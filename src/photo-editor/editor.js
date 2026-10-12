/* Photo editor: one photo or a collage of up to nine, with filters, effects,
   adjustments, text and stickers, exported as JPEG, PNG or WebP up to 8K.
   Layout follows the video editor: top bar with format and export settings,
   a canvas in the middle, tabs at the bottom on phones and a side panel on
   larger screens. Every change is one undo step. */
import { h, pickFiles, downloadBlob, safeFilename, formatBytes, clamp, debounce } from "../core/util.js";
import { icon } from "../core/icons.js";
import { t, lang } from "../core/i18n.js";
import { prefs } from "../core/prefs.js";
import { toast } from "../../components/toast.js";
import { openSheet, confirmDialog, promptDialog } from "../../components/sheet.js";
import { putBlob } from "../storage/blobs.js";
import { savePhotoProject } from "../storage/projects.js";
import { libraryEffects, EFFECT_CATEGORIES, effectName, getEffect } from "../render/effects.js";
import { defaultTextStyle } from "../render/text.js";
import { listFonts, fontName, fontStack, ensureFont } from "../render/fonts.js";
import { STICKERS, STICKER_EXT, stickerDataUrl, userStickers, importStickers, userStickerFile } from "../render/stickers.js";
import { uid } from "../core/util.js";
import {
  MAX_PHOTOS, LAYOUTS, layoutsFor, getLayout, ASPECT_LIST, BACKGROUNDS, EXPORT_SIZES, FILTERS, ADJUST_KEYS,
  createPhoto, createTextItem, createStickerItem, canvasSize, cellRects, fitLayout, docAspect,
} from "./model.js";
import { PhotoRenderer, canvasFits } from "./render.js";

/** append() without the null and false placeholders used for optional controls. */
const app = (el, ...kids) => el.append(...kids.filter((k) => k != null && k !== false));
const MAX_PHOTO_BYTES = 200 * 1024 * 1024;
const TEXT_COLORS = ["#ffffff", "#000000", "#ffd84a", "#ff5c6c", "#4dabf7", "#63e6be", "#b197fc", "#ff9f43"];
const FORMATS = [["jpeg", "JPG"], ["png", "PNG"], ["webp", "WebP"]];

let webpOk = null;
const webpSupported = () => {
  if (webpOk == null) { try { const c = document.createElement("canvas"); c.width = c.height = 2; webpOk = c.toDataURL("image/webp").startsWith("data:image/webp"); } catch { webpOk = false; } }
  return webpOk;
};

/**
 * Opens the photo editor in `el`. Returns a session: { kind, project, close() }.
 */
