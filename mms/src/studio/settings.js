/* Settings sheet: General, Appearance, Language, Playback, Export, Storage,
   Privacy, Keyboard Shortcuts, About. iOS-style list → detail navigation. */
import { h, formatBytes, formatTime } from "../core/util.js";
import { icon } from "../core/icons.js";
import { t, lang, langInfo, date, setLanguage, detect } from "../core/i18n.js";
import { prefs, DEFAULTS } from "../core/prefs.js";
import { confirmDialog, promptDialog, close as closeSheet } from "../../components/sheet.js";
import { toast } from "../../components/sheet.js";
import { applyTheme } from "../core/prefs.js";
import { languageView, privacySummaryView } from "../core/common-views.js";
import { APP, SUPPORT, ASPECTS, RESOLUTIONS, resLabel, FRAME_RATES } from "../config.js";
import { storageInfo, requestPersistence } from "../storage/db.js";
import { listProjects, deleteProject, renameProject, deleteEverything, collectGarbage } from "../storage/projects.js";

/* ---------------------------------------------------------- building blocks */
const list = (...items) => h("ul", { class: "list" }, items.flat().filter(Boolean).map((i) => (i.tagName === "LI" ? i : h("li", {}, i))));
const group = (title, foot, ...items) => h("div", { class: "section" }, title ? h("h3", { class: "section-title" }, title) : null, list(...items), foot ? h("p", { class: "section-foot" }, foot) : null);

function switchRow(key, label, sub) {
  const sw = h("button", { class: "switch", type: "button", role: "switch", "aria-checked": String(!!prefs.get(key)), "aria-label": label,
    onclick: () => { prefs.set(key, !prefs.get(key)); sw.setAttribute("aria-checked", String(!!prefs.get(key))); } });
  return h("div", { class: "row" }, h("span", { class: "row-main" }, h("span", { class: "row-label" }, label), sub ? h("span", { class: "row-sub" }, sub) : null), sw);
}

function choiceRows(key, options, onPick) {
  const rows = options.map(([value, label, sub]) => h("button", { class: "row", type: "button", role: "radio", "aria-checked": String(prefs.get(key) === value),
    onclick: () => { prefs.set(key, value); rows.forEach((r, i) => r.setAttribute("aria-checked", String(options[i][0] === value))); onPick?.(value); } },
    h("span", { class: "row-main" }, h("span", { class: "row-label" }, label), sub ? h("span", { class: "row-sub" }, sub) : null), h("span", { html: icon("check", "check") })));
  const ul = h("ul", { class: "list", role: "radiogroup" }, rows.map((r) => h("li", {}, r)));
  return ul;
}

function segRow(key, label, options) {
  const seg = h("div", { class: "segmented", role: "radiogroup", "aria-label": label });
  const btns = options.map(([v, l]) => h("button", { type: "button", role: "radio", "aria-checked": String(prefs.get(key) === v),
    onclick: () => { prefs.set(key, v); btns.forEach((b, i) => b.setAttribute("aria-checked", String(options[i][0] === v))); } }, l));
  seg.append(...btns);
  return h("div", { class: "row wrap" }, h("span", { class: "row-label" }, label), seg);
}

function navRow(ic, label, value, view, nav) {
  return h("li", { class: "has-icon" }, h("button", { class: "row", type: "button", onclick: () => nav.push(view()) },
    h("span", { class: "row-icon", html: icon(ic) }), h("span", { class: "row-main" }, h("span", { class: "row-label" }, label)),
    value ? h("span", { class: "row-value" }, value) : null, h("span", { html: icon("chevron", "chev") })));
}

/* ---------------------------------------------------------- root
   Grouped like the other apps in the family (Giotto Sketch Studio): General,
   Appearance, Studio, Information, About, then Reset. */
