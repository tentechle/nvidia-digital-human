// Wires the modules together. Each module talks to the others only through the bus.
import { createBus } from "./core/events.js";
import { STAGES } from "./pipeline/stages.js";
import { createRunner } from "./pipeline/runner.js";
import { answer, SUGGESTIONS } from "./conversation/replies.js";
import { createVoice } from "./voice/voice.js";
import { mountTranscript } from "./ui/transcript.js";
import { mountTrace } from "./ui/trace.js";
import { mountStages } from "./ui/stages-bar.js";
import { mountVoiceSettings } from "./ui/voice-settings.js";
import { mountLivePanel } from "./ui/live-panel.js";
import { createBrowserSpeaker } from "./live/speakers.js";

const $ = (sel) => document.querySelector(sel);

const bus = createBus();
const voice = createVoice({ bus });

// The avatar is the LiveTalking server's photoreal video. The live panel connects
// to it and tells the runner which speaker to use; if the server is offline the
// browser reads answers aloud instead.
let runner = null;
const live = mountLivePanel(
  {
    form: $("#liveConnect"), url: $("#liveUrl"), button: $("#liveButton"), status: $("#liveStatus"),
    modes: $("#answerMode"), video: $("#liveVideo"),
    overlay: $("#liveOffline"), overlayTitle: $("#liveOfflineTitle"), overlayText: $("#liveOfflineText"),
  },
  { bus, browserSpeaker: createBrowserSpeaker(voice), isBusy: () => runner.isRunning() },
);
runner = createRunner({ bus, answer, getSpeaker: live.getSpeaker, getAnswerMode: live.getAnswerMode });
bus.on("live", ({ on }) => { document.body.dataset.live = String(on); });

const transcript = mountTranscript($("#transcript"), bus);
mountTrace($("#trace"), $("#clearTrace"), bus);
mountStages($("#stages"), $("#stageDetail"), STAGES, bus);
mountVoiceSettings($("#voiceSettings"), voice, bus);

// Status badge and caption on the viewport.
const status = $("#status");
const caption = $("#caption");
const setStatus = (state, label) => { status.dataset.state = state; status.textContent = label; };
bus.on("turn:start", () => { setStatus("thinking", "Thinking"); caption.textContent = ""; });
bus.on("speech:active", ({ on }) => { if (on && runner.isRunning()) setStatus("speaking", "Speaking"); });
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
  // Clear the caption shortly after speaking, unless another turn has begun.
  setTimeout(() => { if (!runner.isRunning()) caption.textContent = ""; }, 2500);
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

transcript.add("assistant", "Ask a question or pick one below. The avatar answers out loud, and each pipeline stage lights up as it runs.");
