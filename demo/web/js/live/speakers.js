// Two interchangeable "speakers" the runner can use for a turn:
//   browser: the page's own speech synthesis, with the wireframe face
//   live:    a LiveTalking server that speaks, lip-syncs and streams a real video
//
// Both take hooks { onFirstAudio(seconds), onSentence(text) } so the runner can
// log real timings whichever one is active.
import { createTurnTracker } from "./turn-tracker.js";

export function createBrowserSpeaker(voice) {
  let stopped = false;
  return {
    kind: "browser",
    canChat: false,
    describe: () => voice.describe(),
    async say(text, { onFirstAudio, onSentence } = {}) {
      stopped = false;
      const t0 = performance.now();
      let first = true;
      await voice.speak(text, {
        onSentence: (_i, _n, sentence) => {
          if (stopped) return;
          if (first) { first = false; onFirstAudio?.((performance.now() - t0) / 1000); }
          onSentence?.(sentence);
        },
      });
    },
    stop() { stopped = true; voice.cancel(); },
  };
}

export function createLiveSpeaker({ client, bus, label = "LiveTalking server" }) {
  let current = null;

  // knownText: what we asked the server to say (echo), used for captions when the
  // client has fallen back to polling and the server's sentence text isn't available.
  function run(send, hooks, settleMs, knownText = null) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const parts = [];
      let first = true;
      let unsubscribe = () => {};
      const sentence = (text) => {
        parts.push(text.trim());
        bus.emit("speech:sentence", { text });
        hooks.onSentence?.(text);
      };
      const tracker = createTurnTracker({
        settleMs,
        confirmIdle: async () => !(await client.isSpeaking()),
        onSentence: sentence,
        onSpeaking: (on) => {
          if (on && first) {
            first = false;
            hooks.onFirstAudio?.((performance.now() - t0) / 1000);
            if (client.eventMode === "poll") {
              hooks.onNote?.("server event stream unavailable: following /is_speaking instead");
              if (knownText) sentence(knownText);
            }
          }
          bus.emit("speech:active", { on, rate: 1 });
        },
        onDone: (result) => {
          unsubscribe();
          current = null;
          resolve({ ...result, text: parts.join(" ") });
        },
      });
      unsubscribe = client.onEvent((evt) => tracker.event(evt));
      current = tracker;
      send().catch((err) => {
        hooks.onError?.(err);
        tracker.finish({ error: err.message });
      });
    });
  }

  return {
    kind: "live",
    canChat: true,
    label,
    describe: () => `${label}: server voice, wav2lip lip-sync on the GPU`,
    say: (text, hooks = {}) => run(() => client.say(text), hooks, 1200, text),
    chat: (question, hooks = {}) => run(() => client.chat(question), hooks, 2500),
    stop() {
      client.interrupt().catch(() => {});
      current?.finish({ stopped: true });
    },
  };
}
