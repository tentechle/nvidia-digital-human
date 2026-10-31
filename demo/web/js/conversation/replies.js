// Scripted replies. Short sentences read better aloud than long ones.
const TOPICS = [
  {
    topic: "greeting",
    match: /\b(hi|hello|hey|good (morning|afternoon|evening))\b/,
    mood: "happy",
    text: "Hello. I'm a browser model of a Tokkio assistant. Ask me how a turn like this one works.",
  },
  {
    topic: "tokkio",
    match: /tokkio|what are you|who are you|what is this/,
    mood: "happy",
    text: "Tokkio is NVIDIA's reference workflow for customer service with an animated assistant. It listens, decides on an answer, and replies with a voice and a face that move together.",
  },
  {
    topic: "pipeline",
    match: /pipeline|turn|how .*work|stages?|architecture|steps/,
    mood: "neutral",
    text: "Every turn passes through six stages. Speech recognition turns your voice into text. A language model writes the answer. Speech synthesis gives it a voice. Audio2Face turns that audio into facial motion. Then the avatar is rendered and streamed to you.",
  },
  {
    topic: "hardware",
    match: /hardware|gpu|requirement|run it|deploy|server|cloud/,
    mood: "neutral",
    text: "The full workflow needs NVIDIA GPUs. Speech, animation and rendering all run on them. It is usually deployed on a GPU server or a cloud instance. This page only simulates it.",
  },
  {
    topic: "animation",
    match: /face|animat|lip|blendshape|mouth|expression/,
    mood: "happy",
    text: "The face is driven by blendshape weights, the same idea Audio2Face uses. Jaw, smile, blink and brow values update every frame. You can watch them change in the meters.",
  },
  {
    topic: "latency",
    match: /latency|fast|delay|real.?time|quick/,
    mood: "neutral",
    text: "In a real deployment, each stage streams into the next. The avatar can start speaking before the whole answer is written. That keeps the delay short enough to feel like a conversation.",
  },
  {
    topic: "thanks",
    match: /thank/,
    mood: "happy",
    text: "You're welcome. Is there anything else you'd like to know?",
  },
];

const FALLBACK = {
  topic: "unknown",
  mood: "concerned",
  text: "I can't answer that one. My replies here are scripted, not generated. Try asking how a turn works, what hardware it needs, or how the face is animated.",
};

export const SUGGESTIONS = [
  "How does a turn work?",
  "How is the face animated?",
  "What hardware does it need?",
  "What is Tokkio?",
];

export function answer(question) {
  const q = question.toLowerCase();
  return TOPICS.find((t) => t.match.test(q)) ?? FALLBACK;
}
