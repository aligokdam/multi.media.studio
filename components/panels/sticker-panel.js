/* Stickers panel: nine built-in emoji stickers plus the user's own images.
   A sticker is added as an image clip on an overlay track at the playhead. */
import { h, pickFiles } from "../../src/core/util.js";
import { icon } from "../../src/core/icons.js";
import { t } from "../../src/core/i18n.js";
import { toast } from "../toast.js";
import { confirmDialog } from "../sheet.js";
import { STICKERS, STICKER_EXT, stickerDataUrl, builtInStickerFile, userStickers, importStickers, userStickerFile, removeUserSticker } from "../../src/render/stickers.js";
import { dropImport } from "./media-panel.js";

export function stickersPanel(root, ctx) {
  const { registry, actions } = ctx;
  let query = "", cat = null;
  const search = h("input", { class: "field", type: "search", placeholder: t("sticker.search"), "aria-label": t("sticker.search"), oninput: (e) => { query = e.target.value.trim().toLowerCase(); render(); } });
  const chips = h("div", { class: "chips" });
  const grid = h("div", { class: "sticker-grid" });
  const yoursHead = h("h3", { class: "panel-subtitle" }, t("sticker.yours"));
  const yours = h("div", { class: "sticker-grid" });
  const accept = STICKER_EXT.map((x) => "." + x).join(",") + ",image/*";
  root.append(
    h("div", { class: "panel-actions" }, h("button", { class: "btn block", type: "button", onclick: async () => onImport(await pickFiles({ accept, multiple: true })) }, h("span", { html: icon("importFile") }), t("common.import"))),
    h("div", { class: "search" }, h("span", { html: icon("search") }), search),
    chips, grid, yoursHead, yours,
    h("p", { class: "panel-hint" }, t("sticker.hint")));
  dropImport(root, onImport, (f) => STICKER_EXT.includes((f.name.split(".").pop() || "").toLowerCase()) || /^image\//.test(f.type));

  async function place(file) {
    const { added, errors } = await registry.importFiles([file]);
    const m = added[0];
    if (!m) { toast(t("media.error." + (errors[0]?.reason || "unreadable"), { name: file.name }), { type: "error" }); return; }
    actions.addMedia(m, { sticker: true });
  }

  async function onImport(files) {
    if (!files?.length) return;
    const { added, errors } = await importStickers(files);
    for (const e of errors) toast(t("sticker.error." + e.reason, { name: e.name }), { type: e.reason === "duplicate" ? undefined : "error" });
    if (added.length) { toast(t("sticker.imported", { n: added.length }), { type: "success" }); cat = "yours"; }
    render();
  }

  function tile(label, src, onAdd, extra) {
    const b = h("button", { class: "sticker-tile", type: "button", "aria-label": t("sticker.add", { name: label }), title: label, draggable: "false", onclick: onAdd },
      h("img", { src, alt: "", draggable: "false", loading: "lazy" }), extra || null);
    return b;
  }

  async function render() {
    chips.textContent = "";
    for (const [v, l] of [[null, t("common.all")], ["emoji", t("sticker.cat.emoji")], ["yours", t("sticker.cat.yours")]]) {
      chips.append(h("button", { class: "chip", type: "button", "aria-pressed": String(cat === v), onclick: () => { cat = v; render(); } }, l));
    }
    grid.textContent = "";
    const builtIn = cat === "yours" ? [] : STICKERS.filter((s) => !query || (t("sticker.name." + s.id) + " " + s.id).toLowerCase().includes(query));
    for (const s of builtIn) grid.append(tile(t("sticker.name." + s.id), stickerDataUrl(s), async () => place(await builtInStickerFile(s.id))));
    grid.hidden = !builtIn.length;

    const own = cat === "emoji" ? [] : (await userStickers()).filter((s) => !query || s.name.toLowerCase().includes(query));
    yours.textContent = "";
    for (const u of own) {
      const del = h("span", { class: "sticker-del", role: "button", tabindex: "0", "aria-label": t("sticker.remove", { name: u.name }), html: icon("close"),
        onclick: async (e) => {
          e.stopPropagation();
          if (!(await confirmDialog({ title: t("sticker.removeTitle"), message: u.name, confirm: t("common.remove"), destructive: true }))) return;
          await removeUserSticker(u.id); render();
        } });
      const img = h("img", { alt: "", draggable: "false" });
      const b = tile(u.name, "", async () => { try { await place(await userStickerFile(u)); } catch { toast(t("media.error.unreadable", { name: u.name }), { type: "error" }); } }, del);
      b.querySelector("img").replaceWith(img);
      userStickerFile(u).then((f) => { const url = URL.createObjectURL(f); img.src = url; img.onload = () => URL.revokeObjectURL(url); }).catch(() => {});
      yours.append(b);
    }
    const showYours = cat !== "emoji";
    yoursHead.hidden = !showYours;
    yours.hidden = !showYours;
    if (showYours && !own.length) yours.append(h("p", { class: "panel-hint lib-empty sticker-empty" }, query ? t("lib.noResults") : t("sticker.noneYet")));
    if (!builtIn.length && cat !== "yours" && query && !own.length) grid.hidden = true;
  }

  render();
}
