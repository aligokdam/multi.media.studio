/* Theme and motion preferences, applied to <html>. */
import { prefs } from "./prefs.js";
import { Emitter } from "./util.js";

const bus = new Emitter();
const lightQuery = matchMedia("(prefers-color-scheme: light)");

export function resolvedTheme() {
  const p = prefs.get("theme");
  return p === "system" ? (lightQuery.matches ? "light" : "dark") : p === "light" ? "light" : "dark";
}

export function applyTheme() {
  const theme = resolvedTheme();
  const root = document.documentElement;
  if (root.dataset.theme !== theme) {
    root.dataset.theme = theme;
    bus.emit("change", theme);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#ffffff" : "#000000");
  if (prefs.get("reduceMotion") === "on") root.dataset.motion = "reduce";
  else delete root.dataset.motion;
}

export function toggleTheme() {
  prefs.set("theme", resolvedTheme() === "dark" ? "light" : "dark");
}

export function onTheme(fn) { return bus.on("change", fn); }

lightQuery.addEventListener?.("change", () => applyTheme());
prefs.on("change:theme", applyTheme);
prefs.on("change:reduceMotion", applyTheme);
