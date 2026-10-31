// Event log of every stage, with time since the turn started.
const MAX_ROWS = 120;

export function mountTrace(container, clearButton, bus) {
  const empty = () => {
    container.innerHTML = '<p class="trace__empty">Each turn is logged here as it runs.</p>';
  };
  empty();

  function row(cells, className) {
    container.querySelector(".trace__empty")?.remove();
    const div = document.createElement("div");
    div.className = className;
    cells.forEach(([cls, text]) => {
      const span = document.createElement("span");
      span.className = cls;
      span.textContent = text;
      div.append(span);
    });
    container.append(div);
    while (container.children.length > MAX_ROWS) container.firstElementChild.remove();
    container.scrollTop = container.scrollHeight;
  }

  bus.on("turn:start", ({ turn, question }) =>
    row([["trace__turn", `Turn ${turn}`], ["trace__msg", `"${question}"`]], "trace__head"));
  bus.on("trace", ({ t, stage, msg }) =>
    row([["trace__time", `+${t.toFixed(2)}s`], ["trace__stage", stage], ["trace__msg", msg]], "trace__row"));

  clearButton.addEventListener("click", empty);
}
