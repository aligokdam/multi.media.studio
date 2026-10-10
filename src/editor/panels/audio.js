/* Music and sound effect panels. */
import { h, pickFiles, uid, formatTime } from "../../core/util.js";
import { icon } from "../../core/icons.js";
import { t } from "../../core/i18n.js";
import { toast } from "../../core/toast.js";
import { openSheet, confirmDialog } from "../../core/sheet.js";
import { TRACKS, GENRES, MOODS, MUSIC_LICENSE, loadPreview } from "../../audio/music.js";
import { SFX, SFX_CATEGORIES, loadSfx } from "../../audio/sfx.js";
import { audioRow } from "../../audio/rows.js";
import { ACCEPT } from "../../media/registry.js";
import { putBlob, getBlob, deleteBlob } from "../../storage/blobs.js";
import { kvGet, kvSet } from "../../storage/db.js";
import { importFlow } from "./media.js";

function addBtn(label, onclick) {
  return h("button", { class: "icon-btn small filled row-add", type: "button", "aria-label": label, title: label, html: icon("plus"), onclick: (e) => { e.stopPropagation(); onclick(); } });
}

function licenseBadge() {
  return h("button", { class: "badge badge-btn", type: "button", "aria-label": t("music.licenseInfo"), title: t("music.licenseInfo"), onclick: (e) => { e.stopPropagation(); openSheet(licenseView()); } }, "CC0");
}

export function licenseView() {
  return {
    title: () => t("music.licenseTitle"),
    render(root) {
      const rows = [
        [t("music.licenseName"), MUSIC_LICENSE.name],
        [t("music.composer"), t("music.composerValue")],
        [t("music.commercial"), t("common.yes")],
        [t("music.attribution"), t("music.attributionValue")],
        [t("music.source"), t("music.sourceValue")],
      ];
      root.append(
        h("div", { class: "prose" }, h("p", { class: "lead" }, t("music.licenseLead")), h("p", {}, t("music.licenseBody"))),
        h("div", { class: "section" }, h("ul", { class: "list" }, rows.map(([k, v]) => h("li", {}, h("div", { class: "row" }, h("span", { class: "row-main" }, h("span", { class: "row-sub" }, k), h("span", { class: "row-label" }, v))))))),
        h("div", { class: "section" }, h("ul", { class: "list" }, h("li", {}, h("a", { class: "row", href: MUSIC_LICENSE.url, target: "_blank", rel: "noopener noreferrer" }, h("span", { class: "row-label" }, t("music.readLicense")), h("span", { html: icon("chevron", "chev") }))))),
        h("p", { class: "section-foot" }, t("music.userFilesNote")));
    },
  };
}

/* ------------------------------------------------------------ music */
export function musicPanel(root, ctx) {
  const { registry, actions, store } = ctx;
  let genre = null, mood = null, length = "any", query = "";
  const search = h("input", { class: "field", type: "search", placeholder: t("music.search"), "aria-label": t("music.search"), oninput: (e) => { query = e.target.value.trim().toLowerCase(); renderList(); } });
  const genreChips = h("div", { class: "chips" });
  const moodSel = h("select", { class: "field compact", "aria-label": t("music.mood"), onchange: (e) => { mood = e.target.value || null; renderList(); } },
    h("option", { value: "" }, t("music.anyMood")), MOODS.map((m) => h("option", { value: m }, t("mood." + m))));
  const lenSel = h("select", { class: "field compact", "aria-label": t("music.length"), onchange: (e) => { length = e.target.value; renderList(); } },
    ["any", "short", "medium", "long"].map((v) => h("option", { value: v }, t("music.len." + v))));
  const list = h("ul", { class: "list lib-list" });
  const yours = h("div");
  root.append(
    h("div", { class: "panel-actions" },
      h("button", { class: "btn block", type: "button", onclick: importAudio }, h("span", { html: icon("importFile") }), t("music.importAudio"))),
    yours,
    h("div", { class: "search" }, h("span", { html: icon("search") }), search),
    genreChips,
    h("div", { class: "filter-row" }, moodSel, lenSel),
    list,
    h("button", { class: "license-note", type: "button", onclick: () => openSheet(licenseView()) }, h("span", { html: icon("license") }), t("music.licenseLine")));

  async function importAudio() {
    const files = await pickFiles({ accept: ACCEPT.audio, multiple: true });
    const added = await importFlow(registry, files);
    if (added[0]) actions.addMedia(added[0], { role: "music" });
  }

  function renderChips() {
    genreChips.textContent = "";
    [null, ...GENRES].forEach((g) => genreChips.append(h("button", { class: "chip", type: "button", "aria-pressed": String(genre === g),
      onclick: () => { genre = g; renderChips(); renderList(); } }, g ? t("genre." + g) : t("common.all"))));
  }

  function renderYours() {
    yours.textContent = "";
    const own = Object.values(store.project.media).filter((m) => m.kind === "audio" && m.origin === "user" && !m.blobId);
    if (!own.length) return;
    const ul = h("ul", { class: "list lib-list" });
    for (const m of own) ul.append(h("li", {}, audioRow({ id: "pm-" + m.id, title: m.name, duration: m.duration, sub: formatTime(m.duration) + " · " + t("music.yourFile"),
      load: () => registry.audioBuffer(m.id), draggable: { type: "media", id: m.id }, trailing: [addBtn(t("music.add", { title: m.name }), () => actions.addMedia(m, { role: "music" }))] })));
    yours.append(h("h3", { class: "panel-subtitle" }, t("music.yours")), ul);
  }

  function renderList() {
    list.textContent = "";
    const items = TRACKS.filter((tr) => (!genre || tr.genre === genre) && (!mood || tr.moods.includes(mood))
      && (length === "any" || (length === "short" && tr.duration < 60) || (length === "medium" && tr.duration >= 60 && tr.duration <= 75) || (length === "long" && tr.duration > 75))
      && (!query || (tr.title + " " + t("genre." + tr.genre) + " " + tr.moods.map((m) => t("mood." + m)).join(" ")).toLowerCase().includes(query)));
    if (!items.length) list.append(h("li", {}, h("p", { class: "panel-hint" }, t("music.noResults"))));
    for (const tr of items) {
      list.append(h("li", {}, audioRow({
        id: tr.id, title: tr.title, duration: tr.duration, load: () => loadPreview(tr.id),
        sub: [formatTime(tr.duration), t("genre." + tr.genre), ...tr.moods.map((m) => t("mood." + m))].join(" · "),
        badge: licenseBadge(), draggable: { type: "music", id: tr.id },
        trailing: [addBtn(t("music.add", { title: tr.title }), () => ctx.addLibrary("library", tr.id))],
      })));
    }
  }

  renderChips(); renderList(); renderYours();
  const off = store.on("project", (d) => { if (!d?.live) renderYours(); });
  return off;
}