export function openPhotoEditor(el, initialDoc, { files = null } = {}) {
  let doc = initialDoc;
  const renderer = new PhotoRenderer();
  const undoStack = [], redoStack = [];
  let gesture = null;            // snapshot taken at the start of a drag or slider move
  let sel = null;                // { kind: "cell", index } | { kind: "item", id }
  let tab = "edit";              // edit | filter | effects | adjust | text | sticker
  let tool = null;               // phone: open drawer section inside the edit tab
  let drawerSnapshot = null;     // phone: state to restore when ✕ is pressed
  let disposed = false;
  const offs = [];
  const isPhone = () => matchMedia("(max-width: 900px)").matches;

  /* ---------------------------------------------------------------- history */
  const snap = () => JSON.stringify(doc);
  function commit(fn, { render = true } = {}) {
    const before = gesture ?? snap();
    gesture = null;
    if (fn(doc) === false) return false;
    undoStack.push(before); if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    changed(render);
    return true;
  }
  /** Live change during a drag or slider move. end() records one undo step. */
  function live(fn) { if (gesture == null) gesture = snap(); fn(doc); changed(true, true); }
  function end() { if (gesture == null) return; const before = gesture; gesture = null; if (before !== snap()) { undoStack.push(before); redoStack.length = 0; } changed(false); }
  function undo() { if (!undoStack.length) return; redoStack.push(snap()); doc = JSON.parse(undoStack.pop()); validateSel(); changed(true); refreshPanel(); }
  function redo() { if (!redoStack.length) return; undoStack.push(snap()); doc = JSON.parse(redoStack.pop()); validateSel(); changed(true); refreshPanel(); }
  function validateSel() {
    if (sel?.kind === "item" && !doc.items.some((i) => i.id === sel.id)) sel = null;
    if (sel?.kind === "cell" && sel.index >= getLayout(doc.layout).cells.length) sel = null;
  }
  function changed(render = true, isLive = false) {
    doc.updatedAt = Date.now();
    if (render) scheduleRender();
    syncChrome();
    if (!isLive) save();
  }

  /* ---------------------------------------------------------------- saving */
  const saveState = h("span", { class: "save-state" }, t("studio.saved"));
  const save = debounce(async () => {
    if (disposed) return;
    try { await savePhotoProject(doc, { thumb: makeThumb() }); saveState.textContent = t("studio.saved"); }
    catch (e) { console.error(e); saveState.textContent = t("studio.saveFailed"); }
  }, 700);
  function makeThumb() {
    try {
      if (!doc.photos.length && !doc.items.length) return null;
      const { w, h: hh } = canvasSize(doc, 320);
      const c = document.createElement("canvas");
      renderer.render(doc, c, w, hh, { preview: true });
      return c.toDataURL("image/jpeg", 0.75);
    } catch { return undefined; }
  }

  /* ---------------------------------------------------------------- top bar */
  const nameBtn = h("button", { class: "project-name", type: "button", title: t("common.rename"), onclick: async () => {
    const n = await promptDialog({ title: t("common.rename"), value: doc.name });
    if (n) commit((d) => { d.name = n.slice(0, 120); }, { render: false });
  } });
  const undoBtn = h("button", { class: "icon-btn", type: "button", "aria-label": t("studio.undo"), title: t("studio.undo"), html: icon("undo"), onclick: undo });
  const redoBtn = h("button", { class: "icon-btn", type: "button", "aria-label": t("studio.redo"), title: t("studio.redo"), html: icon("redo"), onclick: redo });
  const helpBtn = h("button", { class: "icon-btn", type: "button", "aria-label": t("photo.guide.title"), title: t("photo.guide.title"), html: icon("help"), onclick: () => openSheet(guideView()) });
  const aspectBtn = h("button", { class: "pe-ar-btn", type: "button", "aria-haspopup": "true", "aria-label": t("insp.aspect"), title: t("insp.aspect"), onclick: () => togglePop("aspect") });
  const sizeBtn = h("button", { class: "res-btn pe-res-btn", type: "button", "aria-haspopup": "true", "aria-label": t("photo.exportSettings"), title: t("photo.exportSettings"), onclick: () => togglePop("export") });
  const exportBtn = h("button", { class: "btn primary small pe-export", type: "button", onclick: () => exportImage() }, h("span", { html: icon("exportFile") }), h("span", {}, t("studio.export")));
  const top = h("header", { class: "pe-top" },
    h("a", { class: "icon-btn", href: "#/studio", "aria-label": t("studio.backToProjects"), title: t("studio.backToProjects"), html: icon("back") }),
    h("div", { class: "ed-title" }, nameBtn, saveState),
    aspectBtn,
    h("div", { class: "pe-top-actions" }, undoBtn, redoBtn, helpBtn),
    sizeBtn, exportBtn);

  /* ---------------------------------------------------------------- stage */
  const canvas = h("canvas", { class: "pe-canvas", "aria-label": t("photo.canvas") });
  const overlay = h("div", { class: "pe-sel", hidden: true });
  const wrap = h("div", { class: "pe-wrap" }, canvas, overlay);
  const empty = h("div", { class: "pe-empty" },
    h("span", { class: "pe-empty-icon", html: icon("image") }),
    h("strong", {}, t("photo.emptyTitle")),
    h("p", {}, t("photo.emptyText")),
    h("button", { class: "btn primary large", type: "button", onclick: () => addPhotos() }, h("span", { html: icon("plus") }), t("photo.choose")));
  const stage = h("section", { class: "pe-stage", "aria-label": t("studio.previewLabel") }, wrap, empty);

  /* ---------------------------------------------------------------- tabs, panel, tools */
  const TABS = [["edit", "layers", "photo.tab.edit"], ["filter", "sparkle", "photo.tab.filter"], ["effects", "effects", "photo.tab.effects"],
    ["adjust", "adjust", "photo.tab.adjust"], ["text", "text", "photo.tab.text"], ["sticker", "sticker", "photo.tab.sticker"]];
  const tabs = h("nav", { class: "pe-tabs", "aria-label": t("photo.tools") });
  for (const [k, ic, label] of TABS) tabs.append(h("button", { type: "button", class: "pe-tab", dataset: { tab: k }, onclick: () => openTab(k) }, h("span", { html: icon(ic) }), h("span", {}, t(label))));
  const panelTitle = h("h2", { class: "pe-panel-title" });
  const panelBody = h("div", { class: "pe-panel-body" });
  const cancelBtn = h("button", { class: "pe-x", type: "button", "aria-label": t("common.cancel"), title: t("common.cancel"), html: icon("close"), onclick: () => closeDrawer(false) });
  const doneBtn = h("button", { class: "pe-ok", type: "button", "aria-label": t("common.done"), title: t("common.done"), html: icon("check"), onclick: () => closeDrawer(true) });
  const panel = h("aside", { class: "pe-panel", "aria-label": t("photo.tools") }, h("div", { class: "pe-panel-head" }, cancelBtn, panelTitle, doneBtn), panelBody);
  const toolsRow = h("div", { class: "pe-toolsrow" });
  const root = h("div", { class: "pe" }, top, tabs, panel, stage, toolsRow);
  el.append(root);

  function applyLayout() {
    root.dataset.layout = isPhone() ? "mobile" : "desktop";
    refreshPanel();
    scheduleRender();
  }
  const mq = matchMedia("(max-width: 900px)");
  mq.addEventListener("change", applyLayout);
  offs.push(() => mq.removeEventListener("change", applyLayout));

  function openTab(k) {
    if (isPhone()) {
      if (k === "edit") { tab = "edit"; tool = null; closeDrawer(true); return; }
      tab = k; tool = null; drawerSnapshot = snap();
      root.classList.add("drawer-open");
    } else tab = k;
    if ((k === "filter" || k === "effects" || k === "adjust") && sel?.kind !== "cell" && doc.photos.length) sel = { kind: "cell", index: 0 };
    if (k === "text" && sel?.kind === "item" && itemById(sel.id)?.type !== "text") sel = null;
    refreshPanel(); scheduleRender();
  }
  function openTool(name) {
    tool = name; drawerSnapshot = snap();
    root.classList.add("drawer-open");
    refreshPanel();
  }
  function closeDrawer(keep) {
    if (!keep && drawerSnapshot && drawerSnapshot !== snap()) { doc = JSON.parse(drawerSnapshot); validateSel(); changed(true); }
    drawerSnapshot = null;
    root.classList.remove("drawer-open");
    if (isPhone()) { tab = "edit"; tool = null; }
    refreshPanel(); scheduleRender();
  }

  /* ---------------------------------------------------------------- render loop */
  let raf = 0, sizeCss = { w: 1, h: 1 };
  function scheduleRender() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawNow(); }); }
  let ensuring = null;
  async function drawNow() {
    if (disposed) return;
    empty.hidden = doc.photos.length > 0 || doc.items.length > 0;
    wrap.hidden = !empty.hidden;
    if (!empty.hidden) { overlay.hidden = true; return; }
    if (!ensuring) ensuring = renderer.ensure(doc).finally(() => { ensuring = null; });
    await ensuring;
    if (disposed) return;
    const r = stage.getBoundingClientRect();
    const pad = isPhone() ? 12 : 28;
    const aw = Math.max(40, r.width - pad * 2), ah = Math.max(40, r.height - pad * 2);
    const a = docAspect(doc);
    let cw = aw, ch = aw / a;
    if (ch > ah) { ch = ah; cw = ah * a; }
    sizeCss = { w: Math.round(cw), h: Math.round(ch) };
    wrap.style.width = sizeCss.w + "px"; wrap.style.height = sizeCss.h + "px";
    const dpr = Math.min(2, devicePixelRatio || 1);
    const k = Math.min(dpr, 2048 / Math.max(cw, ch));
    const W = Math.max(2, Math.round(cw * k)), H = Math.max(2, Math.round(ch * k));
    renderer.render(doc, canvas, W, H, { preview: true, selectedCell: sel?.kind === "cell" ? sel.index : -1 });
    placeOverlay();
  }
  const ro = new ResizeObserver(() => scheduleRender());
  ro.observe(stage);
  offs.push(() => ro.disconnect());
  const onFonts = () => scheduleRender();
  window.addEventListener("mms:fonts", onFonts);
  offs.push(() => window.removeEventListener("mms:fonts", onFonts));

  /* ---------------------------------------------------------------- selection overlay (dashed box, ✕, edit, resize) */
  const itemById = (id) => doc.items.find((i) => i.id === id);
  function placeOverlay() {
    const it = sel?.kind === "item" ? itemById(sel.id) : null;
    if (!it || !canvas.width) { overlay.hidden = true; return; }
    const s = sizeCss.w / canvas.width;
    const box = renderer.itemBox(it, canvas.width, canvas.height);
    overlay.hidden = false;
    Object.assign(overlay.style, { left: box.cx * s + "px", top: box.cy * s + "px", width: Math.max(24, box.w * s + 16) + "px", height: Math.max(24, box.h * s + 16) + "px", transform: `translate(-50%, -50%) rotate(${box.rotation}deg)` });
    overlay.classList.toggle("is-text", it.type === "text");
  }
  overlay.append(
    h("button", { class: "pe-sel-del", type: "button", "aria-label": t("common.delete"), title: t("common.delete"), html: icon("close"),
      onpointerdown: (e) => e.stopPropagation(),
      onclick: () => { const id = sel?.id; sel = null; commit((d) => { d.items = d.items.filter((i) => i.id !== id); }); refreshPanel(); } }),
    h("button", { class: "pe-sel-edit", type: "button", onpointerdown: (e) => e.stopPropagation(), onclick: () => editText() }, h("span", { html: icon("edit") }), t("photo.edit")),
    h("span", { class: "pe-sel-handle", role: "slider", "aria-label": t("photo.resize"), html: '<svg viewBox="0 0 24 24" class="i" aria-hidden="true"><path d="M8 8l8 8M16 10v6h-6M8 14V8h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' }));

  /* ---------------------------------------------------------------- pointer: select, move, pan, resize, rotate, pinch */
  const pointers = new Map();
  let drag = null;
  const toCanvas = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height, r }; };
  function hitItem(p) {
    for (let i = doc.items.length - 1; i >= 0; i--) {
      const it = doc.items[i];
      const b = renderer.itemBox(it, canvas.width, canvas.height);
      const a = (-b.rotation * Math.PI) / 180;
      const dx = p.x - b.cx, dy = p.y - b.cy;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      const m = Math.min(canvas.width, canvas.height) * 0.02;
      if (Math.abs(lx) <= b.w / 2 + m && Math.abs(ly) <= b.h / 2 + m) return it;
    }
    return null;
  }
  function hitCell(p) { return cellRects(doc, canvas.width, canvas.height).findIndex((c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h); }

  wrap.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    wrap.setPointerCapture(e.pointerId);
    const p = toCanvas(e);
    if (pointers.size === 2 && drag) { startPinch(); return; }
    if (e.target.closest(".pe-sel-handle")) {
      const it = itemById(sel.id);
      const b = renderer.itemBox(it, canvas.width, canvas.height);
      drag = { type: "handle", it, cx: b.cx, cy: b.cy, d0: Math.hypot(p.x - b.cx, p.y - b.cy), a0: Math.atan2(p.y - b.cy, p.x - b.cx), s0: it.scale, r0: it.rotation };
      return;
    }
    const it = hitItem(p);
    if (it) {
      const wasSel = sel?.kind === "item" && sel.id === it.id;
      sel = { kind: "item", id: it.id };
      if (it.type === "text" && tab !== "text" && !isPhone()) tab = "text";
      drag = { type: "item", it, x0: it.x, y0: it.y, px: p.x, py: p.y, moved: false, wasSel };
      refreshPanel(); scheduleRender();
      return;
    }
    const ci = hitCell(p);
    if (ci < 0) { sel = null; refreshPanel(); scheduleRender(); return; }
    const photo = doc.photos[ci];
    if (!photo) { sel = { kind: "cell", index: ci }; addPhotos(); return; }
    sel = { kind: "cell", index: ci };
    drag = { type: "pan", ci, photo, px: p.x, py: p.y, pan0: [photo.panX || 0, photo.panY ?? alignPan()], moved: false };
    refreshPanel(); scheduleRender();
  });
  const alignPan = () => ({ top: -1, center: 0, bottom: 1 }[doc.align] || 0);
  function startPinch() {
    const [a, b] = [...pointers.values()];
    drag = { ...drag, pinch: { d0: Math.hypot(a.x - b.x, a.y - b.y), a0: Math.atan2(b.y - a.y, b.x - a.x), s0: drag.it?.scale ?? drag.photo?.zoom ?? 1, r0: drag.it?.rotation ?? 0 } };
  }
  wrap.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!drag) return;
    const p = toCanvas(e);
    if (drag.pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const k = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, drag.pinch.d0);
      const rot = ((Math.atan2(b.y - a.y, b.x - a.x) - drag.pinch.a0) * 180) / Math.PI;
      if (drag.it) live(() => { const it = itemById(drag.it.id); it.scale = clamp(drag.pinch.s0 * k, 0.1, 8); it.rotation = snapAngle(drag.pinch.r0 + rot); });
      else if (drag.photo) live(() => { doc.photos[drag.ci].zoom = clamp(drag.pinch.s0 * k, 1, 5); });
      return;
    }
    if (drag.type === "handle") {
      const d = Math.hypot(p.x - drag.cx, p.y - drag.cy);
      const ang = ((Math.atan2(p.y - drag.cy, p.x - drag.cx) - drag.a0) * 180) / Math.PI;
      live(() => { const it = itemById(drag.it.id); it.scale = clamp((drag.s0 * d) / Math.max(1, drag.d0), 0.1, 8); it.rotation = snapAngle(drag.r0 + ang); });
      return;
    }
    const dx = p.x - drag.px, dy = p.y - drag.py;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    if (drag.type === "item") {
      live(() => { const it = itemById(drag.it.id); it.x = clamp(drag.x0 + dx / canvas.width, -0.2, 1.2); it.y = clamp(drag.y0 + dy / canvas.height, -0.2, 1.2); });
    } else if (drag.type === "pan") {
      const cell = cellRects(doc, canvas.width, canvas.height)[drag.ci];
      const src = renderer.source(drag.photo, 1024);
      if (!src) return;
      const r = renderer.coverRect(src, cell, { ...drag.photo, panX: 0, panY: 0 });
      const mx = (r.w - cell.w) / 2, my = (r.h - cell.h) / 2;
      live(() => {
        const ph = doc.photos[drag.ci];
        if (mx > 0.5) ph.panX = clamp(drag.pan0[0] - dx / mx, -1, 1);
        if (my > 0.5) ph.panY = clamp(drag.pan0[1] - dy / my, -1, 1);
      });
    }
  });
  const upHandler = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size > 0) return;
    if (drag?.type === "item" && !drag.moved && drag.wasSel && drag.it.type === "text") { drag = null; editText(); return; }
    drag = null; end();
  };
  wrap.addEventListener("pointerup", upHandler);
  wrap.addEventListener("pointercancel", upHandler);
  wrap.addEventListener("dblclick", (e) => { const it = hitItem(toCanvas(e)); if (it?.type === "text") { sel = { kind: "item", id: it.id }; editText(); } });
  wrap.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = toCanvas(e);
    const f = Math.exp(-e.deltaY * 0.0015);
    const it = hitItem(p);
    if (it) { sel = { kind: "item", id: it.id }; live(() => { const x = itemById(it.id); x.scale = clamp(x.scale * f, 0.1, 8); }); clearTimeout(wheelT); wheelT = setTimeout(end, 300); return; }
    const ci = hitCell(p);
    if (ci >= 0 && doc.photos[ci]) { sel = { kind: "cell", index: ci }; live(() => { const ph = doc.photos[ci]; ph.zoom = clamp((ph.zoom || 1) * f, 1, 5); }); clearTimeout(wheelT); wheelT = setTimeout(end, 300); }
  }, { passive: false });
  let wheelT = 0;
  const snapAngle = (a) => { const r = ((a % 360) + 540) % 360 - 180; for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(r - s) < 4) return s; return r; };

  /* drop images onto the stage */
  stage.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); stage.classList.add("drop-over"); } });
  stage.addEventListener("dragleave", () => stage.classList.remove("drop-over"));
  stage.addEventListener("drop", (e) => { e.preventDefault(); stage.classList.remove("drop-over"); const files = Array.from(e.dataTransfer?.files || []); if (files.length) addPhotos(files); });

  /* ---------------------------------------------------------------- photos */
  async function readPhoto(f) {
    if (!/^image\//.test(f.type) && !/\.(png|jpe?g|webp|gif|avif|bmp|heic|heif)$/i.test(f.name)) throw new Error("unsupported");
    if (f.size > MAX_PHOTO_BYTES) throw new Error("tooLarge");
    let bmp;
    try { bmp = await createImageBitmap(f, { imageOrientation: "from-image" }); } catch { throw new Error("unreadable"); }
    const w = bmp.width, hh = bmp.height;
    bmp.close?.();
    const blobId = uid("m");
    try { await putBlob(blobId, f); } catch { throw new Error("storage"); }
    return { blobId, name: f.name, width: w, height: hh, size: f.size, type: f.type };
  }
  async function addPhotos(given, { replaceIndex = -1 } = {}) {
    const files = given || await pickFiles({ accept: "image/*", multiple: replaceIndex < 0 });
    if (!files.length) return;
    const room = replaceIndex >= 0 ? 1 : MAX_PHOTOS - doc.photos.length;
    if (room <= 0) { toast(t("photo.maxPhotos", { n: MAX_PHOTOS })); return; }
    if (files.length > room) toast(t("photo.maxPhotos", { n: MAX_PHOTOS }));
    const read = [];
    for (const f of files.slice(0, room)) {
      try { read.push(await readPhoto(f)); }
      catch (e) { toast(t("photo.error." + (e.message || "unreadable"), { name: f.name }), { type: "error" }); }
    }
    if (!read.length) return;
    commit((d) => {
      for (const r of read) d.media[r.blobId] = { id: r.blobId, blobId: r.blobId, origin: "user", kind: "image", name: r.name, size: r.size, mime: r.type };
      if (replaceIndex >= 0 && d.photos[replaceIndex]) {
        const old = d.photos[replaceIndex];
        d.photos[replaceIndex] = { ...old, blobId: read[0].blobId, name: read[0].name, width: read[0].width, height: read[0].height, zoom: 1, panX: 0, panY: null, rotate: 0, flip: false };
      } else {
        for (const r of read) d.photos.push(createPhoto(r));
        fitLayout(d);
      }
      if (d.name === t("projects.untitled") && read[0]) d.name = read[0].name.replace(/\.[^.]+$/, "").slice(0, 120);
    });
    // Keep the general tools in view after adding photos; tap a photo to edit it.
    if (replaceIndex < 0) sel = isPhone() ? null : { kind: "cell", index: Math.min(doc.photos.length - 1, doc.photos.length - read.length) };
    refreshPanel();
  }
  const selPhotoIndex = () => (sel?.kind === "cell" && doc.photos[sel.index] ? sel.index : -1);
  function photoAction(kind) {
    const i = selPhotoIndex();
    if (i < 0) { toast(t("photo.selectPhoto")); return; }
    if (kind === "replace") return addPhotos(null, { replaceIndex: i });
    if (kind === "rotate") return commit((d) => { const p = d.photos[i]; p.rotate = ((p.rotate || 0) + 90) % 360; p.panX = 0; p.panY = null; });
    if (kind === "flip") return commit((d) => { d.photos[i].flip = !d.photos[i].flip; });
    if (kind === "fit") return commit((d) => { const p = d.photos[i]; p.zoom = 1; p.panX = 0; p.panY = null; });
    if (kind === "left" && i > 0) { commit((d) => { [d.photos[i - 1], d.photos[i]] = [d.photos[i], d.photos[i - 1]]; }); sel = { kind: "cell", index: i - 1 }; refreshPanel(); return; }
    if (kind === "right" && i < doc.photos.length - 1) { commit((d) => { [d.photos[i + 1], d.photos[i]] = [d.photos[i], d.photos[i + 1]]; }); sel = { kind: "cell", index: i + 1 }; refreshPanel(); return; }
    if (kind === "delete") { commit((d) => { d.photos.splice(i, 1); fitLayout(d); }); sel = null; refreshPanel(); }
  }

  /* ---------------------------------------------------------------- shared UI pieces */
  const chipRow = (items, current, onPick) => h("div", { class: "chips" }, ...items.map(([v, l]) => h("button", { class: "chip", type: "button", "aria-pressed": String(current === v), onclick: () => onPick(v) }, l)));
  function rangeRow(label, value, min, max, onInput, { format = (v) => String(Math.round(v)), reset, step = 1 } = {}) {
    const out = h("span", { class: "pe-range-val ltr tabular" }, format(value));
    const input = h("input", { type: "range", class: "pe-range", min: String(min), max: String(max), step: String(step), value: String(value), "aria-label": label });
    const fill = () => input.style.setProperty("--p", ((+input.value - min) / (max - min)) * 100 + "%");
    fill();
    input.addEventListener("input", () => { fill(); out.textContent = format(+input.value); onInput(+input.value); });
    input.addEventListener("change", end);
    if (reset != null) input.addEventListener("dblclick", () => { input.value = String(reset); fill(); out.textContent = format(reset); onInput(reset); end(); });
    return h("label", { class: "pe-range-row" }, h("span", { class: "pe-range-head" }, h("span", {}, label), out), input);
  }
  const section = (title, ...children) => h("div", { class: "pe-sec" }, title ? h("h3", { class: "pe-sec-title" }, title) : null, ...children);
  const toolBtn = (ic, label, fn, { pressed, disabled } = {}) => h("button", { class: "tool", type: "button", "aria-pressed": pressed == null ? null : String(!!pressed), disabled: !!disabled, onclick: fn }, h("span", { html: icon(ic) }), h("span", {}, label));

  function layoutGlyph(lay) {
    const s = 34, g = 2;
    const rects = lay.cells.map(([x, y, w, hh]) => `<rect x="${x * s + g / 2}" y="${y * s + g / 2}" width="${w * s - g}" height="${hh * s - g}" rx="2"/>`).join("");
    return `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" aria-hidden="true" fill="currentColor">${rects}</svg>`;
  }

  /* ---------------------------------------------------------------- edit tab sections */
  function photosSection() {
    const strip = h("div", { class: "pe-strip" });
    doc.photos.forEach((p, i) => {
      const img = h("img", { alt: "", draggable: "false" });
      const url = renderer.thumb(p, { filter: p.filter, adjust: p.adjust, effects: p.effects }, 96);
      if (url) img.src = url;
      strip.append(h("button", { class: "pe-strip-item", type: "button", "aria-pressed": String(selPhotoIndex() === i), "aria-label": p.name, title: p.name,
        onclick: () => { sel = { kind: "cell", index: i }; refreshPanel(); scheduleRender(); } }, img, h("span", { class: "pe-strip-num" }, String(i + 1))));
    });
    if (doc.photos.length < MAX_PHOTOS) strip.append(h("button", { class: "pe-strip-add", type: "button", "aria-label": t("photo.add"), title: t("photo.add"), html: icon("plus"), onclick: () => addPhotos() }));
    return section(t("photo.photos", { n: doc.photos.length, max: MAX_PHOTOS }), strip);
  }
  function photoActionsSection() {
    const i = selPhotoIndex();
    if (i < 0) return null;
    return section(t("photo.selected", { n: i + 1 }), h("div", { class: "pe-tools-grid" },
      toolBtn("importFile", t("photo.replace"), () => photoAction("replace")),
      toolBtn("redo", t("photo.rotate"), () => photoAction("rotate")),
      toolBtn("split", t("photo.flip"), () => photoAction("flip")),
      toolBtn("fit", t("photo.fit"), () => photoAction("fit")),
      toolBtn("back", t("photo.moveBack"), () => photoAction("left"), { disabled: i === 0 }),
      toolBtn("forward", t("photo.moveForward"), () => photoAction("right"), { disabled: i === doc.photos.length - 1 }),
      toolBtn("trash", t("common.delete"), () => photoAction("delete"))),
      h("p", { class: "pe-hint" }, t("photo.panHint")));
  }
  function layoutSection() {
    const opts = layoutsFor(doc.photos.length || 1);
    const all = doc.photos.length > 1 ? opts : LAYOUTS.filter((l) => l.cells.length <= 1);
    return section(t("photo.layout"), h("div", { class: "pe-layouts" }, ...all.map((l) =>
      h("button", { class: "pe-layout", type: "button", "aria-pressed": String(doc.layout === l.id), "aria-label": t("photo.layout") + " " + l.id, html: layoutGlyph(l),
        onclick: () => commit((d) => { d.layout = l.id; }) }))),
      doc.photos.length < 2 ? h("p", { class: "pe-hint" }, t("photo.collageHint")) : null);
  }
  function aspectGlyph(a) {
    if (a === "original") return h("span", { class: "ar-glyph ltr pe-orig" }, t("photo.original"));
    const [w, hh] = a.split(":").map(Number);
    const k = 30 / Math.max(w, hh);
    return h("span", { class: "ar-glyph ltr", style: { width: Math.max(18, w * k) + "px", height: Math.max(18, hh * k) + "px" } }, a);
  }
  function aspectSection() {
    return section(t("insp.aspect"), h("div", { class: "pe-aspects", role: "radiogroup", "aria-label": t("insp.aspect") }, ...ASPECT_LIST.map((a) =>
      h("button", { type: "button", class: "ar-opt", role: "radio", "aria-checked": String(doc.aspect === a), "aria-label": a === "original" ? t("photo.original") : a,
        onclick: () => commit((d) => { d.aspect = a; }) }, aspectGlyph(a), h("i", { class: "ar-dot" })))));
  }
  function frameSection() {
    return section(t("photo.frame"),
      rangeRow(t("photo.gap"), Math.round((doc.frame.gap || 0) * 1000), 0, 60, (v) => live(() => { doc.frame.gap = v / 1000; }), { reset: 0 }),
      rangeRow(t("photo.corners"), Math.round((doc.frame.radius || 0) * 1000), 0, 120, (v) => live(() => { doc.frame.radius = v / 1000; }), { reset: 0 }),
      h("div", { class: "pe-swatches", role: "radiogroup", "aria-label": t("photo.background") }, ...BACKGROUNDS.map((c) =>
        h("button", { type: "button", class: "pe-swatch", role: "radio", "aria-checked": String(doc.frame.bg === c), "aria-label": c, style: { "--sw": c }, onclick: () => commit((d) => { d.frame.bg = c; }) })),
        h("label", { class: "pe-swatch pe-swatch-pick", title: t("photo.customColor") }, h("input", { type: "color", value: doc.frame.bg, "aria-label": t("photo.customColor"), oninput: (e) => live(() => { doc.frame.bg = e.target.value; }), onchange: end }))));
  }
  function alignSection() {
    return section(t("photo.align"), h("div", { class: "segmented block", role: "radiogroup", "aria-label": t("photo.align") },
      ...[["top", "photo.alignTop"], ["center", "photo.alignCenter"], ["bottom", "photo.alignBottom"]].map(([v, k]) =>
        h("button", { type: "button", role: "radio", "aria-checked": String(doc.align === v), onclick: () => commit((d) => { d.align = v; for (const p of d.photos) p.panY = null; }) }, t(k)))),
      h("p", { class: "pe-hint" }, t("photo.alignHint")));
  }

  /* ---------------------------------------------------------------- filter tab */
  const thumbCache = new Map();
  function targetPhoto() { const i = selPhotoIndex(); return i >= 0 ? doc.photos[i] : doc.photos[0]; }
  function filterSection() {
    const p = targetPhoto();
    if (!p) return section(null, h("p", { class: "pe-hint" }, t("photo.needPhoto")));
    const idx = doc.photos.indexOf(p);
    const grid = h("div", { class: "pe-filters" });
    const tile = (id, label, look) => {
      const key = p.blobId + "|" + p.rotate + "|" + p.flip + "|" + id;
      let url = thumbCache.get(key);
      if (!url) { url = renderer.thumb(p, look, 120); if (url) thumbCache.set(key, url); }
      const on = (p.filter?.id || null) === id;
      return h("button", { class: "pe-filter", type: "button", "aria-pressed": String(on),
        onclick: () => commit((d) => { const ph = d.photos[idx]; ph.filter = id ? { id, amount: ph.filter?.id === id ? ph.filter.amount : 0.8 } : null; }) && refreshPanel() },
        id ? h("img", { src: url || "", alt: "" }) : h("span", { class: "pe-none", html: icon("none") }), h("span", {}, label));
    };
    grid.append(tile(null, t("filter.none"), {}));
    for (const f of FILTERS) grid.append(tile(f.id, t("filter." + f.id), { filter: { id: f.id, amount: 1 } }));
    return section(null, grid,
      p.filter ? rangeRow(t("filter.strength"), Math.round(p.filter.amount * 100), 0, 100, (v) => live(() => { if (doc.photos[idx].filter) doc.photos[idx].filter.amount = v / 100; }), { format: (v) => v + " %", reset: 80 }) : null,
      doc.photos.length > 1 ? h("button", { class: "btn block", type: "button", onclick: () => { commit((d) => { const src = d.photos[idx]; for (const ph of d.photos) ph.filter = src.filter ? { ...src.filter } : null; }); toast(t("photo.appliedAll")); } }, t("photo.applyAll")) : null);
  }

  /* ---------------------------------------------------------------- effects tab */
  let fxCat = null;
  function effectsSection() {
    const p = targetPhoto();
    if (!p) return section(null, h("p", { class: "pe-hint" }, t("photo.needPhoto")));
    const idx = doc.photos.indexOf(p);
    const defs = libraryEffects();
    const cats = [...EFFECT_CATEGORIES, ...(defs.some((d) => d.category === "custom") ? ["custom"] : [])];
    if (fxCat && !cats.includes(fxCat)) fxCat = null;
    const grid = h("div", { class: "pe-filters" });
    grid.append(h("button", { class: "pe-filter", type: "button", "aria-pressed": String(!p.effects?.length), onclick: () => commit((d) => { d.photos[idx].effects = []; }) && refreshPanel() },
      h("span", { class: "pe-none", html: icon("none") }), h("span", {}, t("fx.none"))));
    for (const def of defs.filter((d) => !fxCat || d.category === fxCat)) {
      const key = p.blobId + "|" + p.rotate + "|" + p.flip + "|fx:" + def.id;
      let url = thumbCache.get(key);
      if (!url) { url = renderer.thumb(p, { effects: [{ id: def.id, amount: Math.max(0.55, def.defaultAmount ?? 0.6) }] }, 120); if (url) thumbCache.set(key, url); }
      const on = p.effects?.some((e) => e.id === def.id);
      grid.append(h("button", { class: "pe-filter", type: "button", "aria-pressed": String(!!on),
        onclick: () => commit((d) => {
          const ph = d.photos[idx];
          ph.effects = ph.effects || [];
          if (ph.effects.some((e) => e.id === def.id)) ph.effects = ph.effects.filter((e) => e.id !== def.id);
          else { if (ph.effects.length >= 4) ph.effects.shift(); ph.effects.push({ id: def.id, amount: def.defaultAmount ?? 0.6 }); }
        }) && refreshPanel() },
        h("img", { src: url || "", alt: "" }), h("span", {}, effectName(def))));
    }
    // Settings of every applied effect: strength and the effect's own parameters.
    const applied = (p.effects || []).map((e) => {
      const def = getEffect(e.id);
      if (!def) return null;
      const setP = (key, v) => live(() => { const x = doc.photos[idx].effects.find((y) => y.id === e.id); if (x) x.params = { ...(x.params || {}), [key]: v }; });
      return h("div", { class: "pe-fx-item" },
        h("div", { class: "pe-fx-head" }, h("strong", {}, effectName(def)),
          h("button", { class: "icon-btn small", type: "button", "aria-label": t("insp.fxRemove", { name: effectName(def) }), title: t("insp.fxRemove", { name: effectName(def) }), html: icon("close"),
            onclick: () => commit((d) => { d.photos[idx].effects = d.photos[idx].effects.filter((y) => y.id !== e.id); }) && refreshPanel() })),
        rangeRow(t("insp.amount"), Math.round((e.amount ?? def.defaultAmount) * 100), 0, 100,
          (v) => live(() => { const x = doc.photos[idx].effects.find((y) => y.id === e.id); if (x) x.amount = v / 100; }), { format: (v) => v + " %", reset: Math.round(def.defaultAmount * 100) }),
        ...(def.params || []).map((pp) => {
          const v = e.params?.[pp.key] ?? pp.default;
          if (pp.type === "toggle") return h("label", { class: "pe-toggle" }, h("span", {}, t("fx.param." + pp.key)),
            h("input", { type: "checkbox", checked: !!v, onchange: (ev) => commit((d) => { const x = d.photos[idx].effects.find((y) => y.id === e.id); if (x) x.params = { ...(x.params || {}), [pp.key]: ev.target.checked ? 1 : 0 }; }) }));
          const dec = pp.step < 1 ? (pp.step < 0.1 ? 2 : 1) : 0;
          return rangeRow(t("fx.param." + pp.key), v, pp.min, pp.max, (val) => setP(pp.key, val), { step: pp.step, reset: pp.default, format: (val) => (+val).toFixed(dec) + (pp.unit ? " " + pp.unit : "") });
        }));
    }).filter(Boolean);
    return h("div", {},
      section(null, chipRow([[null, t("common.all")], ...cats.map((c) => [c, t("fx.cat." + c)])], fxCat, (c) => { fxCat = c; refreshPanel(); }), grid),
      applied.length ? section(t("photo.appliedEffects"), ...applied) : h("p", { class: "pe-hint" }, t("photo.effectsHint")));
  }

  /* ---------------------------------------------------------------- adjust tab */
  function adjustSection() {
    const p = targetPhoto();
    if (!p) return section(null, h("p", { class: "pe-hint" }, t("photo.needPhoto")));
    const idx = doc.photos.indexOf(p);
    return section(null,
      ...ADJUST_KEYS.map((k) => rangeRow(t("insp.adj." + k), p.adjust?.[k] || 0, -100, 100, (v) => live(() => { const ph = doc.photos[idx]; ph.adjust = { ...(ph.adjust || {}), [k]: v }; }), { format: (v) => (v > 0 ? "+" : "") + v, reset: 0 })),
      h("div", { class: "pe-row2" },
        h("button", { class: "btn", type: "button", onclick: () => commit((d) => { d.photos[idx].adjust = {}; }) && refreshPanel() }, t("common.reset")),
        doc.photos.length > 1 ? h("button", { class: "btn", type: "button", onclick: () => { commit((d) => { const a = { ...(d.photos[idx].adjust || {}) }; for (const ph of d.photos) ph.adjust = { ...a }; }); toast(t("photo.appliedAll")); } }, t("photo.applyAll")) : null));
  }

  /* ---------------------------------------------------------------- text tab */
  const PRESETS = [["title", 1], ["subtitle", 1], ["caption", 1]];
  function addText(preset = "title") {
    const style = { ...defaultTextStyle(preset), size: preset === "title" ? 120 : preset === "subtitle" ? 72 : 48 };
    const it = createTextItem(t("text.sample." + preset), style);
    it.y = preset === "caption" ? 0.82 : 0.5;
    commit((d) => { d.items.push(it); });
    sel = { kind: "item", id: it.id };
    refreshPanel();
  }
  function textSection() {
    const it = sel?.kind === "item" ? itemById(sel.id) : null;
    const quick = section(t("photo.addText"), h("div", { class: "pe-tools-grid" }, ...PRESETS.map(([k]) => toolBtn("text", t("text.preset." + k), () => addText(k)))));
    if (!it || it.type !== "text") return h("div", {}, quick, h("p", { class: "pe-hint" }, t("photo.textHint")));
    const st = it.style;
    const setStyle = (fn) => commit((d) => { const x = d.items.find((i) => i.id === it.id); fn(x.style, x); });
    const area = h("textarea", { class: "field pe-textarea", rows: "3", "aria-label": t("insp.textContent") });
    area.value = it.content;
    area.addEventListener("input", () => live(() => { itemById(it.id).content = area.value; }));
    area.addEventListener("change", end);
    const fonts = h("select", { class: "field", "aria-label": t("insp.font"), onchange: (e) => { ensureFont(e.target.value); setStyle((s) => { s.font = e.target.value; }); } },
      ...listFonts().map((f) => h("option", { value: f.key, selected: f.key === st.font, style: { fontFamily: fontStack(f.key) } }, fontName(f.key, t))));
    return h("div", {},
      section(t("insp.textContent"), area),
      section(t("insp.font"), fonts,
        h("div", { class: "segmented block", role: "radiogroup", "aria-label": t("insp.weight") }, ...[[400, "insp.weightRegular"], [600, "insp.weightSemibold"], [800, "insp.weightBold"]].map(([v, k]) =>
          h("button", { type: "button", role: "radio", "aria-checked": String(st.weight === v), onclick: () => setStyle((s) => { s.weight = v; }) }, t(k))))),
      section(t("insp.color"), h("div", { class: "pe-swatches" }, ...TEXT_COLORS.map((c) =>
        h("button", { type: "button", class: "pe-swatch", "aria-pressed": String(st.color === c), "aria-label": c, style: { "--sw": c }, onclick: () => setStyle((s) => { s.color = c; }) })),
        h("label", { class: "pe-swatch pe-swatch-pick" }, h("input", { type: "color", value: st.color, "aria-label": t("photo.customColor"), oninput: (e) => live(() => { itemById(it.id).style.color = e.target.value; }), onchange: end })))),
      section(null,
        rangeRow(t("insp.size"), Math.round(it.scale * 100), 10, 600, (v) => live(() => { itemById(it.id).scale = v / 100; }), { format: (v) => v + " %", reset: 100 }),
        rangeRow(t("photo.rotation"), Math.round(it.rotation || 0), -180, 180, (v) => live(() => { itemById(it.id).rotation = v; }), { format: (v) => v + "°", reset: 0 }),
        h("label", { class: "pe-toggle" }, h("span", {}, t("insp.background")),
          h("input", { type: "checkbox", class: "switch-input", checked: !!st.bg, onchange: (e) => setStyle((s) => { s.bg = e.target.checked; s.bgOpacity = s.bgOpacity ?? 0.6; }) }))),
      h("div", { class: "pe-row2" },
        h("button", { class: "btn", type: "button", onclick: () => { const copy = { ...structuredClone(it), id: uid("it"), x: Math.min(0.95, it.x + 0.05), y: Math.min(0.95, it.y + 0.05) }; commit((d) => { d.items.push(copy); }); sel = { kind: "item", id: copy.id }; refreshPanel(); } }, h("span", { html: icon("duplicate") }), t("tl.duplicate")),
        h("button", { class: "btn danger", type: "button", onclick: () => { sel = null; commit((d) => { d.items = d.items.filter((x) => x.id !== it.id); }); refreshPanel(); } }, h("span", { html: icon("trash") }), t("common.delete"))));
  }
  function editText() {
    const it = sel?.kind === "item" ? itemById(sel.id) : null;
    if (!it || it.type !== "text") return;
    if (isPhone()) openTab("text"); else { tab = "text"; refreshPanel(); }
    requestAnimationFrame(() => { const a = panelBody.querySelector(".pe-textarea"); if (a) { a.focus(); a.select(); } });
  }

  /* ---------------------------------------------------------------- sticker tab */
  function stickerSection() {
    const grid = h("div", { class: "sticker-grid" });
    for (const s of STICKERS) grid.append(h("button", { class: "sticker-tile", type: "button", "aria-label": t("sticker.add", { name: t("sticker.name." + s.id) }), title: t("sticker.name." + s.id),
      onclick: () => addSticker(createStickerItem({ stickerId: s.id })) }, h("img", { src: stickerDataUrl(s), alt: "", draggable: "false" })));
    const yours = h("div", { class: "sticker-grid" });
    userStickers().then((list) => {
      for (const u of list) {
        const img = h("img", { alt: "", draggable: "false" });
        userStickerFile(u).then((f) => { const url = URL.createObjectURL(f); img.src = url; img.onload = () => URL.revokeObjectURL(url); }).catch(() => {});
        yours.append(h("button", { class: "sticker-tile", type: "button", title: u.name, "aria-label": t("sticker.add", { name: u.name }),
          onclick: async () => {
            try {
              const f = await userStickerFile(u);
              const blobId = uid("m");
              await putBlob(blobId, f);
              doc.media[blobId] = { id: blobId, blobId, origin: "user", kind: "image", name: f.name, size: f.size, mime: f.type };
              addSticker(createStickerItem({ blobId, width: u.width, height: u.height }));
            } catch { toast(t("media.error.unreadable", { name: u.name }), { type: "error" }); }
          } }, img));
      }
      if (!list.length) yours.append(h("p", { class: "panel-hint sticker-empty" }, t("sticker.noneYet")));
    });
    return h("div", {},
      h("div", { class: "panel-actions" }, h("button", { class: "btn block", type: "button", onclick: async () => {
        const files = await pickFiles({ accept: STICKER_EXT.map((x) => "." + x).join(",") + ",image/*", multiple: true });
        if (!files.length) return;
        const { added, errors } = await importStickers(files);
        for (const e of errors) toast(t("sticker.error." + e.reason, { name: e.name }), { type: e.reason === "duplicate" ? undefined : "error" });
        if (added.length) toast(t("sticker.imported", { n: added.length }), { type: "success" });
        refreshPanel();
      } }, h("span", { html: icon("importFile") }), t("common.import"))),
      section(t("sticker.cat.emoji"), grid), section(t("sticker.yours"), yours));
  }
  function addSticker(item) {
    commit((d) => { d.items.push(item); });
    sel = { kind: "item", id: item.id };
    refreshPanel();
  }

  /* ---------------------------------------------------------------- panel and phone tools */
  const TOOL_TITLES = { photos: "photo.photos.short", layout: "photo.layout", aspect: "insp.aspect", frame: "photo.frame", align: "photo.align", selected: "photo.photo" };
  function refreshPanel() {
    const phone = isPhone();
    tabs.querySelectorAll(".pe-tab").forEach((b) => b.setAttribute("aria-current", String(b.dataset.tab === (phone && !root.classList.contains("drawer-open") ? "edit" : tab))));
    panelBody.textContent = "";
    let title = "";
    if (phone && tab === "edit") {
      if (tool) {
        title = t(TOOL_TITLES[tool]);
        panelBody.append(({ photos: photosSection, layout: layoutSection, aspect: aspectSection, frame: frameSection, align: alignSection, selected: photoActionsSection })[tool]() || h("div"));
      }
    } else {
      const label = TABS.find((x) => x[0] === tab)?.[2];
      title = t(label);
      if (tab === "edit") panelBody.append(...[photoActionsSection(), photosSection(), layoutSection(), aspectSection(), frameSection(), doc.photos.length > 1 ? alignSection() : null].filter(Boolean));
      if (tab === "filter") panelBody.append(filterSection());
      if (tab === "effects") panelBody.append(effectsSection());
      if (tab === "adjust") panelBody.append(adjustSection());
      if (tab === "text") panelBody.append(textSection());
      if (tab === "sticker") panelBody.append(stickerSection());
    }
    panelTitle.textContent = title;
    renderToolsRow();
    syncChrome();
  }
  function renderToolsRow() {
    toolsRow.textContent = "";
    if (!isPhone()) return;
    const i = selPhotoIndex();
    const it = sel?.kind === "item" ? itemById(sel.id) : null;
    if (it) {
      app(toolsRow, 
        it.type === "text" ? toolBtn("edit", t("photo.edit"), () => editText()) : null,
        toolBtn("duplicate", t("tl.duplicate"), () => { const copy = { ...structuredClone(it), id: uid("it"), x: Math.min(0.95, it.x + 0.05), y: Math.min(0.95, it.y + 0.05) }; commit((d) => { d.items.push(copy); }); sel = { kind: "item", id: copy.id }; refreshPanel(); }),
        toolBtn("trash", t("common.delete"), () => { sel = null; commit((d) => { d.items = d.items.filter((x) => x.id !== it.id); }); refreshPanel(); }),
        toolBtn("close", t("common.done"), () => { sel = null; refreshPanel(); scheduleRender(); }));
      return;
    }
    if (i >= 0) {
      app(toolsRow, 
        toolBtn("importFile", t("photo.replace"), () => photoAction("replace")),
        toolBtn("redo", t("photo.rotate"), () => photoAction("rotate")),
        toolBtn("split", t("photo.flip"), () => photoAction("flip")),
        toolBtn("fit", t("photo.fit"), () => photoAction("fit")),
        toolBtn("sparkle", t("photo.tab.filter"), () => openTab("filter")),
        toolBtn("adjust", t("photo.tab.adjust"), () => openTab("adjust")),
        toolBtn("back", t("photo.moveBack"), () => photoAction("left"), { disabled: i === 0 }),
        toolBtn("forward", t("photo.moveForward"), () => photoAction("right"), { disabled: i === doc.photos.length - 1 }),
        toolBtn("trash", t("common.delete"), () => photoAction("delete")),
        toolBtn("close", t("common.done"), () => { sel = null; refreshPanel(); scheduleRender(); }));
      return;
    }
    app(toolsRow, 
      toolBtn("plus", t("photo.add"), () => addPhotos(), { disabled: doc.photos.length >= MAX_PHOTOS }),
      toolBtn("layers", t("photo.layout"), () => openTool("layout")),
      toolBtn("aspect", t("insp.aspect"), () => openTool("aspect")),
      toolBtn("fit", t("photo.frame"), () => openTool("frame")),
      toolBtn("image", t("photo.photos.short"), () => openTool("photos")),
      doc.photos.length > 1 ? toolBtn("align", t("photo.align"), () => openTool("align")) : null);
  }

  /* ---------------------------------------------------------------- popovers: aspect, export settings */
  let pop = null;
  function closePop() { if (!pop) return; pop.remove(); pop = null; document.removeEventListener("pointerdown", onOutside, true); }
  function onOutside(e) { if (pop && !pop.contains(e.target) && !e.target.closest(".pe-ar-btn, .pe-res-btn")) closePop(); }
  function togglePop(kind) {
    if (pop?.dataset.kind === kind) return closePop();
    closePop();
    pop = h("div", { class: "ed-pop pe-pop", role: "dialog", dataset: { kind }, "aria-label": kind === "aspect" ? t("insp.aspect") : t("photo.exportSettings") });
    if (kind === "aspect") drawAspectPop(); else drawExportPop();
    root.append(pop);
    document.addEventListener("pointerdown", onOutside, true);
  }
  function drawAspectPop() {
    pop.textContent = "";
    pop.append(h("div", { class: "ar-row pe-ar-row", role: "radiogroup", "aria-label": t("insp.aspect") }, ...ASPECT_LIST.map((a) =>
      h("button", { type: "button", class: "ar-opt", role: "radio", "aria-checked": String(doc.aspect === a), "aria-label": a === "original" ? t("photo.original") : a,
        onclick: () => { commit((d) => { d.aspect = a; }); drawAspectPop(); } }, aspectGlyph(a), h("i", { class: "ar-dot" })))));
  }
  const exportOpts = () => ({ size: prefs.get("photoExportSize") || 3840, format: prefs.get("photoExportFormat") || "jpeg", quality: prefs.get("photoExportQuality") || 92 });
  const fitCache = new Map();
  function sizeFits(longSide) {
    const { w, h: hh } = canvasSize(doc, longSide);
    const key = w + "x" + hh;
    if (!fitCache.has(key)) fitCache.set(key, canvasFits(w, hh));
    return fitCache.get(key);
  }
  function estimate(o) {
    const { w, h: hh } = canvasSize(doc, o.size);
    const px = w * hh;
    const bpp = o.format === "png" ? 1.6 : o.format === "webp" ? 0.09 + (o.quality / 100) ** 3 * 0.5 : 0.12 + (o.quality / 100) ** 3 * 0.75;
    return px * bpp;
  }
  function drawExportPop() {
    const o = exportOpts();
    if (o.format === "webp" && !webpSupported()) o.format = "jpeg";
    pop.textContent = "";
    const stops = EXPORT_SIZES.map((s) => ({ ...s, off: !sizeFits(s.value) }));
    let idx = Math.max(0, stops.findIndex((s) => s.value === o.size));
    if (stops[idx].off) { const ok = stops.map((s, i) => (s.off ? -1 : i)).filter((i) => i >= 0); idx = ok.length ? ok[ok.length - 1] : 0; }
    const { w, h: hh } = canvasSize(doc, stops[idx].value);
    const n = stops.length;
    const input = h("input", { type: "range", class: "ss-input ltr", min: "0", max: String(n - 1), step: "1", value: String(idx), "aria-label": t("export.resolution"), "aria-valuetext": stops[idx].label });
    input.style.setProperty("--p", (idx / (n - 1)) * 100 + "%");
    input.addEventListener("input", () => input.style.setProperty("--p", (input.value / (n - 1)) * 100 + "%"));
    input.addEventListener("change", () => { let i = +input.value; if (stops[i].off) i = idx; prefs.set("photoExportSize", stops[i].value); drawExportPop(); syncChrome(); });
    app(pop,
      h("div", { class: "ss" },
        h("div", { class: "ss-head" }, h("span", {}, t("export.resolution")), h("span", { class: "ss-note ltr tabular" }, `${w} × ${hh}`)),
        h("div", { class: "ss-track" }, h("div", { class: "ss-dots", "aria-hidden": "true" }, ...stops.map((s, i) => h("i", { class: s.off ? "off" : "", style: { left: (i / (n - 1)) * 100 + "%" } }))), input),
        h("div", { class: "ss-labels ltr", "aria-hidden": "true" }, ...stops.map((s, i) => h("span", { class: (i === idx ? "on " : "") + (s.off ? "off" : ""), style: { left: (i / (n - 1)) * 100 + "%" } }, s.label)))),
      stops.some((s) => s.off) ? h("p", { class: "pe-hint" }, t("photo.sizeLimit")) : null,
      h("div", { class: "ss" }, h("div", { class: "ss-head" }, h("span", {}, t("export.format"))),
        h("div", { class: "segmented block", role: "radiogroup", "aria-label": t("export.format") },
          ...FORMATS.map(([v, l]) => h("button", { type: "button", role: "radio", disabled: v === "webp" && !webpSupported(), "aria-checked": String(o.format === v), onclick: () => { prefs.set("photoExportFormat", v); drawExportPop(); } }, l)))),
      o.format !== "png" ? rangeRow(t("export.quality"), o.quality, 60, 100, (v) => { prefs.set("photoExportQuality", v); est.textContent = t("export.estimate") + " ≈ " + formatBytes(estimate({ ...o, size: stops[idx].value, quality: v }), lang()); }, { format: (v) => v + " %" }) : null,
      h("p", { class: "ed-pop-size ltr tabular" }, ""),
      h("button", { class: "btn primary large block", type: "button", onclick: () => { closePop(); exportImage(); } }, h("span", { html: icon("exportFile") }), t("studio.export")),
      h("p", { class: "pe-hint center" }, t("photo.exportNote")));
    const est = pop.querySelector(".ed-pop-size");
    est.textContent = t("export.estimate") + " ≈ " + formatBytes(estimate({ ...o, size: stops[idx].value }), lang());
  }

  /* ---------------------------------------------------------------- export */
  let exporting = false;
  async function exportImage() {
    if (exporting) return;
    if (!doc.photos.length && !doc.items.length) { toast(t("photo.needPhoto")); return; }
    const o = exportOpts();
    let size = o.size;
    if (!sizeFits(size)) { size = EXPORT_SIZES.map((s) => s.value).filter(sizeFits).pop() || 1080; toast(t("photo.sizeLimit")); }
    const format = o.format === "webp" && !webpSupported() ? "jpeg" : o.format;
    exporting = true; exportBtn.disabled = true;
    toast(t("photo.exporting"), { duration: 60000 });
    try {
      await renderer.ensure(doc);
      const { w, h: hh } = canvasSize(doc, size);
      const c = document.createElement("canvas");
      renderer.render(doc, c, w, hh, { preview: false });
      const mime = "image/" + format;
      const blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), mime, format === "png" ? undefined : o.quality / 100));
      c.width = c.height = 1;
      const ext = format === "jpeg" ? "jpg" : format;
      const file = safeFilename(doc.name, "photo") + "." + ext;
      let saved = false;
      if ("showSaveFilePicker" in window) {
        try {
          const handle = await window.showSaveFilePicker({ suggestedName: file, types: [{ description: ext.toUpperCase(), accept: { [mime]: ["." + ext] } }] });
          const wr = await handle.createWritable(); await wr.write(blob); await wr.close(); saved = true;
        } catch (e) { if (e?.name === "AbortError") { toast(""); return; } }
      }
      if (!saved) downloadBlob(blob, file);
      toast(t("photo.exported", { size: `${w} × ${hh}`, bytes: formatBytes(blob.size, lang()) }), { type: "success" });
    } catch (e) {
      console.error(e);
      toast(t("photo.exportFailed"), { type: "error" });
    } finally { exporting = false; exportBtn.disabled = false; }
  }

  /* ---------------------------------------------------------------- guide */
  function guideView() {
    return {
      title: () => t("photo.guide.title"),
      render(r) {
        r.append(h("ol", { class: "guide-steps" }, ...[1, 2, 3, 4, 5].map((i) => h("li", {}, h("span", { class: "guide-num" }, String(i)), h("span", {}, t("photo.guide.s" + i))))),
          h("p", { class: "guide-privacy" }, t("guide.privacy")));
      },
    };
  }

  /* ---------------------------------------------------------------- chrome */
  function syncChrome() {
    undoBtn.disabled = !undoStack.length; redoBtn.disabled = !redoStack.length;
    nameBtn.textContent = doc.name;
    aspectBtn.textContent = ""; aspectBtn.append(aspectGlyph(doc.aspect));
    const o = exportOpts();
    sizeBtn.innerHTML = `<span>${EXPORT_SIZES.find((s) => s.value === o.size)?.label || "4K"}</span>` + icon("caret");
    exportBtn.disabled = exporting || (!doc.photos.length && !doc.items.length);
    root.classList.toggle("has-photos", doc.photos.length > 0);
  }

  /* keyboard: undo, redo, delete */
  function onKey(e) {
    if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && sel) {
      e.preventDefault();
      if (sel.kind === "item") { const id = sel.id; sel = null; commit((d) => { d.items = d.items.filter((i) => i.id !== id); }); refreshPanel(); }
      else photoAction("delete");
    }
    if (e.key === "Escape") { if (pop) closePop(); else { sel = null; refreshPanel(); scheduleRender(); } }
  }
  document.addEventListener("keydown", onKey);
  offs.push(() => document.removeEventListener("keydown", onKey));

  applyLayout();
  // Photos chosen with "Create" are added as soon as the editor opens.
  if (files?.length && !doc.photos.length) setTimeout(() => addPhotos(files), 30);

  return {
    kind: "photo",
    get project() { return doc; },
    async close() {
      disposed = true;
      closePop();
      save.cancel?.();
      try { await savePhotoProject(doc, { thumb: makeThumb() }); } catch { /* ignore */ }
      offs.forEach((o) => o());
      renderer.dispose();
      cancelAnimationFrame(raf);
    },
  };
}
