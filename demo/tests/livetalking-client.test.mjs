import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LiveTalkingClient, normalizeBaseUrl, parseServerEvent, waitForIceGathering,
} from "../web/js/live/livetalking-client.js";

test("normalizeBaseUrl keeps the origin and path, drops trailing slashes", () => {
  assert.equal(normalizeBaseUrl("http://127.0.0.1:8010/"), "http://127.0.0.1:8010");
  assert.equal(normalizeBaseUrl("  https://gpu.example.com/avatar//  "), "https://gpu.example.com/avatar");
  assert.throws(() => normalizeBaseUrl("ftp://example.com"), /http:\/\/ or https:\/\//);
  assert.throws(() => normalizeBaseUrl("not a url"));
});

test("parseServerEvent accepts status events and rejects everything else", () => {
  assert.deepEqual(parseServerEvent('{"status":"start","text":"Hi."}'), { status: "start", text: "Hi." });
  assert.equal(parseServerEvent("{oops"), null);
  assert.equal(parseServerEvent('{"text":"no status"}'), null);
  assert.equal(parseServerEvent("42"), null);
});

class FakePC extends EventTarget {
  constructor(config) {
    super();
    this.config = config;
    this.transceivers = [];
    this.iceGatheringState = "new";
    this.connectionState = "new";
    this.closed = false;
  }
  addTransceiver(kind, init) { this.transceivers.push([kind, init.direction]); }
  async createOffer() { return { sdp: "v=0 offer", type: "offer" }; }
  async setLocalDescription(desc) {
    this.localDescription = desc;
    setTimeout(() => { this.iceGatheringState = "complete"; this.dispatchEvent(new Event("icegatheringstatechange")); }, 5);
  }
  async setRemoteDescription(desc) { this.remoteDescription = desc; }
  close() { this.closed = true; }
}

class FakeEventSource {
  static last = null;
  constructor(url) { this.url = url; this.closed = false; FakeEventSource.last = this; }
  close() { this.closed = true; }
}

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const path = new URL(url).pathname;
    calls.push({ path, body: init.body ? JSON.parse(init.body) : undefined });
    const reply = routes[path];
    if (!reply) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => (typeof reply === "function" ? reply(calls.at(-1).body) : reply) };
  };
  fn.calls = calls;
  return fn;
}

const deps = (fetch) => ({ fetch, RTCPeerConnection: FakePC, EventSource: FakeEventSource, MediaStream: class { addTrack() {} } });

test("waitForIceGathering resolves on completion or on timeout", async () => {
  const pc = new FakePC();
  await pc.setLocalDescription({});
  await waitForIceGathering(pc, 1000);
  assert.equal(pc.iceGatheringState, "complete");

  const stuck = new FakePC();
  const t0 = Date.now();
  await waitForIceGathering(stuck, 30);
  assert.ok(Date.now() - t0 >= 25, "waited for the timeout");
});

test("connect negotiates receive-only media and opens the event stream", async () => {
  const fetch = fakeFetch({ "/offer": { sdp: "v=0 answer", type: "answer", sessionid: "s 1" } });
  const client = new LiveTalkingClient("http://127.0.0.1:8010/", deps(fetch));
  await client.connect({ voice: "en-US-AvaNeural" });

  assert.deepEqual(client.pc.transceivers, [["video", "recvonly"], ["audio", "recvonly"]]);
  assert.deepEqual(fetch.calls[0], { path: "/offer", body: { sdp: "v=0 offer", type: "offer", refaudio: "en-US-AvaNeural" } });
  assert.deepEqual(client.pc.remoteDescription, { sdp: "v=0 answer", type: "answer" });
  assert.equal(client.sessionid, "s 1");
  assert.equal(FakeEventSource.last.url, "http://127.0.0.1:8010/sse?sessionid=s%201");

  const seen = [];
  client.onEvent((e) => seen.push(e));
  FakeEventSource.last.onmessage({ data: '{"status":"start","text":"Hello."}' });
  FakeEventSource.last.onmessage({ data: "not json" });
  assert.deepEqual(seen, [{ status: "start", text: "Hello." }]);
});

test("say, chat, interrupt and isSpeaking send the session id", async () => {
  const fetch = fakeFetch({
    "/offer": { sdp: "a", type: "answer", sessionid: "abc" },
    "/human": { code: 0, msg: "ok" },
    "/interrupt_talk": { code: 0, msg: "ok" },
    "/is_speaking": { code: 0, msg: "ok", data: true },
  });
  const client = new LiveTalkingClient("http://localhost:8010", deps(fetch));
  await client.connect();
  await client.say("Hi");
  await client.chat("What is Tokkio?");
  await client.interrupt();
  assert.equal(await client.isSpeaking(), true);

  assert.deepEqual(fetch.calls.slice(1).map((c) => [c.path, c.body]), [
    ["/human", { sessionid: "abc", text: "Hi", type: "echo", interrupt: true }],
    ["/human", { sessionid: "abc", text: "What is Tokkio?", type: "chat", interrupt: true }],
    ["/interrupt_talk", { sessionid: "abc" }],
    ["/is_speaking", { sessionid: "abc" }],
  ]);
});

test("server errors surface as exceptions with the server's message", async () => {
  const fetch = fakeFetch({ "/offer": { code: -1, msg: "max session reached" } });
  const client = new LiveTalkingClient("http://localhost:8010", deps(fetch));
  await assert.rejects(client.connect(), /max session reached/);
  await assert.rejects(async () => client.say("x"), /Not connected/);
});

test("close tears down the peer connection and the event stream", async () => {
  const fetch = fakeFetch({ "/offer": { sdp: "a", type: "answer", sessionid: "abc" } });
  const client = new LiveTalkingClient("http://localhost:8010", deps(fetch));
  await client.connect();
  const { pc, events } = client;
  client.close();
  assert.equal(pc.closed, true);
  assert.equal(events.closed, true);
  assert.equal(client.sessionid, null);
});

test("falls back to polling /is_speaking when the event stream fails", async () => {
  const speaking = [false, true, true, false];
  const fetch = fakeFetch({
    "/offer": { sdp: "a", type: "answer", sessionid: "abc" },
    "/is_speaking": () => ({ code: 0, msg: "ok", data: speaking.shift() ?? false }),
  });
  const client = new LiveTalkingClient("http://localhost:8010", { ...deps(fetch), pollMs: 5 });
  await client.connect();
  const seen = [];
  client.onEvent((e) => seen.push(e));
  assert.equal(client.eventMode, "sse");

  // A network blip (CONNECTING) must not trigger the fallback; a hard failure (CLOSED) must.
  const es = FakeEventSource.last;
  es.readyState = 0;
  es.onerror();
  assert.equal(client.eventMode, "sse");
  es.readyState = 2;
  es.onerror();
  assert.equal(client.eventMode, "poll");
  assert.equal(es.closed, true);

  await new Promise((r) => setTimeout(r, 60));
  client.close();
  assert.deepEqual(seen, [{ status: "start", polled: true }, { status: "end", polled: true }]);
  assert.equal(client.eventMode, "sse", "close() stops polling");
});
