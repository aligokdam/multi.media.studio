/* Contextual inspector. The same section builders feed the desktop side panel
   (tabs) and the phone bottom sheets (one tool at a time). */
import { h, clamp, formatTime, pickFiles } from "../core/util.js";
import { icon } from "../core/icons.js";
import { t, num } from "../core/i18n.js";
import { ASPECTS, FRAME_RATES } from "../config.js";
import { findClip, maxDuration, clipEnd, projectDuration } from "./model.js";
import { slider, segmented, toggle, select, colorRow, textArea, section, buttonRow, pct, signed, secs } from "../../components/controls.js";
import { getEffect, effectName } from "../render/effects.js";
import { FILTERS, combineLook } from "../render/filters.js";
import { lookThumb } from "../render/thumbs.js";
import { listTransitions, transitionName, DEFAULT_TRANSITION_DURATION } from "../render/transitions.js";
import { ANIM_IN, ANIM_OUT, ANIM_LOOP, evaluateAnimation } from "../render/animations.js";
import { TEXT_PRESETS, defaultTextStyle } from "../render/text.js";
import { listFonts, fontName, importFonts, USER_FONT_EXT } from "../render/fonts.js";
import { toast } from "../../components/sheet.js";

function fontOptions(current) {
  const all = listFonts();
  if (current && !all.some((f) => f.key === current)) all.push({ key: current });
  return all.map((f) => ({ value: f.key, label: fontName(f.key, t) }));
}

const TABS = {
  video: ["edit", "adjust", "effects", "animation"],
  image: ["edit", "adjust", "effects", "animation"],
  text: ["text", "effects", "animation"],
  audio: ["audio"],
};
const TAB_ICON = { edit: "transform", adjust: "adjust", effects: "effects", animation: "animate", text: "text", audio: "volume" };
const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4];

export class Inspector {
  constructor(store, actions, registry, { onOpenLibrary } = {}) {
    this.store = store;
    this.actions = actions;
    this.registry = registry;
    this.onOpenLibrary = onOpenLibrary;
    this.tab = {};
    this.el = h("div", { class: "inspector-body" });
    this.offs = [
      store.on("selection", () => this.render()),
      store.on("project", (d) => { if (!d?.live) this.render(); }),
    ];
  }

  /* ----------------------------------------------------------- helpers */
  clipUpdater(id) {
    const s = this.store;
    return {
      set: (label, fn) => s.update(label, (p) => { const f = findClip(p, id); if (f) fn(f.clip, p, f); }),
      live: (fn) => (v, p) => { const f = findClip(p, id); if (f) fn(f.clip, v, p, f); },
    };
  }