export function settingsView(ctx = {}) {
  return {
    title: () => t("settings.title"),
    render(root, nav) {
      const seg = h("div", { class: "segmented block", role: "radiogroup", "aria-label": t("settings.appearance") });
      const themes = [["system", t("settings.theme.system")], ["light", t("settings.theme.light")], ["dark", t("settings.theme.dark")]];
      const btns = themes.map(([v, l]) => h("button", { type: "button", role: "radio", "aria-checked": String(prefs.get("theme") === v),
        onclick: () => { prefs.set("theme", v); btns.forEach((b, i) => b.setAttribute("aria-checked", String(themes[i][0] === v))); } }, l));
      seg.append(...btns);
      const link = (ic, label, href) => h("li", { class: "has-icon" }, h("a", { class: "row", href, onclick: () => closeSheet() },
        h("span", { class: "row-icon", html: icon(ic) }), h("span", { class: "row-main" }, h("span", { class: "row-label" }, label)), h("span", { html: icon("chevron", "chev") })));
      root.append(
        h("div", { class: "section" }, h("h3", { class: "section-title" }, t("settings.general")), h("ul", { class: "list" },
          navRow("globe", t("settings.language"), langInfo().name, languageView, nav))),
        h("div", { class: "section" }, h("h3", { class: "section-title" }, t("settings.appearance")), seg,
          h("p", { class: "section-foot" }, t("settings.appearanceHint"))),
        h("div", { class: "section" }, h("h3", { class: "section-title" }, t("settings.studio")), h("ul", { class: "list" },
          navRow("general", t("settings.editing"), null, generalView, nav),
          navRow("appearance", t("settings.display"), null, appearanceView, nav),
          navRow("playback", t("settings.playback"), null, playbackView, nav),
          navRow("exportFile", t("settings.export"), null, exportPrefsView, nav),
          navRow("storage", t("settings.storage"), null, () => storageView(ctx), nav))),
        h("div", { class: "section" }, h("h3", { class: "section-title" }, t("settings.info")), h("ul", { class: "list" },
          navRow("shield", t("privacy.title"), null, privacySummaryView, nav),
          link("license", t("terms.title"), "#/terms"),
          link("info", t("faq.title"), "#faq"),
          navRow("help", t("nav.how"), null, guideView, nav),
          navRow("keyboard", t("settings.shortcuts"), null, shortcutsView, nav))),
        h("div", { class: "section" }, h("h3", { class: "section-title" }, t("settings.about")), h("ul", { class: "list" },
          navRow("info", APP.name, APP.version, aboutView, nav),
          h("li", {}, h("div", { class: "row static" }, h("span", { class: "row-label" }, t("about.license")), h("span", { class: "row-value" }, "MIT"))),
          h("li", {}, h("a", { class: "row", href: APP.repository, target: "_blank", rel: "noopener noreferrer" }, h("span", { class: "row-label" }, t("settings.source")), h("span", { class: "row-value" }, "GitHub"), h("span", { html: icon("chevron", "chev") }))))),
        h("div", { class: "section" }, h("ul", { class: "list" }, h("li", {}, h("button", { class: "row danger", type: "button", onclick: async () => {
          if (!(await confirmDialog({ title: t("settings.reset"), message: t("settings.resetConfirm"), confirm: t("common.reset"), destructive: true }))) return;
          const keep = new Set(["seenLocalNotice"]);
          prefs.reset(Object.keys(DEFAULTS).filter((k) => !keep.has(k)));
          applyTheme();
          await setLanguage(detect());
          toast(t("settings.resetDone"));
          nav.close();
        } }, h("span", { class: "row-label" }, t("settings.reset")))))));
    },
  };
}

/** "How it works" guide, opened from the ? button and from Settings. */
export function guideView() {
  return {
    title: () => t("guide.title"),
    render(root) {
      root.append(
        h("ol", { class: "guide-steps" }, [1, 2, 3, 4, 5, 6, 7].map((i) => h("li", {}, h("span", { class: "guide-num", "aria-hidden": "true" }, String(i)), h("p", {}, t("guide.s" + i))))),
        h("p", { class: "guide-privacy" }, t("guide.privacy")));
    },
  };
}

