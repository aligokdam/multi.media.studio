/* Text, Effects and Transitions panels. */
import { h, pickFiles } from "../../src/core/util.js";
import { icon } from "../../src/core/icons.js";
import { t } from "../../src/core/i18n.js";
import { toast } from "../toast.js";
import { confirmDialog } from "../sheet.js";
import { TEXT_PRESETS, FONTS } from "../../src/render/text.js";
import { BUNDLED, FONT_CATEGORIES, USER_FONT_EXT, listFonts, fontName, fontStack, ensureFont, importFonts, removeUserFont } from "../../src/render/fonts.js";
import { TEXT_TRANSITIONS, evaluateAnimation } from "../../src/render/animations.js";
import { prefs } from "../../src/core/prefs.js";
import { toggle } from "../controls.js";
import { dropImport } from "./media-panel.js";
import { listEffects, libraryEffects, EFFECT_CATEGORIES, effectName, registerEffect, unregisterEffect, validateEffectFile, getEffect } from "../../src/render/effects.js";
import { lookThumb, dropThumb, thumbContext } from "../../src/render/thumbs.js";
import { TRANSITION_CATEGORIES, USER_TRANSITION_MAX, listTransitions, transitionName, registerTransition, unregisterTransition, parseTransitionFile } from "../../src/render/transitions.js";
import { Compositor } from "../../src/render/compositor.js";
import { buildLayer } from "../../src/render/scene.js";
import { drawSampleScene } from "../../src/render/sample.js";
import { kvGet, kvSet } from "../../src/storage/db.js";
import { isVisual } from "../../src/studio/model.js";

/* ------------------------------------------------------------ text */
const TEXT_TABS = ["styles", "transitions", "fonts"];

