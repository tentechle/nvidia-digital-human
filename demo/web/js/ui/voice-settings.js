// Voice picker, speed slider, sound toggle and a preview button.
const PREVIEW = "This is how I sound at this speed.";

export function mountVoiceSettings(root, voice, bus) {
  const select = root.querySelector("#voiceSelect");
  const rate = root.querySelector("#rate");
  const rateOut = root.querySelector("#rateOut");
  const toggle = root.querySelector("#soundToggle");
  const preview = root.querySelector("#voicePreview");

  if (!voice.available) {
    root.querySelector(".voice-settings__note").textContent =
      "This browser has no speech voices, so the avatar lip-syncs silently.";
    [select, rate, toggle, preview].forEach((el) => { el.disabled = true; });
    return;
  }

  const note = root.querySelector(".voice-settings__note");
  const defaultNote = note.textContent;

  function fillVoices(voices) {
    const chosen = voice.current();
    select.innerHTML = "";
    voices.forEach((v) => {
      const opt = new Option(`${v.name} (${v.lang})`, v.voiceURI, false, chosen?.voiceURI === v.voiceURI);
      select.append(opt);
    });
    if (!voices.length) select.append(new Option("No English voices found", ""));
    select.disabled = voices.length === 0;
    preview.hidden = voices.length === 0;
    note.textContent = voices.length
      ? defaultNote
      : "This browser has no speech voices installed, so the avatar lip-syncs silently. Open the page in Chrome, Edge or Safari to hear it.";
  }
  fillVoices(voice.voices());
  bus.on("voice:list", fillVoices);
  select.addEventListener("change", () => voice.setVoice(select.value));

  const showRate = () => { rateOut.textContent = `${Number(rate.value).toFixed(2)}x`; };
  rate.value = voice.settings.rate;
  showRate();
  rate.addEventListener("input", () => { voice.setRate(Number(rate.value)); showRate(); });

  const showToggle = () => {
    toggle.setAttribute("aria-pressed", String(voice.settings.enabled));
    toggle.textContent = voice.settings.enabled ? "Sound on" : "Sound off";
  };
  showToggle();
  toggle.addEventListener("click", () => { voice.setEnabled(!voice.settings.enabled); showToggle(); });

  let previewing = false;
  let inTurn = false;
  const syncPreview = () => { preview.disabled = previewing || inTurn; };
  bus.on("turn:start", () => { inTurn = true; syncPreview(); });
  bus.on("turn:end", () => { inTurn = false; syncPreview(); });

  preview.addEventListener("click", async () => {
    previewing = true;
    syncPreview();
    bus.emit("preview", true);
    const wasEnabled = voice.settings.enabled;
    voice.setEnabled(true);
    await voice.speak(PREVIEW);
    voice.setEnabled(wasEnabled);
    showToggle();
    previewing = false;
    syncPreview();
    bus.emit("preview", false);
  });
}
