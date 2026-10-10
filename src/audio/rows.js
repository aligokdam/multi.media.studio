/* List row with a preview button for any audio item (library music, sound
   effects, user sounds). Shared by the landing page and the studio panels. */
import { h, formatTime } from "../core/util.js";
import { icon } from "../core/icons.js";
import { t } from "../core/i18n.js";
import { playPreview, stopPreview, onPreview, previewingId } from "./preview.js";

/**
 * @param o { id, title, sub, duration, badge, load: () => Promise<AudioBuffer>, trailing?: Node[], draggable?: payload }
 */
export function audioRow(o) {
  const btn = h("button", { class: "play-btn", type: "button", "aria-label": t("music.preview", { title: o.title }), html: icon(previewingId() === o.id ? "pause" : "play") });
  const row = h("div", { class: "row track-row" + (previewingId() === o.id ? " playing" : ""), dataset: { id: o.id } },
    h("span", { class: "play-wrap" }, h("span", { class: "play-ring", "aria-hidden": "true" }), btn),
    h("span", { class: "row-main" }, h("span", { class: "row-label" }, o.title), o.sub ? h("span", { class: "row-sub" }, o.sub) : null),
    o.duration ? h("span", { class: "row-value ltr tabular" }, formatTime(o.duration)) : null,
    o.badge || null,
    ...(o.trailing || []));
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (previewingId() === o.id) { stopPreview(); return; }
    row.classList.add("loading");
    try { await playPreview(o.id, await o.load()); }
    catch (err) { console.error(err); }
    finally { row.classList.remove("loading"); }
  });
  if (o.draggable) {
    row.draggable = true;
    row.addEventListener("dragstart", (e) => { e.dataTransfer.setData("application/x-mms", JSON.stringify(o.draggable)); e.dataTransfer.effectAllowed = "copy"; });
  }
  return row;
}

const rows = (id) => document.querySelectorAll(`.track-row[data-id="${CSS.escape(id)}"]`);
onPreview("play", ({ id }) => rows(id).forEach((r) => { r.classList.add("playing"); r.querySelector(".play-btn").innerHTML = icon("pause"); }));
onPreview("stop", ({ id }) => rows(id).forEach((r) => { r.classList.remove("playing"); r.querySelector(".play-btn").innerHTML = icon("play"); r.style.removeProperty("--progress"); }));
onPreview("progress", ({ id, progress }) => rows(id).forEach((r) => r.style.setProperty("--progress", progress)));
