/* Timeline.
   Desktop: track headers on the start side, a moving playhead, ruler scrubbing.
   Mobile:  the playhead is fixed in the middle; scrolling the timeline moves time
            (the pattern phone editors use), clips are dragged after a long press.
   Time always runs left to right, also in RTL languages, like every video editor. */
import { h, clamp, formatTime, isTouch, debounce } from "../core/util.js";
import { icon } from "../core/icons.js";
import { t } from "../core/i18n.js";
import { prefs } from "../core/prefs.js";
import { LIMITS } from "../config.js";
import { clipEnd, findClip, maxDuration, projectDuration, trackAccepts, canJoin, mainTrack as mainTrackOf } from "./model.js";
import { getTransition } from "../render/transitions.js";
import { effectName, getEffect } from "../render/effects.js";

const LANE_H = { main: 64, overlay: 50, text: 36, music: 46, sfx: 40, audio: 46 };
const LANE_H_MOBILE = { main: 58, overlay: 44, text: 34, music: 42, sfx: 36, audio: 42 };
const DRAG_THRESHOLD = 4;
const LONG_PRESS_MS = 320;

export class Timeline {
  constructor(store, registry, actions, { onRequestLibrary, onDropPayload, onJunction, onClipActivate, onAddMedia } = {}) {
    this.store = store;
    this.registry = registry;
    this.actions = actions;
    this.cb = { onRequestLibrary, onDropPayload, onJunction, onClipActivate, onAddMedia };
    this.clipEls = new Map();
    this.mobile = false;
    this.ignoreScroll = 0;
    this.build();
    this.offs = [
      store.on("project", () => this.render()),
      store.on("selection", () => this.renderSelection()),
      store.on("time", () => this.updatePlayhead()),
      store.on("zoom", () => { this.render(); this.updatePlayhead(true); }),
      store.on("playing", () => this.updatePlayhead(true)),
      store.on("history", () => this.updateToolbar()),
      registry.on("thumbs", () => this.drawVisible()),
      registry.on("peaks", () => this.drawVisible()),
      registry.on("status", () => this.render()),
      prefs.on("change:snapping", () => this.updateToolbar()),
      prefs.on("change:timelineThumbs", () => this.drawVisible()),
    ];
    this.resizeObs = new ResizeObserver(() => { this.setMode(); this.render(); this.updatePlayhead(true); });
    this.resizeObs.observe(this.el);
  }

  /* ------------------------------------------------------------------ DOM */
  build() {
    const tb = (name, labelKey, onclick, extra = {}) => h("button", { class: "icon-btn small", type: "button", "data-tool": name, "aria-label": t(labelKey), title: t(labelKey), onclick, html: icon(extra.icon || name), ...extra.attrs });
    this.tools = {
      split: tb("split", "tl.split", () => this.actions.split()),
      remove: tb("remove", "tl.delete", () => this.actions.remove(), { icon: "trash" }),
      duplicate: tb("duplicate", "tl.duplicate", () => this.actions.duplicate()),
      join: tb("join", "tl.join", () => this.actions.join()),
      snap: tb("snap", "tl.snap", () => prefs.set("snapping", !prefs.get("snapping")), { icon: "magnet" }),
      zoomOut: tb("zoomOut", "tl.zoomOut", () => this.zoomBy(1 / 1.4)),
      zoomIn: tb("zoomIn", "tl.zoomIn", () => this.zoomBy(1.4)),
      fit: tb("fit", "tl.fit", () => this.fit()),
    };
    this.zoomSlider = h("input", { type: "range", class: "zoom-slider ltr", min: "0", max: "1000", "aria-label": t("tl.zoom"), oninput: (e) => this.setZoomFromSlider(+e.target.value) });
    this.timeLabel = h("span", { class: "tl-time ltr tabular", "aria-live": "off" });
    this.toolbar = h("div", { class: "tl-toolbar", role: "toolbar", "aria-label": t("tl.tools") },
      h("div", { class: "tl-tools" }, this.tools.split, this.tools.remove, this.tools.duplicate, this.tools.join),
      this.timeLabel,
      h("div", { class: "tl-zoom" }, this.tools.snap, h("span", { class: "tl-sep" }), this.tools.zoomOut, this.zoomSlider, this.tools.zoomIn, this.tools.fit));

    this.heads = h("div", { class: "tl-heads" });
    this.ruler = h("canvas", { class: "tl-ruler", "aria-hidden": "true" });
    this.rulerWrap = h("div", { class: "tl-ruler-wrap", role: "slider", tabindex: "0", "aria-label": t("tl.playhead"), "aria-valuemin": "0" }, this.ruler);
    this.lanes = h("div", { class: "tl-lanes" });
    this.playhead = h("div", { class: "tl-playhead", "aria-hidden": "true" }, h("span", { class: "tl-playhead-cap" }));
    this.snapLine = h("div", { class: "tl-snapline", hidden: true });
    this.insertMark = h("div", { class: "tl-insert", hidden: true });
    // Phone shortcuts: an "Add text" box just before the start of the main track and a
    // "+" button pinned to the right edge for adding more media.
    this.addTitle = h("button", { class: "tl-add-title", type: "button", onclick: () => this.cb.onRequestLibrary?.("text") });
    this.addMediaBtn = h("button", { class: "tl-add-media", type: "button", html: icon("plus"), onclick: () => this.cb.onAddMedia?.() });
    this.content = h("div", { class: "tl-content" }, this.rulerWrap, this.lanes, this.playhead, this.snapLine, this.insertMark, this.addTitle);
    this.viewport = h("div", { class: "tl-viewport", tabindex: "-1" }, this.content);
    this.centerHead = h("div", { class: "tl-center-playhead", "aria-hidden": "true" }, h("span", { class: "tl-playhead-cap" }));
    this.main = h("div", { class: "tl-main ltr" }, this.heads, h("div", { class: "tl-viewport-wrap" }, this.viewport, this.centerHead, this.addMediaBtn));
    this.el = h("section", { class: "timeline", "aria-label": t("tl.label") }, this.toolbar, this.main);

    this.viewport.addEventListener("scroll", () => this.onScroll(), { passive: true });
    this.viewport.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    this.bindRuler();
    this.bindLanes();
    this.bindPinch();
    this.bindDrop();
  }

