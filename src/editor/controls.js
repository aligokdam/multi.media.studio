/* Inspector controls. Each control edits the project through the store; sliders
   record one undo step per drag (begin on first input, commit on release). */
import { h, uid } from "../core/util.js";
import { icon } from "../core/icons.js";
import { t, num } from "../core/i18n.js";

const fill = (input) => {
  const min = +input.min, max = +input.max, v = +input.value;
  input.style.setProperty("--p", ((v - min) / (max - min)) * 100 + "%");
};

/**
 * Slider row.
 * opts: { key, label, min, max, step, value, format(v), onInput(v), store, reset, ltrTrack }
 */
export function slider(o) {
  const id = uid("s");
  const out = h("output", { class: "ctl-value tabular", for: id });
  const input = h("input", { id, type: "range", min: String(o.min), max: String(o.max), step: String(o.step ?? 1), value: String(o.value), dataset: { ctl: o.key } });
  const show = () => { out.textContent = o.format ? o.format(+input.value) : num(+input.value); fill(input); };
  show();
  let active = false;
  input.addEventListener("input", () => {
    if (!active) { active = true; o.store.begin(o.key); }
    o.store.live((p) => o.onInput(+input.value, p));
    show();
  });
  input.addEventListener("change", () => { if (active) { active = false; o.store.commit(); } });
  const label = h("label", { class: "ctl-label", for: id }, o.label);
  const row = h("div", { class: "ctl ctl-slider" }, h("div", { class: "ctl-head" }, label, out), input);
  if (o.reset != null) {
    label.title = t("insp.resetHint");
    row.addEventListener("dblclick", (e) => {
      if (e.target.closest("input")) return;
      input.value = String(o.reset); show();
      o.store.update(o.key, (p) => o.onInput(o.reset, p));
    });
  }
  return row;
}

/** Segmented radio group. options: [{ value, label, icon? }] */
export function segmented({ key, label, options, value, onChange, block = true }) {
  const lid = uid("l");
  const group = h("div", { class: "segmented" + (block ? " block" : ""), role: "radiogroup", "aria-labelledby": label ? lid : null, "aria-label": label ? null : key });
  const buttons = options.map((o) => {
    const b = h("button", { type: "button", role: "radio", "aria-checked": String(o.value === value), dataset: { ctl: key + ":" + o.value }, title: o.title || null, "aria-label": o.icon && !o.label ? o.title : null,
      onclick: () => { if (o.value !== value) onChange(o.value); } });
    if (o.icon) b.innerHTML = icon(o.icon);
    if (o.label) b.append(o.label);
    return b;
  });
  group.append(...buttons);
  group.addEventListener("keydown", (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    const rtl = document.documentElement.dir === "rtl";
    let d = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") d = 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") d = -1;
    if (!d) return;
    if (rtl && (e.key === "ArrowLeft" || e.key === "ArrowRight")) d = -d;
    e.preventDefault();
    const n = buttons[(i + d + buttons.length) % buttons.length];
    n.focus(); n.click();
  });
  return h("div", { class: "ctl" }, label ? h("span", { class: "ctl-label", id: lid }, label) : null, group);
}

export function toggle({ key, label, sub, value, onChange }) {
  const lid = uid("l");
  const sw = h("button", { class: "switch", type: "button", role: "switch", "aria-checked": String(!!value), "aria-labelledby": lid, dataset: { ctl: key }, onclick: () => onChange(!value) });
  return h("div", { class: "ctl ctl-row" }, h("span", { class: "ctl-main" }, h("span", { class: "ctl-label", id: lid }, label), sub ? h("span", { class: "ctl-sub" }, sub) : null), sw);
}

export function select({ key, label, options, value, onChange }) {
  const id = uid("sel");
  const s = h("select", { id, class: "field", dataset: { ctl: key }, onchange: (e) => onChange(e.target.value) },
    options.map((o) => h("option", { value: o.value, selected: o.value === value }, o.label)));
  return h("div", { class: "ctl" }, h("label", { class: "ctl-label", for: id }, label), s);
}

export function colorRow({ key, label, value, onChange, swatches = ["#ffffff", "#000000", "#f5d76e", "#ff6b6b", "#4dabf7", "#63e6be", "#b197fc"] }) {
  const lid = uid("l");
  const input = h("input", { type: "color", value, class: "color-input", "aria-label": t("insp.customColor"), dataset: { ctl: key + ":custom" }, onchange: (e) => onChange(e.target.value) });
  const sw = swatches.map((c) => h("button", { type: "button", class: "swatch", style: { "--c": c }, "aria-label": c, "aria-pressed": String(c.toLowerCase() === (value || "").toLowerCase()), dataset: { ctl: key + ":" + c }, onclick: () => onChange(c) }));
  return h("div", { class: "ctl" }, h("span", { class: "ctl-label", id: lid }, label), h("div", { class: "swatches", role: "group", "aria-labelledby": lid }, ...sw, h("label", { class: "swatch custom" }, input)));
}

export function textArea({ key, label, value, onInput, placeholder }) {
  const id = uid("ta");
  let active = false;
  const ta = h("textarea", { id, class: "field", rows: "3", dataset: { ctl: key }, placeholder: placeholder || "" });
  ta.value = value;
  return { el: h("div", { class: "ctl" }, h("label", { class: "ctl-label", for: id }, label), ta), ta, bind(store) {
    ta.addEventListener("input", () => { if (!active) { active = true; store.begin(key); } store.live((p) => onInput(ta.value, p)); });
    ta.addEventListener("blur", () => { if (active) { active = false; store.commit(); } });
  } };
}

export function section(title, ...children) {
  return h("section", { class: "insp-section" }, title ? h("h3", { class: "insp-title" }, title) : null, ...children);
}

export function buttonRow(...buttons) { return h("div", { class: "ctl btn-row" }, ...buttons); }

export const pct = (v) => num(Math.round(v)) + " %";
export const signed = (v) => (v > 0 ? "+" : "") + num(Math.round(v));
export const secs = (v) => num(+v.toFixed(2)) + " s";