/* ------------------------------------------------------------ sounds */
export async function userSounds() { return (await kvGet("userSounds", [])) || []; }

export function soundsPanel(root, ctx) {
  const { registry, actions } = ctx;
  let cat = null;
  const chips = h("div", { class: "chips" });
  const list = h("ul", { class: "list lib-list" });
  const yours = h("div");
  root.append(
    h("div", { class: "panel-actions" }, h("button", { class: "btn block", type: "button", onclick: importEffect }, h("span", { html: icon("importFile") }), t("sfx.import"))),
    yours, chips, list,
    h("button", { class: "license-note", type: "button", onclick: () => openSheet(licenseView()) }, h("span", { html: icon("license") }), t("music.licenseLine")));

  async function importEffect() {
    const files = await pickFiles({ accept: ACCEPT.audio, multiple: true });
    if (!files.length) return;
    const lib = await userSounds();
    let ok = 0;
    for (const f of files) {
      try {
        const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await f.arrayBuffer());
        const id = uid("us");
        await putBlob(id, f);
        lib.push({ id, name: f.name.replace(/\.[^.]+$/, "").slice(0, 80), mime: f.type, size: f.size, duration: buf.duration, addedAt: Date.now() });
        ok++;
      } catch (e) {
        toast(t("media.error.unreadable", { name: f.name }), { type: "error" });
      }
    }
    await kvSet("userSounds", lib);
    if (ok) toast(t("sfx.imported", { n: ok }), { type: "success" });
    renderYours();
  }

  async function renderYours() {
    const lib = await userSounds();
    yours.textContent = "";
    if (!lib.length) return;
    const ul = h("ul", { class: "list lib-list" });
    for (const s of lib) {
      const del = h("button", { class: "icon-btn small", type: "button", "aria-label": t("sfx.delete", { name: s.name }), title: t("sfx.delete", { name: s.name }), html: icon("trash"),
        onclick: async (e) => {
          e.stopPropagation();
          if (!(await confirmDialog({ title: t("sfx.deleteTitle"), message: t("sfx.deleteBody", { name: s.name }), confirm: t("common.delete"), destructive: true }))) return;
          const next = (await userSounds()).filter((x) => x.id !== s.id);
          await kvSet("userSounds", next);
          const inUse = Object.values(ctx.store.project.media).some((m) => m.blobId === s.id);
          if (!inUse) await deleteBlob(s.id).catch(() => {});
          renderYours();
        } });
      ul.append(h("li", {}, audioRow({
        id: s.id, title: s.name, duration: s.duration, sub: formatTime(s.duration) + " · " + t("sfx.yourSound"),
        load: async () => { const b = await getBlob(s.id); return new OfflineAudioContext(2, 1, 44100).decodeAudioData(await b.arrayBuffer()); },
        trailing: [del, addBtn(t("music.add", { title: s.name }), async () => { const m = await registry.addUserSound(s); actions.addMedia(m, { role: "sfx" }); })],
      })));
    }
    yours.append(h("h3", { class: "panel-subtitle" }, t("sfx.yours")), ul);
  }

  function renderChips() {
    chips.textContent = "";
    [null, ...SFX_CATEGORIES].forEach((c) => chips.append(h("button", { class: "chip", type: "button", "aria-pressed": String(cat === c), onclick: () => { cat = c; renderChips(); renderList(); } }, c ? t("sfx.cat." + c) : t("common.all"))));
  }

  function renderList() {
    list.textContent = "";
    for (const s of SFX.filter((x) => !cat || x.category === cat)) {
      list.append(h("li", {}, audioRow({
        id: s.id, title: s.title, duration: s.duration, sub: formatTime(s.duration) + " · " + t("sfx.cat." + s.category), load: () => loadSfx(s.id),
        badge: licenseBadge(), draggable: { type: "sfx", id: s.id },
        trailing: [addBtn(t("music.add", { title: s.title }), () => ctx.addLibrary("sfx", s.id))],
      })));
    }
  }

  renderChips(); renderList(); renderYours();
}