  setMode() {
    const mobile = matchMedia("(max-width: 760px)").matches;
    if (mobile !== this.mobile) {
      this.mobile = mobile;
      this.el.dataset.mode = mobile ? "mobile" : "desktop";
    }
    this.vw = this.viewport.clientWidth || 600;
  }

  pad() { return this.mobile ? Math.round(this.vw / 2) : 14; }
  x(time) { return this.pad() + time * this.store.state.zoom; }
  timeAt(clientX) {
    const r = this.viewport.getBoundingClientRect();
    return Math.max(0, (clientX - r.left + this.viewport.scrollLeft - this.pad()) / this.store.state.zoom);
  }
  laneHeight(track) { return (this.mobile ? LANE_H_MOBILE : LANE_H)[track.role] || 44; }

  /* ------------------------------------------------------------------ render */
  render() {
    if (!this.vw) this.setMode();
    const p = this.store.project;
    const z = this.store.state.zoom;
    const dur = projectDuration(p);
    const tail = this.mobile ? 0 : Math.max(12, dur * 0.35) * z + 120;
    const width = Math.max(this.vw, this.pad() * 2 + dur * z + tail);
    this.content.style.width = width + "px";
    this.width = width;

    // Headers
    this.heads.textContent = "";
    this.heads.append(h("div", { class: "tl-head-spacer" }));
    const seen = new Set();
    const laneEls = [];
    for (const track of p.tracks) {
      const hgt = this.laneHeight(track);
      this.heads.append(this.header(track, hgt));
      let lane = this.lanes.querySelector(`[data-track="${track.id}"]`);
      if (!lane) lane = h("div", { class: "tl-lane", dataset: { track: track.id } });
      lane.dataset.role = track.role;
      lane.dataset.kind = track.kind;
      lane.classList.toggle("muted", !!track.muted);
      lane.classList.toggle("hidden-track", !!track.hidden);
      lane.classList.toggle("locked", !!track.locked);
      // Phones show only the tracks in use (plus the main track), like phone editors do.
      lane.classList.toggle("collapsed", this.mobile && !track.clips.length && track.role !== "main");
      lane.style.height = hgt + "px";
      laneEls.push(lane);
      // Clips (keyed)
      for (const clip of track.clips) {
        seen.add(clip.id);
        let el = this.clipEls.get(clip.id);
        if (!el) { el = this.clipElement(); this.clipEls.set(clip.id, el); }
        this.updateClip(el, clip, track);
        if (el.parentNode !== lane) lane.append(el);
      }
      this.updateEmptyLane(lane, track);
    }
    for (const [id, el] of this.clipEls) if (!seen.has(id)) { el.remove(); this.clipEls.delete(id); }
    // Lane order
    laneEls.forEach((lane, i) => { if (this.lanes.children[i] !== lane) this.lanes.insertBefore(lane, this.lanes.children[i] || null); });
    while (this.lanes.children.length > laneEls.length) this.lanes.lastChild.remove();

    this.renderJunctions();
    this.placeShortcuts();
    this.renderSelection();
    this.updateToolbar();
    this.syncZoomSlider();
    this.drawRuler();
    this.drawVisible();
    this.updatePlayhead();
  }

  placeShortcuts() {
    const show = this.mobile;
    this.addTitle.hidden = this.addMediaBtn.hidden = !show;
    if (!show) return;
    const main = mainTrackOf(this.store.project);
    const lane = main && this.lanes.querySelector(`[data-track="${main.id}"]`);
    if (!lane) return;
    const top = this.rulerWrap.offsetHeight + lane.offsetTop;
    this.addTitle.textContent = t("tl.addText");
    this.addTitle.style.top = top + 6 + "px";
    this.addTitle.style.height = lane.offsetHeight - 12 + "px";
    this.addTitle.style.left = this.x(0) - 10 - 92 + "px";
    this.addMediaBtn.hidden = !main.clips.length;
    this.addMediaBtn.setAttribute("aria-label", t("tool.addMedia")); this.addMediaBtn.title = t("tool.addMedia");
    this.addMediaBtn.style.top = top + (lane.offsetHeight - 40) / 2 - this.viewport.scrollTop + "px";
  }

