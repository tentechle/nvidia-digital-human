// The six stages of a Tokkio turn, in order. `detail` describes the real component.
export const STAGES = [
  {
    id: "asr",
    name: "Speech recognition",
    component: "Riva ASR",
    detail: "Riva ASR streams the customer's microphone audio into text as they speak. Typed questions on this page skip it.",
  },
  {
    id: "llm",
    name: "Answer",
    component: "LLM + RAG via NIM",
    detail: "A language model, served through NVIDIA NIM and grounded in the business's own documents, decides what to say. Here, replies come from a short script.",
  },
  {
    id: "tts",
    name: "Speech synthesis",
    component: "Riva TTS",
    detail: "Riva TTS turns the reply into natural speech. This page uses a voice built into your browser instead.",
  },
  {
    id: "a2f",
    name: "Facial animation",
    component: "Audio2Face-3D",
    detail: "Audio2Face-3D listens to the synthesized speech and outputs blendshape weights (jaw, lips, eyes, brows) every frame. The meters on this page show the same kind of weights.",
  },
  {
    id: "render",
    name: "Rendering",
    component: "Omniverse RTX or Unreal Engine",
    detail: "A GPU renderer draws the animated 3D character every frame. This page draws a wireframe face on a canvas.",
  },
  {
    id: "stream",
    name: "Delivery",
    component: "WebRTC",
    detail: "The rendered video and audio stream to the customer's browser or kiosk over WebRTC with low latency.",
  },
];
