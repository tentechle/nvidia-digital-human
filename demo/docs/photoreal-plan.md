# Photoreal avatar plan

**Status (2026-10-30):** phases 1 and 2 are done. LiveTalking runs locally (see `../server/`), and the explorer page connects to it over WebRTC (see `../web/js/live/`). Still to do: your own avatar footage, the cloud deployment, and microphone input.

Goal: replace the wireframe face with a photoreal talking person, rendered on a GPU server and streamed into this page, while keeping the rest of the page (conversation, pipeline view, log) as it is.

## Choice: LiveTalking

[lipku/LiveTalking](https://github.com/lipku/LiveTalking), Apache-2.0. It takes a short video of a real person and re-synthesises only the mouth region in real time to match new speech, so everything else (skin, hair, lighting, eyes) is real footage. That's why it looks more real than any 3D model.

| Model | Published speed | Use |
|---|---|---|
| wav2lip256 | 60 FPS on RTX 3060, 120 on 3080 Ti | Local prototype on the RTX 4060 laptop |
| MuseTalk | 42 FPS on 3080 Ti, 72 on 4090 | Production: sharper mouth, needs a bigger GPU |

Real time means at least 25 FPS. VRAM needs aren't published, so they get measured in phase 1.

Alternative considered: [LAM](https://github.com/aigc3d/LAM) (Gaussian head from one photo, rendered in the browser). It's cheaper to host because the server only turns audio into expressions, but the result is a reconstruction, not real footage, and the browser renderer's licence is unverified. It's worth revisiting if hosting cost matters more than realism.

## How it fits the page

```
page (static host, HTTPS)                    GPU server (HTTPS via reverse proxy)
──────────────────────────                   ─────────────────────────────────────
runner: question → scripted reply
video-avatar.js ── POST /offer (SDP) ──────▶  LiveTalking: WebRTC session
                ◀── video + audio track ────   wav2lip / MuseTalk renders frames
                ── POST /human {sessionid,      TTS (EdgeTTS, CosyVoice, GPT-SoVITS…)
                    type:"echo", text} ─────▶   speaks the text, lip-syncs it
                ── POST /is_speaking or SSE ▶   lets the runner know when it's done
```

Code changes, all inside the existing module layout:

- `js/avatar/video-avatar.js` (new): connects to the server over WebRTC, shows the video, and exposes `speak(text)` (`POST /human`, type `echo`) and `stop()` (`POST /interrupt_talk`). It tracks speaking state via `/sse` or `/is_speaking`.
- `js/pipeline/runner.js`: takes a "speaker" (browser voice or video avatar) instead of the voice module directly. The rest of the runner stays the same.
- `js/main.js`: if a server URL is configured and reachable, use the video avatar; otherwise fall back to the wireframe and browser voice.
- The page's TTS and rendering stages become real work done on the server. The log reports measured server timings.
- Later: switch `type` to `chat` with an LLM (for example a NIM model from build.nvidia.com), and add microphone input for real speech recognition.

## Phases

**0. Source footage (you).** Record 3–5 minutes of yourself, or of someone who has given written permission, talking to camera:
- 1080p, steady camera, even front lighting, plain background
- head mostly still and facing forward
- some natural pauses with the mouth closed

Never use footage of anyone else, especially public figures. Label the avatar as AI-generated on the page.

**1. Local prototype (RTX 4060, 8 GB).**
1. Install LiveTalking in its own conda environment (Python 3.12, PyTorch 2.9.1 + CUDA 12.8 per its README).
2. Run the bundled wav2lip sample avatar.
3. Generate your own avatar with `genavatar.py`, or the `/avatar.html` upload page.
4. Measure FPS and VRAM, and judge mouth quality.
5. Try MuseTalk to see whether it fits in 8 GB.

**2. Wire the page.** Build `video-avatar.js` and the speaker switch. Test against the local server (`http://localhost:8010`; localhost needs no HTTPS).

**3. Cloud deployment.**
- **GPU:** RTX 4090 class for MuseTalk at 72 FPS.
- **Networking:** a VM with a public IP. LiveTalking needs TCP 8010 plus UDP for WebRTC media. Container hosts that don't expose UDP need a TURN server (coturn).
- **HTTPS:** the page is served over HTTPS, so the API must be too. Put Caddy in front on a domain, with CORS limited to the page's origin.
- **Abuse protection:** a shared access token, and limits on session count and length (the GPU handles only a few concurrent speakers).
- **Cost control:** auto-shutdown when idle. GPU VMs bill by the hour.

**4. Polish.** Idle loop when silent, voice choice or cloning (your own voice only), subtitles synced to server speech, a fallback message when the server is asleep.

## Open questions

- Which TTS voice? EdgeTTS is the easiest start but calls Microsoft's online service. CosyVoice and GPT-SoVITS run locally on the GPU.
- Which cloud provider, and what monthly budget?
