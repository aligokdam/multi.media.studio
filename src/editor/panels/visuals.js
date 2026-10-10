/* Text, Effects and Transitions panels. */
import { h, pickFiles } from "../../core/util.js";
import { icon } from "../../core/icons.js";
import { t } from "../../core/i18n.js";
import { toast } from "../../core/toast.js";
import { confirmDialog } from "../../core/sheet.js";
import { TEXT_PRESETS, FONTS } from "../../render/text.js";
import { listEffects, effectName, registerEffect, unregisterEffect, validateEffectFile, getEffect } from "../../render/effects.js";
import { TRANSITIONS, transitionName } from "../../render/transitions.js";
import { Compositor } from "../../render/compositor.js";
import { buildLayer } from "../../render/scene.js";
import { drawSampleScene } from "../../render/sample.js";
import { kvGet, kvSet } from "../../storage/db.js";
import { isVisual } from "../model.js";

/* ------------------------------------------------------------ text */
export function textPanel(root, ctx) {
  const grid = h("div", { class: "text-presets" });
  for (const [key, p] of Object.entries(TEXT_PRESETS)) {
    const sample = h("span", { class: "tp-sample", style: {
      fontFamily: FONTS[p.font], fontWeight: p.weight, fontSize: Math.max(13, Math.min(30, p.size / 3.4)) + "px",
      letterSpacing: p.letterSpacing + "em" } }, t("text.sample." + key));
    if (p.bg) sample.classList.add("boxed");
    const card = h("button", { class: "tp-card", type: "button", draggable: "true", dataset: { preset: key }, onclick: () => ctx.actions.addText(key) },
      h("span", { class: "tp-stage", dataset: { preset: key } }, sample),
      h("span", { class: "tp-name" }, t("text.preset." + key)));
    card.addEventListener("dragstart", (e) => e.dataTransfer.setData("application/x-mms", JSON.stringify({ type: "text", preset: key })));
    grid.append(card);
  }
  root.append(grid, h("p", { class: "panel-hint" }, t("text.hint")));
}

/* ------------------------------------------------------------ effects */
const thumbCache = new Map();
let thumbComp = null, sample = null;
function effectThumb(id) {
  if (thumbCache.has(id)) return thumbCache.get(id);
  try {
    if (!thumbComp) {
      const c = document.createElement("canvas");
      thumbComp = new Compositor(c, { preserveDrawingBuffer: true });
      thumbComp.setSize(192, 120);
      sample = drawSampleScene(Object.assign(document.createElement("canvas"), { width: 384, height: 240 }), 1.5, 2);
    }
    const def = getEffect(id);
    const clip = { transform: { x: 0, y: 0, scale: 1, rotation: 0 }, opacity: 1, fit: "cover", adjust: {}, effects: [{ id, amount: Math.max(0.55, def?.defaultAmount ?? 0.6) }], duration: 10 };
    const layer = buildLayer({ clip, local: 1 }, { w: 192, h: 120 }, { key: "sample", source: sample, srcW: 384, srcH: 240, version: 1 });
    thumbComp.render([{ kind: "layer", layer }], { time: 1.37 });
    const url = thumbComp.canvas.toDataURL("image/jpeg", 0.82);
    thumbCache.set(id, url);
    return url;
  } catch { return null; }
}

export async function loadUserEffects() {
  const list = (await kvGet("userEffects", [])) || [];
  for (const def of list) { try { registerEffect(def); } catch (e) { console.warn("Skipped user effect", def?.id, e); } }
  return list;
}

export function effectsPanel(root, ctx) {
  const { store, actions } = ctx;
  const grid = h("div", { class: "fx-lib" });
  const target = h("p", { class: "panel-hint target-hint" });
  root.append(target, grid,
    h("div", { class: "panel-actions" }, h("button", { class: "btn block", type: "button", onclick: importEffect }, h("span", { html: icon("importFile") }), t("fx.import"))),
    h("p", { class: "panel-hint" }, t("fx.importHint")));

  function selectedVisual() { const s = store.selectedClip; return s && isVisual(s.clip) ? s.clip : null; }

  function render() {
    const sel = selectedVisual();
    target.textContent = sel ? t("fx.applyTo") : t("fx.selectFirst");
    grid.textContent = "";
    for (const def of listEffects()) {
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
            thumbCache.delete(def.id);
            render();
          } }));
      }
      grid.append(card);
    }
  }

  async function importEffect() {
    const [file] = await pickFiles({ accept: ".mmsfx,.json,application/json", multiple: false });
    if (!file) return;
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
      thumbCache.delete(def.id);
      toast(t("fx.imported", { name: effectName(getEffect(def.id)) }), { type: "success" });
      render();
    } catch (e) {
      console.warn(e);
      toast(t("fx.importFailed"), { type: "error" });
    }
  }

  render();
  const offs = [store.on("selection", render), store.on("project", (d) => { if (!d?.live) render(); })];
  return () => offs.forEach((o) => o());
}

/* ------------------------------------------------------------ transitions */
export function transitionsPanel(root, ctx) {
  const { store, actions } = ctx;
  const hint = h("p", { class: "panel-hint target-hint" });
  const grid = h("div", { class: "tr-grid lib" });
  root.append(hint, grid, h("p", { class: "panel-hint" }, t("tr.hint")));
  function render() {
    const j = actions.targetJunction();
    const f = j && store.project.tracks.flatMap((tr) => tr.clips).find((c) => c.id === j.clipId);
    const current = f?.transition?.type || "cut";
    hint.textContent = j ? t("tr.applyTo") : t("tr.noCut");
    grid.textContent = "";
    for (const tr of TRANSITIONS) {
      const b = h("button", { class: "tr-tile", type: "button", draggable: "true", "aria-pressed": String(!!j && tr.id === current),
        onclick: () => {
          const jj = actions.targetJunction();
          if (!jj) { toast(t("tr.noCut")); return; }
          actions.setTransition(jj.clipId, tr.id);
          store.selectJunction(jj);
        } },
        h("span", { class: "tr-glyph", dataset: { tr: tr.id } }), h("span", {}, transitionName(tr.id)));
      b.addEventListener("dragstart", (e) => e.dataTransfer.setData("application/x-mms", JSON.stringify({ type: "transition", id: tr.id })));
      grid.append(b);
    }
  }
  render();
  const offs = [store.on("selection", render), store.on("time", render), store.on("project", (d) => { if (!d?.live) render(); })];
  return () => offs.forEach((o) => o());
}