function generalView() {
  return {
    title: () => t("settings.general"),
    render(root) {
      root.append(
        group(null, t("settings.autosaveFoot"), switchRow("autosave", t("settings.autosave")), switchRow("snapping", t("settings.snapping"), t("settings.snappingSub")), switchRow("confirmDelete", t("settings.confirmDelete"))),
        h("div", { class: "section" }, h("h3", { class: "section-title" }, t("settings.newProjects")),
          h("ul", { class: "list" },
            h("li", {}, segRow("defaultAspect", t("settings.defaultAspect"), Object.keys(ASPECTS).map((a) => [a, a]))),
            h("li", {}, segRow("imageDuration", t("settings.imageDuration"), [3, 5, 8, 10].map((s) => [s, t("common.seconds", { n: s })]))))));
    },
  };
}

function appearanceView() {
  return {
    title: () => t("settings.appearance"),
    render(root) {
      root.append(
        h("div", { class: "section" }, h("h3", { class: "section-title" }, t("settings.themeTitle")),
          choiceRows("theme", [["system", t("settings.theme.system"), t("settings.theme.systemSub")], ["light", t("settings.theme.light")], ["dark", t("settings.theme.dark")]])),
        group(null, null,
          h("div", { class: "row" }, h("span", { class: "row-main" }, h("span", { class: "row-label" }, t("settings.reduceMotion")), h("span", { class: "row-sub" }, t("settings.reduceMotionSub"))),
            (() => { const sw = h("button", { class: "switch", type: "button", role: "switch", "aria-label": t("settings.reduceMotion"), "aria-checked": String(prefs.get("reduceMotion") === "on"),
              onclick: () => { prefs.set("reduceMotion", prefs.get("reduceMotion") === "on" ? "system" : "on"); sw.setAttribute("aria-checked", String(prefs.get("reduceMotion") === "on")); } }); return sw; })()),
          switchRow("timelineThumbs", t("settings.timelineThumbs"))));
    },
  };
}

function playbackView() {
  return {
    title: () => t("settings.playback"),
    render(root) {
      root.append(
        h("div", { class: "section" }, h("h3", { class: "section-title" }, t("settings.previewQuality")),
          choiceRows("previewQuality", [["auto", t("settings.quality.auto"), t("settings.quality.autoSub")], ["full", t("settings.quality.full")], ["half", t("settings.quality.half"), t("settings.quality.halfSub")]])),
        group(null, null, switchRow("loop", t("settings.loop")), switchRow("followPlayhead", t("settings.follow")), switchRow("safeAreas", t("settings.safeAreas"), t("settings.safeAreasSub"))));
    },
  };
}

function exportPrefsView() {
  return {
    title: () => t("settings.export"),
    render(root) {
      root.append(
        h("div", { class: "section" }, h("ul", { class: "list" },
          h("li", {}, segRow("exportFormat", t("export.format"), [["mp4", "MP4"], ["webm", "WebM"]])),
          h("li", {}, segRow("exportResolution", t("export.resolution"), RESOLUTIONS.map((r) => [r, resLabel(r)]))),
          h("li", {}, segRow("exportFps", t("export.fps"), FRAME_RATES.map((f) => [f, String(f)]))),
          h("li", {}, segRow("exportQuality", t("export.quality"), [["medium", t("export.q.medium")], ["high", t("export.q.high")], ["very-high", t("export.q.max")]])))),
        h("p", { class: "section-foot" }, t("settings.exportFoot")));
    },
  };
}

