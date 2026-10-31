// Chat transcript: the user's questions and the assistant's replies.
// LLM replies arrive sentence by sentence and are appended to one item.
export function mountTranscript(list, bus) {
  function add(role, text) {
    const item = document.createElement("li");
    item.className = `transcript__item transcript__item--${role}`;
    const who = document.createElement("span");
    who.className = "transcript__who";
    who.textContent = role === "user" ? "You" : "Assistant";
    const body = document.createElement("p");
    body.textContent = text;
    item.append(who, body);
    list.append(item);
    list.scrollTop = list.scrollHeight;
    return body;
  }

  let streaming = null;
  bus.on("turn:start", ({ question }) => { add("user", question); streaming = null; });
  bus.on("reply", ({ text }) => add("assistant", text));
  bus.on("reply:start", () => {
    streaming = add("assistant", "…");
    streaming.dataset.empty = "true";
  });
  bus.on("reply:chunk", ({ text }) => {
    if (!streaming) return;
    streaming.textContent = streaming.dataset.empty ? text.trim() : `${streaming.textContent} ${text.trim()}`;
    delete streaming.dataset.empty;
    list.scrollTop = list.scrollHeight;
  });
  bus.on("turn:end", () => {
    if (streaming?.dataset.empty) streaming.textContent = "(no answer)";
    streaming = null;
  });
  return { add };
}