export function textPanel(root, ctx) {
  const { store, actions } = ctx;
  let tab = "styles", query = "", fontCat = "";
  const search = h("input", { class: "field", type: "search", placeholder: t("text.search"), "aria-label": t("text.search"), oninput: (e) => { query = e.target.value.trim().toLowerCase(); render(); } });
  const chips = h("div", { class: "chips" });
  const filters = h("div", { class: "filter-row single" });
  const body = h("div", { class: "text-lib" });
  const foot = h("p", { class: "panel-hint" });
  root.append(
    h("div", { class: "panel-actions" }, h("button", { class: "btn block", type: "button", onclick: async () => importFontFiles(await pickFiles({ accept: USER_FONT_EXT.map((x) => "." + x).join(","), multiple: true })) }, h("span", { html: icon("importFile") }), t("common.import"))),
    h("div", { class: "search" }, h("span", { html: icon("search") }), search),
    chips, filters, body, foot);
  dropImport(root, importFontFiles, (f) => USER_FONT_EXT.includes((f.name.split(".").pop() || "").toLowerCase()));

  const selectedText = () => { const s = store.selectedClip; return s?.clip.kind === "text" ? s.clip : null; };
  const match = (...words) => !query || words.join(" ").toLowerCase().includes(query);

  async function importFontFiles(files) {
    if (!files?.length) return;
    const { added, errors } = await importFonts(files);
    for (const e of errors) toast(t("text.fontError." + e.reason, { name: e.name }), { type: e.reason === "duplicate" ? undefined : "error" });
    if (added.length) {
      toast(t("text.fontsImported", { n: added.length }), { type: "success" });
      const c = selectedText();
      if (c) actions.setTextStyle(c.id, { font: added[0] });
      tab = "fonts"; fontCat = "yours"; render();
    }
  }

  function renderChips() {
    chips.textContent = "";
    for (const k of TEXT_TABS) chips.append(h("button", { class: "chip", type: "button", "aria-pressed": String(tab === k), onclick: () => { tab = k; render(); } }, t("text.tab." + k)));
  }

  /* -- styles */
  function renderStyles() {
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
    if (!grid.childElementCount) return empty();
    body.append(grid);
    foot.textContent = "";
  }

  /* -- transitions */
  let tiles = [];
  function renderTransitions() {
    const sel = selectedText();
    const current = sel ? (sel.animIn?.type || "none") : prefs.get("textAnim");
    body.append(
      toggle({ key: "textAutoAnim", label: t("text.autoAnim"), sub: t("text.autoAnimSub"), value: prefs.get("textAutoAnim"),
        onChange: (v) => { prefs.set("textAutoAnim", v); render(); } }));
    const grid = h("div", { class: "tt-grid" });
    tiles = [];
    // "None": no transition for the selected title, or no automatic transition for new ones.
    const noneOn = sel ? current === "none" : !prefs.get("textAutoAnim");
    if (match(t("anim.none"))) grid.append(h("button", { class: "tt-tile", type: "button", "aria-pressed": String(noneOn),
      onclick: () => {
        const c = selectedText();
        if (c) actions.setTextTransition(c.id, "none");
        else { prefs.set("textAutoAnim", false); toast(t("text.animNone")); }
        render();
      } },
      h("span", { class: "tt-stage none", html: icon("none") }), h("span", { class: "tt-name" }, t("anim.none"))));
    for (const type of TEXT_TRANSITIONS) {
      if (!match(t("anim." + type))) continue;
      const word = h("span", { class: "tt-word" }, "Abc");
      const tile = h("button", { class: "tt-tile", type: "button", "aria-pressed": String(sel ? current === type : prefs.get("textAutoAnim") && current === type),
        onclick: () => {
          prefs.set("textAnim", type);
          const c = selectedText();
          if (c) { actions.setTextTransition(c.id, current === type && sel ? "none" : type); }
          else toast(prefs.get("textAutoAnim") ? t("text.animChosen", { name: t("anim." + type) }) : t("text.selectTitle"));
          render();
        } },
        h("span", { class: "tt-stage" }, word), h("span", { class: "tt-name" }, t("anim." + type)));
      tiles.push({ word, type });
      grid.append(tile);
    }
    if (!tiles.length) return empty();
    body.append(grid);
    foot.textContent = sel ? t("text.animApplyHint") : t("text.animSelectHint");
    startTiles();
  }

  let raf = 0;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function startTiles() {
    cancelAnimationFrame(raf);
    const D = 2.4, CYCLE = 3.0;
    const clip = (type) => ({ duration: D, animIn: { type, duration: 0.7 }, animOut: { type, duration: 0.7 } });
    const frame = (now) => {
      const local = reduce ? 1.2 : Math.min(D - 0.001, (now / 1000) % CYCLE);
      for (const { word, type } of tiles) {
        const a = evaluateAnimation(clip(type), local);
        const hidden = !reduce && (now / 1000) % CYCLE >= D;
        word.textContent = a.typeProgress < 1 ? "Abc".slice(0, Math.round(3 * a.typeProgress)) : "Abc";
        word.style.opacity = hidden ? 0 : a.opacity;
        word.style.transform = `translate(${a.dx * 90}px, ${a.dy * 60}px) rotate(${a.rotation}deg) scale(${a.scale * a.sx}, ${a.scale * a.sy})`;
      }
      if (!reduce && tiles.length && body.isConnected) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  /* -- fonts */
  function renderFonts() {
    const sel = selectedText();
    const current = sel?.text.style.font;
    filters.append(h("select", { class: "field compact", "aria-label": t("text.fontCategory"), onchange: (e) => { fontCat = e.target.value; render(); } },
      h("option", { value: "" }, t("text.fontCat.all")), FONT_CATEGORIES.map((c) => h("option", { value: c, selected: c === fontCat }, t("text.fontCat." + c)))));
    const list = h("ul", { class: "list font-list" });
    for (const f of listFonts()) {
      if (fontCat && f.category !== fontCat) continue;
      const name = fontName(f.key, t);
      if (!match(name, t("text.fontCat." + f.category))) continue;
      ensureFont(f.key);
      const del = f.category === "yours" ? h("button", { class: "icon-btn small", type: "button", "aria-label": t("text.removeFont", { name }), title: t("text.removeFont", { name }), html: icon("trash"),
        onclick: async (e) => {
          e.stopPropagation();
          if (!(await confirmDialog({ title: t("text.removeFontTitle"), message: name, confirm: t("common.remove"), destructive: true }))) return;
          await removeUserFont(f.key); render();
        } }) : null;
      list.append(h("li", {}, h("div", { class: "row font-row" + (current === f.key ? " on" : ""), role: "button", tabindex: "0", "aria-pressed": String(current === f.key),
        onclick: () => applyFont(f.key), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); applyFont(f.key); } } },
        h("span", { class: "font-sample", style: { fontFamily: fontStack(f.key) } }, "Aa"),
        h("span", { class: "row-main" }, h("span", { class: "row-label", style: { fontFamily: fontStack(f.key) } }, name), h("span", { class: "row-sub" }, t("text.fontCat." + f.category) + (BUNDLED[f.key] ? " · " + (f.key === "permanent-marker" ? "Apache 2.0" : "OFL") : ""))),
        current === f.key ? h("span", { class: "font-check", html: icon("check") }) : null,
        del)));
    }
    if (!list.childElementCount) return empty(fontCat === "yours" && !query ? t("text.noFonts") : null);
    body.append(list);
    foot.textContent = sel ? t("text.fontApplyHint") : t("text.fontNewHint");
  }

  function applyFont(key) {
    const c = selectedText();
    if (c) actions.setTextStyle(c.id, { font: key });
    else actions.addText("title", undefined, { font: key });
  }

  function empty(msg) { body.append(h("p", { class: "panel-hint lib-empty" }, msg || t("lib.noResults"))); foot.textContent = ""; }

  function render() {
    cancelAnimationFrame(raf);
    renderChips();
    body.textContent = ""; filters.textContent = ""; filters.hidden = tab !== "fonts";
    search.placeholder = t("text.search." + tab);
    search.setAttribute("aria-label", search.placeholder);
    if (tab === "styles") renderStyles();
    else if (tab === "transitions") renderTransitions();
    else renderFonts();
  }

  render();
  let fontTimer = 0;
  const onFonts = () => { clearTimeout(fontTimer); fontTimer = setTimeout(() => { if (tab === "fonts") render(); }, 120); };
  window.addEventListener("mms:fonts", onFonts);
  const offs = [store.on("selection", () => { if (tab !== "styles") render(); }), store.on("project", (d) => { if (!d?.live && tab !== "styles") render(); })];
  return () => { cancelAnimationFrame(raf); window.removeEventListener("mms:fonts", onFonts); offs.forEach((o) => o()); };
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
