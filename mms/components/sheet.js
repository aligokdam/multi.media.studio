/* One sheet component for every secondary screen (settings, language, privacy,
   export, libraries on mobile). It is a centred card on large screens and a bottom
   sheet with a grabber on phones. Views are pushed onto a stack, iOS style. */
import { h, $, prefersReducedMotion } from "../src/core/util.js";
import { icon } from "../src/core/icons.js";
import { t, onLanguage } from "../src/core/i18n.js";

let el = null;          // root element
let stack = [];         // [{ title, render, el }]
let opts = {};
let lastFocus = null;
let open = false;

function build() {
  if (el) return el;
  const backdrop = h("div", { class: "sheet-backdrop", onclick: () => close() });
  const back = h("button", { class: "nav-btn sheet-back", type: "button", onclick: () => pop() },
    h("span", { html: icon("back") }), h("span", { class: "sheet-back-label" }));
  const done = h("button", { class: "nav-btn strong sheet-done", type: "button", onclick: () => close() });
  const title = h("h2", { class: "sheet-title", id: "sheetTitle" });
  const grab = h("div", { class: "sheet-grabber", "aria-hidden": "true" });
  const header = h("div", { class: "sheet-header" }, h("div", { class: "start" }, back), title, h("div", { class: "end" }, done));
  const body = h("div", { class: "sheet-body" });
  const panel = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": "sheetTitle", tabindex: "-1" }, grab, header, body);
  el = h("div", { class: "sheet-layer", hidden: true }, backdrop, panel);
  document.body.append(el);

  panel.addEventListener("keydown", (e) => { if (e.key === "Tab") trapFocus(e, panel); });
  // Escape works wherever focus is while the sheet is open (alerts handle their own).
  document.addEventListener("keydown", (e) => {
    if (!open || e.key !== "Escape" || document.querySelector(".alert-layer")) return;
    e.preventDefault(); e.stopPropagation();
    stack.length > 1 ? pop() : close();
  }, true);
  enableDragToDismiss(grab, panel);
  onLanguage(() => { if (open) refreshChrome(); });
  return el;
}

