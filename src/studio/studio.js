/* Studio: project browser and editor shell. Wires store, media registry,
   playback, preview, timeline, inspector and panels together, and owns
   autosave, keyboard shortcuts and the responsive layout. */
import { h, $, formatTime, formatBytes, debounce, pickFiles, downloadBlob, safeFilename, isTouch } from "../core/util.js";
import { icon, MARK } from "../core/icons.js";
import { t, lang, date, onLanguage, translate } from "../core/i18n.js";
import { prefs } from "../core/prefs.js";
import { openSheet, close as closeSheet, isSheetOpen, confirmDialog, promptDialog } from "../../components/sheet.js";
import { toast } from "../../components/toast.js";
import { APP, ASPECTS, RESOLUTIONS, resLabel, FRAME_RATES } from "../config.js";
import { webgl2Supported } from "../render/compositor.js";
import { createProject, findClip, frameSize, projectDuration, isVisual, mainTrack } from "./model.js";
import { createStore } from "./store.js";
import { createActions } from "./actions.js";
import { MediaRegistry, ACCEPT, kindOf } from "../media/registry.js";
import { Playback } from "./playback.js";
import { Preview } from "./preview.js";
import { Timeline, trackName, trackIcon } from "./timeline.js";
import { Inspector } from "./inspector.js";
import { mediaPanel, importFlow } from "../../components/panels/media-panel.js";
import { musicPanel, soundsPanel } from "../../components/panels/audio-panels.js";
import { stickersPanel } from "../../components/panels/sticker-panel.js";
import { textPanel, effectsPanel, transitionsPanel, loadUserEffects, loadUserTransitions } from "../../components/panels/visual-panels.js";
import { settingsView, shortcutsView, guideView } from "./settings.js";
import { exportNowView, estimateBytes } from "../export/export-sheet.js";
import { probeCapabilities } from "../export/exporter.js";
import { listProjects, loadProject, saveProject, savePhotoProject, deleteProject, renameProject } from "../storage/projects.js";
import { exportPackage, importPackage } from "../storage/package.js";
import { stopPreview } from "../audio/preview.js";
import { loadUserFonts, ensureProjectFonts } from "../render/fonts.js";

const root = () => document.getElementById("studio");
let session = null;          // open editor session
let userEffectsLoaded = false;

export async function show(projectId) {
  if (!webgl2Supported()) { renderUnsupported(); return; }
  if (!userEffectsLoaded) { userEffectsLoaded = true; await Promise.all([loadUserEffects().catch(() => {}), loadUserFonts().catch(() => {}), loadUserTransitions().catch(() => {})]); }
  if (!projectId) { await closeSession(); await renderBrowser(); return; }
  if (projectId === "new") {
    // "Start a project" links land here: show the project list with the new-project sheet open.
    history.replaceState(null, "", "#/studio");
    await closeSession(); await renderBrowser(); newProjectFlow(); return;
  }
  if (session?.project?.id === projectId) return;
  await closeSession();
  const project = await loadProject(projectId).catch(() => null);
  if (!project) { toast(t("projects.notFound"), { type: "error" }); location.hash = "#/studio"; return; }
  if (project.kind === "photo") { const files = pendingPhotoFiles?.id === project.id ? pendingPhotoFiles.files : null; pendingPhotoFiles = null; await openPhoto(project, { files }); return; }
  openEditor(project);
}

/* ------------------------------------------------------------ photo projects */
let pendingPhotoFiles = null;
async function openPhoto(doc, opts) {
  const el = root();
  el.dataset.view = "photo";
  el.textContent = "";
  const { openPhotoEditor } = await import("../photo-editor/editor.js");
  session = openPhotoEditor(el, doc, opts);
  translate(el);
}

/** Creates a project from chosen files: photos open the photo editor
    (one photo or a collage), anything with video or audio opens the video editor. */
async function startProject(kind, files = []) {
  closeSheet();
  if (kind === "photo") {
    const { createPhotoDoc } = await import("../photo-editor/model.js");
    const doc = createPhotoDoc({ name: files[0]?.name?.replace(/\.[^.]+$/, "").slice(0, 120) || t("projects.untitled") });
    await savePhotoProject(doc);
    pendingPhotoFiles = files.length ? { id: doc.id, files } : null;
    location.hash = "#/studio/" + doc.id;
    return;
  }
  if (files.length) return quickProject(files);
  const p = createProject({ name: t("projects.untitled"), aspect: prefs.get("defaultAspect") });
  await saveProject(p);
  location.hash = "#/studio/" + p.id;
}

/** Only images: one photo opens the photo editor, several ask whether to make a collage or a video. */
function chooseForImages(files) {
  openSheet({
    title: () => t("projects.photosTitle", { n: files.length }),
    render(root) {
      const row = (ic, title, text, fn) => h("li", { class: "has-icon" }, h("button", { class: "row kind-row", type: "button", onclick: fn },
        h("span", { class: "row-icon", html: icon(ic) }),
        h("span", { class: "row-main" }, h("span", { class: "row-label" }, t(title)), h("span", { class: "row-sub" }, t(text))),
        h("span", { html: icon("chevron", "chev") })));
      root.append(...[h("div", { class: "section" }, h("ul", { class: "list" },
        row("image", "projects.asPhoto", "projects.asPhotoText", () => startProject("photo", files.slice(0, 9))),
        row("clapper", "projects.asVideo", "projects.asVideoText", () => startProject("video", files)))),
        files.length > 9 ? h("p", { class: "section-foot" }, t("projects.collageLimit")) : null].filter(Boolean));
    },
  });
}


export function hide() { closeSession(); }

function renderUnsupported() {
  const el = root();
  el.textContent = "";
  el.append(h("div", { class: "unsupported" }, h("span", { html: MARK }), h("h1", {}, t("studio.unsupportedTitle")), h("p", {}, t("studio.unsupportedText")), h("a", { class: "btn", href: "#/" }, t("common.back"))));
}

/* ====================================================================== projects browser */
const phoneMQ = matchMedia("(max-width: 760px)");
phoneMQ.addEventListener("change", () => { if (!session && root()?.dataset.view === "browser") renderBrowser(); });

async function renderBrowser() {
  if (phoneMQ.matches) return renderPhoneBrowser();
  const el = root();
  el.dataset.view = "browser";
  el.textContent = "";
  const grid = h("div", { class: "project-grid" });
  const header = h("header", { class: "pb-top" },
    h("a", { class: "brand", href: "#/", "aria-label": t("nav.home") }, h("span", { html: MARK }), h("span", { class: "brand-name" }, APP.name)),
    h("div", { class: "pb-actions" }, ...browserActions()));
  const main = h("main", { class: "pb-main", id: "main", tabindex: "-1" },
    h("div", { class: "pb-head" },
      h("h1", {}, t("projects.title")),
      h("div", { class: "pb-buttons" },
        h("button", { class: "btn", type: "button", onclick: importProjectFlow }, h("span", { html: icon("importFile") }), t("projects.import")),
        h("button", { class: "btn primary", type: "button", onclick: newProjectFlow }, h("span", { html: icon("plus") }), t("cta.start")))),
    grid);
  el.append(header, main);
  pageDrop(main);

  const projects = await listProjects();
  if (!projects.length) grid.append(emptyState());
  el.append(legalFooter());
  for (const p of projects) {
    const thumb = h("div", { class: "pc-thumb", dataset: { aspect: p.aspect } });
    if (p.thumb) thumb.append(h("img", { src: p.thumb, alt: "" }));
    else thumb.innerHTML = icon("media");
    const more = h("button", { class: "icon-btn small pc-more", type: "button", "aria-label": t("projects.options", { name: p.name }), html: icon("more"),
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); projectMenu(p); } });
    grid.append(h("a", { class: "project-card", href: "#/studio/" + p.id },
      thumb,
      h("span", { class: "pc-meta" }, h("strong", {}, p.name), h("span", { class: "ltr tabular" }, p.kind === "photo" ? `${t("projects.kind.photo")} · ${p.aspect === "original" ? t("photo.original") : p.aspect}` : `${formatTime(p.duration || 0)} · ${p.aspect === "original" ? t("photo.original") : p.aspect}`), h("span", {}, date(p.updatedAt))),
      more));
  }
  translate(el);
}

