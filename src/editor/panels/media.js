/* Media panel: import, browse and place the project's own media. */
import { h, formatTime, formatBytes, pickFiles } from "../../core/util.js";
import { icon } from "../../core/icons.js";
import { t, lang } from "../../core/i18n.js";
import { toast } from "../../core/toast.js";
import { confirmDialog } from "../../core/sheet.js";
import { ACCEPT } from "../../media/registry.js";

export function mediaPanel(root, ctx) {
  const { store, registry, actions } = ctx;
  const grid = h("div", { class: "media-grid" });
  const importBtn = h("button", { class: "btn primary block", type: "button", onclick: () => ctx.importMedia() }, h("span", { html: icon("importFile") }), t("media.import"));
  const hint = h("p", { class: "panel-hint" }, t("media.hint"));
  root.append(h("div", { class: "panel-actions" }, importBtn), grid, hint);

  function used(id) { return store.project.tracks.some((tr) => tr.clips.some((c) => c.mediaId === id)); }

  function render() {
    grid.textContent = "";
    const items = Object.values(store.project.media).filter((m) => m.origin === "user" && m.kind !== "audio" || (m.origin === "user" && m.kind === "audio"))
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    hint.hidden = items.length > 0;
    for (const m of items) grid.append(card(m));
    if (!items.length) grid.append(h("div", { class: "media-empty" }, h("span", { html: icon("media") }), h("p", {}, t("media.empty"))));
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
  if (errors.length) {
    const first = errors[0];
    toast(t("media.error." + first.reason, { name: first.name }) + (errors.length > 1 ? " " + t("media.moreErrors", { n: errors.length - 1 }) : ""), { type: "error" });
  } else if (added.length) {
    toast(t("media.imported", { n: added.length }), { type: "success" });
  } else if (shown) toast("");
  onAdded?.(added);
  return added;
}

export { pickFiles, ACCEPT };
