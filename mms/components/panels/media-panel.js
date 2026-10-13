/* Media panel: import, browse and place the project's own media. */
import { h, formatTime, formatBytes, pickFiles } from "../../src/core/util.js";
import { icon } from "../../src/core/icons.js";
import { t, lang } from "../../src/core/i18n.js";
import { toast } from "../sheet.js";
import { confirmDialog } from "../sheet.js";
import { ACCEPT } from "../../src/media/registry.js";

export function mediaPanel(root, ctx) {
  const { store, registry, actions } = ctx;
  const grid = h("div", { class: "media-grid" });
  const importBtn = h("button", { class: "btn primary block", type: "button", onclick: () => ctx.importMedia() }, h("span", { html: icon("importFile") }), t("common.import"));
  const hint = h("p", { class: "panel-hint" }, t("media.hint"));
  let query = "", kind = null;
  const search = h("input", { class: "field", type: "search", placeholder: t("media.search"), "aria-label": t("media.search"), oninput: (e) => { query = e.target.value.trim().toLowerCase(); render(); } });
  const chips = h("div", { class: "chips" });
  const tools = h("div", { class: "media-tools" }, h("div", { class: "search" }, h("span", { html: icon("search") }), search), chips);
  root.append(h("div", { class: "panel-actions" }, importBtn), tools, grid, hint);
  dropImport(root, (files) => ctx.importMedia(files));

  function renderChips() {
    chips.textContent = "";
    [[null, t("common.all")], ["video", t("media.kind.video")], ["image", t("media.kind.image")], ["audio", t("media.kind.audio")]].forEach(([k, l]) =>
      chips.append(h("button", { class: "chip", type: "button", "aria-pressed": String(kind === k), onclick: () => { kind = k; renderChips(); render(); } }, l)));
  }
  renderChips();

  function used(id) { return store.project.tracks.some((tr) => tr.clips.some((c) => c.mediaId === id)); }

  function render() {
    grid.textContent = "";
    const all = Object.values(store.project.media).filter((m) => m.origin === "user").sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    const items = all.filter((m) => (!kind || m.kind === kind) && (!query || m.name.toLowerCase().includes(query)));
    hint.hidden = all.length > 0;
    tools.hidden = all.length === 0;
    for (const m of items) grid.append(card(m));
    if (!all.length) grid.append(h("div", { class: "media-empty" }, h("span", { html: icon("media") }), h("p", {}, t("media.empty"))));
    else if (!items.length) grid.append(h("p", { class: "panel-hint lib-empty" }, t("lib.noResults")));
  }

  function card(m) {
    const entry = registry.entry(m.id);
    const thumb = h("div", { class: "media-thumb", dataset: { kind: m.kind } });
    const th = entry?.thumbs?.[Math.min(1, (entry.thumbs.length || 1) - 1)]?.canvas;
    if (th) { const c = h("canvas", { width: th.width, height: th.height }); c.getContext("2d").drawImage(th, 0, 0); thumb.append(c); }
    else thumb.innerHTML = icon(m.kind === "audio" ? "music" : m.kind === "image" ? "image" : "video");
    const missing = entry && (entry.status === "missing" || entry.status === "error");
    const add = h("button", { class: "media-add", type: "button", "aria-label": t("media.add", { name: m.name }), title: t("media.add", { name: m.name }), html: icon("plus"),
      onclick: (e) => { e.stopPropagation(); if (!missing) actions.addMedia(m); } });
    const overlay = m.kind !== "audio" ? h("button", { class: "media-overlay", type: "button", "aria-label": t("media.addOverlay", { name: m.name }), title: t("media.addOverlay", { name: m.name }), html: icon("layers"),
      onclick: (e) => { e.stopPropagation(); if (!missing) actions.addMedia(m, { overlay: true }); } }) : null;
    const remove = !used(m.id) ? h("button", { class: "media-remove", type: "button", "aria-label": t("media.remove", { name: m.name }), title: t("media.remove", { name: m.name }), html: icon("close"),
      onclick: async (e) => {
        e.stopPropagation();
        if (!(await confirmDialog({ title: t("media.removeTitle"), message: m.name, confirm: t("common.remove"), destructive: true }))) return;
        store.update("removeMedia", (p) => { delete p.media[m.id]; });
        registry.release(m.id);
      } }) : null;
    const el = h("div", { class: "media-card" + (missing ? " missing" : ""), draggable: missing ? "false" : "true", tabindex: "0", role: "button", "aria-label": t("media.add", { name: m.name }),
      onclick: () => { if (missing) ctx.relink(m.id); else actions.addMedia(m); },
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } } },
      thumb,
      h("div", { class: "media-meta" },
        h("span", { class: "media-name" }, m.name),
        h("span", { class: "media-sub ltr tabular" }, missing ? t("media.missing") : [m.duration ? formatTime(m.duration) : null, m.width ? `${m.width}×${m.height}` : null, formatBytes(m.size, lang())].filter(Boolean).join(" · "))),
      add, overlay, remove);
    el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("application/x-mms", JSON.stringify({ type: "media", id: m.id })); e.dataTransfer.effectAllowed = "copy"; });
    return el;
  }

  render();
  const offs = [store.on("project", (d) => { if (!d?.live) render(); }), registry.on("thumbs", render), registry.on("status", render)];
  return () => offs.forEach((o) => o());
}

/** Shared import flow with progress and error reporting. */
export async function importFlow(registry, files, { onAdded } = {}) {
  if (!files?.length) return [];
  let shown = false;
  const timer = setTimeout(() => { shown = true; toast(t("media.importing", { n: files.length }), { duration: 60000 }); }, 300);
  const { added, errors } = await registry.importFiles(files);
  clearTimeout(timer);
  const hard = errors.filter((e) => !e.soft);
  const dups = errors.length - hard.length;
  if (dups) toast(t("media.duplicate", { n: dups }));
  if (hard.length) {
    const first = hard[0];
    toast(t("media.error." + first.reason, { name: first.name }) + (hard.length > 1 ? " " + t("media.moreErrors", { n: hard.length - 1 }) : ""), { type: "error" });
  } else if (added.length > dups) {
    toast(t("media.imported", { n: added.length - dups }), { type: "success" });
  } else if (shown) toast("");
  onAdded?.(added);
  return added;
}

/** Lets files be dropped onto a library panel. accept: optional (file) => boolean. */
export function dropImport(el, onFiles, accept) {
  let depth = 0;
  const has = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
  el.addEventListener("dragenter", (e) => { if (!has(e)) return; e.preventDefault(); depth++; el.classList.add("drop-over"); });
  el.addEventListener("dragover", (e) => { if (!has(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  el.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; el.classList.remove("drop-over"); } });
  el.addEventListener("drop", (e) => {
    if (!has(e)) return;
    e.preventDefault(); e.stopPropagation(); depth = 0; el.classList.remove("drop-over");
    const files = Array.from(e.dataTransfer.files || []);
    const ok = accept ? files.filter(accept) : files;
    if (ok.length < files.length) toast(t("lib.dropRejected", { n: files.length - ok.length }), { type: "error" });
    if (ok.length) onFiles(ok);
  });
}

export { pickFiles, ACCEPT };
