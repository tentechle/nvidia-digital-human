// Runs one conversational turn through the stages and reports what happens.
//
// Emits on the bus:
//   turn:start { turn, question }   turn:end { turn, stopped }
//   stage { id, state }             state: idle | active | done | skipped
//   trace { turn, t, stage, msg }   t: seconds since the turn started
//   expression <name>               reply { text, mood, topic }
import { STAGES } from "./stages.js";
import { splitSentences } from "../voice/voice.js";

const STOPPED = Symbol("stopped");

export function createRunner({ bus, voice, answer }) {
  let turn = 0;
  let running = false;
  let stopped = false;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const check = () => { if (stopped) throw STOPPED; };
  const words = (text) => text.split(/\s+/).length;

  async function run(question) {
    if (running) return;
    running = true;
    stopped = false;
    const id = ++turn;
    const t0 = performance.now();
    const trace = (stage, msg) => bus.emit("trace", { turn: id, t: (performance.now() - t0) / 1000, stage, msg });
    const stage = (sid, state) => bus.emit("stage", { id: sid, state });

    bus.emit("turn:start", { turn: id, question });
    STAGES.forEach((s) => stage(s.id, "idle"));
    try {
      stage("asr", "skipped");
      trace("asr", "typed input, no audio to transcribe");

      stage("llm", "active");
      bus.emit("expression", "thinking");
      trace("llm", "matching the question to a scripted reply");
      await sleep(700);
      check();
      const reply = answer(question);
      trace("llm", `reply ready: topic "${reply.topic}", ${words(reply.text)} words`);
      stage("llm", "done");

      stage("tts", "active");
      trace("tts", `${splitSentences(reply.text).length} sentences, ${voice.describe()}`);
      await sleep(250);
      check();

      bus.emit("reply", reply);
      bus.emit("expression", reply.mood);
      ["a2f", "render", "stream"].forEach((s) => stage(s, "active"));
      trace("a2f", "jaw and lip weights follow the speech; brows and smile follow the mood");
      await voice.speak(reply.text, { onSentence: (i, n) => trace("tts", `speaking sentence ${i} of ${n}`) });
      check();

      ["tts", "a2f", "render", "stream"].forEach((s) => stage(s, "done"));
      trace("stream", `turn finished in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    } catch (err) {
      if (err !== STOPPED) throw err;
      STAGES.forEach((s) => stage(s.id, "idle"));
      trace("stream", "stopped");
    } finally {
      running = false;
      bus.emit("turn:end", { turn: id, stopped });
    }
  }

  function stop() {
    if (!running) return;
    stopped = true;
    voice.cancel();
  }

  return { run, stop, isRunning: () => running };
}
