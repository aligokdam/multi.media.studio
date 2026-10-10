/* Toasts: one at a time, announced politely to screen readers. */
import { h } from "./util.js";

let box, text, actionBtn, timer;

function build() {
  if (box) return;
  text = h("span", { class: "toast-text" });
  actionBtn = h("button", { class: "toast-action", type: "button", hidden: true });
  box = h("div", { class: "toast", role: "status", "aria-live": "polite" }, h("span", { class: "toast-dot", "aria-hidden": "true" }), text, actionBtn);
  document.body.append(box);
}

/** toast(message, { type: "info" | "error" | "success", action: { label, run }, duration }) */
export function toast(message, { type = "info", action = null, duration } = {}) {
  build();
  clearTimeout(timer);
  box.dataset.type = type;
  text.textContent = message;
  actionBtn.hidden = !action;
  actionBtn.onclick = null;
  if (action) {
    actionBtn.textContent = action.label;
    actionBtn.onclick = () => { hide(); action.run(); };
  }
  box.classList.add("show");
  timer = setTimeout(hide, duration || (type === "error" ? 6000 : action ? 5000 : 2600));
}

function hide() { box?.classList.remove("show"); }