/* Phone project list: All / Videos / Photos tabs, then a plain list with
   thumbnail, duration, name (tap the pencil to rename) and a relative date, plus
   a selection mode with Cancel, a count, Select all and one Delete button. */
async function renderPhoneBrowser() {
  const el = root();
  el.dataset.view = "browser";
  el.textContent = "";
  const projects = await listProjects();
  let selecting = false, kind = "all";
  const chosen = new Set();
  const list = h("ul", { class: "pl-list" });
  const selectBtn = h("button", { class: "icon-btn pl-select", type: "button", html: icon("checkCircle"), "aria-pressed": "false", onclick: () => setSelecting(!selecting) });
  const label = t("projects.select");
  selectBtn.setAttribute("aria-label", label); selectBtn.title = label;
  const top = h("header", { class: "pl-top" });
  const visible = () => projects.filter((p) => kind === "all" || (kind === "photo" ? p.kind === "photo" : p.kind !== "photo"));
  function drawTop() {
    top.textContent = "";
    if (selecting) {
      const all = visible().length > 0 && visible().every((p) => chosen.has(p.id));
      top.append(
        h("button", { class: "pl-text-btn", type: "button", onclick: () => setSelecting(false) }, t("common.cancel")),
        h("h1", { class: "tabular" }, t("projects.selected", { n: chosen.size })),
        h("div", { class: "pl-top-end" }, h("button", { class: "pl-text-btn pl-all", type: "button", onclick: () => {
          if (all) visible().forEach((p) => chosen.delete(p.id)); else visible().forEach((p) => chosen.add(p.id));
          syncRows(); drawTop(); drawBottom();
        } }, all ? t("projects.deselectAll") : t("projects.selectAll"))));
    } else {
      top.append(
        h("a", { class: "icon-btn", href: "#/", "aria-label": t("nav.home"), title: t("nav.home"), html: icon("back") }),
        h("h1", {}, t("projects.title")),
        h("div", { class: "pl-top-end" }, ...browserActions(), projects.length ? selectBtn : null));
    }
  }
  const tabs = h("div", { class: "pl-tabs", role: "tablist", "aria-label": t("projects.title") });
  function drawTabs() {
    tabs.textContent = "";
    for (const [v, l] of [["all", t("common.all")], ["video", t("media.kind.video")], ["photo", t("media.kind.image")]]) {
      tabs.append(h("button", { class: "pl-tab", type: "button", role: "tab", "aria-selected": String(kind === v), onclick: () => { kind = v; drawTabs(); drawList(); } }, l));
    }
  }
  const bottom = h("footer", { class: "pl-bottom" });
  const rtf = new Intl.RelativeTimeFormat(lang(), { numeric: "auto" });
  const day0 = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  /** Today, Yesterday, then a short date in the interface language. */
  const when = (ms) => {
    const diff = Math.round((day0(Date.now()) - day0(ms || Date.now())) / 86400000);
    if (diff >= 0 && diff < 2) { const s = rtf.format(-diff, "day"); return s.charAt(0).toLocaleUpperCase(lang()) + s.slice(1); }
    const d = new Date(ms);
    return d.toLocaleDateString(lang(), { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  };
  const syncRows = () => list.querySelectorAll(".pl-row").forEach((r) => r.setAttribute("aria-checked", String(chosen.has(r.dataset.id))));

  function drawBottom() {
    bottom.textContent = "";
    if (selecting) {
      const n = chosen.size;
      bottom.append(
        h("button", { class: "icon-btn pl-import", type: "button", "aria-label": t("projects.export"), title: t("projects.export"), html: icon("exportFile"), disabled: n !== 1 || projects.find((x) => x.id === [...chosen][0])?.kind === "photo", onclick: async () => { const id = [...chosen][0]; const proj = await loadProject(id); setSelecting(false); await exportProjectFlow(proj); } }),
        h("button", { class: "btn large pl-delete", type: "button", disabled: !n, onclick: async () => {
          const ok = await confirmDialog(n === 1
            ? { title: t("projects.deleteTitle"), message: t("projects.deleteBody", { name: projects.find((x) => chosen.has(x.id))?.name || "" }), confirm: t("common.delete"), destructive: true }
            : { title: t("projects.deleteManyTitle", { n }), message: t("projects.deleteManyBody"), confirm: t("common.delete"), destructive: true });
          if (!ok) return;
          for (const id of chosen) await deleteProject(id);
          renderBrowser();
        } }, t("common.delete")));
    } else if (projects.length) {
      // With no projects the empty state already shows the one Create button.
      bottom.append(h("button", { class: "btn primary large pl-create", type: "button", onclick: newProjectFlow }, h("span", { html: icon("plus") }), t("cta.start")));
    }
    bottom.hidden = !bottom.childElementCount;
  }
  function setSelecting(v) {
    selecting = v; chosen.clear();
    selectBtn.setAttribute("aria-pressed", String(v));
    el.classList.toggle("selecting", v);
    syncRows(); drawTop(); drawBottom();
  }
  function drawList() {
  list.textContent = "";
  const rows = visible();
  if (!rows.length) list.append(h("li", { class: "pl-none" }, t("projects.empty")));
  for (const p of rows) {
    const thumb = h("span", { class: "pl-thumb" }, p.thumb ? h("img", { src: p.thumb, alt: "" }) : h("span", { class: "pl-thumb-empty", html: icon("clapper") }),
      h("span", { class: "pl-dur ltr tabular" }, p.kind === "photo" ? h("span", { html: icon("image") }) : formatTime(p.duration || 0)));
    const rename = h("button", { class: "pl-rename", type: "button", "aria-label": t("common.rename") + " " + p.name, title: t("common.rename"), html: icon("edit"),
      onclick: async (e) => { e.preventDefault(); e.stopPropagation(); const n = await promptDialog({ title: t("common.rename"), value: p.name }); if (n) { await renameProject(p.id, n); renderBrowser(); } } });
    const row = h("a", { class: "pl-row", href: "#/studio/" + p.id, role: "checkbox", "aria-checked": String(chosen.has(p.id)), dataset: { id: p.id } },
      thumb,
      h("span", { class: "pl-meta" }, h("span", { class: "pl-name-row" }, h("strong", { class: "pl-name" }, p.name), rename), h("span", { class: "pl-date" }, when(p.updatedAt))),
      h("span", { class: "pl-check", "aria-hidden": "true", html: icon("check") }));
    row.addEventListener("click", (e) => {
      if (!selecting) return;
      e.preventDefault();
      chosen.has(p.id) ? chosen.delete(p.id) : chosen.add(p.id);
      row.setAttribute("aria-checked", String(chosen.has(p.id)));
      drawTop(); drawBottom();
    });
    list.append(h("li", {}, row));
  }
  }
  drawTop(); drawTabs(); drawList();
  const main = h("main", { class: "pl-main", id: "main", tabindex: "-1" },
    projects.length ? tabs : null,
    projects.length ? list : emptyState(),
    h("button", { class: "pl-import-link", type: "button", onclick: importProjectFlow }, h("span", { html: icon("importFile") }), t("projects.import")),
    legalFooter());
  el.append(h("div", { class: "pl" }, top, main, bottom));
  pageDrop(main);
  drawBottom();
  translate(el);
}

/** ? (how it works) and Settings, as round buttons like the rest of the app family. */
function browserActions() {
  return [
    h("button", { class: "icon-btn round", type: "button", "aria-label": t("guide.title"), title: t("guide.title"), html: icon("help"), onclick: () => openSheet(guideView()) }),
    h("button", { class: "icon-btn round", type: "button", "aria-label": t("settings.title"), title: t("settings.title"), html: icon("settings"), onclick: () => openSheet(settingsView({ onRenamed: () => renderBrowser() })) }),
  ];
}

/** Privacy · Terms, at the bottom of the project page. */
function legalFooter() {
  return h("footer", { class: "legal-links pb-legal" },
    h("a", { href: "#/privacy", "data-sheet": "privacy" }, h("span", { html: icon("lock") }), h("span", {}, t("privacy.title"))),
    h("span", { "aria-hidden": "true" }, "·"),
    h("a", { href: "#/terms" }, t("footer.terms")));
}

/** Empty state: a quiet tray, one line and one clear Create button. */
function emptyState() {
  return h("div", { class: "pb-empty" },
    h("span", { class: "pb-empty-icon", html: icon("emptyTray") }),
    h("p", { class: "pb-empty-text" }, t("projects.emptyText")),
    h("button", { class: "btn primary large pb-create", type: "button", onclick: newProjectFlow }, h("span", { html: icon("plus") }), t("cta.start")));
}

/** Files dropped anywhere on the project page start a project with them. */
function pageDrop(el) {
  el.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); el.classList.add("drop-over"); } });
  el.addEventListener("dragleave", (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove("drop-over"); });
  el.addEventListener("drop", (e) => { e.preventDefault(); el.classList.remove("drop-over"); const files = Array.from(e.dataTransfer?.files || []).filter((f) => kindOf(f)); if (!files.length) return; if (files.every((f) => kindOf(f) === "image")) { if (files.length === 1) startProject("photo", files); else chooseForImages(files); } else quickProject(files); });
}