  header(track, hgt) {
    const name = trackName(this.store.project, track);
    const btn = (ic, key, pressed, onclick) => h("button", { class: "icon-btn small", type: "button", "aria-label": t(key, { track: name }), title: t(key, { track: name }), "aria-pressed": String(!!pressed), onclick, html: icon(ic) });
    const update = (fn) => this.store.update("track", (p) => { const tr = p.tracks.find((x) => x.id === track.id); if (tr) fn(tr); });
    return h("div", { class: "tl-head", style: { height: hgt + "px" }, dataset: { role: track.role } },
      h("span", { class: "tl-head-icon", html: icon(trackIcon(track)) }),
      h("span", { class: "tl-head-name" }, name),
      h("span", { class: "tl-head-btns" },
        track.kind !== "text" ? btn(track.muted ? "mute" : "volume", track.muted ? "tl.unmute" : "tl.mute", track.muted, () => update((tr) => (tr.muted = !tr.muted))) : null,
        track.kind !== "audio" ? btn(track.hidden ? "eyeOff" : "eye", track.hidden ? "tl.show" : "tl.hide", track.hidden, () => update((tr) => (tr.hidden = !tr.hidden))) : null,
        btn(track.locked ? "lock" : "unlock", track.locked ? "tl.unlock" : "tl.lock", track.locked, () => update((tr) => (tr.locked = !tr.locked)))));
  }

  updateEmptyLane(lane, track) {
    let ph = lane.querySelector(".lane-add");
    const show = !track.clips.length && !track.locked;
    if (!show) { ph?.remove(); return; }
    const key = { main: "tl.addMedia", text: "tl.addText", music: "tl.addMusic", sfx: "tl.addSound", overlay: "tl.addMedia" }[track.role] || "tl.addMedia";
    if (!ph) {
      ph = h("button", { class: "lane-add", type: "button" });
      lane.append(ph);
    }
    ph.innerHTML = icon("plus") + "<span></span>";
    ph.lastChild.textContent = t(key);
    ph.onclick = (e) => { e.stopPropagation(); this.cb.onRequestLibrary?.(track.role === "overlay" ? "media" : { main: "media", text: "text", music: "music", sfx: "sounds" }[track.role], track); };
    ph.style.insetInlineStart = "";
    ph.style.left = this.x(this.mobile ? this.store.state.time : 0) + 4 + "px";
  }

  clipElement() {
    const el = h("div", { class: "clip", tabindex: "-1", role: "button" },
      h("canvas", { class: "clip-canvas", "aria-hidden": "true" }),
      h("span", { class: "clip-label" }, h("span", { class: "clip-icon" }), h("span", { class: "clip-name" }), h("span", { class: "clip-badges" })),
      h("span", { class: "fade-shape in", "aria-hidden": "true" }), h("span", { class: "fade-shape out", "aria-hidden": "true" }),
      h("span", { class: "fade-handle in", "aria-hidden": "true", dataset: { fade: "in" } }),
      h("span", { class: "fade-handle out", "aria-hidden": "true", dataset: { fade: "out" } }),
      h("span", { class: "clip-handle l", "aria-hidden": "true", dataset: { edge: "l" } }),
      h("span", { class: "clip-handle r", "aria-hidden": "true", dataset: { edge: "r" } }));
    el.addEventListener("keydown", (e) => this.onClipKey(e, el));
    return el;
  }

  updateClip(el, clip, track) {
    const p = this.store.project;
    const media = clip.mediaId ? p.media[clip.mediaId] : null;
    const left = this.x(clip.start), w = Math.max(2, clip.duration * this.store.state.zoom);
    el.dataset.id = clip.id;
    el.dataset.kind = clip.kind;
    el.style.left = left + "px";
    el.style.width = w + "px";
    el.classList.toggle("narrow", w < 44);
    const status = media && this.registry.entry(media.id)?.status;
    el.classList.toggle("missing", status === "missing" || status === "error");
    const name = clip.kind === "text" ? (clip.text.content || t("text.empty")).split("\n")[0] : media?.name || "";
    el.querySelector(".clip-name").textContent = name;
    el.querySelector(".clip-icon").innerHTML = icon({ video: "video", image: "image", audio: media?.origin === "sfx" ? "wave" : "music", text: "text" }[clip.kind]);
    const badges = [];
    if (clip.speed && clip.speed !== 1) badges.push(`${+clip.speed.toFixed(2)}×`);
    if (clip.effects?.length) badges.push("fx");
    if (clip.muted || clip.volume === 0) badges.push("🔇");
    el.querySelector(".clip-badges").textContent = badges.join(" ");
    const audioish = clip.kind === "audio" || (clip.kind === "video" && media?.hasAudio !== false);
    const fz = this.store.state.zoom;
    const fi = el.querySelector(".fade-shape.in"), fo = el.querySelector(".fade-shape.out");
    fi.hidden = fo.hidden = !audioish;
    el.querySelectorAll(".fade-handle").forEach((fh) => (fh.hidden = !audioish || track.locked));
    if (audioish) {
      fi.style.width = (clip.fadeIn || 0) * fz + "px";
      fo.style.width = (clip.fadeOut || 0) * fz + "px";
      el.querySelector(".fade-handle.in").style.left = Math.min(w - 8, (clip.fadeIn || 0) * fz) + "px";
      el.querySelector(".fade-handle.out").style.right = Math.min(w - 8, (clip.fadeOut || 0) * fz) + "px";
    }
    const kindLabel = t("clip.kind." + clip.kind);
    el.setAttribute("aria-label", t("tl.clipLabel", { kind: kindLabel, name, start: formatTime(clip.start), duration: formatTime(clip.duration) }));
    el.dataset.drawKey = [clip.in, clip.speed, w, clip.start, this.store.state.zoom, clip.mediaId, status].join("|");
  }

