/* Preview monitor: renders the current frame with the compositor and lets you
   move and scale the selected visual clip directly on the picture. */
import { icon } from "../core/icons.js";
import { h, clamp } from "../core/util.js";
import { t } from "../core/i18n.js";
import { prefs } from "../core/prefs.js";
import { Compositor } from "../render/compositor.js";
import { sceneAt, toRenderOps, hexToRgb, buildLayer } from "../render/scene.js";
import { frameSize, findClip, isVisual } from "./model.js";

export class Preview {
  constructor(store, playback) {
    this.store = store;
    this.playback = playback;
    this.canvas = h("canvas", { class: "preview-canvas", role: "img", "aria-label": t("studio.previewLabel") });
    // Dashed frame with a delete button (top left) and a resize handle (bottom right), as in phone editors.
    this.box = h("div", { class: "sel-box", hidden: true },
      h("button", { class: "sel-del", type: "button", "aria-label": t("common.delete"), title: t("common.delete"), html: icon("close"),
        onpointerdown: (e) => e.stopPropagation(), onclick: (e) => { e.stopPropagation(); this.onDelete?.(); } }),
      h("span", { class: "sel-handle", dataset: { h: "ne" } }), h("span", { class: "sel-handle", dataset: { h: "sw" } }),
      h("span", { class: "sel-handle big", dataset: { h: "se" }, html: '<svg viewBox="0 0 24 24" class="i" aria-hidden="true"><path d="M8 8l8 8M16 10v6h-6M8 14V8h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' }));
    this.safe = h("div", { class: "safe-areas", hidden: true, "aria-hidden": "true" }, h("span", { class: "safe-action" }), h("span", { class: "safe-title" }));
    this.frame = h("div", { class: "preview-frame ltr" }, this.canvas, this.safe, this.box);
    this.el = h("div", { class: "preview" }, this.frame);
    this.comp = new Compositor(this.canvas);
    this.comp.onRestore = () => this.requestRender();
    this.pending = 0;
    this.resizeObs = new ResizeObserver(() => this.layout());
    this.resizeObs.observe(this.el);
    this.offs = [
      store.on("project", () => { this.layout(); this.requestRender(); }),
      store.on("selection", () => this.requestRender()),
      prefs.on("change:safeAreas", () => this.layout()),
      prefs.on("change:previewQuality", () => this.layout()),
    ];
    this.bindPointer();
  }

  layout() {
    const p = this.store.project;
    const { w: fw, h: fh } = frameSize(p);
    const cs = getComputedStyle(this.el);
    const availW = this.el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = this.el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (availW <= 0 || availH <= 0) return;
    const scale = Math.min(availW / fw, availH / fh);
    const cw = Math.floor(fw * scale), ch = Math.floor(fh * scale);
    this.frame.style.width = cw + "px";
    this.frame.style.height = ch + "px";
    const q = prefs.get("previewQuality");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cap = q === "half" ? 540 : 1080;
    const short = Math.min(Math.min(cw, ch) * dpr, cap);
    const k = short / Math.min(fw, fh);
    if (this.comp.width !== Math.round(fw * k) || this.comp.height !== Math.round(fh * k)) {
      this.comp.setSize(fw * k, fh * k);
      this.requestRender();
    }
    this.safe.hidden = !prefs.get("safeAreas");
    this.cssScale = { cw, ch };
  }

  requestRender() {
    if (this.pending) return;
    this.pending = requestAnimationFrame(() => { this.pending = 0; this.render(this.store.state.time); });
  }

  render(time) {
    const p = this.store.project;
    const frame = { w: this.comp.width, h: this.comp.height };
    const ops = sceneAt(p, time);
    const renderOps = toRenderOps(ops, frame, (item) => this.playback.drawable(item));
    this.comp.render(renderOps, { time, background: hexToRgb(p.settings.background) });
    this.updateBox(ops, frame);
  }

