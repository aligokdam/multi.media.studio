/* Text styles, Effects and Transitions panels. */
import { h, pickFiles } from "../../src/core/util.js";
import { icon } from "../../src/core/icons.js";
import { t } from "../../src/core/i18n.js";
import { toast } from "../sheet.js";
import { confirmDialog } from "../sheet.js";
import { TEXT_PRESETS, FONTS } from "../../src/render/text.js";
import { dropImport } from "./media-panel.js";
import { listEffects, libraryEffects, EFFECT_CATEGORIES, effectName, registerEffect, unregisterEffect, validateEffectFile, getEffect } from "../../src/render/effects.js";
import { lookThumb, dropThumb, thumbContext } from "../../src/render/thumbs.js";
import { TRANSITION_CATEGORIES, USER_TRANSITION_MAX, listTransitions, transitionName, registerTransition, unregisterTransition, parseTransitionFile } from "../../src/render/transitions.js";
import { Compositor } from "../../src/render/compositor.js";
import { buildLayer } from "../../src/render/scene.js";
import { drawSampleScene } from "../../src/render/thumbs.js";
import { kvGet, kvSet } from "../../src/storage/db.js";
import { isVisual } from "../../src/studio/model.js";

/* ------------------------------------------------------------ text */
/* The library only holds text styles. Entrance and exit, fonts and the rest of
   a title's look are edited in the inspector once a title is selected. */
export function textPanel(root, ctx) {
  const { actions } = ctx;
  let query = "";
  const search = h("input", { class: "field", type: "search", placeholder: t("text.search.styles"), "aria-label": t("text.search.styles"), oninput: (e) => { query = e.target.value.trim().toLowerCase(); render(); } });
  const body = h("div", { class: "text-lib" });
  root.append(h("div", { class: "search" }, h("span", { html: icon("search") }), search), body);
  const match = (...words) => !query || words.join(" ").toLowerCase().includes(query);

  function render() {
    body.textContent = "";
    const grid = h("div", { class: "text-presets" });
    for (const [key, p] of Object.entries(TEXT_PRESETS)) {
      if (!match(t("text.preset." + key), t("text.sample." + key))) continue;
      const sample = h("span", { class: "tp-sample", style: {
        fontFamily: FONTS[p.font], fontWeight: p.weight, fontSize: Math.max(13, Math.min(30, p.size / 3.4)) + "px",
        letterSpacing: p.letterSpacing + "em" } }, t("text.sample." + key));
      if (p.bg) sample.classList.add("boxed");
      const card = h("button", { class: "tp-card", type: "button", draggable: "true", dataset: { preset: key }, onclick: () => actions.addText(key) },
        h("span", { class: "tp-stage", dataset: { preset: key } }, sample),
        h("span", { class: "tp-name" }, t("text.preset." + key)));
      card.addEventListener("dragstart", (e) => e.dataTransfer.setData("application/x-mms", JSON.stringify({ type: "text", preset: key })));
      grid.append(card);
    }
    body.append(grid.childElementCount ? grid : h("p", { class: "panel-hint lib-empty" }, t("lib.noResults")));
  }

  render();
}

/* ------------------------------------------------------------ effects */
const thumbCache = new Map();
let thumbComp = null, sample = null;
function initThumbs() {
  if (thumbComp) return;
  ({ comp: thumbComp, sample } = thumbContext());
}
function effectThumb(id) {
  const def = getEffect(id);
  return lookThumb("fx:" + id, { effects: [{ id, amount: Math.max(0.55, def?.defaultAmount ?? 0.6) }] });
}

export async function loadUserEffects() {
  const list = (await kvGet("userEffects", [])) || [];
  for (const def of list) { try { registerEffect(def); } catch (e) { console.warn("Skipped user effect", def?.id, e); } }
  return list;
}

function libHeader(root, { importLabel, onImport, accept, placeholder, onSearch }) {
  const search = h("input", { class: "field", type: "search", placeholder, "aria-label": placeholder, oninput: (e) => onSearch(e.target.value.trim().toLowerCase()) });
  const chips = h("div", { class: "chips" });
  root.append(
    h("div", { class: "panel-actions" }, h("button", { class: "btn block", type: "button", onclick: async () => onImport(await pickFiles({ accept, multiple: true })) }, h("span", { html: icon("importFile") }), importLabel)),
    h("div", { class: "search" }, h("span", { html: icon("search") }), search), chips);
  return { search, chips };
}

function renderChipRow(el, items, current, onPick) {
  el.textContent = "";
  for (const [value, label] of items) el.append(h("button", { class: "chip", type: "button", "aria-pressed": String(current === value), onclick: () => onPick(value) }, label));
}

