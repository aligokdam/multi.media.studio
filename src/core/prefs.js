/* User preferences: small, non-sensitive settings kept in localStorage on this device.
   Media and projects never go here (see storage/). */
import { Emitter } from "./util.js";

const KEY = "mms.prefs";

export const DEFAULTS = Object.freeze({
  // General
  autosave: true,
  snapping: true,
  defaultAspect: "16:9",
  imageDuration: 5,
  confirmDelete: true,
  // Appearance
  theme: "dark",              // system | light | dark
  reduceMotion: "system",     // system | on
  timelineThumbs: true,
  // Language (null: follow the browser)
  language: null,
  // Playback
  previewQuality: "auto",     // auto | full | half
  loop: false,
  safeAreas: false,
  followPlayhead: true,
  // Export
  exportFormat: "mp4",
  exportResolution: 1080,
  exportFps: 30,
  exportQuality: "high",      // medium | high | very-high
  // Onboarding
  seenLocalNotice: false,
});

const bus = new Emitter();
let state = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return Object.assign({}, DEFAULTS, raw && typeof raw === "object" ? raw : {});
  } catch {
    return Object.assign({}, DEFAULTS);
  }
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage may be blocked */ }
}

export const prefs = {
  get(key) { return key ? state[key] : { ...state }; },
  set(key, value) {
    if (state[key] === value) return;
    state[key] = value;
    persist();
    bus.emit("change", { key, value });
    bus.emit("change:" + key, value);
  },
  reset(keys) {
    for (const k of keys || Object.keys(DEFAULTS)) state[k] = DEFAULTS[k];
    persist();
    bus.emit("change", { key: "*" });
  },
  on(type, fn) { return bus.on(type, fn); },
};