  renderJunctions() {
    this.lanes.querySelectorAll(".junction").forEach((j) => j.remove());
    const sel = this.store.state.junction;
    for (const track of this.store.project.tracks) {
      if (track.kind === "audio") continue;
      const lane = this.lanes.querySelector(`[data-track="${track.id}"]`);
      for (let i = 1; i < track.clips.length; i++) {
        const a = track.clips[i - 1], b = track.clips[i];
        if (Math.abs(clipEnd(a) - b.start) > 0.01) continue;
        const has = !!b.transition && getTransition(b.transition.type);
        const j = h("button", {
          class: "junction" + (has ? " has" : "") + (sel?.clipId === b.id ? " selected" : ""),
          type: "button",
          style: { left: this.x(b.start) + "px" },
          "aria-label": has ? t("tl.junctionSet", { name: t("tr." + b.transition.type) }) : t("tl.junctionAdd"),
          title: has ? t("tr." + b.transition.type) : t("tl.junctionAdd"),
          dataset: { clip: b.id, track: track.id },
          html: has ? '<span class="j-diamond"></span>' : icon("plus"),
        });
        if (has) {
          const tw = Math.min(b.transition.duration, a.duration, b.duration) * this.store.state.zoom;
          j.style.setProperty("--tw", tw + "px");
        }
        j.addEventListener("pointerdown", (e) => e.stopPropagation());
        j.addEventListener("click", (e) => {
          e.stopPropagation();
          this.store.selectJunction({ trackId: track.id, clipId: b.id });
          this.cb.onJunction?.({ trackId: track.id, clipId: b.id });
        });
        lane.append(j);
      }
    }
  }

  renderSelection() {
    const sel = new Set(this.store.state.selection);
    let focusSet = false;
    for (const [id, el] of this.clipEls) {
      const on = sel.has(id);
      el.classList.toggle("selected", on);
      el.setAttribute("aria-pressed", String(on));
      el.tabIndex = on && !focusSet ? 0 : -1;
      if (on) focusSet = true;
    }
    if (!focusSet) { const first = this.clipEls.values().next().value; if (first) first.tabIndex = 0; }
    const j = this.store.state.junction;
    this.lanes.querySelectorAll(".junction").forEach((el) => el.classList.toggle("selected", !!j && el.dataset.clip === j.clipId));
    this.updateToolbar();
  }

  updateToolbar() {
    const s = this.store;
    const has = s.state.selection.length > 0;
    this.tools.remove.disabled = !has;
    this.tools.duplicate.disabled = !has;
    this.tools.join.disabled = !this.actions.canJoinSelected();
    const sel = s.selectedClip, tm = s.state.time;
    const over = (c) => tm > c.start + 0.05 && tm < clipEnd(c) - 0.05;
    this.tools.split.disabled = !(sel ? over(sel.clip) : mainTrackOf(this.store.project)?.clips.some(over));
    this.tools.snap.setAttribute("aria-pressed", String(!!prefs.get("snapping")));
  }

  /* ------------------------------------------------------------------ drawing */
  drawVisible() {
    if (this.drawPending) return;
    this.drawPending = requestAnimationFrame(() => {
      this.drawPending = 0;
      const sl = this.viewport.scrollLeft, vw = this.vw;
      for (const [id, el] of this.clipEls) {
        const left = parseFloat(el.style.left), w = parseFloat(el.style.width);
        const a = Math.max(left, sl - 50), b = Math.min(left + w, sl + vw + 50);
        const canvas = el.querySelector(".clip-canvas");
        if (b <= a) { if (canvas.width) { canvas.width = 0; canvas.dataset.key = ""; } continue; }
        const key = el.dataset.drawKey + "|" + Math.round(a) + "|" + Math.round(b) + "|" + (this.registry.entry(this.store.project.media[findClip(this.store.project, id)?.clip.mediaId]?.id)?.thumbs?.length || 0) + "|" + (document.documentElement.dataset.theme);
        if (canvas.dataset.key === key) continue;
        canvas.dataset.key = key;
        this.drawClip(id, el, canvas, a - left, b - left);
      }
    });
  }

  drawClip(id, el, canvas, from, to) {
    const f = findClip(this.store.project, id);
    if (!f) return;
    const clip = f.clip;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const hgt = el.clientHeight || 40;
    const w = Math.max(1, Math.round(to - from));
    canvas.width = w * dpr; canvas.height = hgt * dpr;
    canvas.style.left = from + "px";
    canvas.style.width = w + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const z = this.store.state.zoom;
    if ((clip.kind === "video" || clip.kind === "image") && prefs.get("timelineThumbs")) {
      const entry = this.registry.entry(clip.mediaId);
      const sample = entry?.thumbs?.[0]?.canvas;
      if (!sample) return;
      const tw = Math.max(16, (sample.width / sample.height) * hgt);
      const startI = Math.floor(from / tw);
      for (let i = startI; i * tw < to; i++) {
        const x = i * tw;
        const srcT = (clip.in || 0) + ((x + tw / 2) / z) * (clip.speed || 1);
        const th = clip.kind === "image" ? sample : this.registry.thumbAt(clip.mediaId, srcT);
        if (th) ctx.drawImage(th, x - from, 0, tw, hgt);
      }
    } else if (clip.kind === "audio") {
      const peaks = this.registry.entry(clip.mediaId)?.peaks;
      if (!peaks) return;
      const color = getComputedStyle(el).getPropertyValue("--clip-audio-wave").trim() || "#999";
      ctx.fillStyle = color;
      const mid = hgt * 0.56, amp = hgt * 0.36;
      for (let x = from; x < to; x += 2) {
        const srcT = (clip.in || 0) + (x / z) * (clip.speed || 1);
        const i = Math.floor(srcT * peaks.perSecond);
        const v = peaks.peaks[i] || 0;
        const local = x / z;
        const g = Math.min(1, clip.fadeIn > 0 ? local / clip.fadeIn : 1, clip.fadeOut > 0 ? (clip.duration - local) / clip.fadeOut : 1) * Math.min(1.6, clip.volume ?? 1);
        const hh = Math.max(1, v * amp * g);
        ctx.fillRect(x - from, mid - hh, 1.4, hh * 2);
      }
    }
  }

