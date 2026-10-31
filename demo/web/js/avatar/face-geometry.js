// Builds the wireframe face from blendshape weights.
// Units are normalised: x right, y down, the head spans about y -0.5 to 0.56.
// Depth (0 at the silhouette, ~1 at the nose) drives a small parallax when the head turns.

const lerp = (a, b, t) => a + (b - a) * t;
const range = (n) => Array.from({ length: n }, (_, i) => i / (n - 1));

const CROWN = -0.5;
const CHIN = 0.56;

// Half-width of the head silhouette at height y.
export function halfWidth(y) {
  if (y <= 0) {
    // Superellipse: a fuller, rounder crown than a plain ellipse.
    const t = Math.min(1, -y / -CROWN);
    return 0.4 * Math.max(0, 1 - t ** 2.6) ** (1 / 2.6);
  }
  const t = Math.min(1, y / CHIN);
  return 0.4 * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.3 * t * t);
}

// Seeded random points spread over the skin, kept away from the eyes and mouth.
const SKIN_POINTS = (() => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts = [];
  while (pts.length < 150) {
    const y = lerp(CROWN + 0.06, CHIN - 0.05, rand());
    const u = lerp(-0.92, 0.92, rand());
    const x = u * halfWidth(y);
    const nearEye = Math.abs(Math.abs(x) - 0.155) < 0.1 && Math.abs(y + 0.035) < 0.06;
    const nearMouth = Math.abs(x) < 0.15 && y > 0.2 && y < 0.31;
    if (!nearEye && !nearMouth) pts.push([x, y, Math.sqrt(1 - u * u)]);
  }
  return pts;
})();

export function faceGeometry(b) {
  const project = (x, y, depth) => [x + b.headYaw * 0.06 * depth, y + b.headPitch * 0.05 * depth];
  // Skin below the cheeks follows the jaw.
  const drop = (y) => (y > 0.2 ? b.jawOpen * 0.075 * Math.min(1, (y - 0.2) / 0.36) : 0);
  const skin = (x, y, depth) => project(x, y + drop(y), depth);

  // Silhouette, latitude and longitude lines.
  const ys = range(44).map((t) => lerp(CROWN, CHIN, t));
  const right = ys.map((y) => skin(halfWidth(y), y, 0));
  const left = ys.map((y) => skin(-halfWidth(y), y, 0)).reverse();
  const outline = [...right, ...left];

  const wire = [];
  for (const y0 of [-0.38, -0.25, -0.12, 0.05, 0.18, 0.33, 0.46]) {
    const hw = halfWidth(y0);
    wire.push(range(21).map((t) => {
      const u = t * 2 - 1;
      return skin(u * hw, y0 + 0.028 * (1 - u * u), Math.sqrt(1 - u * u));
    }));
  }
  for (const u of [-0.7, -0.35, 0, 0.35, 0.7]) {
    wire.push(ys.slice(1, -1).map((y) => skin(u * halfWidth(y), y, Math.sqrt(1 - u * u))));
  }
  const dots = SKIN_POINTS.map(([x, y, d]) => skin(x, y, d));

  // Eyes and brows.
  const open = 1 - b.eyeBlink;
  const squint = b.mouthSmile * 0.25;
  const lids = [];
  const irises = [];
  const brows = [];
  for (const side of [-1, 1]) {
    const cx = side * 0.155;
    const cy = -0.035;
    const arc = range(11).map((t) => Math.PI * t);
    lids.push(arc.map((a) => project(cx + 0.066 * Math.cos(a), cy - 0.03 * open * Math.sin(a) * (1 - squint * 0.3), 0.85)));
    lids.push(arc.map((a) => project(cx + 0.066 * Math.cos(a), cy + (0.02 * open - squint * 0.012) * Math.sin(a), 0.85)));
    if (open > 0.3) {
      irises.push({ c: project(cx + b.gazeX * 0.022, cy + b.gazeY * 0.01 - 0.002, 0.9), r: 0.021 * Math.min(1, open * 1.3) });
    }
    brows.push(range(8).map((u) => {
      const arch = 0.022 * Math.sin(Math.PI * Math.min(1, u * 1.2));
      const y = -0.125 - arch - b.browInnerUp * 0.035 * (1 - u) + b.browDown * 0.03 * (1 - 0.6 * u) - b.mouthSmile * 0.006;
      return project(side * (0.075 + 0.16 * u), y, 0.8);
    }));
  }

  // Nose.
  const nose = [
    [[0, -0.06], [0.004, 0.02], [0.012, 0.1]].map(([x, y]) => project(x, y, 1.1)),
    [[-0.048, 0.118], [-0.03, 0.135], [0, 0.142], [0.03, 0.135], [0.048, 0.118]].map(([x, y]) => project(x, y, 1)),
  ];

  // Lips: four curves between the two corners.
  const { mouthSmile: s, mouthFrown: f, jawOpen: j } = b;
  const cornerX = 0.1 + s * 0.025 - f * 0.01;
  const cornerY = 0.252 - s * 0.028 + f * 0.03;
  const curve = (mid, scaleX = 1, dip = 0) => range(13).map((t) => {
    const u = t * 2 - 1;
    return project(u * cornerX * scaleX, lerp(cornerY, mid, 1 - u * u) + dip * Math.exp(-((u / 0.18) ** 2)), 0.95);
  });
  const upperOuter = curve(0.226, 1, 0.006);
  const upperInner = curve(0.247, 0.96);
  const lowerInner = curve(0.25 + j * 0.085, 0.96);
  const lowerOuter = curve(0.283 + j * 0.09);

  const chin = [[-0.05, 0.4], [0, 0.408], [0.05, 0.4]].map(([x, y]) => skin(x, y, 0.8));

  return {
    outline,
    wire,
    dots,
    features: [...lids, ...brows, ...nose, chin],
    lips: [...upperOuter, ...lowerOuter.slice().reverse()],
    mouth: j > 0.02 ? [...upperInner, ...lowerInner.slice().reverse()] : null,
    seam: j > 0.02 ? null : upperInner,
    irises,
  };
}
