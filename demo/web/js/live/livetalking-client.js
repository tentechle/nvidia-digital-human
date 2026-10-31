// Client for a LiveTalking server: WebRTC video/audio in, text out, speech events back.
//
//   POST /offer         SDP offer -> answer + sessionid
//   POST /human         {sessionid, text, type: "echo" | "chat", interrupt}
//   POST /interrupt_talk, POST /is_speaking
//   GET  /sse?sessionid  {status, text} events, sent as the audio is played out
//
// Browser APIs are injectable so the protocol logic can be tested in Node.

export function normalizeBaseUrl(raw) {
  const url = new URL(String(raw).trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Server address must start with http:// or https://");
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

// Resolves once ICE gathering finishes, or after timeoutMs with whatever was gathered.
export function waitForIceGathering(pc, timeoutMs = 3000) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    };
    const onChange = () => { if (pc.iceGatheringState === "complete") done(); };
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener("icegatheringstatechange", onChange);
  });
}

export function parseServerEvent(data) {
  try {
    const evt = JSON.parse(data);
    return evt && typeof evt === "object" && typeof evt.status === "string" ? evt : null;
  } catch {
    return null;
  }
}

export class LiveTalkingClient {
  constructor(baseUrl, deps = {}) {
    this.base = normalizeBaseUrl(baseUrl);
    this.fetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
    this.RTCPeerConnection = deps.RTCPeerConnection ?? globalThis.RTCPeerConnection;
    this.EventSource = deps.EventSource ?? globalThis.EventSource;
    this.MediaStream = deps.MediaStream ?? globalThis.MediaStream;
    this.pollMs = deps.pollMs ?? 300;
    this.pc = null;
    this.events = null;
    this.poller = null;
    this.sessionid = null;
    this.listeners = new Set();
  }

  // "sse" while the server's event stream works, "poll" after falling back.
  get eventMode() {
    return this.poller ? "poll" : "sse";
  }

  emit(evt) {
    this.listeners.forEach((fn) => fn(evt));
  }

  // Unpatched LiveTalking servers fail /sse for cross-origin pages. Instead of
  // losing every turn, watch /is_speaking and send the same start/end events
  // (without the sentence text, which only the event stream carries).
  startPolling() {
    if (this.poller) return;
    this.events?.close();
    this.events = null;
    let last = false;
    this.poller = setInterval(async () => {
      if (!this.sessionid) return;
      try {
        const speaking = await this.isSpeaking();
        if (speaking !== last) {
          last = speaking;
          this.emit({ status: speaking ? "start" : "end", polled: true });
        }
      } catch {
        // Transient failure: try again on the next tick.
      }
    }, this.pollMs);
  }

  async post(path, body) {
    const res = await this.fetch(this.base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} failed: HTTP ${res.status}`);
    const json = await res.json();
    if (typeof json.code === "number" && json.code !== 0) throw new Error(json.msg || `${path} failed`);
    return json;
  }

  async config() {
    const res = await this.fetch(`${this.base}/api/admin/config`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.config ?? null;
  }

  // Opens the WebRTC session. Returns a MediaStream with the avatar's video and voice.
  async connect({ voice, iceServers = [] } = {}) {
    this.close();
    const pc = new this.RTCPeerConnection({ iceServers });
    this.pc = pc;
    const stream = new this.MediaStream();
    pc.addEventListener("track", (e) => stream.addTrack(e.track));
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    await pc.setLocalDescription(await pc.createOffer());
    await waitForIceGathering(pc);
    const offer = { sdp: pc.localDescription.sdp, type: pc.localDescription.type };
    if (voice) offer.refaudio = voice;
    const answer = await this.post("/offer", offer);
    if (!answer.sdp || !answer.sessionid) throw new Error("The server did not return a session");
    this.sessionid = answer.sessionid;
    await pc.setRemoteDescription({ sdp: answer.sdp, type: answer.type });

    const events = new this.EventSource(`${this.base}/sse?sessionid=${encodeURIComponent(this.sessionid)}`);
    this.events = events;
    events.onmessage = (e) => {
      const evt = parseServerEvent(e.data);
      if (evt) this.emit(evt);
    };
    // readyState 2 (CLOSED) means the browser gave up, e.g. on an HTTP error.
    // Network blips leave it at CONNECTING and the browser retries by itself.
    events.onerror = () => {
      if (this.events === events && events.readyState === 2) this.startPolling();
    };
    return stream;
  }

  onEvent(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  requireSession() {
    if (!this.sessionid) throw new Error("Not connected to the avatar server");
    return this.sessionid;
  }

  say(text) {
    return this.post("/human", { sessionid: this.requireSession(), text, type: "echo", interrupt: true });
  }

  chat(text) {
    return this.post("/human", { sessionid: this.requireSession(), text, type: "chat", interrupt: true });
  }

  interrupt() {
    return this.post("/interrupt_talk", { sessionid: this.requireSession() });
  }

  async isSpeaking() {
    const json = await this.post("/is_speaking", { sessionid: this.requireSession() });
    return json.data === true;
  }

  close() {
    clearInterval(this.poller);
    this.poller = null;
    this.events?.close();
    this.events = null;
    this.pc?.close();
    this.pc = null;
    this.sessionid = null;
  }
}
