// Wires the modules together. Each module talks to the others only through the bus.
import { createBus } from "./core/events.js";
import { STAGES } from "./pipeline/stages.js";
import { createRunner } from "./pipeline/runner.js";
import { answer, SUGGESTIONS } from "./conversation/replies.js";
import { createVoice } from "./voice/voice.js";
import { createAvatar, EXPRESSIONS, BLENDSHAPES } from "./avatar/avatar.js";
import { mountTranscript } from "./ui/transcript.js";
import { mountTrace } from "./ui/trace.js";
import { mountStages } from "./ui/stages-bar.js";
import { mountMeters } from "./ui/blendshape-meters.js";
import { mountVoiceSettings } from "./ui/voice-settings.js";

const $ = (sel) => document.querySelector(sel);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const bus = createBus();
const voice = createVoice({ bus });
const avatar = createAvatar($("#avatar"), { reduceMotion });
const runner = createRunner({ bus, voice, answer });

const transcript = mountTranscript($("#transcript"), bus);
mountTrace($("#trace"), $("#clearTrace"), bus);
mountStages($("#stages"), $("#stageDetail"), STAGES, bus);
mountMeters($("#meters"), BLENDSHAPES, avatar);
mountVoiceSettings($("#voiceSettings"), voice, bus);

// Speech drives the mouth.
bus.on("speech:active", ({ on, rate }) => avatar.setSpeaking(on, rate));
bus.on("speech:word", ({ word }) => avatar.word(word));

// Expression presets: buttons and the runner both set them.
const presets = $("#expressions");
Object.keys(EXPRESSIONS).forEach((name) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.expression = name;
  btn.textContent = name[0].toUpperCase() + name.slice(1);
  btn.addEventListener("click", () => bus.emit("expression", name));
  presets.append(btn);
});
bus.on("expression", (name) => {
  avatar.setExpression(name);
  presets.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.expression === name)));
});
bus.emit("expression", "neutral");

// Status badge and caption on the viewport.
const status = $("#status");
const caption = $("#caption");
const setStatus = (state, label) => { status.dataset.state = state; status.textContent = label; };
bus.on("turn:start", () => { setStatus("thinking", "Thinking"); caption.textContent = ""; });
bus.on("reply", () => setStatus("speaking", "Speaking"));
bus.on("speech:sentence", ({ text }) => { caption.textContent = text; });
bus.on("preview", (on) => { setStatus(on ? "speaking" : "idle", on ? "Speaking" : "Idle"); if (!on) caption.textContent = ""; });

// Composer: Send becomes Stop while a turn runs.
const form = $("#composer");
const input = $("#question");
const send = $("#send");
bus.on("turn:start", () => { send.textContent = "Stop"; input.value = ""; });
bus.on("turn:end", () => {
  send.textContent = "Send";
  setStatus("idle", "Idle");
  // Relax back to neutral shortly after speaking, unless another turn has begun.
  setTimeout(() => {
    if (runner.isRunning()) return;
    caption.textContent = "";
    bus.emit("expression", "neutral");
  }, 2500);
});
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (runner.isRunning()) return runner.stop();
  const q = input.value.trim();
  if (q) runner.run(q);
});

const suggestions = $("#suggestions");
SUGGESTIONS.forEach((text) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "suggestion";
  btn.textContent = text;
  btn.addEventListener("click", () => runner.run(text));
  suggestions.append(btn);
});

transcript.add("assistant", "Ask a question or pick one below. You'll hear the answer, see the face move, and see each pipeline stage run.");
