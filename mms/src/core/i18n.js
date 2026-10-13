/* Internationalisation.
   - Strings live in locales/<code>.js (flat "section.key" names).
   - English is always loaded and is the fallback for any missing key.
   - DOM bindings: data-i18n (text), data-i18n-html (trusted markup from locale files),
     data-i18n-aria, data-i18n-title, data-i18n-placeholder.
   - `{name}` placeholders are replaced from the vars object. */
import { LANGUAGES } from "../../../m.m.s/locales/index.js";
import { Emitter } from "./util.js";
import { prefs } from "./prefs.js";

/* Static import paths so bundlers (and the single-file build) can see every locale. */
const LOADERS = {
  en: () => import("../../../m.m.s/locales/en.js"),
  fil: () => import("../../../m.m.s/locales/fil.js"),
  fr: () => import("../../../m.m.s/locales/fr.js"),
  de: () => import("../../../m.m.s/locales/de.js"),
  ha: () => import("../../../m.m.s/locales/ha.js"),
  id: () => import("../../../m.m.s/locales/id.js"),
  it: () => import("../../../m.m.s/locales/it.js"),
  pt: () => import("../../../m.m.s/locales/pt.js"),
  es: () => import("../../../m.m.s/locales/es.js"),
  tr: () => import("../../../m.m.s/locales/tr.js"),
  vi: () => import("../../../m.m.s/locales/vi.js"),
  ar: () => import("../../../m.m.s/locales/ar.js"),
  fa: () => import("../../../m.m.s/locales/fa.js"),
  ur: () => import("../../../m.m.s/locales/ur.js"),
  ru: () => import("../../../m.m.s/locales/ru.js"),
  zh: () => import("../../../m.m.s/locales/zh.js"),
  ja: () => import("../../../m.m.s/locales/ja.js"),
  ko: () => import("../../../m.m.s/locales/ko.js"),
  hi: () => import("../../../m.m.s/locales/hi.js"),
  mr: () => import("../../../m.m.s/locales/mr.js"),
  bn: () => import("../../../m.m.s/locales/bn.js"),
  pa: () => import("../../../m.m.s/locales/pa.js"),
  ta: () => import("../../../m.m.s/locales/ta.js"),
  te: () => import("../../../m.m.s/locales/te.js"),
};
const bus = new Emitter();
const dicts = {};
let current = "en";

async function loadDict(code) {
  if (dicts[code]) return dicts[code];
  try {
    const mod = await LOADERS[code]();
    dicts[code] = mod.default || {};
  } catch (e) {
    console.warn("Language file failed to load:", code, e);
    dicts[code] = null;
  }
  return dicts[code];
}

export function languages() { return LANGUAGES; }
export function lang() { return current; }
export function langInfo(code = current) { return LANGUAGES.find((l) => l.code === code) || LANGUAGES[0]; }
export function isRTL() { return langInfo().dir === "rtl"; }

export function t(key, vars) {
  let s = dicts[current]?.[key];
  if (s == null) s = dicts.en?.[key];
  if (s == null) {
    if (dicts.en) console.debug("i18n: missing key", key);
    s = key;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return s;
}

/** True when the key exists in English (used for optional strings). */
export function has(key) { return dicts.en?.[key] != null; }

export function detect() {
  const saved = prefs.get("language");
  if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  const list = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  for (const tag of list) {
    let base = String(tag || "").toLowerCase().split("-")[0];
    if (base === "tl") base = "fil";
    if (LANGUAGES.some((l) => l.code === base)) return base;
  }
  return "en";
}

export async function setLanguage(code, { persist = false } = {}) {
  if (!LANGUAGES.some((l) => l.code === code)) code = "en";
  await loadDict("en");
  const d = await loadDict(code);
  if (!d) code = "en";
  current = code;
  const info = langInfo(code);
  const root = document.documentElement;
  root.lang = code;
  root.dir = info.dir;
  root.dataset.script = info.script;
  if (persist) prefs.set("language", code);
  translate(document);
  root.classList.remove("i18n-wait");
  bus.emit("change", code);
}

export function translate(root = document) {
  const q = (sel) => (root.querySelectorAll ? root.querySelectorAll(sel) : []);
  q("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  q("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  q("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
  q("[data-i18n-title]").forEach((el) => el.setAttribute("title", t(el.dataset.i18nTitle)));
  q("[data-i18n-placeholder]").forEach((el) => el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder)));
}

export function onLanguage(fn) { return bus.on("change", fn); }

/** Locale-aware number formatting for UI values (not timecodes). */
export function num(n, opts) {
  try { return new Intl.NumberFormat(current, opts).format(n); } catch { return String(n); }
}

export function date(ts) {
  try { return new Intl.DateTimeFormat(current, { dateStyle: "medium", timeStyle: "short" }).format(ts); }
  catch { return new Date(ts).toLocaleString(); }
}
