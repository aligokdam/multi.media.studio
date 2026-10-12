/* Runs before first paint (classic script in <head>): applies the saved theme,
   language direction and route so the page never flashes the wrong state.
   Kept tiny and dependency-free on purpose. */
(function () {
  /* Opened straight from a folder (file://): browsers block ES modules there,
     so switch to the self-contained build that works without a server. */
  if (location.protocol === "file:" && !window.MMS_SINGLE_FILE) {
    location.replace("mms/standalone/multi-media-studio.html" + location.hash);
    return;
  }
  var root = document.documentElement;
  var prefs = {};
  try { prefs = JSON.parse(localStorage.getItem("mms.prefs") || "{}") || {}; } catch (e) {}

  var pref = prefs.theme === "light" || prefs.theme === "system" ? prefs.theme : "dark";
  var theme = pref === "system"
    ? (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : pref;
  root.setAttribute("data-theme", theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#ffffff" : "#000000");

  // Language: saved choice, else the browser's first supported language.
  var supported = ["en", "fil", "fr", "de", "ha", "id", "it", "pt", "es", "tr", "vi", "ar", "fa", "ur", "ru", "zh", "ja", "ko", "hi", "mr", "bn", "pa", "ta", "te"];
  var rtl = { ar: 1, fa: 1, ur: 1 };
  var lang = supported.indexOf(prefs.language) >= 0 ? prefs.language : null;
  if (!lang) {
    var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
    for (var i = 0; i < list.length && !lang; i++) {
      var base = String(list[i] || "").toLowerCase().split("-")[0];
      if (base === "tl") base = "fil";
      if (supported.indexOf(base) >= 0) lang = base;
    }
  }
  lang = lang || "en";
  root.setAttribute("lang", lang);
  root.setAttribute("dir", rtl[lang] ? "rtl" : "ltr");

  if (prefs.reduceMotion === "on") root.setAttribute("data-motion", "reduce");

  var h = location.hash;
  root.setAttribute("data-route",
    /^#\/studio/.test(h) ? "studio" : /^#\/(terms|privacy)/.test(h) ? "legal" : "home");

  // Keep the page hidden until translations are applied (with a hard cap).
  root.classList.add("i18n-wait");
  setTimeout(function () { root.classList.remove("i18n-wait"); }, 1500);
})();