function storageView(ctx) {
  return {
    title: () => t("settings.storage"),
    render(root, nav) {
      const usage = h("div", { class: "storage-meter" }, h("div", { class: "progress" }, h("span")), h("p", { class: "row-sub" }, t("common.loading")));
      const persistRow = h("div", { class: "row" });
      const projectsList = h("ul", { class: "list" });
      root.append(
        h("div", { class: "notice" }, h("span", { html: icon("info") }), h("p", {}, t("storage.notice"))),
        h("div", { class: "section" }, h("h3", { class: "section-title" }, t("settings.usage")), h("div", { class: "list pad" }, usage)),
        h("div", { class: "section" }, h("ul", { class: "list" }, h("li", {}, persistRow)), h("p", { class: "section-foot" }, t("settings.persistFoot"))),
        h("div", { class: "section" }, h("h3", { class: "section-title" }, t("settings.projects")), projectsList),
        h("div", { class: "section" }, h("ul", { class: "list" },
          h("li", {}, h("button", { class: "row", type: "button", onclick: async () => { const n = await collectGarbage(); toast(t("settings.cleaned", { n })); refresh(); } }, h("span", { class: "row-label" }, t("settings.cleanUp")))),
          h("li", {}, h("button", { class: "row danger", type: "button", onclick: async () => {
            if (!(await confirmDialog({ title: t("settings.deleteAllTitle"), message: t("settings.deleteAllBody"), confirm: t("settings.deleteAll"), destructive: true }))) return;
            ctx.beforeDeleteAll?.();
            await deleteEverything();
            location.hash = "#/";
            location.reload();
          } }, h("span", { class: "row-label" }, t("settings.deleteAll")))))));

      async function refresh() {
        const info = await storageInfo();
        const pctUsed = info.quota ? Math.min(100, (info.usage / info.quota) * 100) : 0;
        usage.querySelector(".progress span").style.width = pctUsed + "%";
        usage.querySelector("p").textContent = t("settings.usageText", { used: formatBytes(info.usage, lang()), total: formatBytes(info.quota, lang()) }) + " · " + t("settings.backend." + info.backend);
        persistRow.textContent = "";
        persistRow.append(h("span", { class: "row-main" }, h("span", { class: "row-label" }, t("settings.persistent")), h("span", { class: "row-sub" }, info.persisted ? t("settings.persistOn") : t("settings.persistOff"))),
          info.persisted ? h("span", { class: "badge" }, t("common.on")) : h("button", { class: "btn small", type: "button", onclick: async () => { const ok = await requestPersistence(); toast(ok ? t("settings.persistGranted") : t("settings.persistDenied")); refresh(); } }, t("settings.persistRequest")));
        projectsList.textContent = "";
        const projects = await listProjects();
        if (!projects.length) projectsList.append(h("li", {}, h("div", { class: "row" }, h("span", { class: "row-sub" }, t("projects.empty")))));
        for (const p of projects) {
          projectsList.append(h("li", {}, h("div", { class: "row" },
            h("span", { class: "row-main" }, h("span", { class: "row-label" }, p.name), h("span", { class: "row-sub" }, `${formatTime(p.duration || 0)} · ${date(p.updatedAt)}`)),
            h("button", { class: "icon-btn small", type: "button", "aria-label": t("common.rename") + " " + p.name, html: icon("edit"), onclick: async () => { const n = await promptDialog({ title: t("common.rename"), value: p.name }); if (n) { await renameProject(p.id, n); ctx.onRenamed?.(p.id, n); refresh(); } } }),
            h("button", { class: "icon-btn small", type: "button", "aria-label": t("common.delete") + " " + p.name, html: icon("trash"), onclick: async () => {
              if (!(await confirmDialog({ title: t("projects.deleteTitle"), message: t("projects.deleteBody", { name: p.name }), confirm: t("common.delete"), destructive: true }))) return;
              if (ctx.currentProjectId?.() === p.id) { ctx.onDeleteCurrent?.(); }
              await deleteProject(p.id); refresh();
            } }))));
        }
      }
      refresh();
      void nav;
    },
  };
}

