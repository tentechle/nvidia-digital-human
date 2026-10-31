// Connect / disconnect a LiveTalking server and choose where answers come from.
// Owns the connection, and tells the runner which speaker and answer mode to use.
import { LiveTalkingClient } from "../live/livetalking-client.js";
import { createLiveSpeaker } from "../live/speakers.js";
import { load, save } from "../core/storage.js";

const DEFAULT_URL = "http://127.0.0.1:8010";

function describeConfig(cfg) {
  if (!cfg) return "server details unavailable";
  const llm = cfg.llm_provider ? `${cfg.llm_provider}${cfg.llm_model ? ` ${cfg.llm_model}` : ""} LLM` : "no LLM";
  return `${cfg.model} avatar "${cfg.avatar_id}", ${cfg.tts} voice ${cfg.REF_FILE}, ${llm}`;
}

export function mountLivePanel(els, { bus, browserSpeaker, isBusy }) {
  let client = null;
  let liveSpeaker = null;
  let mode = load("answerMode", "scripted");
  els.url.value = load("liveUrl", DEFAULT_URL);

  const setStatus = (state, text) => { els.status.dataset.state = state; els.status.textContent = text; };

  function renderMode() {
    els.modes.querySelectorAll("button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.mode === (liveSpeaker ? mode : "scripted")));
      if (b.dataset.mode === "llm") b.disabled = !liveSpeaker;
    });
  }

  function showVideo(stream) {
    els.video.srcObject = stream;
    els.video.hidden = !stream;
    els.canvas.hidden = !!stream;
    if (stream) {
      els.video.muted = false;
      els.video.play().catch(() => {});
    }
  }

  function disconnect(reason) {
    client?.close();
    client = null;
    liveSpeaker = null;
    showVideo(null);
    els.button.textContent = "Connect";
    els.url.disabled = false;
    setStatus(reason ? "error" : "off", reason ?? "Not connected: using the wireframe face and your browser's voice.");
    renderMode();
    bus.emit("live", { on: false });
  }

  // Browsers report "disconnected" a few seconds after the server goes away, but
  // only reach "failed" after ~30 s. "disconnected" can also be a brief network
  // blip, so give it a short grace period before giving up.
  const DROP_GRACE_MS = 4000;
  function watchConnection(pc) {
    let grace = null;
    const dropped = () => {
      if (client?.pc === pc) disconnect("The connection to the avatar server dropped. Is it still running?");
    };
    pc.addEventListener("connectionstatechange", () => {
      clearTimeout(grace);
      if (pc.connectionState === "failed") dropped();
      else if (pc.connectionState === "disconnected") grace = setTimeout(dropped, DROP_GRACE_MS);
    });
  }

  async function connect() {
    let url;
    try {
      url = new URL(els.url.value).href;
    } catch {
      return setStatus("error", "Enter a full address, like http://127.0.0.1:8010");
    }
    els.button.disabled = true;
    els.url.disabled = true;
    setStatus("connecting", "Connecting…");
    try {
      client = new LiveTalkingClient(url);
      const stream = await client.connect();
      const cfg = await client.config().catch(() => null);
      watchConnection(client.pc);
      liveSpeaker = createLiveSpeaker({ client, bus, label: cfg?.llm_provider ? `${cfg.llm_provider} server` : "avatar server" });
      showVideo(stream);
      save("liveUrl", els.url.value);
      els.button.textContent = "Disconnect";
      setStatus("live", `Live: ${describeConfig(cfg)}`);
      renderMode();
      bus.emit("live", { on: true, config: cfg });
    } catch (err) {
      client?.close();
      client = null;
      els.url.disabled = false;
      const hint = err instanceof TypeError ? " Is the server running, and reachable from this page?" : "";
      setStatus("error", `Could not connect: ${err.message}.${hint}`);
    } finally {
      els.button.disabled = false;
    }
  }

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (isBusy()) return setStatus(els.status.dataset.state, "Wait for the current answer to finish first.");
    if (client) disconnect();
    else connect();
  });

  els.modes.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn || btn.disabled) return;
    mode = btn.dataset.mode;
    save("answerMode", mode);
    renderMode();
  });
  renderMode();
  addEventListener("pagehide", () => client?.close());

  return {
    getSpeaker: () => liveSpeaker ?? browserSpeaker,
    getAnswerMode: () => (liveSpeaker ? mode : "scripted"),
  };
}