export function effectsPanel(root, ctx) {
  const { store, actions } = ctx;
  let query = "", cat = null;
  const target = h("p", { class: "panel-hint target-hint" });
  const { chips } = libHeader(root, { importLabel: t("common.import"), onImport: importEffects, accept: ".mmsfx,.json,application/json",
    placeholder: t("fx.search"), onSearch: (q) => { query = q; render(); } });
  const grid = h("div", { class: "fx-lib" });
  root.append(target, grid);
  dropImport(root, importEffects, (f) => /\.(mmsfx|json)$/i.test(f.name));

  function selectedVisual() { const s = store.selectedClip; return s && isVisual(s.clip) ? s.clip : null; }

  function render() {
    const all = libraryEffects();
    const cats = [...EFFECT_CATEGORIES, ...(all.some((d) => d.category === "custom") ? ["custom"] : [])];
    if (cat && !cats.includes(cat)) cat = null;
    renderChipRow(chips, [[null, t("common.all")], ...cats.map((c) => [c, t("fx.cat." + c)])], cat, (c) => { cat = c; render(); });
    const sel = selectedVisual();
    target.textContent = sel ? t("fx.applyTo") : t("fx.selectFirst");
    grid.textContent = "";
    const items = all.filter((d) => (!cat || d.category === cat) && (!query || (effectName(d) + " " + t("fx.cat." + d.category)).toLowerCase().includes(query)));
    if (!items.length) grid.append(h("p", { class: "panel-hint lib-empty" }, t("lib.noResults")));
    // "No effect": removes every effect from the selected clip.
    if (!cat && (!query || t("fx.none").toLowerCase().includes(query))) {
      const clean = !sel || !sel.effects.length;
      grid.prepend(h("button", { class: "fx-tile fx-none" + (sel && clean ? " applied" : ""), type: "button", "aria-pressed": String(!!sel && clean),
        onclick: () => {
          const c = selectedVisual();
          if (!c) { toast(t("fx.selectFirst")); return; }
          actions.clearEffects(c.id);
        } },
        h("span", { class: "fx-none-glyph", html: icon("none") }), h("span", { class: "fx-name" }, t("fx.none"))));
    }
    for (const def of items) {
      const applied = sel?.effects.some((e) => e.id === def.id);
      const url = effectThumb(def.id);
      const card = h("button", { class: "fx-tile" + (applied ? " applied" : ""), type: "button", draggable: "true", "aria-pressed": String(!!applied),
        onclick: () => {
          const c = selectedVisual();
          if (!c) { toast(t("fx.selectFirst")); return; }
          if (c.effects.some((e) => e.id === def.id)) actions.removeEffect(c.id, def.id);
          else if (!actions.addEffect(c.id, def.id)) toast(t("fx.limit"));
        } },
        url ? h("img", { src: url, alt: "", draggable: "false" }) : h("span", { class: "fx-fallback", html: icon("effects") }),
        h("span", { class: "fx-name" }, effectName(def)),
        applied ? h("span", { class: "fx-check", html: icon("check") }) : null);
      card.addEventListener("dragstart", (e) => e.dataTransfer.setData("application/x-mms", JSON.stringify({ type: "effect", id: def.id })));
      if (!def.builtIn) {
        card.append(h("span", { class: "fx-del", role: "button", tabindex: "0", "aria-label": t("fx.removeCustom", { name: effectName(def) }), html: icon("close"),
          onclick: async (e) => {
            e.stopPropagation();
            if (!(await confirmDialog({ title: t("fx.removeCustomTitle"), message: effectName(def), confirm: t("common.remove"), destructive: true }))) return;
            unregisterEffect(def.id);
            await kvSet("userEffects", ((await kvGet("userEffects", [])) || []).filter((x) => x.id !== def.id));
            dropThumb("fx:" + def.id);
            render();
          } }));
      }
      grid.append(card);
    }
  }

  async function importEffects(files) {
    if (!files?.length) return;
    for (const file of files) {
      try {
        if (file.size > 64 * 1024) throw new Error("size");
        const def = validateEffectFile(JSON.parse(await file.text()));
        // Compile once before accepting it.
        const probe = new Compositor(document.createElement("canvas"));
        try { probe.testEffect(def); } finally { probe.dispose(); }
        registerEffect(def);
        const list = ((await kvGet("userEffects", [])) || []).filter((x) => x.id !== def.id);
        list.push(def);
        await kvSet("userEffects", list);
        dropThumb("fx:" + def.id);
        toast(t("fx.imported", { name: effectName(getEffect(def.id)) }), { type: "success" });
      } catch (e) {
        console.warn(e);
        toast(t("fx.importFailedName", { name: file.name }), { type: "error" });
      }
    }
    render();
  }

  render();
  const offs = [store.on("selection", render), store.on("project", (d) => { if (!d?.live) render(); })];
  return () => offs.forEach((o) => o());
}

/* ------------------------------------------------------------ transitions */
let trSample = null;
function transitionThumb(def) {
  const key = "tr:" + def.id;
  if (thumbCache.has(key)) return thumbCache.get(key);
  try {
    initThumbs();
    if (!trSample) trSample = drawSampleScene(Object.assign(document.createElement("canvas"), { width: 384, height: 240 }), 4.2, 1);
    const base = { transform: { x: 0, y: 0, scale: 1, rotation: 0 }, opacity: 1, fit: "cover", adjust: {}, effects: [], duration: 10 };
    const a = buildLayer({ clip: base, local: 1 }, { w: 192, h: 120 }, { key: "sample", source: sample, srcW: 384, srcH: 240, version: 1 });
    const b = buildLayer({ clip: base, local: 1 }, { w: 192, h: 120 }, { key: "sample-b", source: trSample, srcW: 384, srcH: 240, version: 1 });
    thumbComp.render([{ kind: "transition", a, b, mode: def.mode, custom: def.custom ? def.id : null, p: def.id === "cut" ? 0.5 : 0.45 }], { time: 1 });
    const url = thumbComp.canvas.toDataURL("image/jpeg", 0.82);
    thumbCache.set(key, url);
    return url;
  } catch (e) { return null; }
}

