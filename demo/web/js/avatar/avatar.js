// Blendshape rig + canvas renderer for the wireframe face.
// Speech drives jawOpen; the expression preset drives smile, frown and brows;
// blinks, gaze and head motion run on their own.
import { faceGeometry } from "./face-geometry.js";

export const EXPRESSIONS = {
  neutral:   { mouthSmile: 0.1,  mouthFrown: 0,    browInnerUp: 0,    browDown: 0 },
  happy:     { mouthSmile: 0.75, mouthFrown: 0,    browInnerUp: 0.2,  browDown: 0 },
  thinking:  { mouthSmile: 0,    mouthFrown: 0.15, browInnerUp: 0.05, browDown: 0.5 },
  concerned: { mouthSmile: 0,    mouthFrown: 0.45, browInnerUp: 0.6,  browDown: 0 },
};
export const BLENDSHAPES = ["jawOpen", "mouthSmile", "mouthFrown", "eyeBlink", "browInnerUp", "browDown"];

const COLORS = {
  wire: "rgba(226, 232, 228, 0.08)",
  outline: "rgba(226, 232, 228, 0.5)",
  dot: "rgba(226, 232, 228, 0.26)",
  feature: "rgba(238, 242, 239, 0.92)",
  mouth: "#050607",
  body: "rgba(226, 232, 228, 0.3)",
};

export function createAvatar(canvas, { reduceMotion = false } = {}) {
  const ctx = canvas.getContext("2d");
  const shapes = { jawOpen: 0, eyeBlink: 0, headYaw: 0, headPitch: 0, gazeX: 0, gazeY: 0, ...EXPRESSIONS.neutral };
  const goal = { ...shapes };
  const frameListeners = new Set();
  let view = { w: 0, h: 0, dpr: 1 };
  let pointer = null;
  let speaking = false;
  let speechRate = 1;
  let amp = 0;
  let phase = 0;
  let blinkT = -1;
  let nextBlink = performance.now() + 1800;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view = { w: r.width, h: r.height, dpr };
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    pointer = {
      x: Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)),
      y: Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)),
    };
  });
  canvas.addEventListener("pointerleave", () => { pointer = null; });

  // Smoothing that is independent of frame rate: `keep` is the fraction left after one second.
  const ease = (key, keep, dt) => { shapes[key] += (goal[key] - shapes[key]) * (1 - keep ** dt); };

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const idle = !reduceMotion;

    const gx = pointer ? pointer.x : idle ? Math.sin(now / 2300) * 0.15 : 0;
    const gy = pointer ? pointer.y : idle ? Math.sin(now / 3100) * 0.1 : 0;
    goal.gazeX = gx;
    goal.gazeY = gy;
    goal.headYaw = gx * 0.6 + (speaking && idle ? Math.sin(now / 520) * 0.08 : 0);
    goal.headPitch = gy * 0.4 + (speaking && idle ? Math.sin(now / 730) * 0.06 : 0);

    if (now > nextBlink) { blinkT = 0; nextBlink = now + 2200 + Math.random() * 3800; }
    if (blinkT >= 0) {
      blinkT += dt;
      shapes.eyeBlink = blinkT < 0.07 ? blinkT / 0.07 : Math.max(0, 1 - (blinkT - 0.07) / 0.13);
      if (blinkT > 0.2) blinkT = -1;
    }

    if (speaking) {
      // Syllable-rate oscillation; word boundaries (when the voice reports them) push the amplitude up.
      phase += dt * Math.PI * 2 * 4 * speechRate;
      amp += (0.32 - amp) * Math.min(1, dt * 1.5);
      goal.jawOpen = amp * (0.3 + 0.7 * Math.abs(Math.sin(phase)));
    } else {
      goal.jawOpen = 0;
    }

    ease("jawOpen", 0.00001, dt);
    for (const key of ["mouthSmile", "mouthFrown", "browInnerUp", "browDown"]) ease(key, 0.02, dt);
    for (const key of ["headYaw", "headPitch", "gazeX", "gazeY"]) ease(key, reduceMotion ? 0 : 0.05, dt);

    draw();
    frameListeners.forEach((fn) => fn(shapes));
    requestAnimationFrame(tick);
  }

  function path(points, closed) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length - 1; i++) {
      const [x, y] = points[i];
      const [nx, ny] = points[i + 1];
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    const end = points[points.length - 1];
    ctx.lineTo(end[0], end[1]);
    if (closed) ctx.closePath();
  }

  function draw() {
    const { w, h, dpr } = view;
    if (!w || !h) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Head spans y -0.5..0.56 and the shoulders reach ~0.9; centre that range.
    const scale = Math.min(w / 1.2, h / 1.55);
    const ox = w / 2;
    const oy = h / 2 - 0.2 * scale;
    const S = ([x, y]) => [ox + x * scale, oy + y * scale];
    const g = faceGeometry(shapes);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Neck and shoulders.
    ctx.strokeStyle = COLORS.body;
    ctx.lineWidth = 1.2;
    path([[-0.13, 0.43], [-0.14, 0.62]].map(S));
    ctx.stroke();
    path([[0.13, 0.43], [0.14, 0.62]].map(S));
    ctx.stroke();
    path([[-0.62, 0.95], [-0.5, 0.72], [-0.14, 0.64], [0, 0.66], [0.14, 0.64], [0.5, 0.72], [0.62, 0.95]].map(S));
    ctx.stroke();

    ctx.strokeStyle = COLORS.wire;
    ctx.lineWidth = 1;
    g.wire.forEach((line) => { path(line.map(S)); ctx.stroke(); });

    ctx.fillStyle = COLORS.dot;
    g.dots.forEach((p) => {
      const [x, y] = S(p);
      ctx.beginPath();
      ctx.arc(x, y, 1.1, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.4;
    path(g.outline.map(S), true);
    ctx.stroke();

    ctx.strokeStyle = COLORS.feature;
    ctx.lineWidth = 1.7;
    g.features.forEach((line) => { path(line.map(S)); ctx.stroke(); });

    if (g.mouth) {
      ctx.fillStyle = COLORS.mouth;
      path(g.mouth.map(S), true);
      ctx.fill();
    }
    path(g.lips.map(S), true);
    ctx.stroke();
    if (g.seam) { path(g.seam.map(S)); ctx.stroke(); }

    g.irises.forEach(({ c, r }) => {
      const [x, y] = S(c);
      ctx.fillStyle = COLORS.feature;
      ctx.beginPath();
      ctx.arc(x, y, r * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.mouth;
      ctx.beginPath();
      ctx.arc(x, y, r * scale * 0.45, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  requestAnimationFrame(tick);

  return {
    setExpression(name) { Object.assign(goal, EXPRESSIONS[name] ?? EXPRESSIONS.neutral); },
    setSpeaking(on, rate = 1) { speaking = on; speechRate = rate; if (on) amp = Math.max(amp, 0.5); },
    word(w) {
      const syllables = (w.match(/[aeiouy]+/gi) || []).length || 1;
      amp = Math.min(1, 0.45 + 0.15 * syllables);
    },
    onFrame(fn) { frameListeners.add(fn); return () => frameListeners.delete(fn); },
  };
}