  render() {
    const focusKey = document.activeElement?.closest?.(".inspector-body") ? document.activeElement.dataset?.ctl : null;
    const scroll = this.el.scrollTop;
    this.el.textContent = "";
    const s = this.store;
    const sel = s.selectedClip;
    if (s.state.junction) this.el.append(this.transitionSection(s.state.junction));
    else if (sel) this.el.append(this.clipPanel(sel));
    else this.el.append(this.projectSection());
    this.el.scrollTop = scroll;
    if (focusKey) this.el.querySelector(`[data-ctl="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  }

  clipPanel(sel) {
    const clip = sel.clip;
    const tabs = TABS[clip.kind];
    let tab = this.tab[clip.kind];
    if (!tabs.includes(tab)) tab = tabs[0];
    const media = clip.mediaId ? this.store.project.media[clip.mediaId] : null;
    const name = clip.kind === "text" ? (clip.text.content.split("\n")[0] || t("text.empty")) : media?.name || "";
    const head = h("div", { class: "insp-head" },
      h("span", { class: "insp-kind", html: icon({ video: "video", image: "image", audio: "music", text: "text" }[clip.kind]) }),
      h("span", { class: "insp-name" }, h("strong", {}, name), h("span", { class: "ltr tabular" }, `${formatTime(clip.start)} · ${num(+clip.duration.toFixed(1))} s`)),
      h("button", { class: "icon-btn small", type: "button", "aria-label": t("tl.delete"), title: t("tl.delete"), html: icon("trash"), onclick: () => this.actions.remove([clip.id]) }));
    const wrap = h("div", { class: "insp-clip" }, head);
    if (tabs.length > 1) {
      wrap.append(h("div", { class: "insp-tabs" }, segmented({
        key: "tab", options: tabs.map((x) => ({ value: x, label: t("insp.tab." + x) })), value: tab,
        onChange: (v) => { this.tab[clip.kind] = v; this.render(); },
      })));
    }
    wrap.append(this.section(tab, clip.id));
    return wrap;
  }

  /** Builds one section for a clip (also used by the mobile tool sheets). */
  section(name, clipId) {
    const f = findClip(this.store.project, clipId);
    if (!f) return h("div");
    const clip = f.clip;
    switch (name) {
      case "edit": return clip.kind === "video" ? h("div", {}, this.speedSection(clip), this.volumeSection(clip), this.frameSection(clip)) : this.frameSection(clip);
      case "audio": return h("div", {}, this.volumeSection(clip), this.speedSection(clip));
      case "speed": return this.speedSection(clip);
      case "volume": return this.volumeSection(clip);
      case "transform": return this.frameSection(clip);
      case "adjust": return h("div", {}, this.filterSection(clip), this.adjustSection(clip));
      case "effects": return this.effectsSection(clip);
      case "animation": return this.animationSection(clip);
      case "text": return this.textSection(clip);
      default: return h("div");
    }
  }

  /* ----------------------------------------------------------- speed */
  speedSection(clip) {
    const u = this.clipUpdater(clip.id);
    const media = this.store.project.media[clip.mediaId];
    const apply = (c, sp) => {
      const span = c.duration * (c.speed || 1);
      c.speed = clamp(sp, 0.25, 4);
      c.duration = Math.max(0.1, Math.min(span / c.speed, maxDuration(c, media)));
    };
    return section(t("insp.speed"),
      segmented({ key: "speed-preset", options: SPEEDS.map((v) => ({ value: v, label: num(v) + "×" })), value: SPEEDS.includes(clip.speed) ? clip.speed : null,
        onChange: (v) => u.set("speed", (c) => apply(c, v)) }),
      slider({ key: "speed", label: t("insp.speedCustom"), min: 0.25, max: 4, step: 0.05, value: clip.speed || 1, format: (v) => num(v) + "×", reset: 1, store: this.store,
        onInput: u.live((c, v) => apply(c, v)) }),
      h("p", { class: "ctl-note" }, t("insp.speedNote")));
  }

  /* ----------------------------------------------------------- volume & fades */
  volumeSection(clip) {
    const u = this.clipUpdater(clip.id);
    const media = this.store.project.media[clip.mediaId];
    if (clip.kind === "video" && media?.hasAudio === false) return section(t("insp.volume"), h("p", { class: "ctl-note" }, t("insp.noAudio")));
    const maxFade = Math.max(0.1, Math.min(10, clip.duration / 2));
    return section(t("insp.volume"),
      slider({ key: "volume", label: t("insp.volume"), min: 0, max: 200, step: 1, value: Math.round((clip.volume ?? 1) * 100), format: pct, reset: 100, store: this.store,
        onInput: u.live((c, v) => { c.volume = v / 100; }) }),
      toggle({ key: "mute", label: t("insp.mute"), value: !!clip.muted, onChange: (v) => u.set("mute", (c) => { c.muted = v; }) }),
      slider({ key: "fadeIn", label: t("insp.fadeIn"), min: 0, max: maxFade, step: 0.05, value: clip.fadeIn || 0, format: secs, reset: 0, store: this.store,
        onInput: u.live((c, v) => { c.fadeIn = v; }) }),
      slider({ key: "fadeOut", label: t("insp.fadeOut"), min: 0, max: maxFade, step: 0.05, value: clip.fadeOut || 0, format: secs, reset: 0, store: this.store,
        onInput: u.live((c, v) => { c.fadeOut = v; }) }));
  }

  /* ----------------------------------------------------------- frame / transform */
  frameSection(clip) {
    const u = this.clipUpdater(clip.id);
    const tf = clip.transform;
    const parts = [];
    if (clip.kind === "image") {
      parts.push(slider({ key: "duration", label: t("insp.duration"), min: 0.5, max: 60, step: 0.1, value: clip.duration, format: secs, store: this.store,
        onInput: u.live((c, v) => { c.duration = v; }) }));
    }
    if (clip.kind !== "text") {
      parts.push(segmented({ key: "fit", label: t("insp.fit"), value: clip.fit || "contain",
        options: [{ value: "contain", label: t("insp.fitContain") }, { value: "cover", label: t("insp.fitCover") }],
        onChange: (v) => u.set("fit", (c) => { c.fit = v; }) }));
    }
    parts.push(
      slider({ key: "opacity", label: t("insp.opacity"), min: 0, max: 100, value: Math.round((clip.opacity ?? 1) * 100), format: pct, reset: 100, store: this.store, onInput: u.live((c, v) => { c.opacity = v / 100; }) }),
      slider({ key: "scale", label: t("insp.scale"), min: 5, max: 400, value: Math.round(tf.scale * 100), format: pct, reset: 100, store: this.store, onInput: u.live((c, v) => { c.transform.scale = v / 100; }) }),
      slider({ key: "posX", label: t("insp.posX"), min: -100, max: 100, value: Math.round(tf.x * 100), format: signed, reset: 0, store: this.store, onInput: u.live((c, v) => { c.transform.x = v / 100; }) }),
      slider({ key: "posY", label: t("insp.posY"), min: -100, max: 100, value: Math.round(tf.y * 100), format: signed, reset: 0, store: this.store, onInput: u.live((c, v) => { c.transform.y = v / 100; }) }),
      slider({ key: "rotation", label: t("insp.rotation"), min: -180, max: 180, value: Math.round(tf.rotation), format: (v) => signed(v) + "°", reset: 0, store: this.store, onInput: u.live((c, v) => { c.transform.rotation = v; }) }),
      buttonRow(h("button", { class: "btn small", type: "button", onclick: () => u.set("transform", (c) => { c.transform = { x: 0, y: 0, scale: 1, rotation: 0 }; c.opacity = 1; }) }, t("insp.resetTransform"))));
    return section(clip.kind === "text" ? t("insp.position") : t("insp.frame"), ...parts);
  }

  /* ----------------------------------------------------------- color */
  adjustSection(clip) {
    const u = this.clipUpdater(clip.id);
    const keys = ["exposure", "brightness", "contrast", "saturation", "temperature", "tint"];
    return section(t("insp.adjust"),
      ...keys.map((k) => slider({ key: "adj-" + k, label: t("insp.adj." + k), min: -100, max: 100, value: clip.adjust[k] || 0, format: signed, reset: 0, store: this.store,
        onInput: u.live((c, v) => { c.adjust[k] = v; }) })),
      buttonRow(h("button", { class: "btn small", type: "button", onclick: () => u.set("adjust", (c) => { keys.forEach((k) => (c.adjust[k] = 0)); }) }, t("insp.resetColor"))));
  }

  /* ----------------------------------------------------------- filters (colour and tone looks) */
  filterSection(clip) {
    const u = this.clipUpdater(clip.id);
    const cur = clip.filter?.id || null;
    const strip = h("div", { class: "look-strip", role: "radiogroup", "aria-label": t("filter.title") });
    const tile = (id) => {
      const label = t("filter." + (id || "none"));
      const url = id ? lookThumb("filter:" + id, combineLook({ filter: { id, amount: 1 } })) : null;
      return h("button", { type: "button", class: "look-tile", role: "radio", "aria-checked": String(cur === id), "aria-label": label, dataset: { ctl: "filter:" + (id || "none") },
        onclick: () => u.set("filter", (c) => { c.filter = id ? { id, amount: c.filter?.id === id ? c.filter.amount : 0.8 } : null; }) },
        url ? h("img", { src: url, alt: "" }) : h("span", { class: "look-none", html: icon("none") }), h("span", { class: "look-name" }, label));
    };
    strip.append(tile(null), ...FILTERS.map((f) => tile(f.id)));
    return section(t("filter.title"), strip,
      cur ? slider({ key: "filter-amt", label: t("filter.strength"), min: 0, max: 100, value: Math.round((clip.filter.amount ?? 1) * 100), format: pct, reset: 80, store: this.store,
        onInput: u.live((c, v) => { if (c.filter) c.filter.amount = v / 100; }) }) : null);
  }

  /** Controls for an effect's own parameters (sizes, levels, angles, switches). */
  effectParamControls(clip, fx, def) {
    const u = this.clipUpdater(clip.id);
    const setParam = (c, key, v) => { const e = c.effects.find((x) => x.id === fx.id); if (e) e.params = { ...(e.params || {}), [key]: v }; };
    return (def.params || []).map((p) => {
      const value = fx.params?.[p.key] ?? p.default;
      if (p.type === "toggle") return toggle({ key: "fxp-" + fx.id + "-" + p.key, label: t("fx.param." + p.key), value: !!value, onChange: (v) => u.set("effect", (c) => setParam(c, p.key, v ? 1 : 0)) });
      const dec = p.step < 1 ? (p.step < 0.1 ? 2 : 1) : 0;
      return slider({ key: "fxp-" + fx.id + "-" + p.key, label: t("fx.param." + p.key), min: p.min, max: p.max, step: p.step, value, reset: p.default, store: this.store,
        format: (v) => num(+v.toFixed(dec)) + (p.unit ? " " + p.unit : ""), onInput: u.live((c, v) => setParam(c, p.key, v)) });
    });
  }

  /* ----------------------------------------------------------- effects */
  effectsSection(clip) {
    const u = this.clipUpdater(clip.id);
    const list = h("div", { class: "fx-stack" });
    if (!clip.effects.length) list.append(h("p", { class: "ctl-note" }, t("insp.noEffects")));
    for (const fx of clip.effects) {
      const def = getEffect(fx.id);
      const name = def ? effectName(def) : fx.id;
      const row = h("div", { class: "fx-item" + (fx.enabled === false ? " off" : "") },
        h("div", { class: "fx-item-head" },
          h("strong", {}, name),
          h("button", { class: "icon-btn small", type: "button", "aria-label": t(fx.enabled === false ? "insp.fxEnable" : "insp.fxDisable", { name }), "aria-pressed": String(fx.enabled !== false), html: icon(fx.enabled === false ? "eyeOff" : "eye"),
            onclick: () => u.set("effect", (c) => { const e = c.effects.find((x) => x.id === fx.id); if (e) e.enabled = e.enabled === false; }) }),
          h("button", { class: "icon-btn small", type: "button", "aria-label": t("insp.fxRemove", { name }), html: icon("close"), onclick: () => this.actions.removeEffect(clip.id, fx.id) })),
        def ? slider({ key: "fx-" + fx.id, label: t("insp.amount"), min: 0, max: 100, value: Math.round((fx.amount ?? def.defaultAmount) * 100), format: pct, reset: Math.round(def.defaultAmount * 100), store: this.store,
          onInput: u.live((c, v) => { const e = c.effects.find((x) => x.id === fx.id); if (e) e.amount = v / 100; }) }) : h("p", { class: "ctl-note" }, t("insp.fxMissing")),
        ...(def ? this.effectParamControls(clip, fx, def) : []));
      list.append(row);
    }
    return section(t("insp.effects"), list,
      buttonRow(h("button", { class: "btn small", type: "button", onclick: () => this.onOpenLibrary?.("effects") }, h("span", { html: icon("plus") }), t("insp.addEffect"))));
  }

  /* ----------------------------------------------------------- animation */
  /** In and Out: pick how the clip enters and leaves from animated tiles, then its duration. */
  animationSection(clip) {
    const u = this.clipUpdater(clip.id);
    const maxD = Math.max(0.2, Math.min(3, clip.duration / 2));
    const box = h("div", { class: "anim-io" });
    const draw = () => {
      const side = this.animSide === "out" ? "out" : "in";
      const key = side === "in" ? "animIn" : "animOut";
      const types = (side === "in" ? ANIM_IN : ANIM_OUT).filter((x) => clip.kind === "text" || x !== "typewriter");
      const current = clip[key]?.type || "none";
      const tiles = [];
      const grid = h("div", { class: "tt-grid", role: "radiogroup", "aria-label": t(side === "in" ? "insp.animIn" : "insp.animOut") },
        types.map((type) => {
          const word = type === "none" ? null : h("span", { class: "tt-word" }, clip.kind === "text" ? "Abc" : h("span", { class: "tt-block" }));
          if (word) tiles.push({ word, type });
          return h("button", { class: "tt-tile", type: "button", role: "radio", "aria-checked": String(current === type), "aria-pressed": String(current === type), dataset: { ctl: key + ":" + type },
            onclick: () => u.set("animation", (c) => { c[key] = { type, duration: c[key]?.duration || 0.6 }; }) },
            type === "none" ? h("span", { class: "tt-stage none", html: icon("none") }) : h("span", { class: "tt-stage" }, word),
            h("span", { class: "tt-name" }, t("anim." + type)));
        }));
      box.textContent = "";
      box.append(
        segmented({ key: "animSide", options: [{ value: "in", label: t("insp.animIn") }, { value: "out", label: t("insp.animOut") }], value: side,
          onChange: (v) => { this.animSide = v; draw(); } }),
        grid,
        current !== "none" ? slider({ key: key + "D", label: t("insp.animDuration"), min: 0.1, max: maxD, step: 0.05, value: Math.min(maxD, clip[key]?.duration || 0.6), format: secs, store: this.store,
          onInput: u.live((c, v) => { c[key] = { ...(c[key] || { type: "none" }), duration: v }; }) }) : null);
      animateTiles(grid, tiles, side, clip.kind === "text");
    };
    draw();
    return h("div", {},
      section(t("insp.animInOut"), box),
      section(null, select({ key: "animLoop", label: t("insp.animLoop"), value: clip.animLoop?.type || "none", options: ANIM_LOOP.map((x) => ({ value: x, label: t("anim.loop." + x) })),
        onChange: (v) => u.set("animation", (c) => { c.animLoop = { type: v }; }) })));
  }

  /* ----------------------------------------------------------- text */
  textSection(clip) {
    const u = this.clipUpdater(clip.id);
    const st = clip.text.style;
    const ta = textArea({ key: "text-content", label: t("insp.textContent"), value: clip.text.content, placeholder: t("text.placeholder"),
      onInput: (v, p) => { const f = findClip(p, clip.id); if (f) f.clip.text.content = v; } });
    ta.bind(this.store);
    const setStyle = (label, fn) => u.set(label, (c) => fn(c.text.style, c));
    const liveStyle = (fn) => u.live((c, v) => fn(c.text.style, v));
    return h("div", {},
      section(null,
        ta.el,
        select({ key: "preset", label: t("insp.textStyle"), value: st.preset || "custom",
          options: Object.keys(TEXT_PRESETS).map((k) => ({ value: k, label: t("text.preset." + k) })),
          onChange: (v) => u.set("text", (c) => { const keep = { color: c.text.style.color }; c.text.style = { ...defaultTextStyle(v), ...keep }; const pr = TEXT_PRESETS[v]; c.transform.x = pr.x || 0; c.transform.y = pr.y || 0; }) }),
        select({ key: "font", label: t("insp.font"), value: st.font, options: fontOptions(st.font),
          onChange: (v) => setStyle("font", (s) => { s.font = v; }) }),
        buttonRow(h("button", { class: "btn small", type: "button", onclick: async () => {
          const files = await pickFiles({ accept: USER_FONT_EXT.map((x) => "." + x).join(","), multiple: true });
          if (!files?.length) return;
          const { added, errors } = await importFonts(files);
          for (const e of errors) toast(t("text.fontError." + e.reason, { name: e.name }), { type: e.reason === "duplicate" ? undefined : "error" });
          if (added.length) { toast(t("text.fontsImported", { n: added.length }), { type: "success" }); setStyle("font", (s) => { s.font = added[0]; }); }
        } }, h("span", { html: icon("importFile") }), t("insp.importFont"))),
        slider({ key: "size", label: t("insp.size"), min: 12, max: 260, value: st.size, format: (v) => num(v) + " px", store: this.store, onInput: liveStyle((s, v) => { s.size = v; }) }),
        segmented({ key: "weight", label: t("insp.weight"), value: st.weight,
          options: [{ value: 400, label: t("insp.weightRegular") }, { value: 600, label: t("insp.weightSemibold") }, { value: 800, label: t("insp.weightBold") }],
          onChange: (v) => setStyle("weight", (s) => { s.weight = v; }) }),
        segmented({ key: "align", label: t("insp.align"), value: st.align,
          options: [{ value: "start", icon: document.documentElement.dir === "rtl" ? "align-right" : "align-left", title: t("insp.alignStart") }, { value: "center", icon: "align-center", title: t("insp.alignCenter") }, { value: "end", icon: document.documentElement.dir === "rtl" ? "align-left" : "align-right", title: t("insp.alignEnd") }],
          onChange: (v) => setStyle("align", (s) => { s.align = v; }) }),
        toggle({ key: "italic", label: t("insp.italic"), value: !!st.italic, onChange: (v) => setStyle("italic", (s) => { s.italic = v; }) }),
        colorRow({ key: "color", label: t("insp.color"), value: st.color, onChange: (v) => setStyle("color", (s) => { s.color = v; }) }),
        slider({ key: "spacing", label: t("insp.letterSpacing"), min: -10, max: 40, value: Math.round((st.letterSpacing || 0) * 100), format: signed, reset: 0, store: this.store, onInput: liveStyle((s, v) => { s.letterSpacing = v / 100; }) }),
        slider({ key: "lineHeight", label: t("insp.lineHeight"), min: 80, max: 200, value: Math.round((st.lineHeight || 1.2) * 100), format: (v) => num(v / 100), store: this.store, onInput: liveStyle((s, v) => { s.lineHeight = v / 100; }) }),
        slider({ key: "maxWidth", label: t("insp.textWidth"), min: 20, max: 100, value: Math.round((st.maxWidth || 0.86) * 100), format: pct, store: this.store, onInput: liveStyle((s, v) => { s.maxWidth = v / 100; }) })),
      section(t("insp.textBackground"),
        toggle({ key: "bg", label: t("insp.background"), value: !!st.bg, onChange: (v) => setStyle("background", (s) => { s.bg = v; }) }),
        st.bg ? colorRow({ key: "bgColor", label: t("insp.backgroundColor"), value: st.bgColor, onChange: (v) => setStyle("background", (s) => { s.bgColor = v; }) }) : null,
        st.bg ? slider({ key: "bgOpacity", label: t("insp.backgroundOpacity"), min: 0, max: 100, value: Math.round((st.bgOpacity ?? 0.6) * 100), format: pct, store: this.store, onInput: liveStyle((s, v) => { s.bgOpacity = v / 100; }) }) : null,
        !st.bg ? slider({ key: "shadow", label: t("insp.shadow"), min: 0, max: 100, value: Math.round((st.shadow || 0) * 100), format: pct, store: this.store, onInput: liveStyle((s, v) => { s.shadow = v / 100; }) }) : null),
      this.frameSection(clip));
  }

  /* ----------------------------------------------------------- transition */
  transitionSection(j) {
    const f = findClip(this.store.project, j.clipId);
    if (!f) return h("div");
    const clip = f.clip, prev = f.track.clips[f.index - 1];
    const current = clip.transition?.type || "cut";
    const maxD = Math.max(0.2, Math.min(3, clip.duration, prev ? prev.duration : 3));
    const grid = h("div", { class: "tr-grid", role: "radiogroup", "aria-label": t("insp.transition") },
      listTransitions().map((tr) => h("button", { type: "button", class: "tr-tile", role: "radio", "aria-checked": String(tr.id === current), dataset: { ctl: "tr:" + tr.id },
        onclick: () => this.actions.setTransition(clip.id, tr.id) },
        h("span", { class: "tr-glyph", dataset: { tr: tr.id } }), h("span", {}, transitionName(tr.id)))));
    return h("div", { class: "insp-clip" },
      h("div", { class: "insp-head" }, h("span", { class: "insp-kind", html: icon("transition") }),
        h("span", { class: "insp-name" }, h("strong", {}, t("insp.transition")), h("span", { class: "ltr tabular" }, formatTime(clip.start)))),
      section(null, grid,
        current !== "cut" ? slider({ key: "trDuration", label: t("insp.duration"), min: 0.2, max: maxD, step: 0.05, value: Math.min(maxD, clip.transition?.duration || DEFAULT_TRANSITION_DURATION), format: secs, store: this.store,
          onInput: (v, p) => { const ff = findClip(p, clip.id); if (ff?.clip.transition) ff.clip.transition.duration = v; } }) : null,
        h("p", { class: "ctl-note" }, t("insp.transitionNote"))));
  }

  /* ----------------------------------------------------------- project */
  projectSection() {
    const s = this.store;
    const p = s.project;
    const set = (label, fn) => s.update(label, fn);
    const name = h("input", { class: "field", type: "text", value: p.name, maxlength: "120", "aria-label": t("insp.projectName"), dataset: { ctl: "pname" } });
    name.addEventListener("change", () => { const v = name.value.trim(); if (v && v !== p.name) set("rename", (pp) => { pp.name = v; }); });
    const clips = p.tracks.reduce((n, tr) => n + tr.clips.length, 0);
    return h("div", { class: "insp-clip" },
      h("div", { class: "insp-head" }, h("span", { class: "insp-kind", html: icon("general") }),
        h("span", { class: "insp-name" }, h("strong", {}, t("insp.project")), h("span", { class: "ltr tabular" }, `${formatTime(projectDuration(p))} · ${t("insp.clips", { n: num(clips) })}`))),
      section(null,
        h("div", { class: "ctl" }, h("span", { class: "ctl-label" }, t("insp.projectName")), name),
        segmented({ key: "aspect", label: t("insp.aspect"), value: p.settings.aspect, options: ["original", ...Object.keys(ASPECTS)].map((a) => ({ value: a, label: a === "original" ? t("photo.original") : a })), onChange: (v) => set("aspect", (pp) => { pp.settings.aspect = v; }) }),
        segmented({ key: "fps", label: t("insp.fps"), value: p.settings.fps, options: FRAME_RATES.map((f) => ({ value: f, label: String(f) })), onChange: (v) => set("fps", (pp) => { pp.settings.fps = v; }) }),
        colorRow({ key: "bgcolor", label: t("insp.canvasColor"), value: p.settings.background, swatches: ["#000000", "#ffffff", "#1c1c1e", "#f5f5f7"], onChange: (v) => set("background", (pp) => { pp.settings.background = v; }) })),
      h("p", { class: "ctl-note" }, t("insp.selectHint")));
  }

  dispose() { this.offs.forEach((o) => o()); }
}

export { TAB_ICON, clipEnd };

/** Plays each tile's entrance (or exit) on a loop while the grid is on screen. */
function animateTiles(grid, tiles, side, isText) {
  if (!tiles.length) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const D = 1.6, CYCLE = 2.2;
  const frame = (now) => {
    if (!grid.isConnected && now > 2000 + (grid._born || 0)) return;
    const k = reduce ? 0.5 : ((now / 1000) % CYCLE) / CYCLE;
    for (const { word, type } of tiles) {
      const clip = side === "in" ? { duration: D, animIn: { type, duration: 0.8 } } : { duration: D, animOut: { type, duration: 0.8 } };
      const local = side === "in" ? Math.min(D - 0.001, k * D * 1.15) : Math.min(D - 0.001, D * 0.4 + k * D * 0.7);
      const a = evaluateAnimation(clip, local);
      if (isText) word.textContent = a.typeProgress < 1 ? "Abc".slice(0, Math.round(3 * a.typeProgress)) : "Abc";
      word.style.opacity = a.opacity;
      word.style.transform = `translate(${a.dx * 70}px, ${a.dy * 46}px) rotate(${a.rotation}deg) scale(${a.scale * a.sx}, ${a.scale * a.sy})`;
    }
    if (!reduce) requestAnimationFrame(frame);
  };
  grid._born = performance.now();
  requestAnimationFrame(frame);
}
