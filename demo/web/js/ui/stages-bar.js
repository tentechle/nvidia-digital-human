// Row of pipeline stages showing live state; selecting one explains the real component.
const STATE_LABEL = { idle: "Waiting", active: "Running", done: "Done", skipped: "Skipped" };

export function mountStages(list, detail, stages, bus) {
  const buttons = new Map();

  stages.forEach((s, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "stage";
    btn.dataset.state = "idle";
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = `
      <span class="stage__index">${i + 1}</span>
      <span class="stage__name"></span>
      <span class="stage__component"></span>
      <span class="stage__state">${STATE_LABEL.idle}</span>`;
    btn.querySelector(".stage__name").textContent = s.name;
    btn.querySelector(".stage__component").textContent = s.component;
    btn.addEventListener("click", () => select(s.id));
    li.append(btn);
    list.append(li);
    buttons.set(s.id, btn);
  });

  function select(id) {
    const s = stages.find((x) => x.id === id);
    buttons.forEach((b, key) => b.setAttribute("aria-pressed", String(key === id)));
    detail.innerHTML = "";
    const title = document.createElement("strong");
    title.textContent = `${s.name} · ${s.component}. `;
    detail.append(title, document.createTextNode(s.detail));
  }

  bus.on("stage", ({ id, state }) => {
    const btn = buttons.get(id);
    if (!btn) return;
    btn.dataset.state = state;
    btn.querySelector(".stage__state").textContent = STATE_LABEL[state];
  });
}