export async function loadUserTransitions() {
  const list = (await kvGet("userTransitions", [])) || [];
  for (const def of list) { try { registerTransition(def); } catch (e) { console.warn("Skipped user transition", def?.id, e); } }
  return list;
}

export function transitionsPanel(root, ctx) {
  const { store, actions } = ctx;
  let query = "", cat = null;
  const { chips } = libHeader(root, { importLabel: t("common.import"), onImport: importTransitions, accept: ".glsl,.mmstr,.json,.txt",
    placeholder: t("tr.search"), onSearch: (q) => { query = q; render(); } });
  const hint = h("p", { class: "panel-hint target-hint" });
  const grid = h("div", { class: "tr-lib" });
  root.append(hint, grid);
  dropImport(root, importTransitions, (f) => /\.(glsl|mmstr|json|txt)$/i.test(f.name));

  function render() {
    const all = listTransitions();
    const cats = [...TRANSITION_CATEGORIES, ...(all.some((d) => d.custom) ? ["custom"] : [])];
    if (cat && !cats.includes(cat)) cat = null;
    renderChipRow(chips, [[null, t("common.all")], ...cats.map((c) => [c, t("tr.cat." + c)])], cat, (c) => { cat = c; render(); });
    const j = actions.targetJunction();
    const f = j && store.project.tracks.flatMap((tr) => tr.clips).find((c) => c.id === j.clipId);
    const current = f?.transition?.type || "cut";
    hint.textContent = j ? t("tr.applyTo") : t("tr.noCut");
    grid.textContent = "";
    const items = all.filter((d) => (!cat || d.category === cat) && (!query || (transitionName(d.id) + " " + t("tr.cat." + d.category)).toLowerCase().includes(query)));
    if (!items.length) grid.append(h("p", { class: "panel-hint lib-empty" }, t("lib.noResults")));
    for (const tr of items) {
      const url = transitionThumb(tr);
      const b = h("button", { class: "fx-tile tr-thumb" + (j && tr.id === current ? " applied" : ""), type: "button", draggable: "true", "aria-pressed": String(!!j && tr.id === current),
        onclick: () => {
          const jj = actions.targetJunction();
          if (!jj) { toast(t("tr.noCut")); return; }
          actions.setTransition(jj.clipId, tr.id);
          store.selectJunction(jj);
        } },
        url ? h("img", { src: url, alt: "", draggable: "false" }) : h("span", { class: "fx-fallback", html: icon("transition") }),
        h("span", { class: "fx-name" }, transitionName(tr.id)),
        j && tr.id === current ? h("span", { class: "fx-check", html: icon("check") }) : null);
      b.addEventListener("dragstart", (e) => e.dataTransfer.setData("application/x-mms", JSON.stringify({ type: "transition", id: tr.id })));
      if (tr.custom) {
        b.append(h("span", { class: "fx-del", role: "button", tabindex: "0", "aria-label": t("tr.removeCustom", { name: tr.name }), html: icon("close"),
          onclick: async (e) => {
            e.stopPropagation();
            if (!(await confirmDialog({ title: t("tr.removeCustomTitle"), message: tr.name, confirm: t("common.remove"), destructive: true }))) return;
            unregisterTransition(tr.id);
            await kvSet("userTransitions", ((await kvGet("userTransitions", [])) || []).filter((x) => x.id !== tr.id));
            thumbCache.delete("tr:" + tr.id);
            render();
          } }));
      }
      grid.append(b);
    }
  }

  async function importTransitions(files) {
    if (!files?.length) return;
    let ok = 0;
    for (const file of files) {
      try {
        if (file.size > USER_TRANSITION_MAX) throw new Error("size");
        const def = parseTransitionFile(await file.text(), file.name);
        const probe = new Compositor(document.createElement("canvas"));
        try { probe.testTransition(def.glsl); } finally { probe.dispose(); }
        const list = (await kvGet("userTransitions", [])) || [];
        if (list.some((x) => x.glsl === def.glsl)) { toast(t("media.duplicate", { n: 1 })); continue; }
        registerTransition(def);
        list.push(def);
        await kvSet("userTransitions", list);
        ok++;
      } catch (e) {
        console.warn(e);
        toast(t("tr.importFailed", { name: file.name }), { type: "error" });
      }
    }
    if (ok) { toast(t("tr.imported", { n: ok }), { type: "success" }); cat = "custom"; }
    render();
  }

  render();
  const offs = [store.on("selection", render), store.on("time", render), store.on("project", (d) => { if (!d?.live) render(); })];
  return () => offs.forEach((o) => o());
}