let pendingFiles = null;
/** Creates a project in the default format and imports the given files into it. */
async function quickProject(files) {
  const p = createProject({ name: files[0]?.name?.replace(/\.[^.]+$/, "") || t("projects.untitled"), aspect: prefs.get("defaultAspect") });
  await saveProject(p);
  pendingFiles = files;
  location.hash = "#/studio/" + p.id;
}

function projectMenu(p) {
  openSheet({
    title: () => p.name,
    render(root, nav) {
      const row = (ic, label, fn, danger) => h("li", { class: "has-icon" }, h("button", { class: "row" + (danger ? " danger" : ""), type: "button", onclick: fn }, h("span", { class: "row-icon", html: icon(ic) }), h("span", { class: "row-label" }, label)));
      root.append(h("div", { class: "section" }, h("ul", { class: "list" },
        row("edit", t("common.rename"), async () => { const n = await promptDialog({ title: t("common.rename"), value: p.name }); if (n) { await renameProject(p.id, n); closeSheet(); renderBrowser(); } }),
        p.kind === "photo" ? null : row("exportFile", t("projects.export"), async () => { closeSheet(); const proj = await loadProject(p.id); await exportProjectFlow(proj); }),
        row("trash", t("common.delete"), async () => {
          if (!(await confirmDialog({ title: t("projects.deleteTitle"), message: t("projects.deleteBody", { name: p.name }), confirm: t("common.delete"), destructive: true }))) return;
          await deleteProject(p.id); closeSheet(); renderBrowser();
        }, true))));
      void nav;
    },
  });
}

/** "Create": choose photos or videos. The editor follows from what was chosen. */
async function newProjectFlow() {
  const files = await pickFiles({ accept: ACCEPT.all, multiple: true });
  if (!files.length) return;
  const images = files.filter((f) => kindOf(f) === "image");
  const unknown = files.filter((f) => !kindOf(f));
  if (unknown.length) toast(t("media.error.unsupported", { name: unknown[0].name }), { type: "error" });
  const usable = files.filter((f) => kindOf(f));
  if (!usable.length) return;
  if (images.length === usable.length) {
    if (images.length === 1) return startProject("photo", images);
    return chooseForImages(images);
  }
  return startProject("video", usable);
}

async function importProjectFlow() {
  const [file] = await pickFiles({ accept: APP.projectExtension + ",application/zip", multiple: false });
  if (!file) return;
  toast(t("projects.importing"), { duration: 60000 });
  try {
    const p = await importPackage(file);
    toast(t("projects.imported", { name: p.name }), { type: "success" });
    location.hash = "#/studio/" + p.id;
  } catch (e) {
    console.error(e);
    toast(t(e.message === "newer-version" ? "projects.importNewer" : "projects.importFailed"), { type: "error" });
  }
}

async function exportProjectFlow(project) {
  const name = safeFilename(project.name) + APP.projectExtension;
  let writable = null;
  if ("showSaveFilePicker" in window) {
    try { writable = await (await window.showSaveFilePicker({ suggestedName: name, types: [{ description: APP.name, accept: { "application/zip": [APP.projectExtension] } }] })).createWritable(); }
    catch (e) { if (e?.name === "AbortError") return; }
  }
  toast(t("projects.exporting"), { duration: 60000 });
  try {
    const blob = await exportPackage(project, { writable });
    if (blob) downloadBlob(blob, name);
    toast(t("projects.exported"), { type: "success" });
  } catch (e) {
    console.error(e);
    toast(t("projects.exportFailed"), { type: "error" });
  }
}

