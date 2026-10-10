/* Entry point: router, language, theme, and lazy loading of the landing page
   and the studio. Routes are hash based so the app works from any static host
   (GitHub Pages included) without server rewrites:
     #/            landing          #/terms, #/privacy   legal pages
     #/studio      project list     #/studio/<id>        editor */
import { $, $$ } from "./core/util.js";
import { icon, MARK } from "./core/icons.js";
import { t, detect, setLanguage, onLanguage, langInfo, lang } from "./core/i18n.js";
import { applyTheme, toggleTheme, resolvedTheme, onTheme } from "./core/appearance.js";
import { openSheet, close as closeSheet, isSheetOpen } from "./core/sheet.js";
import { languageView } from "./core/common-views.js";
import { APP } from "./config.js";

const root = document.documentElement;
let landing = null;   // module, loaded on first visit to "#/"
let studio = null;    // module, loaded on first visit to "#/studio"
let currentRoute = null;

function hydrateIcons(scope = document) {
  $$("[data-icon]", scope).forEach((el) => { if (!el.firstElementChild) el.innerHTML = icon(el.dataset.icon); });
  $$("[data-mark]", scope).forEach((el) => { if (!el.firstElementChild) el.innerHTML = MARK; });
}

function parseRoute() {
  const hash = location.hash || "#/";
  let m;
  if ((m = hash.match(/^#\/studio(?:\/([\w-]+))?/))) return { name: "studio", projectId: m[1] || null };
  if ((m = hash.match(/^#\/(terms|privacy)/))) return { name: "legal", doc: m[1] };
  return { name: "home", section: /^#[a-z]/.test(hash) ? hash.slice(1) : null };
}

function updateMeta(route) {
  const titles = {
    home: APP.name,
    legal: (route.doc === "terms" ? t("terms.title") : t("privacy.title")) + " · " + APP.name,
    studio: t("studio.title") + " · " + APP.name,
  };
  document.title = titles[route.name];
  $('meta[name="description"]')?.setAttribute("content", t("meta.description"));
}

async function route() {
  const r = parseRoute();
  if (isSheetOpen() && currentRoute && currentRoute.name !== r.name) closeSheet();
  const prev = currentRoute;
  currentRoute = r;
  root.dataset.route = r.name;
  if (r.doc) root.dataset.doc = r.doc; else delete root.dataset.doc;
  updateMeta(r);

  if (r.name !== "studio" && studio && prev?.name === "studio") studio.hide();

  if (r.name === "home") {
    if (!landing) landing = await import("./landing/landing.js");
    landing.show();
    if (r.section) document.getElementById(r.section)?.scrollIntoView();
    else if (prev && prev.name !== "home") window.scrollTo(0, 0);
  } else {
    landing?.hide();
  }
  if (r.name === "legal") {
    window.scrollTo(0, 0);
    $("#legal")?.focus({ preventScroll: true });
  }
  if (r.name === "studio") {
    if (!studio) studio = await import("./editor/studio.js");
    await studio.show(r.projectId);
  }
}

function updateThemeButtons() {
  const dark = resolvedTheme() === "dark";
  $$("[data-theme-toggle]").forEach((b) => {
    const label = dark ? t("nav.themeLight") : t("nav.themeDark");
    b.setAttribute("aria-label", label);
    b.title = label;
    b.innerHTML = icon(dark ? "sun" : "moon");
  });
  $$(".current-language").forEach((el) => { el.textContent = langInfo().name; el.lang = lang(); });
}

function bindGlobal() {
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]");
    if (a?.dataset.action === "language") openSheet(languageView());
    if (a?.dataset.action === "theme") toggleTheme();
    // The header logo always returns to the very top of the home page.
    const top = e.target.closest("[data-scroll-top]");
    if (top) {
      e.preventDefault();
      const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches || root.dataset.motion === "reduce" ? "auto" : "smooth";
      if (currentRoute?.name !== "home") location.hash = "#/";
      else if (location.hash && location.hash !== "#/") history.replaceState(null, "", "#/");
      window.scrollTo({ top: 0, behavior });
      $("#main")?.focus({ preventScroll: true });
      return;
    }
    const s = e.target.closest("[data-scroll]");
    if (s) {
      e.preventDefault();
      if (currentRoute?.name !== "home") { location.hash = "#/"; setTimeout(() => document.getElementById(s.dataset.scroll)?.scrollIntoView(), 60); }
      else document.getElementById(s.dataset.scroll)?.scrollIntoView();
    }
  });
  const nav = $("#siteNav");
  addEventListener("scroll", () => nav?.classList.toggle("scrolled", scrollY > 8), { passive: true });
  addEventListener("hashchange", route);
  onTheme(updateThemeButtons);
  onLanguage(() => { updateThemeButtons(); updateMeta(currentRoute || parseRoute()); });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  try { await navigator.serviceWorker.register("sw.js", { scope: "./" }); }
  catch (e) { console.info("Offline cache unavailable:", e?.message || e); }
}

async function init() {
  applyTheme();
  hydrateIcons();
  bindGlobal();
  await setLanguage(detect());
  updateThemeButtons();
  await route();
  registerServiceWorker();
}

init();
export { hydrateIcons };
