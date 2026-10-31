import { test } from "node:test";
import assert from "node:assert/strict";
import { createTurnTracker } from "../web/js/live/turn-tracker.js";

// Deterministic timers: advance() runs due callbacks in time order and lets
// their promises settle before moving on.
function fakeTimers() {
  let now = 0;
  let nextId = 0;
  const pending = new Map();
  const flush = () => new Promise((r) => setImmediate(r));
  return {
    set(fn, ms) { pending.set(++nextId, { fn, at: now + ms }); return nextId; },
    clear(id) { pending.delete(id); },
    get pending() { return pending.size; },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...pending].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await flush();
      }
      now = end;
      await flush();
    },
  };
}

function setup(overrides = {}) {
  const timers = fakeTimers();
  const log = { sentences: [], speaking: [], done: [] };
  const tracker = createTurnTracker({
    settleMs: 1000,
    startCheckMs: 5000,
    firstTimeoutMs: 20000,
    timers,
    onSentence: (t) => log.sentences.push(t),
    onSpeaking: (on) => log.speaking.push(on),
    onDone: (r) => log.done.push(r),
    ...overrides,
  });
  return { tracker, timers, log };
}

test("one chunk: done after the quiet period once the server confirms", async () => {
  const { tracker, timers, log } = setup();
  tracker.event({ status: "start", text: "Hello there." });
  await timers.advance(2000);
  tracker.event({ status: "end", text: "Hello there." });
  await timers.advance(999);
  assert.equal(log.done.length, 0, "still inside the settle window");
  await timers.advance(1);
  assert.deepEqual(log.sentences, ["Hello there."]);
  assert.deepEqual(log.speaking, [true, false]);
  assert.deepEqual(log.done, [{ timedOut: false, started: true }]);
});

test("several chunks with short gaps stay one turn", async () => {
  const { tracker, timers, log } = setup();
  for (const text of ["First part,", "second part,", "and the end."]) {
    tracker.event({ status: "start", text });
    await timers.advance(1500);
    tracker.event({ status: "end", text });
    await timers.advance(400); // gap while the next chunk is synthesised
  }
  assert.equal(log.done.length, 0);
  await timers.advance(600);
  assert.deepEqual(log.sentences, ["First part,", "second part,", "and the end."]);
  assert.equal(log.done.length, 1);
});

test("keeps waiting while the server still reports speaking", async () => {
  let speaking = true;
  let checks = 0;
  const { tracker, timers, log } = setup({ confirmIdle: async () => { checks++; return !speaking; } });
  tracker.event({ status: "start", text: "A long sentence" });
  tracker.event({ status: "end" });
  await timers.advance(3000);
  assert.equal(log.done.length, 0);
  assert.ok(checks >= 2, "asked the server more than once");
  speaking = false;
  await timers.advance(1000);
  assert.equal(log.done.length, 1);
});

test("a start without an end is resolved by the periodic server check", async () => {
  const { tracker, timers, log } = setup();
  tracker.event({ status: "start", text: "Hi." });
  await timers.advance(4999);
  assert.equal(log.done.length, 0);
  await timers.advance(1);
  assert.equal(log.done.length, 1);
  assert.deepEqual(log.speaking, [true, false]);
});

test("times out when audio never starts", async () => {
  const { timers, log } = setup();
  await timers.advance(20000);
  assert.deepEqual(log.done, [{ timedOut: true, started: false }]);
  assert.deepEqual(log.speaking, []);
});

test("ignores a late end from an interrupted earlier turn", async () => {
  const { tracker, timers, log } = setup();
  tracker.event({ status: "end", text: "old reply" });
  await timers.advance(5000);
  assert.equal(log.done.length, 0);
  assert.deepEqual(log.speaking, []);
});

test("an unreachable server does not hang the turn", async () => {
  const { tracker, timers, log } = setup({ confirmIdle: async () => { throw new Error("offline"); } });
  tracker.event({ status: "start", text: "x" });
  tracker.event({ status: "end", text: "x" });
  await timers.advance(1000);
  assert.equal(log.done.length, 1);
});

test("finish() ends the turn once and clears its timer", async () => {
  const { tracker, timers, log } = setup();
  tracker.event({ status: "start", text: "Stop me" });
  tracker.finish({ stopped: true });
  tracker.finish({ stopped: true });
  tracker.event({ status: "start", text: "ignored" });
  assert.equal(timers.pending, 0);
  assert.deepEqual(log.done, [{ timedOut: false, started: true, stopped: true }]);
  assert.deepEqual(log.sentences, ["Stop me"]);
  assert.deepEqual(log.speaking, [true, false]);
});

test("ignores malformed events", async () => {
  const { tracker, timers, log } = setup();
  tracker.event(null);
  tracker.event("start");
  tracker.event({ status: "unknown" });
  await timers.advance(19999);
  assert.equal(log.done.length, 0);
  assert.equal(tracker.started, false);
});
