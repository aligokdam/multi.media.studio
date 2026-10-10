/* Studio: project browser and editor shell. Wires store, media registry,
   playback, preview, timeline, inspector and panels together, and owns
   autosave, keyboard shortcuts and the responsive layout. */
import { h, $, formatTime, formatBytes, debounce, pickFiles, downloadBlob, safeFilename, isTouch } from "../core/util.js";
import { icon, MARK } from "../core/icons.js";
import { t, lang, date, onLanguage, translate } from "../core/i18n.js";
import { prefs } from "../core/prefs.js";
import { toggleTheme } from "../core/appearance.js";
import { openSheet, close as closeSheet, isSheetOpen, confirmDialog, promptDialog } from "../core/sheet.js";
import { toast } from "../core/toast.js";
import { APP, ASPECTS, RESOLUTIONS, FRAME_RATES } from "../config.js";
import { webgl2Supported } from "../render/compositor.js";
import { createProject, findClip, frameSize, projectDuration, isVisual, mainTrack } from "./model.js";
import { createStore } from "./store.js";
import { createActions } from "./actions.js";
import { MediaRegistry, ACCEPT } from "../media/registry.js";
import { Playback } from "./playback.js";
import { Preview } from "./preview.js";
import { Timeline } from "./timeline.js";
import { Inspector } from "./inspector.js";
import { mediaPanel, importFlow } from "./panels/media.js";
import { musicPanel, soundsPanel } from "./panels/audio.js";
import { textPanel, effectsPanel, transitionsPanel, loadUserEffects } from "./panels/visuals.js";
import { settingsView, shortcutsView } from "./settings.js";
import { exportView, exportNowView, estimateBytes } from "../export/export-sheet.js";
import { probeCapabilities } from "../export/exporter.js";
import { listProjects, loadProject, saveProject, deleteProject, renameProject } from "../storage/projects.js";
import { exportPackage, importPackage } from "../storage/package.js";
import { stopPreview } from "../audio/preview.js";

const root = () => document.getElementById("studio");
let session = null;          // open editor session
let userEffectsLoaded = false;

export async function show(projectId) {
  if (!webgl2Supported()) { renderUnsupported(); return; }
  if (!userEffectsLoaded) { userEffectsLoaded = true; await loadUserEffects().catch(() => {}); }
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
  openEditor(project);
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
    h("div", { class: "pb-actions" },
      h("button", { class: "icon-btn", type: "button", "data-theme-toggle": "", "aria-label": t("nav.themeLight"), onclick: toggleTheme, html: icon("appearance") }),
      h("button", { class: "icon-btn", type: "button", "aria-label": t("settings.title"), title: t("settings.title"), onclick: () => openSheet(settingsView({ onRenamed: () => renderBrowser() })), html: icon("settings") })));
  const main = h("main", { class: "pb-main", id: "main", tabindex: "-1" },
    h("div", { class: "pb-head" },
      h("h1", {}, t("projects.title")),
      h("div", { class: "pb-buttons" },
        h("button", { class: "btn", type: "button", onclick: importProjectFlow }, h("span", { html: icon("importFile") }), t("projects.import")),
        h("button", { class: "btn primary", type: "button", onclick: newProjectFlow }, h("span", { html: icon("plus") }), t("projects.new")))),
    h("div", { class: "notice pb-notice" }, h("span", { html: icon("info") }), h("p", {}, t("storage.notice"))),
    grid);
  el.append(header, main);

  const projects = await listProjects();
  if (!projects.length) {
    grid.append(h("button", { class: "project-new-hero", type: "button", onclick: newProjectFlow },
      h("span", { class: "pnh-icon", html: icon("plus") }), h("strong", {}, t("projects.emptyTitle")), h("span", {}, t("projects.emptyText"))));
  }
  for (const p of projects) {
    const thumb = h("div", { class: "pc-thumb", dataset: { aspect: p.aspect } });
    if (p.thumb) thumb.append(h("img", { src: p.thumb, alt: "" }));
    else thumb.innerHTML = icon("media");
    const more = h("button", { class: "icon-btn small pc-more", type: "button", "aria-label": t("projects.options", { name: p.name }), html: icon("more"),
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); projectMenu(p); } });
    grid.append(h("a", { class: "project-card", href: "#/studio/" + p.id },
      thumb,
      h("span", { class: "pc-meta" }, h("strong", {}, p.name), h("span", { class: "ltr tabular" }, `${formatTime(p.duration || 0)} · ${p.aspect}`), h("span", {}, date(p.updatedAt))),
      more));
  }
  translate(el);
}

