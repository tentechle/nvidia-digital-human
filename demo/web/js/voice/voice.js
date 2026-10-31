// Browser speech synthesis, tuned for clarity: a slower default rate, the best
// available English voice, and one utterance per sentence with a short pause between.
//
// Emits on the bus:
//   voice:list      the available voices changed
//   speech:active   { on, rate }  a sentence started or ended
//   speech:sentence { text }      the sentence now being spoken
//   speech:word     { word }      a word boundary (only some voices report these)
import { load, save } from "../core/storage.js";

export const DEFAULT_RATE = 0.88;
const SENTENCE_PAUSE_MS = 300;
const SILENT_MS_PER_WORD = 380;

function score(v) {
  let s = 0;
  if (/natural|neural|enhanced|premium/i.test(v.name)) s += 4;
  if (/google/i.test(v.name)) s += 2;
  if (/samantha|daniel|karen|moira|serena|aria|jenny|libby|sonia|ava|allison/i.test(v.name)) s += 2;
  if (/en[-_](us|gb)/i.test(v.lang)) s += 1;
  if (/espeak|compact|whisper|novelty|zarvox|bubbles|cellos|trinoids|bad news|bells|albert|fred|junior|ralph/i.test(v.name)) s -= 6;
  return s;
}

export function splitSentences(text) {
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

export function createVoice({ bus }) {
  const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
  const settings = {
    enabled: load("voiceOn", true) && !!synth,
    rate: load("rate", DEFAULT_RATE),
    voiceURI: load("voiceURI", null),
  };
  let voices = [];
  let cancelled = false;

  function refresh() {
    voices = synth ? synth.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang)) : [];
    voices.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
    bus.emit("voice:list", voices);
  }
  if (synth) {
    refresh();
    synth.addEventListener?.("voiceschanged", refresh);
  }

  const current = () => voices.find((v) => v.voiceURI === settings.voiceURI) ?? voices[0] ?? null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Some browsers expose the API but ship no voices (common on Linux).
  const aloud = () => settings.enabled && voices.length > 0;

  function describe() {
    if (settings.enabled && !voices.length) return "no voices installed, timing simulated";
    if (!settings.enabled) return "sound off, timing simulated";
    const v = current();
    return `${v ? v.name : "default voice"} at ${settings.rate.toFixed(2)}x`;
  }

  async function speakSilently(sentence) {
    for (const word of sentence.split(/\s+/)) {
      if (cancelled) return;
      bus.emit("speech:word", { word });
      await sleep(SILENT_MS_PER_WORD / settings.rate);
    }
  }

  function speakAloud(sentence) {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(sentence);
      const v = current();
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = settings.rate;
      u.pitch = 1;
      u.onboundary = (e) => {
        if (e.name && e.name !== "word") return;
        const word = sentence.slice(e.charIndex).split(/\s/)[0];
        if (word) bus.emit("speech:word", { word });
      };
      // Some engines never fire onend; don't hang the turn on them.
      const limit = setTimeout(done, (sentence.split(/\s+/).length * 700) / settings.rate + 3000);
      function done() { clearTimeout(limit); resolve(); }
      u.onend = done;
      u.onerror = done;
      synth.speak(u);
    });
  }

  async function speak(text, { onSentence } = {}) {
    cancelled = false;
    const sentences = splitSentences(text);
    if (synth) synth.cancel(); // clears a queue Chrome sometimes leaves stuck
    for (let i = 0; i < sentences.length && !cancelled; i++) {
      onSentence?.(i + 1, sentences.length);
      bus.emit("speech:sentence", { text: sentences[i] });
      bus.emit("speech:active", { on: true, rate: settings.rate });
      await (aloud() ? speakAloud(sentences[i]) : speakSilently(sentences[i]));
      bus.emit("speech:active", { on: false, rate: settings.rate });
      if (i < sentences.length - 1 && !cancelled) await sleep(SENTENCE_PAUSE_MS);
    }
  }

  function cancel() {
    cancelled = true;
    synth?.cancel();
    bus.emit("speech:active", { on: false, rate: settings.rate });
  }

  return {
    available: !!synth,
    settings,
    voices: () => voices,
    current,
    describe,
    speak,
    cancel,
    setEnabled(on) { settings.enabled = on && !!synth; save("voiceOn", settings.enabled); if (!on) synth?.cancel(); },
    setRate(rate) { settings.rate = rate; save("rate", rate); },
    setVoice(uri) { settings.voiceURI = uri; save("voiceURI", uri); },
  };
}