  /** Bounding box of the selected clip, if it is on screen. */
  updateBox(ops, frame) {
    const sel = this.store.selectedClip;
    const items = [];
    for (const op of ops) op.kind === "clip" ? items.push(op) : items.push(op.a, op.b);
    const item = sel && isVisual(sel.clip) ? items.find((i) => i.clip.id === sel.clip.id) : null;
    if (!item || sel.track.locked) { this.box.hidden = true; this.boxItem = null; return; }
    const layer = buildLayer(item, frame, item.clip.kind === "text" ? null : this.playback.drawable(item));
    if (!layer) { this.box.hidden = true; return; }
    const { cw, ch } = this.cssScale || { cw: 0, ch: 0 };
    const w = layer.w * cw, hh = layer.h * ch;
    let x = cw / 2 + layer.cx * cw - w / 2, y = ch / 2 + layer.cy * ch - hh / 2;
    let bw = w, bh = hh;
    // Keep the frame and its handles inside the preview area: a clip scaled past
    // the edges gets a frame clamped to what is visible, never drawn over the rest of the editor.
    if (!layer.rotation) {
      const pad = 22;
      const minX = pad - this.frame.offsetLeft, minY = pad - this.frame.offsetTop;
      const maxX = this.el.clientWidth - this.frame.offsetLeft - pad, maxY = this.el.clientHeight - this.frame.offsetTop - pad;
      const x2 = Math.min(x + w, maxX), y2 = Math.min(y + hh, maxY);
      x = Math.max(x, minX); y = Math.max(y, minY);
      bw = Math.max(24, x2 - x); bh = Math.max(24, y2 - y);
    }
    Object.assign(this.box.style, { left: x + "px", top: y + "px", width: bw + "px", height: bh + "px", transform: `rotate(${layer.rotation}deg)` });
    this.box.hidden = false;
    this.boxItem = { clipId: item.clip.id, w: bw, h: bh };
  }

  bindPointer() {
    let drag = null;
    // A click on the picture outside the selected clip's frame clears the selection,
    // so the inspector goes back to the project settings.
    this.el.addEventListener("pointerdown", (e) => {
      if (e.button > 0 || e.target.closest(".sel-box")) return;
      if (this.store.state.selection.length || this.store.state.junction) this.store.select([]);
    });
    this.frame.addEventListener("pointerdown", (e) => {
      const sel = this.store.selectedClip;
      if (!sel || !isVisual(sel.clip) || this.box.hidden || sel.track.locked) return;
      const handle = e.target.closest(".sel-handle")?.dataset.h;
      const inBox = e.target === this.box || this.box.contains(e.target);
      if (!handle && !inBox) return;
      e.preventDefault();
      this.frame.setPointerCapture(e.pointerId);
      const tf = { ...sel.clip.transform };
      drag = { id: sel.clip.id, x0: e.clientX, y0: e.clientY, tf, handle, w0: this.boxItem?.w || 1, h0: this.boxItem?.h || 1 };
      this.store.begin(handle ? "scale" : "move");
    });
    this.frame.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const { cw, ch } = this.cssScale;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      this.store.live((p) => {
        const f = findClip(p, drag.id);
        if (!f) return;
        if (drag.handle) {
          const sx = drag.handle.includes("e") ? 1 : -1, sy = drag.handle.includes("s") ? 1 : -1;
          const grow = ((dx * sx) / drag.w0 + (dy * sy) / drag.h0);
          f.clip.transform.scale = clamp(drag.tf.scale * (1 + grow), 0.05, 8);
        } else {
          let nx = drag.tf.x + dx / cw, ny = drag.tf.y + dy / ch;
          // Snap to centre lines.
          if (Math.abs(nx) < 0.012) nx = 0;
          if (Math.abs(ny) < 0.012) ny = 0;
          f.clip.transform.x = clamp(nx, -1.5, 1.5);
          f.clip.transform.y = clamp(ny, -1.5, 1.5);
        }
      });
    });
    const end = () => { if (drag) { drag = null; this.store.commit(); } };
    this.frame.addEventListener("pointerup", end);
    this.frame.addEventListener("pointercancel", end);
  }

  dispose() {
    cancelAnimationFrame(this.pending);
    this.resizeObs.disconnect();
    this.offs.forEach((o) => o());
    this.comp.dispose();
  }
}