  drawRuler() {
    const vw = this.vw || this.viewport.clientWidth;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const H = 24;
    this.ruler.width = vw * dpr; this.ruler.height = H * dpr;
    this.ruler.style.width = vw + "px"; this.ruler.style.height = H + "px";
    const ctx = this.ruler.getContext("2d");
    ctx.scale(dpr, dpr);
    const cs = getComputedStyle(this.el);
    const z = this.store.state.zoom, sl = this.viewport.scrollLeft, pad = this.pad();
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const major = steps.find((s) => s * z >= 84) || 600;
    const minor = major / (major >= 1 && major % 5 === 0 ? 5 : 4);
    const t0 = Math.max(0, (sl - pad) / z), t1 = (sl + vw - pad) / z;
    ctx.font = "500 10.5px " + cs.fontFamily;
    ctx.textBaseline = "top";
    for (let tt = Math.floor(t0 / minor) * minor; tt <= t1 + minor; tt += minor) {
      if (tt < 0) continue;
      const x = Math.round(pad + tt * z - sl) + 0.5;
      const isMajor = Math.abs(tt / major - Math.round(tt / major)) < 1e-6;
      ctx.fillStyle = cs.getPropertyValue(isMajor ? "--label-3" : "--label-4");
      ctx.fillRect(x, isMajor ? 14 : 18, 1, isMajor ? 10 : 6);
      if (isMajor) {
        ctx.fillStyle = cs.getPropertyValue("--label-2");
        const label = major < 1 ? formatTime(tt, true, 10).replace(/\.(\d)\d$/, ".$1") : formatTime(tt);
        ctx.fillText(label, x + 4, 2);
      }
    }
  }

  /* ------------------------------------------------------------------ playhead & scroll */
  updatePlayhead(force) {
    const time = this.store.state.time;
    const z = this.store.state.zoom;
    this.timeLabel.textContent = formatTime(time, true, this.store.project.settings.fps) + " / " + formatTime(projectDuration(this.store.project));
    this.rulerWrap.setAttribute("aria-valuenow", time.toFixed(2));
    this.rulerWrap.setAttribute("aria-valuemax", projectDuration(this.store.project).toFixed(2));
    this.rulerWrap.setAttribute("aria-valuetext", formatTime(time));
    if (this.mobile) {
      const target = time * z;
      if (Math.abs(this.viewport.scrollLeft - target) > 0.5) {
        this.ignoreScroll = 2;
        this.viewport.scrollLeft = target;
      }
      this.playhead.hidden = true;
    } else {
      this.playhead.hidden = false;
      const x = this.x(time);
      this.playhead.style.transform = `translateX(${x}px)`;
      if ((this.store.state.playing || force) && prefs.get("followPlayhead")) {
        const sl = this.viewport.scrollLeft;
        if (x > sl + this.vw - 40 || x < sl) { this.ignoreScroll = 1; this.viewport.scrollLeft = Math.max(0, x - this.vw * 0.15); this.drawRuler(); this.drawVisible(); }
      }
    }
    this.updateToolbar();
    this.lanes.querySelectorAll(".lane-add").forEach((ph) => { if (this.mobile) ph.style.left = this.x(time) + 6 + "px"; });
  }

  onScroll() {
    if (this.mobile) this.addMediaBtn.style.top = this.rulerWrap.offsetHeight + (this.lanes.querySelector('[data-role="main"]')?.offsetTop || 0) + ((this.lanes.querySelector('[data-role="main"]')?.offsetHeight || 40) - 40) / 2 - this.viewport.scrollTop + "px";
    this.drawRuler();
    this.drawVisible();
    this.heads.scrollTop = this.viewport.scrollTop;
    if (this.ignoreScroll > 0) { this.ignoreScroll--; return; }
    if (this.mobile && !this.dragging) {
      const time = this.viewport.scrollLeft / this.store.state.zoom;
      if (this.store.state.playing) this.cb.onScrub?.(time);
      this.seek(time);
    }
  }

  seek(time) { this.onSeek ? this.onSeek(time) : this.store.setTime(time); }

