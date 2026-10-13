/* Small shared helpers. No framework: the DOM is built with `h()` and updated by
   the components that own it. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Creates an element. `props` keys starting with "on" become listeners,
    `dataset`/`style` objects are merged, `html` sets innerHTML (trusted markup only). */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "text") el.textContent = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "style" && typeof v === "object") for (const [sk, sv] of Object.entries(v)) sk.startsWith("--") ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function uid(prefix = "") {
  const a = crypto.getRandomValues(new Uint32Array(2));
  return prefix + a[0].toString(36) + a[1].toString(36).slice(0, 4);
}

/** Tiny event emitter. */
export class Emitter {
  constructor() { this._l = new Map(); }
  on(type, fn) {
    if (!this._l.has(type)) this._l.set(type, new Set());
    this._l.get(type).add(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) { this._l.get(type)?.delete(fn); }
  emit(type, detail) { this._l.get(type)?.forEach((fn) => { try { fn(detail); } catch (e) { console.error(e); } }); }
}

/** mm:ss or h:mm:ss, always with Latin digits (timecodes are read left to right). */
export function formatTime(sec, withFrames = false, fps = 30) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const total = Math.floor(sec + 1e-6);
  const hh = Math.floor(total / 3600), mm = Math.floor((total % 3600) / 60), ss = total % 60;
  const p = (n) => String(n).padStart(2, "0");
  let s = (hh ? hh + ":" + p(mm) : p(mm)) + ":" + p(ss);
  if (withFrames) s += "." + p(Math.floor((sec - total) * fps + 1e-6));
  return s;
}

export function formatDuration(sec) {
  return sec < 10 ? sec.toFixed(1) + "s" : formatTime(sec);
}

export function formatBytes(n, lang = "en") {
  if (!isFinite(n)) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return new Intl.NumberFormat(lang, { maximumFractionDigits: n < 10 && i ? 1 : 0 }).format(n) + " " + units[i];
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Seeded PRNG (mulberry32), used so generated music and noise are reproducible. */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Saves a Blob through a temporary link; the object URL is revoked afterwards. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: filename, style: "display:none" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function safeFilename(name, fallback = "project") {
  const s = String(name || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return s || fallback;
}

export const isTouch = () => matchMedia("(pointer: coarse)").matches;
export const prefersReducedMotion = () =>
  document.documentElement.getAttribute("data-motion") === "reduce" || matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Picks files with a hidden input. Resolves with an array (possibly empty). */
export function pickFiles({ accept = "", multiple = true } = {}) {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept, multiple, class: "sr-only", tabindex: "-1", "aria-hidden": "true" });
    let done = false;
    const finish = (files) => { if (done) return; done = true; input.remove(); resolve(files); };
    input.addEventListener("change", () => finish(Array.from(input.files || [])));
    input.addEventListener("cancel", () => finish([]));
    document.body.append(input);
    input.click();
  });
}
