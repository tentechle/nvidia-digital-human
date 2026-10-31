// Chat transcript: the user's questions and the assistant's replies.
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
  }

  bus.on("turn:start", ({ question }) => add("user", question));
  bus.on("reply", ({ text }) => add("assistant", text));
  return { add };
}