export const SHORTCUTS = [
  ["Space", "sc.play"], ["K", "sc.pause"], ["J / L", "sc.jump"], ["← / →", "sc.frame"], ["Shift + ← / →", "sc.second"],
  ["↑ / ↓", "sc.edit"], ["Home / End", "sc.startEnd"], ["S", "sc.split"], ["⌘/Ctrl + B", "sc.split"], ["Delete", "sc.delete"],
  ["⌘/Ctrl + D", "sc.duplicate"], ["⌘/Ctrl + Z", "sc.undo"], ["⇧ + ⌘/Ctrl + Z", "sc.redo"], ["+ / −", "sc.zoom"], ["\\", "sc.fit"],
  ["N", "sc.snap"], ["T", "sc.text"], ["I", "sc.import"], ["Q / W", "sc.trim"], ["Alt + ← / →", "sc.nudge"], ["E", "sc.export"],
  ["⌘/Ctrl + S", "sc.save"], ["Esc", "sc.deselect"], ["?", "sc.help"],
];

export function shortcutsView() {
  return {
    title: () => t("settings.shortcuts"),
    render(root) {
      root.append(h("div", { class: "section" }, h("ul", { class: "list" }, SHORTCUTS.map(([k, d]) =>
        h("li", {}, h("div", { class: "row" }, h("span", { class: "row-main" }, h("span", { class: "row-label" }, t(d))), h("span", { class: "row-value" }, ...k.split(" / ").map((x, i) => [i ? " / " : null, h("kbd", {}, x)]).flat().filter(Boolean))))))),
        h("p", { class: "section-foot" }, t("settings.shortcutsFoot")));
    },
  };
}

function aboutView() {
  return {
    title: () => t("settings.about"),
    render(root) {
      root.append(
        h("div", { class: "about-head" }, h("span", { class: "about-mark", html: `<svg viewBox="0 0 32 32" class="mark"><use href="#"/></svg>` }), h("h2", {}, APP.name), h("p", { class: "row-sub" }, t("about.version", { v: APP.version })), h("p", {}, t("about.tagline"))),
        group(null, null,
          h("div", { class: "row" }, h("span", { class: "row-label" }, t("about.author")), h("span", { class: "row-value" }, APP.author)),
          h("div", { class: "row" }, h("span", { class: "row-label" }, t("about.license")), h("span", { class: "row-value" }, "MIT")),
          h("a", { class: "row", href: APP.repository, target: "_blank", rel: "noopener noreferrer" }, h("span", { class: "row-label" }, t("cta.github")), h("span", { html: icon("chevron", "chev") })),
          h("a", { class: "row", href: APP.issues, target: "_blank", rel: "noopener noreferrer" }, h("span", { class: "row-label" }, t("about.feedback")), h("span", { html: icon("chevron", "chev") })),
          SUPPORT.enabled && SUPPORT.url ? h("a", { class: "row", href: SUPPORT.url, target: "_blank", rel: "noopener noreferrer" }, h("span", { class: "row-label" }, t(SUPPORT.labelKey)), h("span", { html: icon("chevron", "chev") })) : null),
        h("div", { class: "section" }, h("h3", { class: "section-title" }, t("about.credits")), list(
          h("div", { class: "row" }, h("span", { class: "row-main" }, h("span", { class: "row-label" }, "Mediabunny"), h("span", { class: "row-sub" }, t("about.mediabunny"))), h("span", { class: "row-value" }, "MPL-2.0")),
          h("div", { class: "row" }, h("span", { class: "row-main" }, h("span", { class: "row-label" }, "fflate"), h("span", { class: "row-sub" }, t("about.fflate"))), h("span", { class: "row-value" }, "MIT")),
          h("div", { class: "row" }, h("span", { class: "row-main" }, h("span", { class: "row-label" }, t("about.music")), h("span", { class: "row-sub" }, t("about.musicSub"))), h("span", { class: "row-value" }, "CC0")))),
        h("p", { class: "section-foot" }, t("about.free")));
      const m = root.querySelector(".about-mark");
      import("../core/icons.js").then(({ MARK }) => { m.innerHTML = MARK; });
    },
  };
}

export { DEFAULTS };