  onWheel(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const anchor = this.timeAt(e.clientX);
      const r = this.viewport.getBoundingClientRect();
      this.zoomBy(Math.exp(-e.deltaY * 0.01), anchor, e.clientX - r.left);
    } else if (!this.mobile && Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.shiftKey && this.viewport.scrollHeight <= this.viewport.clientHeight + 2) {
      e.preventDefault();
      this.viewport.scrollLeft += e.deltaY;
    }
  }

  /* ------------------------------------------------------------------ zoom */
  zoomBy(k, anchorTime, anchorPx) {
    const z0 = this.store.state.zoom;
    const at = anchorTime ?? this.store.state.time;
    const ap = anchorPx ?? (this.mobile ? this.vw / 2 : this.x(at) - this.viewport.scrollLeft);
    this.store.setZoom(z0 * k);
    if (!this.mobile) { this.ignoreScroll = 1; this.viewport.scrollLeft = Math.max(0, this.x(at) - ap); }
    this.drawRuler(); this.drawVisible();
  }

  fit() {
    const d = projectDuration(this.store.project) || 10;
    const avail = this.mobile ? this.vw * 0.9 : this.vw - 60;
    this.store.setZoom(avail / d);
    if (!this.mobile) this.viewport.scrollLeft = 0;
  }

  syncZoomSlider() {
    const z = this.store.state.zoom;
    const v = (Math.log(z / LIMITS.minZoom) / Math.log(LIMITS.maxZoom / LIMITS.minZoom)) * 1000;
    this.zoomSlider.value = String(Math.round(v));
    this.zoomSlider.style.setProperty("--p", v / 10 + "%");
  }

  setZoomFromSlider(v) {
    const z = LIMITS.minZoom * Math.pow(LIMITS.maxZoom / LIMITS.minZoom, v / 1000);
    this.zoomBy(z / this.store.state.zoom);
  }

  bindPinch() {
    const pts = new Map();
    let d0 = 0, z0 = 0;
    this.viewport.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") pts.set(e.pointerId, e); if (pts.size === 2) { const [a, b] = [...pts.values()]; d0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); z0 = this.store.state.zoom; this.cancelDrag?.(); } });
    this.viewport.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, e);
      if (pts.size === 2 && d0 > 0) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        this.zoomBy((z0 * (d / d0)) / this.store.state.zoom);
      }
    });
    const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) d0 = 0; };
    this.viewport.addEventListener("pointerup", end);
    this.viewport.addEventListener("pointercancel", end);
  }

  /* ------------------------------------------------------------------ ruler scrub */
  bindRuler() {
    let active = false;
    const move = (e) => this.seek(this.timeAt(e.clientX));
    this.rulerWrap.addEventListener("pointerdown", (e) => {
      if (this.mobile) return;
      active = true;
      this.rulerWrap.setPointerCapture(e.pointerId);
      move(e);
    });
    this.rulerWrap.addEventListener("pointermove", (e) => active && move(e));
    this.rulerWrap.addEventListener("pointerup", () => (active = false));
    this.rulerWrap.addEventListener("pointercancel", () => (active = false));
    this.rulerWrap.addEventListener("keydown", (e) => {
      const fps = this.store.project.settings.fps;
      const step = e.shiftKey ? 1 : 1 / fps;
      if (e.key === "ArrowLeft") { e.preventDefault(); this.seek(this.store.state.time - step); }
      if (e.key === "ArrowRight") { e.preventDefault(); this.seek(this.store.state.time + step); }
      if (e.key === "Home") { e.preventDefault(); this.seek(0); }
      if (e.key === "End") { e.preventDefault(); this.seek(projectDuration(this.store.project)); }
    });
  }

  /* ------------------------------------------------------------------ clip interaction */
  snapTargets(excludeIds) {
    const pts = [0, this.store.state.time];
    for (const tr of this.store.project.tracks) for (const c of tr.clips) if (!excludeIds.has(c.id)) { pts.push(c.start, clipEnd(c)); }
    return pts;
  }

  snap(time, targets, alsoEnd = null) {
    if (!prefs.get("snapping")) { this.snapLine.hidden = true; return { time, snapped: null }; }
    const th = 8 / this.store.state.zoom;
    let best = null, bestD = th, offset = 0;
    for (const p of targets) {
      const d = Math.abs(p - time);
      if (d < bestD) { bestD = d; best = p; offset = 0; }
      if (alsoEnd != null) { const d2 = Math.abs(p - (time + alsoEnd)); if (d2 < bestD) { bestD = d2; best = p; offset = alsoEnd; } }
    }
    if (best == null) { this.snapLine.hidden = true; return { time, snapped: null }; }
    this.snapLine.hidden = false;
    this.snapLine.style.transform = `translateX(${this.x(best)}px)`;
    return { time: best - offset, snapped: best };
  }

  bindLanes() {
    let g = null; // gesture state
    const lanes = this.lanes;

    const begin = (e, clipEl) => {
      const id = clipEl.dataset.id;
      const f = findClip(this.store.project, id);
      if (!f) return null;
      const edge = e.target.closest(".clip-handle")?.dataset.edge;
      const fade = e.target.closest(".fade-handle")?.dataset.fade;
      return { id, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, t0: this.timeAt(e.clientX), started: false,
        mode: fade ? "fade-" + fade : edge ? "trim-" + edge : "move", orig: structuredClone(f.clip), trackId: f.track.id,
        main: f.track.role === "main", locked: f.track.locked, touch: e.pointerType === "touch", el: clipEl };
    };

    const start = () => {
      if (g.locked) { g = null; return; }
      g.started = true;
      this.dragging = true;
      g.el.classList.add("dragging");
      this.store.begin(g.mode.startsWith("trim") ? "trim" : g.mode.startsWith("fade") ? "fade" : "move");
      this.snapSet = this.snapTargets(new Set([g.id]));
      if (g.touch && navigator.vibrate) navigator.vibrate(8);
    };

    const move = (e) => {
      if (!g || e.pointerId !== g.pointerId) return;
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (!g.started) {
        if (g.touch) { if (Math.hypot(dx, dy) > 10) { clearTimeout(g.timer); g = null; } return; }
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        start();
        if (!g) return;
      }
      e.preventDefault();
      if (this.mobile) this.autoScroll(e.clientX);
      const tNow = this.timeAt(e.clientX);
      const dt = tNow - g.t0;
      const o = g.orig;
      if (g.mode === "move") {
        if (g.main) this.previewReorder(g, e);
        else this.store.live((p) => {
          const f = findClip(p, g.id);
          if (!f) return;
          let st = Math.max(0, o.start + dt);
          st = this.snap(st, this.snapSet, o.duration).time;
          f.clip.start = Math.max(0, st);
          // Vertical move to another compatible lane.
          const lane = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".tl-lane");
          const target = lane && p.tracks.find((tr) => tr.id === lane.dataset.track);
          if (target && target.id !== f.track.id && target.role !== "main" && !target.locked && trackAccepts(target, f.clip.kind)) {
            f.track.clips.splice(f.track.clips.indexOf(f.clip), 1);
            target.clips.push(f.clip);
          }
          g.mainDrop = target && target.role === "main" && trackAccepts(target, f.clip.kind) ? target.id : null;
        });
      } else if (g.mode.startsWith("trim")) {
        this.store.live((p) => {
          const f = findClip(p, g.id);
          if (!f) return;
          const media = p.media[o.mediaId];
          const min = LIMITS.minClipDuration;
          const sp = o.speed || 1;
          if (g.mode === "trim-l") {
            let d = dt;
            if (!g.main) d = this.snap(o.start + dt, this.snapSet).time - o.start;
            if (o.in != null) d = Math.max(d, -o.in / sp);
            d = Math.min(d, o.duration - min);
            if (!g.main) d = Math.max(d, -o.start);
            f.clip.duration = o.duration - d;
            if (o.in != null) f.clip.in = o.in + d * sp;
            if (!g.main) f.clip.start = o.start + d;
          } else {
            let end = o.start + o.duration + dt;
            if (!g.main) end = this.snap(end, this.snapSet).time;
            const maxD = maxDuration(o, media);
            f.clip.duration = clamp(end - o.start, min, maxD);
          }
        });
      } else if (g.mode.startsWith("fade")) {
        this.store.live((p) => {
          const f = findClip(p, g.id);
          if (!f) return;
          const max = f.clip.duration / 2;
          if (g.mode === "fade-in") f.clip.fadeIn = clamp((o.fadeIn || 0) + dt, 0, max);
          else f.clip.fadeOut = clamp((o.fadeOut || 0) - dt, 0, max);
        });
      }
    };

    const end = (e) => {
      if (!g || (e && e.pointerId !== g.pointerId)) return;
      clearTimeout(g.timer);
      const gg = g; g = null;
      this.snapLine.hidden = true;
      this.insertMark.hidden = true;
      gg.el.classList.remove("dragging");
      gg.el.style.removeProperty("--drag-x");
      if (!gg.started) return;
      this.dragging = false;
      if (gg.mode === "move" && gg.main && gg.insertIndex != null) {
        this.store.live((p) => {
          const f = findClip(p, gg.id);
          const tr = f.track;
          const from = tr.clips.indexOf(f.clip);
          let to = gg.insertIndex;
          if (to > from) to--;
          if (to !== from) { tr.clips.splice(from, 1); tr.clips.splice(to, 0, f.clip); f.clip.transition = null; tr.clips.forEach((c, i) => { c.start = i; }); }
        });
      }
      if (gg.mode === "move" && !gg.main && gg.mainDrop) {
        this.store.live((p) => {
          const f = findClip(p, gg.id);
          const main = p.tracks.find((tr) => tr.id === gg.mainDrop);
          f.track.clips.splice(f.track.clips.indexOf(f.clip), 1);
          const idx = main.clips.findIndex((c) => f.clip.start < c.start + c.duration / 2);
          f.clip.transform = { x: 0, y: 0, scale: 1, rotation: 0 };
          main.clips.splice(idx < 0 ? main.clips.length : idx, 0, f.clip);
          main.clips.forEach((c, i) => { c.start = i; });
        });
      }
      this.store.commit();
    };
    this.cancelDrag = () => { if (g && g.started) { this.store.cancel(); } if (g) { clearTimeout(g.timer); g.el.classList.remove("dragging"); } g = null; this.dragging = false; };

    lanes.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      const clipEl = e.target.closest(".clip");
      if (!clipEl) {
        // Empty lane: seek on desktop, deselect.
        if (!e.target.closest(".lane-add, .junction")) {
          if (!this.mobile) this.seek(this.timeAt(e.clientX));
          this.store.select([]);
        }
        return;
      }
      const id = clipEl.dataset.id;
      if (e.shiftKey || e.metaKey || e.ctrlKey) this.store.select(id, { add: true });
      else if (!this.store.state.selection.includes(id)) this.store.select(id);
      g = begin(e, clipEl);
      if (!g) return;
      if (g.touch) {
        // Handles respond immediately; the clip body needs a long press, so a
        // quick swipe still scrolls the timeline.
        if (g.mode !== "move") { start(); }
        else g.timer = setTimeout(() => { if (g && !g.started) { start(); clipEl.setPointerCapture?.(g.pointerId); } }, LONG_PRESS_MS);
      } else {
        clipEl.setPointerCapture(e.pointerId);
      }
    });
    lanes.addEventListener("pointermove", move);
    lanes.addEventListener("pointerup", end);
    lanes.addEventListener("pointercancel", (e) => { if (g && !g.started) { clearTimeout(g.timer); g = null; } else end(e); });
    // While a touch drag is active, stop the browser from scrolling.
    lanes.addEventListener("touchmove", (e) => { if (g?.started) e.preventDefault(); }, { passive: false });
    lanes.addEventListener("dblclick", (e) => { const c = e.target.closest(".clip"); if (c) this.cb.onClipActivate?.(c.dataset.id); });
  }

  previewReorder(g, e) {
    const p = this.store.project;
    const f = findClip(p, g.id);
    if (!f) return;
    const time = this.timeAt(e.clientX);
    const clips = f.track.clips;
    let idx = clips.length;
    for (let i = 0; i < clips.length; i++) { if (time < clips[i].start + clips[i].duration / 2) { idx = i; break; } }
    g.insertIndex = idx;
    const x = idx < clips.length ? this.x(clips[idx].start) : this.x(clipEnd(clips[clips.length - 1]));
    const lane = this.lanes.querySelector(`[data-track="${f.track.id}"]`);
    this.insertMark.hidden = false;
    this.insertMark.style.transform = `translateX(${x}px)`;
    this.insertMark.style.top = lane.offsetTop + this.rulerWrap.offsetHeight + "px";
    this.insertMark.style.height = lane.offsetHeight + "px";
    g.el.style.setProperty("--drag-x", (e.clientX - g.x0) + "px");
  }

  autoScroll(clientX) {
    const r = this.viewport.getBoundingClientRect();
    const edge = 40;
    if (clientX < r.left + edge) this.viewport.scrollLeft -= 12;
    else if (clientX > r.right - edge) this.viewport.scrollLeft += 12;
  }

  onClipKey(e, el) {
    const id = el.dataset.id;
    const f = findClip(this.store.project, id);
    if (!f) return;
    const clips = Array.from(this.clipEls.values()).sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));
    if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && e.altKey) {
      e.preventDefault();
      this.actions.nudge((e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 1 : 1 / this.store.project.settings.fps));
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const sameLane = Array.from(el.parentNode.querySelectorAll(".clip"));
      const i = sameLane.indexOf(el) + (e.key === "ArrowRight" ? 1 : -1);
      const next = sameLane[i];
      if (next) { this.store.select(next.dataset.id); next.focus(); this.seek(findClip(this.store.project, next.dataset.id).clip.start); }
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const lanes = Array.from(this.lanes.children);
      const li = lanes.indexOf(el.parentNode) + (e.key === "ArrowDown" ? 1 : -1);
      const lane = lanes[li];
      const cand = lane && Array.from(lane.querySelectorAll(".clip"));
      if (cand && cand.length) {
        const x = parseFloat(el.style.left);
        const next = cand.reduce((a, b) => (Math.abs(parseFloat(b.style.left) - x) < Math.abs(parseFloat(a.style.left) - x) ? b : a));
        this.store.select(next.dataset.id); next.focus();
      }
      return;
    }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.store.select(id); this.cb.onClipActivate?.(id); }
    void clips;
  }

  /* ------------------------------------------------------------------ drop from libraries */
  bindDrop() {
    const lanes = this.lanes;
    lanes.addEventListener("dragover", (e) => {
      if (!e.dataTransfer.types.includes("application/x-mms") && !e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      const lane = e.target.closest(".tl-lane");
      lanes.querySelectorAll(".drop-target").forEach((l) => l !== lane && l.classList.remove("drop-target"));
      lane?.classList.add("drop-target");
    });
    lanes.addEventListener("dragleave", (e) => { if (!lanes.contains(e.relatedTarget)) lanes.querySelectorAll(".drop-target").forEach((l) => l.classList.remove("drop-target")); });
    lanes.addEventListener("drop", (e) => {
      e.preventDefault();
      lanes.querySelectorAll(".drop-target").forEach((l) => l.classList.remove("drop-target"));
      const lane = e.target.closest(".tl-lane");
      const clipEl = e.target.closest(".clip");
      const time = this.timeAt(e.clientX);
      const raw = e.dataTransfer.getData("application/x-mms");
      let payload = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
      if (!payload && e.dataTransfer.files?.length) payload = { type: "files", files: Array.from(e.dataTransfer.files) };
      if (!payload) return;
      // A transition dropped near a cut applies to that cut.
      if (payload.type === "transition") {
        const j = this.nearestJunction(lane?.dataset.track, time);
        if (j) { this.actions.setTransition(j.clipId, payload.id); this.store.selectJunction(j); }
        return;
      }
      this.cb.onDropPayload?.(payload, { time, trackId: lane?.dataset.track, clipId: clipEl?.dataset.id });
    });
  }

  nearestJunction(trackId, time) {
    const p = this.store.project;
    const tracks = trackId ? p.tracks.filter((tr) => tr.id === trackId) : p.tracks.filter((tr) => tr.kind !== "audio");
    let best = null, bestD = 60 / this.store.state.zoom + 0.5;
    for (const tr of tracks) for (let i = 1; i < tr.clips.length; i++) {
      const a = tr.clips[i - 1], b = tr.clips[i];
      if (Math.abs(clipEnd(a) - b.start) > 0.01) continue;
      const d = Math.abs(b.start - time);
      if (d < bestD) { bestD = d; best = { trackId: tr.id, clipId: b.id }; }
    }
    return best;
  }

  focusSelected() { this.clipEls.get(this.store.state.selection[0])?.focus(); }

  dispose() {
    this.offs.forEach((o) => o());
    this.resizeObs.disconnect();
    cancelAnimationFrame(this.drawPending);
  }
}

export function trackIcon(track) {
  return { main: "video", overlay: "layers", text: "text", music: "music", sfx: "wave" }[track.role] || "media";
}

export function trackName(p, track) {
  const same = p.tracks.filter((x) => x.role === track.role);
  const base = t("track." + track.role);
  return same.length > 1 ? `${base} ${same.indexOf(track) + 1}` : base;
}

export { canJoin, debounce, isTouch, effectName, getEffect };