/* Phone project list: a plain list with thumbnail, duration, name (tap the pencil
   to rename) and date, plus a selection mode for deleting or exporting. */
async function renderPhoneBrowser() {
  const el = root();
  el.dataset.view = "browser";
  el.textContent = "";
  const projects = await listProjects();
  let selecting = false;
  const chosen = new Set();
  const list = h("ul", { class: "pl-list" });
  const selectBtn = h("button", { class: "icon-btn", type: "button", html: icon("checkCircle"), "aria-pressed": "false", onclick: () => setSelecting(!selecting) });
  const label = t("projects.select");
  selectBtn.setAttribute("aria-label", label); selectBtn.title = label;
  const top = h("header", { class: "pl-top" },
    h("a", { class: "icon-btn", href: "#/", "aria-label": t("nav.home"), title: t("nav.home"), html: icon("back") }),
    h("h1", {}, t("projects.title")),
    h("div", { class: "pl-top-end" },
      h("button", { class: "icon-btn", type: "button", "aria-label": t("settings.title"), title: t("settings.title"), html: icon("settings"), onclick: () => openSheet(settingsView({ onRenamed: () => renderBrowser() })) }),
      projects.length ? selectBtn : null));
  const bottom = h("footer", { class: "pl-bottom" });
  const ymd = (ms) => { const d = new Date(ms || Date.now()); const z = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };

  function drawBottom() {
    bottom.textContent = "";
    if (selecting) {
      const n = chosen.size;
      bottom.append(
        h("span", { class: "pl-count" }, t("projects.selected", { n })),
        h("button", { class: "btn", type: "button", disabled: n !== 1, onclick: async () => { const id = [...chosen][0]; const proj = await loadProject(id); setSelecting(false); await exportProjectFlow(proj); } }, h("span", { html: icon("exportFile") }), t("studio.export")),
        h("button", { class: "btn danger", type: "button", disabled: !n, onclick: async () => {
          const ok = await confirmDialog(n === 1
            ? { title: t("projects.deleteTitle"), message: t("projects.deleteBody", { name: projects.find((x) => chosen.has(x.id))?.name || "" }), confirm: t("common.delete"), destructive: true }
            : { title: t("projects.deleteManyTitle", { n }), message: t("projects.deleteManyBody"), confirm: t("common.delete"), destructive: true });
          if (!ok) return;
          for (const id of chosen) await deleteProject(id);
          renderBrowser();
        } }, h("span", { html: icon("trash") }), t("common.delete")));
    } else {
      bottom.append(
        h("button", { class: "icon-btn pl-import", type: "button", "aria-label": t("projects.import"), title: t("projects.import"), html: icon("importFile"), onclick: importProjectFlow }),
        h("button", { class: "btn primary large pl-create", type: "button", onclick: newProjectFlow }, h("span", { html: icon("plus") }), t("cta.start")));
    }
  }
  function setSelecting(v) {
    selecting = v; chosen.clear();
    selectBtn.setAttribute("aria-pressed", String(v));
    el.classList.toggle("selecting", v);
    list.querySelectorAll(".pl-row").forEach((r) => r.setAttribute("aria-checked", "false"));
    drawBottom();
  }
  for (const p of projects) {
    const thumb = h("span", { class: "pl-thumb" }, p.thumb ? h("img", { src: p.thumb, alt: "" }) : h("span", { class: "pl-thumb-empty", html: icon("clapper") }),
      h("span", { class: "pl-dur ltr tabular" }, formatTime(p.duration || 0)));
    const rename = h("button", { class: "pl-rename", type: "button", "aria-label": t("common.rename") + " " + p.name, title: t("common.rename"), html: icon("edit"),
      onclick: async (e) => { e.preventDefault(); e.stopPropagation(); const n = await promptDialog({ title: t("common.rename"), value: p.name }); if (n) { await renameProject(p.id, n); renderBrowser(); } } });
    const row = h("a", { class: "pl-row", href: "#/studio/" + p.id, role: "checkbox", "aria-checked": "false" },
      thumb,
      h("span", { class: "pl-meta" }, h("span", { class: "pl-name-row" }, h("strong", { class: "pl-name" }, p.name), rename), h("span", { class: "pl-date ltr tabular" }, ymd(p.updatedAt))),
      h("span", { class: "pl-check", "aria-hidden": "true", html: icon("check") }));
    row.addEventListener("click", (e) => {
      if (!selecting) return;
      e.preventDefault();
      chosen.has(p.id) ? chosen.delete(p.id) : chosen.add(p.id);
      row.setAttribute("aria-checked", String(chosen.has(p.id)));
      drawBottom();
    });
    list.append(h("li", {}, row));
  }
  const main = h("main", { class: "pl-main", id: "main", tabindex: "-1" },
    projects.length ? list : h("button", { class: "project-new-hero", type: "button", onclick: newProjectFlow },
      h("span", { class: "pnh-icon", html: icon("plus") }), h("strong", {}, t("projects.emptyTitle")), h("span", {}, t("projects.emptyText"))),
    h("p", { class: "pl-notice" }, t("storage.notice")));
  el.append(h("div", { class: "pl" }, top, main, bottom));
  drawBottom();
  translate(el);
}

