// Live bars for the avatar's blendshape weights. Updates the DOM ~15 times a second.
export function mountMeters(list, keys, avatar) {
  const rows = keys.map((key) => {
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.innerHTML = '<span class="meter"><span class="meter__fill"></span></span><output class="meter__value">0.00</output>';
    list.append(dt, dd);
    return { key, fill: dd.querySelector(".meter__fill"), value: dd.querySelector(".meter__value") };
  });

  let lastPaint = 0;
  avatar.onFrame((shapes) => {
    const now = performance.now();
    if (now - lastPaint < 66) return;
    lastPaint = now;
    rows.forEach(({ key, fill, value }) => {
      const v = Math.max(0, Math.min(1, shapes[key]));
      fill.style.transform = `scaleX(${v})`;
      value.textContent = v.toFixed(2);
    });
  });
}