/* ====================================================================== editor */
function openEditor(project) {
  const el = root();
  el.dataset.view = "editor";
  el.textContent = "";
  const store = createStore(project);
  const registry = new MediaRegistry(store);
  const actions = createActions(store, registry);
  const s = { project, store, registry, actions, offs: [], busy: false };
  session = s;
  Object.defineProperty(s, "project", { get: () => store.project });

  /* ---------------- engine */
  const playback = new Playback(store, registry, { onFrame: (time) => preview.render(time) });
  const preview = new Preview(store, playback);
  preview.onDelete = () => actions.remove();
  s.playback = playback; s.preview = preview;

  /* ---------------- shared context for panels */
  const ctx = {
    store, registry, actions,
    importMedia: async (dropped) => {
      const files = dropped?.length ? dropped : await pickFiles({ accept: ACCEPT.all, multiple: true });
      const added = await importFlow(registry, files);
      // Add the first imported clips straight to the timeline when it is empty.
      if (added.length && !mainTrack(store.project).clips.length) for (const m of added) actions.addMedia(m, { at: m.kind === "audio" ? 0 : projectDuration(store.project) });
    },
    /** Picks files and appends videos and photos to the end of the main track. */
    appendMedia: async () => {
      const files = await pickFiles({ accept: ACCEPT.all, multiple: true });
      const added = await importFlow(registry, files);
      for (const m of added) {
        const end = mainTrack(store.project).clips.reduce((e, c) => Math.max(e, c.start + c.duration), 0);
        actions.addMedia(m, { at: m.kind === "audio" ? store.state.time : end });
      }
    },
    addLibrary: async (origin, id, opts = {}) => {
      try { const m = await registry.addLibrary(origin, id); actions.addMedia(m, { role: origin === "sfx" ? "sfx" : "music", ...opts }); }
      catch (e) { console.error(e); toast(t("music.loadFailed"), { type: "error" }); }
    },
    relink: async (mediaId) => {
      const meta = store.project.media[mediaId];
      const [file] = await pickFiles({ accept: ACCEPT[meta.kind], multiple: false });
      if (!file) return;
      try { await registry.relink(mediaId, file); toast(t("media.relinked"), { type: "success" }); }
      catch { toast(t("media.relinkFailed"), { type: "error" }); }
    },
  };
  s.ctx = ctx;

  /* ---------------- panels */
  const PANELS = {
    media: { icon: "media", label: "panel.media", render: mediaPanel },
    music: { icon: "music", label: "panel.music", render: musicPanel },
    sounds: { icon: "wave", label: "panel.sounds", render: soundsPanel },
    text: { icon: "text", label: "panel.text", render: textPanel },
    effects: { icon: "effects", label: "panel.effects", render: effectsPanel },
    transitions: { icon: "transition", label: "panel.transitions", render: transitionsPanel },
    stickers: { icon: "sticker", label: "panel.stickers", render: stickersPanel },
    inspector: { icon: "adjust", label: "panel.inspector", render: null },
  };
  const panelBody = h("div", { class: "panel-body" });
  const panelTitle = h("h2", { class: "panel-title" });
  const rail = h("nav", { class: "rail", "aria-label": t("studio.libraries") });
  let currentPanel = null, panelCleanup = null;
  const inspector = new Inspector(store, actions, registry, { onOpenLibrary: (name) => openLibrary(name) });
  s.inspector = inspector;

  function setPanel(name) {
    if (currentPanel === name && panelBody.childElementCount) return;
    panelCleanup?.(); panelCleanup = null;
    currentPanel = name;
    panelBody.textContent = "";
    panelTitle.textContent = t(PANELS[name].label);
    rail.querySelectorAll("button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.panel === name)));
    if (name === "inspector") { panelBody.append(inspector.el); inspector.render(); return; }
    panelCleanup = PANELS[name].render(panelBody, ctx) || null;
  }
  for (const [name, p] of Object.entries(PANELS)) {
    rail.append(h("button", { type: "button", class: "rail-btn", dataset: { panel: name }, "aria-label": t(p.label), title: t(p.label), onclick: () => setPanel(name) },
      h("span", { html: icon(p.icon) }), h("span", { class: "rail-label" }, t(p.label))));
  }

  /** On phones libraries open as bottom sheets; on larger screens in the side panel. */
  function openLibrary(name, track) {
    void track;
    if (layout() === "mobile") {
      if (name === "music" || name === "sounds") return openAudioSheet(name);
      openSheet({ title: () => t(PANELS[name].label), render: (r) => { const box = h("div", { class: "lib-stack" }); r.append(box); return PANELS[name].render(box, { ...ctx, sheet: true }); } }, { size: "large" });
    } else setPanel(name);
  }

  function openAudioSheet(start) {
    let which = start;
    openSheet({
      title: () => t("panel.audio"),
      render(r) {
        const body = h("div", { class: "lib-stack" });
        let cleanup = null;
        const seg = h("div", { class: "segmented block sheet-seg", role: "tablist" });
        const draw = () => {
          seg.textContent = "";
          ["music", "sounds"].forEach((k) => seg.append(h("button", { type: "button", role: "tab", "aria-selected": String(which === k), "aria-checked": String(which === k), onclick: () => { which = k; draw(); } }, t("panel." + k))));
          cleanup?.(); body.textContent = "";
          cleanup = PANELS[which].render(body, ctx) || null;
        };
        r.append(seg, body);
        draw();
        return () => cleanup?.();
      },
    }, { size: "large" });
  }

  /* ---------------- top bar */
  const saveState = h("span", { class: "save-state", "aria-live": "polite" });
  const undoBtn = h("button", { class: "icon-btn", type: "button", "aria-label": t("studio.undo"), title: t("studio.undo"), html: icon("undo"), onclick: () => undo() });
  const redoBtn = h("button", { class: "icon-btn", type: "button", "aria-label": t("studio.redo"), title: t("studio.redo"), html: icon("redo"), onclick: () => redo() });
  const nameBtn = h("button", { class: "project-name", type: "button", title: t("common.rename"), onclick: async () => {
    const n = await promptDialog({ title: t("common.rename"), value: store.project.name });
    if (n) store.update("rename", (p) => { p.name = n; });
  } });
  const exportBtn = h("button", { class: "btn primary small export-btn", type: "button", onclick: () => openExport() }, h("span", { html: icon("exportFile") }), h("span", {}, t("studio.export")));
  const moreBtn = h("button", { class: "icon-btn", type: "button", "aria-label": t("guide.title"), title: t("guide.title"), html: icon("help"), onclick: () => helpSheet() });
  // Aspect ratio and export settings open as drop-down panels.
  const aspectBtn = h("button", { class: "ar-btn", type: "button", "aria-label": t("insp.aspect"), title: t("insp.aspect"), "aria-haspopup": "true", "aria-expanded": "false", onclick: () => togglePop("aspect") });
  const resBtn = h("button", { class: "res-btn", type: "button", "aria-label": t("export.resolution"), title: t("export.resolution"), "aria-haspopup": "true", "aria-expanded": "false", onclick: () => togglePop("res") });
  const top = h("header", { class: "ed-top" },
    h("a", { class: "icon-btn", href: "#/studio", "aria-label": t("studio.backToProjects"), title: t("studio.backToProjects"), html: icon("back") }),
    h("div", { class: "ed-title" }, nameBtn, saveState),
    h("div", { class: "ed-top-actions" }, undoBtn, redoBtn,
      h("button", { class: "icon-btn hide-mobile", type: "button", "aria-label": t("settings.shortcuts"), title: t("settings.shortcuts"), html: icon("keyboard"), onclick: () => openSheet(shortcutsView()) }),
      moreBtn),
    aspectBtn, resBtn, exportBtn);

  /* ---------------- transport */
  const playBtn = h("button", { class: "play-main", type: "button", "aria-label": t("studio.play"), html: icon("play"), onclick: () => playback.toggle() });
  const mUndo = h("button", { class: "icon-btn show-mobile", type: "button", "aria-label": t("studio.undo"), title: t("studio.undo"), html: icon("undo"), onclick: () => undo() });
  const mRedo = h("button", { class: "icon-btn show-mobile", type: "button", "aria-label": t("studio.redo"), title: t("studio.redo"), html: icon("redo"), onclick: () => redo() });
  const timeEl = h("span", { class: "transport-time ltr tabular" });
  const transport = h("div", { class: "transport ltr" },
    h("div", { class: "transport-side" }, mUndo, mRedo,
      h("button", { class: "icon-btn small hide-mobile", type: "button", "aria-label": t("studio.prevEdit"), title: t("studio.prevEdit"), html: icon("back"), onclick: () => actions.jumpEdit(-1) })),
    h("div", { class: "transport-center" },
      h("button", { class: "icon-btn small hide-mobile", type: "button", "aria-label": t("studio.toStart"), title: t("studio.toStart"), html: '<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="2.4" height="14" rx="1"/><path d="M19 5.8v12.4a.8.8 0 0 1-1.25.66L9.6 12.66a.8.8 0 0 1 0-1.32l8.15-6.2A.8.8 0 0 1 19 5.8z"/></svg>', onclick: () => playback.seek(0) }),
      playBtn,
      h("button", { class: "icon-btn small hide-mobile", type: "button", "aria-label": t("studio.nextEdit"), title: t("studio.nextEdit"), html: icon("forward"), onclick: () => actions.jumpEdit(1) })),
    h("div", { class: "transport-side end" }, timeEl,
      h("button", { class: "icon-btn small hide-mobile", type: "button", "aria-label": t("studio.fullscreen"), title: t("studio.fullscreen"), html: icon("fullscreen"), onclick: () => toggleFullscreen() })));
  preview.el.append(h("button", { class: "pv-fs show-mobile", type: "button", "aria-label": t("studio.fullscreen"), title: t("studio.fullscreen"), html: icon("fullscreen"), onclick: () => toggleFullscreen() }));
  const stage = h("section", { class: "ed-stage", "aria-label": t("studio.previewLabel") }, preview.el, transport);

  /* ---------------- timeline */
  const timeline = new Timeline(store, registry, actions, {
    onRequestLibrary: (name, track) => openLibrary(name, track),
    onJunction: () => { if (layout() === "mobile") openToolSheet("transition"); else if (layout() === "tablet") setPanel("inspector"); },
    onClipActivate: (id) => { store.select(id); if (layout() === "mobile") openToolSheet(defaultTool()); else if (layout() === "tablet") setPanel("inspector"); },
    onDropPayload: (payload, where) => handleDrop(payload, where),
    onAddMedia: () => ctx.appendMedia(),
    onAddTrack: () => addTrackMenu(),
    onRenameTrack: (track) => renameTrackFlow(track),
    onDeleteTrack: (track) => deleteTrackFlow(track),
  });

  /* ---------------- tracks (layers): add, rename, delete */
  const TRACK_TYPES = [["video", "overlay", "layers", "track.overlay"], ["text", "text", "text", "track.text"], ["audio", "music", "music", "track.music"], ["audio", "sfx", "wave", "track.sfx"]];
  function addTrackMenu() {
    openSheet({
      title: () => t("tl.addTrack"),
      render(r) {
        r.append(h("div", { class: "section" }, h("ul", { class: "list" }, TRACK_TYPES.map(([kind, role, ic, label]) => h("li", { class: "has-icon" },
          h("button", { class: "row", type: "button", onclick: () => { actions.addTrack(kind, role); closeSheet(); } },
            h("span", { class: "row-icon", html: icon(ic) }), h("span", { class: "row-label" }, t(label)), h("span", { html: icon("plus") })))))));
      },
    });
  }
  async function renameTrackFlow(track) {
    const n = await promptDialog({ title: t("tl.renameTrack", { track: trackName(store.project, track) }), value: trackName(store.project, track), maxLength: 40 });
    if (n != null) actions.renameTrack(track.id, n);
  }
  async function deleteTrackFlow(track) {
    const name = trackName(store.project, track);
    const n = track.clips.length;
    if (track.role === "main") {
      if (!n) return;
      if (!(await confirmDialog({ title: t("tl.clearMainTitle"), message: t("tl.clearMainBody"), confirm: t("common.delete"), destructive: true }))) return;
    } else if (n && !(await confirmDialog({ title: t("tl.deleteTrackTitle", { track: name }), message: t("tl.deleteTrackBody", { n }), confirm: t("common.delete"), destructive: true }))) return;
    actions.removeTrack(track.id);
  }
  /** Phones have no track headers, so tracks are managed from a sheet. */
  function tracksSheet() {
    openSheet({
      title: () => t("tool.tracks"),
      render(r) {
        const draw = () => {
          r.textContent = "";
          const rows = store.project.tracks.map((tr) => h("li", { class: "has-icon" }, h("div", { class: "row" },
            h("span", { class: "row-icon", html: icon(trackIcon(tr)) }),
            h("span", { class: "row-main" }, h("span", { class: "row-label" }, trackName(store.project, tr)), h("span", { class: "row-sub" }, t("insp.clips", { n: tr.clips.length }))),
            h("button", { class: "icon-btn small", type: "button", "aria-label": t("tl.renameTrack", { track: trackName(store.project, tr) }), html: icon("edit"), onclick: () => renameTrackFlow(tr) }),
            h("button", { class: "icon-btn small", type: "button", "aria-label": t("tl.deleteTrack", { track: trackName(store.project, tr) }), html: icon("trash"), disabled: tr.role === "main" && !tr.clips.length, onclick: () => deleteTrackFlow(tr) }))));
          r.append(h("div", { class: "section" }, h("ul", { class: "list" }, rows)),
            h("div", { class: "section" }, h("h3", { class: "section-title" }, t("tl.addTrack")), h("ul", { class: "list" }, TRACK_TYPES.map(([kind, role, ic, label]) => h("li", { class: "has-icon" },
              h("button", { class: "row", type: "button", onclick: () => actions.addTrack(kind, role) },
                h("span", { class: "row-icon", html: icon(ic) }), h("span", { class: "row-label" }, t(label)), h("span", { html: icon("plus") })))))));
        };
        draw();
        return store.on("project", (d) => { if (!d?.live) draw(); });
      },
    });
  }
  timeline.onSeek = (time) => playback.seek(time);
  s.timeline = timeline;
  const resizer = h("div", { class: "tl-resizer", role: "separator", "aria-orientation": "horizontal", "aria-label": t("studio.resizeTimeline"), tabindex: "0" });

  /* ---------------- mobile chrome */
  const toolsBar = h("div", { class: "ed-tools", role: "toolbar", "aria-label": t("studio.tools") });
  const tabs = h("nav", { class: "ed-tabs", "aria-label": t("studio.libraries") });
  const TABS = [["edit", "split", "tab.edit"], ["music", "music", "panel.audio"], ["adjust", "adjust", "insp.adjust"], ["effects", "effects", "panel.effects"], ["text", "text", "panel.text"], ["transitions", "transition", "panel.transitions"], ["stickers", "sticker", "panel.stickers"]];
  for (const [k, ic, label] of TABS) {
    tabs.append(h("button", { type: "button", class: "ed-tab", dataset: { tab: k }, onclick: () => (k === "edit" ? (store.select([]), renderTools()) : k === "adjust" ? openColor() : openLibrary(k)) },
      h("span", { html: icon(ic) }), h("span", {}, t(label))));
  }
  /** Color tab: adjusts the selected clip, or the clip under the playhead on the main track. */
  function openColor() {
    let sel = store.selectedClip;
    if (!sel || !isVisual(sel.clip) || sel.clip.kind === "text") {
      const c = mainTrack(store.project).clips.find((x) => store.state.time >= x.start && store.state.time < x.start + x.duration);
      if (!c) { toast(t("fx.selectFirst")); return; }
      store.select(c.id);
    }
    openToolSheet("adjust");
  }

  /* ---------------- drop-down panels (aspect ratio and export settings) */
  let pop = null;
  function closePop() {
    if (!pop) return;
    pop.el.remove(); pop.off?.();
    aspectBtn.setAttribute("aria-expanded", "false"); resBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutside, true);
    pop = null;
  }
  function onOutside(e) { if (pop && !pop.el.contains(e.target) && !e.target.closest(".ar-btn, .res-btn")) closePop(); }
  function togglePop(kind) {
    if (pop?.kind === kind) return closePop();
    closePop();
    playback.pause();
    const el = h("div", { class: "ed-pop", dataset: { kind }, role: "dialog", "aria-label": kind === "aspect" ? t("insp.aspect") : t("export.title") });
    pop = { kind, el };
    (kind === "aspect" ? aspectBtn : resBtn).setAttribute("aria-expanded", "true");
    if (kind === "aspect") drawAspectPop(el); else pop.off = drawResPop(el);
    editor.append(el);
    document.addEventListener("pointerdown", onOutside, true);
    el.querySelector("button, input")?.focus({ preventScroll: true });
  }
  function aspectGlyph(a) {
    if (a === "original") return h("span", { class: "ar-glyph ar-orig ltr" }, t("photo.original"));
    const [w, hh] = ASPECTS[a];
    const k = 32 / Math.max(w, hh);
    return h("span", { class: "ar-glyph ltr", style: { minWidth: Math.max(18, w * k) + "px", height: Math.max(18, hh * k) + "px" } }, a);
  }
  function drawAspectPop(el) {
    el.textContent = "";
    const row = h("div", { class: "ar-row", role: "radiogroup", "aria-label": t("insp.aspect") });
    for (const a of ["original", ...Object.keys(ASPECTS)]) {
      row.append(h("button", { type: "button", class: "ar-opt", role: "radio", "aria-checked": String(store.project.settings.aspect === a), "aria-label": a === "original" ? t("photo.original") : a,
        onclick: () => { store.update("aspect", (p) => { p.settings.aspect = a; }); drawAspectPop(el); } }, aspectGlyph(a), h("i", { class: "ar-dot" })));
    }
    el.append(row);
  }
  function drawResPop(el) {
    let caps = null;
    const p = store.project;
    const opts = () => ({ format: prefs.get("exportFormat"), resolution: prefs.get("exportResolution"), fps: prefs.get("exportFps") || p.settings.fps, quality: prefs.get("exportQuality") });
    const RES_NOTE = { 720: "HD", 1080: "Full HD", 1440: "Quad HD", 2160: "4K Ultra HD", 4320: "8K Ultra HD" };
    const draw = () => {
      const o = opts();
      const resOk = (r) => !caps || caps.resolutions[r]?.[o.format];
      el.textContent = "";
      el.append(
        stepSlider(t("export.resolution"), RES_NOTE[o.resolution] || "", RESOLUTIONS.map((r) => ({ value: r, label: resLabel(r), off: !resOk(r) })), o.resolution, (v) => { prefs.set("exportResolution", v); draw(); }),
        stepSlider(t("export.fps"), "", FRAME_RATES.map((f) => ({ value: f, label: f + " fps" })), o.fps, (v) => { prefs.set("exportFps", v); draw(); }),
        stepSlider(t("export.quality"), "", [["medium", "export.q.medium"], ["high", "export.q.high"], ["very-high", "export.q.max"]].map(([v, k]) => ({ value: v, label: t(k) })), o.quality, (v) => { prefs.set("exportQuality", v); draw(); }),
        h("div", { class: "ss" }, h("div", { class: "ss-head" }, h("span", {}, t("export.format"))),
          h("div", { class: "segmented block", role: "radiogroup", "aria-label": t("export.format") },
            ...[["mp4", "MP4"], ["webm", "WebM"]].map(([v, l]) => h("button", { type: "button", role: "radio", "aria-checked": String(o.format === v), onclick: () => { prefs.set("exportFormat", v); draw(); } }, l)))),
        h("p", { class: "ed-pop-size ltr tabular" }, t("export.estimate") + " ≈ " + formatBytes(estimateBytes(p, o), lang())));
      const f = caps?.formats[o.format];
      const note = f && !f.video ? t("export.noCodec") : f && !f.audio ? t("export.noAudio") : "";
      if (note) el.append(h("p", { class: "ed-pop-note" }, note));
      s.noEncoder = !!(f && !f.video);
      if (!resOk(o.resolution)) { const best = RESOLUTIONS.filter(resOk).pop(); if (best && best !== o.resolution) { prefs.set("exportResolution", best); draw(); } }
      syncChrome();
    };
    draw();
    probeCapabilities(p).then((c) => { caps = c; if (pop?.el === el) draw(); }).catch(() => {});
    return null;
  }
  /** A stepped slider in the style of phone editors: a line with dots, labels below. */
  function stepSlider(label, note, stops, value, onChange) {
    const idx = Math.max(0, stops.findIndex((s) => s.value === value));
    const n = stops.length;
    const input = h("input", { type: "range", class: "ss-input ltr", min: "0", max: String(n - 1), step: "1", value: String(idx), "aria-label": label, "aria-valuetext": stops[idx].label });
    input.style.setProperty("--p", (idx / (n - 1)) * 100 + "%");
    input.addEventListener("input", () => input.style.setProperty("--p", (input.value / (n - 1)) * 100 + "%"));
    input.addEventListener("change", () => {
      let i = +input.value;
      if (stops[i].off) { i = stops.map((s, k) => (s.off ? -1 : k)).filter((k) => k >= 0).reduce((a, k) => (Math.abs(k - i) < Math.abs(a - i) ? k : a), idx); }
      onChange(stops[i].value);
    });
    const dots = h("div", { class: "ss-dots", "aria-hidden": "true" }, ...stops.map((s, i) => h("i", { class: s.off ? "off" : "", style: { left: (i / (n - 1)) * 100 + "%" } })));
    const labels = h("div", { class: "ss-labels ltr", "aria-hidden": "true" }, ...stops.map((s, i) => h("span", { class: (i === idx ? "on " : "") + (s.off ? "off" : ""), style: { left: (i / (n - 1)) * 100 + "%" } }, s.label)));
    return h("div", { class: "ss" }, h("div", { class: "ss-head" }, h("span", {}, label), note ? h("span", { class: "ss-note" }, note) : null),
      h("div", { class: "ss-track" }, dots, input), labels);
  }

  const left = h("aside", { class: "ed-left", "aria-label": t("studio.libraries") }, rail, h("div", { class: "panel" }, panelTitle, panelBody));
  const right = h("aside", { class: "ed-right", "aria-label": t("studio.inspector") }, h("h2", { class: "panel-title" }, t("panel.inspector")), inspector.el);
  const dropOverlay = h("div", { class: "drop-overlay", "aria-hidden": "true" }, h("span", { html: icon("importFile") }), h("strong", {}, t("studio.dropFiles")));
  const editor = h("div", { class: "editor" }, top, left, stage, right, h("div", { class: "ed-bottom" }, resizer, timeline.el), toolsBar, tabs, dropOverlay);
  el.append(editor);
  s.editor = editor;

  /* ---------------- layout */
  function layout() { return matchMedia("(max-width: 760px)").matches ? "mobile" : matchMedia("(max-width: 1199px)").matches ? "tablet" : "desktop"; }
  function applyLayout() {
    const l = layout();
    editor.dataset.layout = l;
    if (l === "desktop" && currentPanel === "inspector") setPanel("media");
    if (l !== "mobile" && !currentPanel) setPanel("media");
    const btn = rail.querySelector('[data-panel="inspector"]');
    if (btn) btn.hidden = l !== "tablet";
    if (l === "desktop" && !right.contains(inspector.el)) { right.append(inspector.el); inspector.render(); }
    renderTools();
  }
  const mq = [matchMedia("(max-width: 760px)"), matchMedia("(max-width: 1199px)")];
  mq.forEach((m) => m.addEventListener("change", applyLayout));
  s.offs.push(() => mq.forEach((m) => m.removeEventListener("change", applyLayout)));

  /* ---------------- mobile context tools */
  function defaultTool() {
    const sel = store.selectedClip;
    if (!sel) return null;
    return { video: "speed", image: "transform", text: "text", audio: "volume" }[sel.clip.kind];
  }
  function toolButton(ic, label, fn, disabled) {
    return h("button", { type: "button", class: "tool", onclick: fn, disabled: !!disabled }, h("span", { html: icon(ic) }), h("span", {}, label));
  }
  function renderTools() {
    toolsBar.textContent = "";
    tabs.querySelectorAll(".ed-tab").forEach((b) => b.setAttribute("aria-current", String(b.dataset.tab === "edit")));
    const sel = store.selectedClip;
    if (store.state.junction) {
      toolsBar.append(toolButton("transition", t("insp.transition"), () => openToolSheet("transition")),
        toolButton("close", t("common.done"), () => store.select([])));
      return;
    }
    if (!sel) {
      toolsBar.append(
        toolButton("plus", t("tool.addMedia"), () => ctx.importMedia()),
        toolButton("music", t("tool.addMusic"), () => openLibrary("music")),
        toolButton("text", t("tool.addText"), () => openLibrary("text")),
        toolButton("split", t("tl.split"), () => actions.split()),
        toolButton("layers", t("tool.tracks"), () => tracksSheet()),
        toolButton("aspect", t("insp.aspect"), () => openSheet({ title: () => t("insp.project"), render: (r) => { r.append(inspector.projectSection()); } })));
      return;
    }
    const k = sel.clip.kind;
    const tools = [toolButton("split", t("tl.split"), () => actions.split())];
    if (k === "video" || k === "audio") tools.push(toolButton("speed", t("insp.speed"), () => openToolSheet("speed")), toolButton("volume", t("insp.volume"), () => openToolSheet("volume")));
    if (k === "text") tools.push(toolButton("edit", t("insp.text"), () => openToolSheet("text")));
    if (k !== "audio") tools.push(
      toolButton("adjust", t("insp.adjust"), () => openToolSheet("adjust"), k === "text"),
      toolButton("effects", t("insp.effects"), () => openToolSheet("effects")),
      toolButton("animate", t("insp.animation"), () => openToolSheet("animation")),
      toolButton("transform", t("insp.frame"), () => openToolSheet("transform")));
    tools.push(toolButton("duplicate", t("tl.duplicate"), () => actions.duplicate()), toolButton("trash", t("tl.delete"), () => actions.remove()));
    toolsBar.append(...tools.filter((b) => !b.disabled));
  }
  function openToolSheet(tool) {
    if (!tool) return;
    openSheet({
      title: () => (tool === "transition" ? t("insp.transition") : t("insp." + (tool === "transform" ? "frame" : tool))),
      render(r) {
        const draw = () => {
          r.textContent = "";
          if (tool === "transition") { if (store.state.junction) r.append(inspector.transitionSection(store.state.junction)); return; }
          const sel = store.selectedClip;
          if (sel) r.append(inspector.section(tool, sel.clip.id));
        };
        draw();
        const off = store.on("project", (d) => { if (!d?.live) draw(); });
        return off;
      },
    });
  }

  /* ---------------- selection & state wiring */
  function syncChrome() {
    undoBtn.disabled = mUndo.disabled = !store.canUndo();
    redoBtn.disabled = mRedo.disabled = !store.canRedo();
    aspectBtn.textContent = ""; aspectBtn.append(aspectGlyph(store.project.settings.aspect));
    const r = prefs.get("exportResolution");
    resBtn.innerHTML = `<span>${resLabel(r)}</span>` + icon("caret");
    editor.classList.toggle("has-sel", !!store.state.selection.length);
    nameBtn.textContent = store.project.name;
    playBtn.innerHTML = icon(store.state.playing ? "pause" : "play");
    playBtn.setAttribute("aria-label", t(store.state.playing ? "studio.pause" : "studio.play"));
    exportBtn.disabled = projectDuration(store.project) <= 0 || s.busy || !!s.noEncoder;
  }
  const updateTime = () => { timeEl.textContent = formatTime(store.state.time) + " / " + formatTime(projectDuration(store.project)); };
  s.offs.push(
    store.on("history", syncChrome),
    store.on("project", () => { syncChrome(); updateTime(); }),
    store.on("playing", syncChrome),
    store.on("time", updateTime),
    store.on("selection", () => {
      renderTools(); syncChrome();
      if (layout() === "tablet" && (store.state.selection.length || store.state.junction)) setPanel("inspector");
    }),
    onLanguage(() => { const p = store.project; closeSession({ keepSheet: true }).then(() => openEditor(p)); }),
  );

  /* ---------------- autosave */
  const save = debounce(async () => {
    if (!prefs.get("autosave") && !s.forceSave) return;
    s.forceSave = false;
    saveState.textContent = t("studio.saving");
    try {
      await saveProject(store.project, { thumb: makeThumb() });
      saveState.textContent = t("studio.saved");
    } catch (e) {
      console.error(e);
      saveState.textContent = t("studio.saveFailed");
      toast(t("studio.saveFailed"), { type: "error" });
    }
  }, 700);
  s.save = save;
  s.offs.push(store.on("project", (d) => { if (!d?.live && d?.label !== "cancel") { saveState.textContent = prefs.get("autosave") ? t("studio.editing") : t("studio.unsaved"); save(); } }));
  function makeThumb() {
    try {
      const c = document.createElement("canvas");
      const src = preview.canvas;
      const k = 320 / Math.max(src.width, src.height);
      c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
      preview.render(store.state.time);
      c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.7);
    } catch { return undefined; }
  }
  const onHide = () => { if (document.visibilityState === "hidden") save.flush(); };
  document.addEventListener("visibilitychange", onHide);
  s.offs.push(() => document.removeEventListener("visibilitychange", onHide));

  /* ---------------- drop & payloads */
  async function handleDrop(payload, where = {}) {
    const time = where.time ?? store.state.time;
    if (payload.type === "files") {
      const added = await importFlow(registry, payload.files);
      for (const m of added) actions.addMedia(m, { at: time, trackId: where.trackId });
      return;
    }
    if (payload.type === "media") { const m = store.project.media[payload.id]; if (m) actions.addMedia(m, { at: time, trackId: where.trackId }); }
    if (payload.type === "music" || payload.type === "sfx") {
      const m = await registry.addLibrary(payload.type === "music" ? "library" : "sfx", payload.id);
      actions.addMedia(m, { at: time, trackId: where.trackId, role: payload.type === "sfx" ? "sfx" : "music" });
    }
    if (payload.type === "text") { store.setTime(time); actions.addText(payload.preset); }
    if (payload.type === "effect") {
      const target = where.clipId ? findClip(store.project, where.clipId) : store.selectedClip;
      if (target && isVisual(target.clip)) { actions.addEffect(target.clip.id, payload.id); store.select(target.clip.id); }
      else toast(t("fx.selectFirst"));
    }
  }
  let dragDepth = 0;
  const onDragEnter = (e) => { if (e.dataTransfer?.types?.includes("Files")) { dragDepth++; editor.classList.add("dragging-files"); } };
  const onDragLeave = () => { if (--dragDepth <= 0) { dragDepth = 0; editor.classList.remove("dragging-files"); } };
  const onDragOver = (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); };
  const onDropFiles = (e) => {
    editor.classList.remove("dragging-files"); dragDepth = 0;
    if (e.defaultPrevented || !e.dataTransfer?.files?.length) return;
    e.preventDefault();
    handleDrop({ type: "files", files: Array.from(e.dataTransfer.files) });
  };
  editor.addEventListener("dragenter", onDragEnter);
  editor.addEventListener("dragleave", onDragLeave);
  editor.addEventListener("dragover", onDragOver);
  editor.addEventListener("drop", onDropFiles);

  /* ---------------- timeline resize */
  {
    let y0 = null, h0 = 0;
    const bottom = editor.querySelector(".ed-bottom");
    const saved = Number(localStorage.getItem("mms.tlHeight") || 0);
    if (saved) bottom.style.setProperty("--tl-h", saved + "px");
    resizer.addEventListener("pointerdown", (e) => { y0 = e.clientY; h0 = bottom.getBoundingClientRect().height; resizer.setPointerCapture(e.pointerId); });
    resizer.addEventListener("pointermove", (e) => { if (y0 == null) return; const v = Math.max(160, Math.min(innerHeight * 0.7, h0 - (e.clientY - y0))); bottom.style.setProperty("--tl-h", v + "px"); });
    resizer.addEventListener("pointerup", () => { if (y0 != null) { y0 = null; try { localStorage.setItem("mms.tlHeight", String(parseInt(bottom.style.getPropertyValue("--tl-h")))); } catch { /* ignore */ } } });
    resizer.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const cur = bottom.getBoundingClientRect().height;
      bottom.style.setProperty("--tl-h", Math.max(160, Math.min(innerHeight * 0.7, cur + (e.key === "ArrowUp" ? 24 : -24))) + "px");
    });
  }

  /* ---------------- commands */
  function undo() { const l = store.undo(); if (l) announce(t("studio.undid")); }
  function redo() { const l = store.redo(); if (l) announce(t("studio.redid")); }
  function announce(msg) { const lr = document.getElementById("liveRegion"); if (lr) { lr.textContent = ""; setTimeout(() => (lr.textContent = msg), 30); } }
  function openExport() {
    playback.pause();
    closePop();
    if (projectDuration(store.project) <= 0) { toast(t("export.empty")); return; }
    save.flush();
    const onBusy = (b) => { s.busy = b; syncChrome(); };
    openSheet(exportNowView(store, registry, { onBusy }));
  }
  function toggleFullscreen() {
    const target = stage;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else target.requestFullscreen?.().catch(() => {});
  }
  /** ? in the editor: how it works. */
  function helpSheet() { openSheet(guideView()); }
  /* ---------------- keyboard */
  const onKey = (e) => {
    if (isSheetOpen() || document.querySelector(".alert-layer")) return;
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) {
      if (e.key === "Escape") e.target.blur();
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    const fps = store.project.settings.fps;
    const k = e.key;
    const handled = () => e.preventDefault();
    if (mod && k.toLowerCase() === "z") { handled(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k.toLowerCase() === "y") { handled(); redo(); return; }
    if (mod && k.toLowerCase() === "d") { handled(); actions.duplicate(); return; }
    if (mod && k.toLowerCase() === "b") { handled(); actions.split(); return; }
    if (mod && k.toLowerCase() === "s") { handled(); s.forceSave = true; save.flush(); toast(t("studio.saved")); return; }
    if (mod) return;
    if (e.target.closest?.(".clip") && (k.startsWith("Arrow") || k === "Enter")) return; // handled by timeline
    switch (k) {
      case " ": handled(); playback.toggle(); break;
      case "k": case "K": handled(); playback.pause(); break;
      case "j": case "J": handled(); playback.seek(store.state.time - 1); break;
      case "l": case "L": handled(); playback.seek(store.state.time + 1); break;
      case "ArrowLeft": handled(); if (e.altKey) actions.nudge(-(e.shiftKey ? 1 : 1 / fps)); else playback.seek(store.state.time - (e.shiftKey ? 1 : 1 / fps)); break;
      case "ArrowRight": handled(); if (e.altKey) actions.nudge(e.shiftKey ? 1 : 1 / fps); else playback.seek(store.state.time + (e.shiftKey ? 1 : 1 / fps)); break;
      case "ArrowUp": handled(); actions.jumpEdit(-1); break;
      case "ArrowDown": handled(); actions.jumpEdit(1); break;
      case "Home": handled(); playback.seek(0); break;
      case "End": handled(); playback.seek(projectDuration(store.project)); break;
      case "s": case "S": handled(); actions.split(); break;
      case "Delete": case "Backspace": handled(); actions.remove(); break;
      case "+": case "=": handled(); timeline.zoomBy(1.4); break;
      case "-": case "_": handled(); timeline.zoomBy(1 / 1.4); break;
      case "\\": handled(); timeline.fit(); break;
      case "n": case "N": handled(); prefs.set("snapping", !prefs.get("snapping")); toast(t(prefs.get("snapping") ? "studio.snapOn" : "studio.snapOff")); break;
      case "t": case "T": handled(); actions.addText("title"); break;
      case "i": case "I": handled(); ctx.importMedia(); break;
      case "q": case "Q": handled(); actions.trimToPlayhead("start"); break;
      case "w": case "W": handled(); actions.trimToPlayhead("end"); break;
      case "e": case "E": handled(); openExport(); break;
      case "?": handled(); openSheet(shortcutsView()); break;
      case "Escape": if (pop) closePop(); else store.select([]); break;
    }
  };
  document.addEventListener("keydown", onKey);
  s.offs.push(() => document.removeEventListener("keydown", onKey));

  /* ---------------- start */
  s.dispose = () => {
    closePop();
    stopPreview();
    playback.dispose(); preview.dispose(); timeline.dispose(); inspector.dispose();
    panelCleanup?.();
    registry.dispose();
    s.offs.forEach((o) => o());
    editor.removeEventListener("drop", onDropFiles);
  };
  applyLayout();
  syncChrome(); updateTime();
  store.setZoom(Math.max(20, Math.min(160, (innerWidth * 0.7) / Math.max(10, projectDuration(store.project)))));
  timeline.render();
  inspector.render();
  registry.ensureAll().then(() => { playback.syncPaused(); timeline.render(); });
  // Titles redraw once their fonts have loaded.
  ensureProjectFonts(store.project);
  const onFonts = () => { if (!store.state.playing) preview.render(store.state.time); };
  window.addEventListener("mms:fonts", onFonts);
  s.offs.push(() => window.removeEventListener("mms:fonts", onFonts));
  if (pendingFiles) {
    const files = pendingFiles; pendingFiles = null;
    importFlow(registry, files).then((added) => { for (const m of added) actions.addMedia(m, { at: m.kind === "audio" ? 0 : projectDuration(store.project) }); });
  }
  saveState.textContent = t("studio.saved");
  translate(editor);
  document.title = store.project.name + " · " + APP.name;
  if (!prefs.get("seenLocalNotice") && !isSheetOpen()) showLocalNotice();
  if (isTouch() && layout() !== "mobile") editor.classList.add("touch");
}

function showLocalNotice() {
  openSheet({
    title: () => t("notice.title"),
    render(r) {
      r.append(
        h("div", { class: "first-run" }, h("span", { class: "fr-icon", html: icon("device") }),
          h("p", { class: "lead" }, t("storage.notice")),
          h("p", { class: "row-sub" }, t("notice.sub"))),
        h("button", { class: "btn primary large block", type: "button", autofocus: true, onclick: () => { prefs.set("seenLocalNotice", true); closeSheet(); } }, t("common.understood")));
    },
  }, { onClose: () => prefs.set("seenLocalNotice", true), hideDone: true });
}

async function closeSession({ keepSheet = false } = {}) {
  const s = session;
  if (!s) return;
  session = null;
  if (s.kind === "photo") { await s.close(); if (isSheetOpen() && !keepSheet) closeSheet(); return; }
  try { s.playback.pause(); } catch { /* ignore */ }
  if (!s.deleted) { s.save.cancel(); try { await saveProject(s.store.project); } catch { /* ignore */ } }
  s.dispose();
  if (isSheetOpen() && !keepSheet) closeSheet();
}

export function currentSession() { return session; }