function projectMenu(p) {
  openSheet({
    title: () => p.name,
    render(root, nav) {
      const row = (ic, label, fn, danger) => h("li", { class: "has-icon" }, h("button", { class: "row" + (danger ? " danger" : ""), type: "button", onclick: fn }, h("span", { class: "row-icon", html: icon(ic) }), h("span", { class: "row-label" }, label)));
      root.append(h("div", { class: "section" }, h("ul", { class: "list" },
        row("edit", t("common.rename"), async () => { const n = await promptDialog({ title: t("common.rename"), value: p.name }); if (n) { await renameProject(p.id, n); closeSheet(); renderBrowser(); } }),
        row("exportFile", t("projects.export"), async () => { closeSheet(); const proj = await loadProject(p.id); await exportProjectFlow(proj); }),
        row("trash", t("common.delete"), async () => {
          if (!(await confirmDialog({ title: t("projects.deleteTitle"), message: t("projects.deleteBody", { name: p.name }), confirm: t("common.delete"), destructive: true }))) return;
          await deleteProject(p.id); closeSheet(); renderBrowser();
        }, true))));
      void nav;
    },
  });
}

function newProjectFlow() {
  openSheet({
    title: () => t("projects.new"),
    render(root) {
      let aspect = prefs.get("defaultAspect");
      const name = h("input", { class: "field", type: "text", value: t("projects.untitled"), maxlength: "120", "aria-label": t("insp.projectName") });
      const tiles = h("div", { class: "aspect-grid", role: "radiogroup", "aria-label": t("insp.aspect") });
      const labels = { "16:9": "aspect.landscape", "9:16": "aspect.portrait", "1:1": "aspect.square", "4:5": "aspect.social", "4:3": "aspect.classic", "21:9": "aspect.cinema" };
      const draw = () => {
        tiles.textContent = "";
        for (const [a, [w, hh]] of Object.entries(ASPECTS)) {
          const k = 46 / Math.max(w, hh);
          tiles.append(h("button", { type: "button", class: "aspect-tile", role: "radio", "aria-checked": String(a === aspect), onclick: () => { aspect = a; draw(); } },
            h("span", { class: "aspect-shape", style: { width: w * k + "px", height: hh * k + "px" } }), h("strong", {}, a), h("span", {}, t(labels[a]))));
        }
      };
      draw();
      const create = async () => {
        const p = createProject({ name: name.value.trim() || t("projects.untitled"), aspect });
        await saveProject(p);
        closeSheet();
        location.hash = "#/studio/" + p.id;
      };
      root.append(h("div", { class: "section" }, h("h3", { class: "section-title" }, t("insp.projectName")), name),
        h("div", { class: "section" }, h("h3", { class: "section-title" }, t("insp.aspect")), tiles),
        h("div", { class: "section" }, h("button", { class: "btn primary large block", type: "button", onclick: create }, t("projects.create"))));
    },
  });
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
  s.playback = playback; s.preview = preview;

  /* ---------------- shared context for panels */
  const ctx = {
    store, registry, actions,
    importMedia: async () => {
      const files = await pickFiles({ accept: ACCEPT.all, multiple: true });
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
      openSheet({ title: () => t(PANELS[name].label), render: (r) => PANELS[name].render(r, { ...ctx, sheet: true }) }, { size: "large" });
    } else setPanel(name);
  }

  function openAudioSheet(start) {
    let which = start;
    openSheet({
      title: () => t("panel.audio"),
      render(r) {
        const body = h("div");
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
  const moreBtn = h("button", { class: "icon-btn", type: "button", "aria-label": t("studio.projectMenu"), title: t("studio.projectMenu"), html: icon("more"), onclick: () => editorMenu() });
  // Phone-only controls: aspect ratio and export settings open as drop-down panels.
  const aspectBtn = h("button", { class: "ar-btn show-mobile", type: "button", "aria-label": t("insp.aspect"), title: t("insp.aspect"), "aria-haspopup": "true", "aria-expanded": "false", onclick: () => togglePop("aspect") });
  const resBtn = h("button", { class: "res-btn show-mobile", type: "button", "aria-label": t("export.resolution"), title: t("export.resolution"), "aria-haspopup": "true", "aria-expanded": "false", onclick: () => togglePop("res") });
  const top = h("header", { class: "ed-top" },
    h("a", { class: "icon-btn", href: "#/studio", "aria-label": t("studio.backToProjects"), title: t("studio.backToProjects"), html: icon("back") }),
    h("div", { class: "ed-title" }, nameBtn, saveState),
    aspectBtn,
    h("div", { class: "ed-top-actions" }, undoBtn, redoBtn,
      h("button", { class: "icon-btn hide-mobile", type: "button", "aria-label": t("settings.shortcuts"), title: t("settings.shortcuts"), html: icon("keyboard"), onclick: () => openSheet(shortcutsView()) }),
      h("button", { class: "icon-btn", type: "button", "aria-label": t("settings.title"), title: t("settings.title"), html: icon("settings"), onclick: () => openSheet(settingsView(settingsCtx())) }),
      moreBtn),
    resBtn, exportBtn);

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
  });
  timeline.onSeek = (time) => playback.seek(time);
  s.timeline = timeline;
  const resizer = h("div", { class: "tl-resizer", role: "separator", "aria-orientation": "horizontal", "aria-label": t("studio.resizeTimeline"), tabindex: "0" });

  /* ---------------- mobile chrome */
  const toolsBar = h("div", { class: "ed-tools", role: "toolbar", "aria-label": t("studio.tools") });
  const tabs = h("nav", { class: "ed-tabs", "aria-label": t("studio.libraries") });
  const TABS = [["edit", "split", "tab.edit"], ["music", "music", "panel.audio"], ["adjust", "adjust", "insp.adjust"], ["effects", "effects", "panel.effects"], ["text", "text", "panel.text"], ["transitions", "transition", "panel.transitions"]];
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

  /* ---------------- phone drop-down panels (aspect ratio, export settings) */
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
    const el = h("div", { class: "ed-pop", role: "dialog", "aria-label": kind === "aspect" ? t("insp.aspect") : t("export.title") });
    pop = { kind, el };
    (kind === "aspect" ? aspectBtn : resBtn).setAttribute("aria-expanded", "true");
    if (kind === "aspect") drawAspectPop(el); else pop.off = drawResPop(el);
    editor.append(el);
    document.addEventListener("pointerdown", onOutside, true);
    el.querySelector("button, input")?.focus({ preventScroll: true });
  }
  function aspectGlyph(a) {
    const [w, hh] = ASPECTS[a];
    const k = 30 / Math.max(w, hh);
    return h("span", { class: "ar-glyph ltr", style: { width: Math.max(18, w * k) + "px", height: Math.max(18, hh * k) + "px" } }, a);
  }
  function drawAspectPop(el) {
    el.textContent = "";
    const row = h("div", { class: "ar-row", role: "radiogroup", "aria-label": t("insp.aspect") });
    for (const a of Object.keys(ASPECTS)) {
      row.append(h("button", { type: "button", class: "ar-opt", role: "radio", "aria-checked": String(store.project.settings.aspect === a), "aria-label": a,
        onclick: () => { store.update("aspect", (p) => { p.settings.aspect = a; }); drawAspectPop(el); } }, aspectGlyph(a), h("i", { class: "ar-dot" })));
    }
    el.append(row);
  }
  function drawResPop(el) {
    let caps = null;
    const p = store.project;
    const opts = () => ({ format: prefs.get("exportFormat"), resolution: prefs.get("exportResolution"), fps: prefs.get("exportFps") || p.settings.fps, quality: prefs.get("exportQuality") });
    const RES_NOTE = { 720: "HD", 1080: "Full HD", 1440: "Quad HD", 2160: "4K Ultra HD" };
    const draw = () => {
      const o = opts();
      const resOk = (r) => !caps || caps.resolutions[r]?.[o.format];
      el.textContent = "";
      el.append(
        stepSlider(t("export.resolution"), RES_NOTE[o.resolution] || "", RESOLUTIONS.map((r) => ({ value: r, label: r === 2160 ? "4K" : r + "p", off: !resOk(r) })), o.resolution, (v) => { prefs.set("exportResolution", v); draw(); }),
        stepSlider(t("export.fps"), "", FRAME_RATES.map((f) => ({ value: f, label: f + " fps" })), o.fps, (v) => { prefs.set("exportFps", v); draw(); }),
        stepSlider(t("export.quality"), "", [["medium", "export.q.medium"], ["high", "export.q.high"], ["very-high", "export.q.max"]].map(([v, k]) => ({ value: v, label: t(k) })), o.quality, (v) => { prefs.set("exportQuality", v); draw(); }),
        h("div", { class: "ss" }, h("div", { class: "ss-head" }, h("span", {}, t("export.format"))),
          h("div", { class: "segmented block", role: "radiogroup", "aria-label": t("export.format") },
            ...[["mp4", "MP4"], ["webm", "WebM"]].map(([v, l]) => h("button", { type: "button", role: "radio", "aria-checked": String(o.format === v), onclick: () => { prefs.set("exportFormat", v); draw(); } }, l)))),
        h("p", { class: "ed-pop-size ltr tabular" }, t("export.estimate") + " ≈ " + formatBytes(estimateBytes(p, o), lang())));
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
    resBtn.innerHTML = `<span>${r === 2160 ? "4K" : r + "p"}</span>` + icon("caret");
    editor.classList.toggle("has-sel", !!store.state.selection.length);
    nameBtn.textContent = store.project.name;
    playBtn.innerHTML = icon(store.state.playing ? "pause" : "play");
    playBtn.setAttribute("aria-label", t(store.state.playing ? "studio.pause" : "studio.play"));
    exportBtn.disabled = projectDuration(store.project) <= 0 || s.busy;
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
    openSheet(layout() === "mobile" ? exportNowView(store, registry, { onBusy }) : exportView(store, registry, { onBusy }), { size: "large" });
  }
  function toggleFullscreen() {
    const target = stage;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else target.requestFullscreen?.().catch(() => {});
  }
  function editorMenu() {
    openSheet({
      title: () => store.project.name,
      render(r) {
        const row = (ic, label, fn, danger) => h("li", { class: "has-icon" }, h("button", { class: "row" + (danger ? " danger" : ""), type: "button", onclick: fn }, h("span", { class: "row-icon", html: icon(ic) }), h("span", { class: "row-label" }, label)));
        r.append(
          h("div", { class: "section" }, h("ul", { class: "list" },
            row("exportFile", t("projects.export"), () => { closeSheet(); save.flush(); exportProjectFlow(store.project); }),
            row("importFile", t("projects.import"), () => { closeSheet(); importProjectFlow(); }),
            row("edit", t("common.rename"), async () => { const n = await promptDialog({ title: t("common.rename"), value: store.project.name }); if (n) { store.update("rename", (p) => { p.name = n; }); closeSheet(); } }))),
          h("div", { class: "section" }, h("ul", { class: "list" },
            row("general", t("insp.project"), () => { r.textContent = ""; r.append(inspector.projectSection()); }))),
          h("div", { class: "notice" }, h("span", { html: icon("info") }), h("p", {}, t("storage.notice"))));
      },
    });
  }
  function settingsCtx() {
    return {
      currentProjectId: () => store.project.id,
      onDeleteCurrent: () => { s.deleted = true; location.hash = "#/studio"; },
      onRenamed: (id, n) => { if (id === store.project.id) store.update("rename", (p) => { p.name = n; }); },
      beforeDeleteAll: () => { s.deleted = true; },
    };
  }

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
  try { s.playback.pause(); } catch { /* ignore */ }
  if (!s.deleted) { s.save.cancel(); try { await saveProject(s.store.project); } catch { /* ignore */ } }
  s.dispose();
  if (isSheetOpen() && !keepSheet) closeSheet();
}

export function currentSession() { return session; }