function trapFocus(e, panel) {
  const f = Array.from(panel.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'))
    .filter((n) => n.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function enableDragToDismiss(grab, panel) {
  let y0 = null, dy = 0;
  const start = (e) => { if (!matchMedia("(max-width: 760px)").matches) return; y0 = e.clientY; dy = 0; grab.setPointerCapture(e.pointerId); panel.style.transition = "none"; };
  const move = (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); panel.style.transform = `translateY(${dy}px)`; };
  const end = () => { if (y0 == null) return; y0 = null; panel.style.transition = ""; panel.style.transform = ""; if (dy > 110) close(); };
  grab.addEventListener("pointerdown", start);
  grab.addEventListener("pointermove", move);
  grab.addEventListener("pointerup", end);
  grab.addEventListener("pointercancel", end);
}

function view() { return stack[stack.length - 1]; }

function refreshChrome() {
  const v = view();
  if (!v) return;
  $(".sheet-title", el).textContent = typeof v.title === "function" ? v.title() : v.title;
  const back = $(".sheet-back", el);
  back.hidden = stack.length < 2;
  if (stack.length > 1) {
    const prev = stack[stack.length - 2];
    $(".sheet-back-label", el).textContent = typeof prev.title === "function" ? prev.title() : prev.title;
  }
  const done = $(".sheet-done", el);
  done.textContent = t("common.done");
  done.hidden = opts.hideDone === true;
}

function mount(v, direction) {
  const body = $(".sheet-body", el);
  body.textContent = "";
  const content = h("div", { class: "sheet-view" + (direction && !prefersReducedMotion() ? " enter-" + direction : "") });
  body.append(content);
  body.scrollTop = 0;
  v.cleanup?.();
  v.cleanup = v.render(content, api) || null;
  v.el = content;
  refreshChrome();
  // Keep focus inside the sheet when its content is replaced.
  const panel = $(".sheet", el);
  if (!panel.contains(document.activeElement) || document.activeElement === document.body) panel.focus({ preventScroll: true });
}

const api = {
  push(v) { stack.push(v); mount(v, "forward"); },
  pop() { pop(); },
  close() { close(); },
  refresh() { const v = view(); if (v) mount(v); },
  setTitle(title) { const v = view(); if (v) { v.title = title; refreshChrome(); } },
};

function pop() {
  if (stack.length < 2) return close();
  const v = stack.pop();
  v.cleanup?.();
  mount(view(), "back");
}

/** Opens the sheet with a root view: { title, render(container, nav) → cleanup? }. */
export function openSheet(rootView, options = {}) {
  build();
  stack.forEach((v) => v.cleanup?.());
  stack = [rootView];
  opts = options;
  if (!open) lastFocus = document.activeElement;
  open = true;
  el.hidden = false;
  el.dataset.size = options.size || "default";
  document.documentElement.classList.add("sheet-open");
  mount(rootView);
  requestAnimationFrame(() => {
    el.classList.add("show");
    const panel = $(".sheet", el);
    (panel.querySelector("[autofocus]") || panel).focus({ preventScroll: true });
  });
  return api;
}

export function close() {
  if (!open || !el) return;
  if (opts.dismissible === false) return;
  open = false;
  stack.forEach((v) => v.cleanup?.());
  stack = [];
  el.classList.remove("show");
  document.documentElement.classList.remove("sheet-open");
  const finish = () => { if (!open) { el.hidden = true; $(".sheet-body", el).textContent = ""; } };
  prefersReducedMotion() ? finish() : setTimeout(finish, 260);
  const cb = opts.onClose; opts = {};
  cb?.();
  lastFocus?.focus?.({ preventScroll: true });
}

export function forceClose() { if (opts) opts.dismissible = true; close(); }
export const isSheetOpen = () => open;

/* ------------------------------------------------------------ alert dialog */
/** Modal confirmation. Resolves true/false. Layered above any sheet. */
export function confirmDialog({ title, message, confirm, cancel, destructive = false }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const done = (v) => { layer.classList.remove("show"); setTimeout(() => layer.remove(), 180); prev?.focus?.(); resolve(v); };
    const ok = h("button", { class: "btn " + (destructive ? "danger" : "primary"), type: "button", onclick: () => done(true) }, confirm || t("common.ok"));
    const no = h("button", { class: "btn", type: "button", onclick: () => done(false) }, cancel || t("common.cancel"));
    const box = h("div", { class: "alert", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "alertTitle", "aria-describedby": "alertMsg" },
      h("h2", { id: "alertTitle" }, title),
      message ? h("p", { id: "alertMsg" }, message) : null,
      h("div", { class: "alert-actions" }, no, ok));
    const layer = h("div", { class: "alert-layer" }, h("div", { class: "sheet-backdrop", onclick: () => done(false) }), box);
    box.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.stopPropagation(); done(false); }
      if (e.key === "Tab") trapFocus(e, box);
    });
    document.body.append(layer);
    requestAnimationFrame(() => { layer.classList.add("show"); (destructive ? no : ok).focus(); });
  });
}

/** Text prompt (used for renaming). Resolves the string or null. */
export function promptDialog({ title, value = "", confirm, maxLength = 120 }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const input = h("input", { class: "field", type: "text", value, maxlength: String(maxLength), "aria-label": title });
    const done = (v) => { layer.classList.remove("show"); setTimeout(() => layer.remove(), 180); prev?.focus?.(); resolve(v); };
    const form = h("form", { class: "alert", role: "dialog", "aria-modal": "true", "aria-labelledby": "promptTitle" },
      h("h2", { id: "promptTitle" }, title), input,
      h("div", { class: "alert-actions" },
        h("button", { class: "btn", type: "button", onclick: () => done(null) }, t("common.cancel")),
        h("button", { class: "btn primary", type: "submit" }, confirm || t("common.save"))));
    form.addEventListener("submit", (e) => { e.preventDefault(); const v = input.value.trim(); done(v || null); });
    form.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); done(null); } });
    const layer = h("div", { class: "alert-layer" }, h("div", { class: "sheet-backdrop", onclick: () => done(null) }), form);
    document.body.append(layer);
    requestAnimationFrame(() => { layer.classList.add("show"); input.focus(); input.select(); });
  });
}

/* ---------------------------------------------------------------- toast notifications */
/* Toasts: one at a time, announced politely to screen readers. */

let box, text, actionBtn, timer;

function buildToastLayer() {
  if (box) return;
  text = h("span", { class: "toast-text" });
  actionBtn = h("button", { class: "toast-action", type: "button", hidden: true });
  box = h("div", { class: "toast", role: "status", "aria-live": "polite" }, h("span", { class: "toast-dot", "aria-hidden": "true" }), text, actionBtn);
  document.body.append(box);
}

/** toast(message, { type: "info" | "error" | "success", action: { label, run }, duration }) */
export function toast(message, { type = "info", action = null, duration } = {}) {
  buildToastLayer();
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
