// Decides when a spoken turn from the LiveTalking server is really over.
//
// The server streams {status: "start" | "end", text} events as each chunk of
// audio actually leaves over WebRTC. One turn can be many chunks (an LLM reply is
// split at punctuation), there can be gaps while the next chunk is synthesised,
// and a very short chunk may send "start" without a matching "end". So a turn is
// done only after a quiet period AND the server confirms it has stopped speaking.
//
// Pure logic with injectable timers, so it can be unit-tested without a browser.

export function createTurnTracker({
  settleMs = 1500,        // quiet time after an "end" before asking the server
  startCheckMs = 6000,    // re-check interval while a chunk is playing
  firstTimeoutMs = 30000, // give up if no audio ever starts
  confirmIdle = async () => true,
  onSentence = () => {},
  onSpeaking = () => {},
  onDone = () => {},
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
} = {}) {
  let started = false;
  let speaking = false;
  let done = false;
  let timer = null;
  let checking = false;

  function arm(ms) {
    if (timer !== null) timers.clear(timer);
    timer = timers.set(check, ms);
  }

  async function check() {
    timer = null;
    if (done) return;
    if (!started) return finish({ timedOut: true });
    if (checking) return;
    checking = true;
    let idle;
    try {
      idle = await confirmIdle();
    } catch {
      idle = true; // can't reach the server: don't hang the turn
    }
    checking = false;
    if (done) return;
    if (idle) finish();
    else arm(settleMs);
  }

  function setSpeaking(on) {
    if (speaking === on) return;
    speaking = on;
    onSpeaking(on);
  }

  function event(evt) {
    if (done || !evt || typeof evt !== "object") return;
    if (evt.status === "start") {
      started = true;
      setSpeaking(true);
      if (evt.text) onSentence(String(evt.text));
      arm(startCheckMs);
    } else if (evt.status === "end") {
      if (!started) return; // late event from an earlier, interrupted turn
      setSpeaking(false);
      arm(settleMs);
    }
  }

  function finish(extra = {}) {
    if (done) return;
    done = true;
    if (timer !== null) timers.clear(timer);
    timer = null;
    setSpeaking(false);
    onDone({ timedOut: false, started, ...extra });
  }

  arm(firstTimeoutMs);

  return {
    event,
    finish,
    get done() { return done; },
    get started() { return started; },
  };
}
