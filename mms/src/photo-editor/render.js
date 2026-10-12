/* Draws a photo project: collage cells (each photo with its filter, effects
   and adjustments through the WebGL compositor), then text and stickers.
   The same code renders the live preview and the exported file. */
import { Compositor } from "../render/compositor.js";
import { buildLayer } from "../render/scene.js";
import { renderText } from "../render/text.js";
import { ensureFont } from "../render/fonts.js";
import { STICKERS, stickerDataUrl } from "../render/stickers.js";
import { getBlob } from "../storage/db.js";
import { cellRects, photoLook } from "./model.js";

const loadImage = (src) => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("image")); i.src = src; });

export class PhotoRenderer {
  constructor() {
    this.bitmaps = new Map();   // blobId → ImageBitmap (full size)
    this.sources = new Map();   // key → canvas (rotated, flipped, scaled)
    this.stickers = new Map();  // stickerId|blobId → image
    this.comp = null;
    this.version = 1;
  }

  async ensure(doc) {
    const jobs = [];
    for (const p of doc.photos) if (!this.bitmaps.has(p.blobId)) jobs.push(this._loadBitmap(p.blobId));
    for (const it of doc.items) {
      if (it.type === "sticker") { const k = it.stickerId || it.blobId; if (!this.stickers.has(k)) jobs.push(this._loadSticker(it)); }
      if (it.type === "text" && it.style?.font) jobs.push(ensureFont(it.style.font));
    }
    await Promise.all(jobs);
  }

  async _loadBitmap(blobId) {
    try { const b = await getBlob(blobId); if (b) this.bitmaps.set(blobId, await createImageBitmap(b, { imageOrientation: "from-image" })); }
    catch (e) { console.warn("Photo could not be decoded", e); }
  }

  async _loadSticker(it) {
    try {
      if (it.stickerId) { const s = STICKERS.find((x) => x.id === it.stickerId); if (s) this.stickers.set(it.stickerId, await loadImage(stickerDataUrl(s))); return; }
      const b = await getBlob(it.blobId);
      if (b) this.stickers.set(it.blobId, await createImageBitmap(b));
    } catch (e) { console.warn("Sticker could not be decoded", e); }
  }

  /** Photo pixels with rotation and flip applied, scaled so the long side is at most maxSide. */
  source(photo, maxSide) {
    const bmp = this.bitmaps.get(photo.blobId);
    if (!bmp) return null;
    const rot = ((photo.rotate || 0) % 360 + 360) % 360;
    const swap = rot % 180 !== 0;
    const bw = swap ? bmp.height : bmp.width, bh = swap ? bmp.width : bmp.height;
    const k = Math.min(1, maxSide / Math.max(bw, bh));
    const tier = k >= 1 ? "full" : Math.ceil(maxSide / 256) * 256;
    const key = `${photo.blobId}|${rot}|${photo.flip ? 1 : 0}|${tier}`;
    let c = this.sources.get(key);
    if (!c) {
      c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(bw * k)); c.height = Math.max(1, Math.round(bh * k));
      const g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.translate(c.width / 2, c.height / 2);
      g.rotate((rot * Math.PI) / 180);
      if (photo.flip) g.scale(-1, 1);
      const dw = (swap ? c.height : c.width), dh = (swap ? c.width : c.height);
      g.drawImage(bmp, -dw / 2, -dh / 2, dw, dh);
      c._key = key;
      this.sources.set(key, c);
      if (this.sources.size > 40) this.sources.delete(this.sources.keys().next().value);
    }
    return c;
  }

  _compositor() {
    if (!this.comp) {
      this.comp = new Compositor(document.createElement("canvas"), { preserveDrawingBuffer: true });
      const gl = this.comp.gl;
      this.maxGL = gl ? Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0], gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) : 4096;
    }
    return this.comp;
  }

  /** Cover geometry of a photo inside a cell, in cell pixels. */
  coverRect(src, cell, photo) {
    const a = src.width / src.height, ca = cell.w / cell.h;
    let w, h;
    if (a > ca) { h = cell.h; w = h * a; } else { w = cell.w; h = w / a; }
    const z = Math.max(1, photo.zoom || 1);
    w *= z; h *= z;
    const mx = (w - cell.w) / 2, my = (h - cell.h) / 2;
    const ay = { top: -1, center: 0, bottom: 1 }[photo._align || "center"] || 0;
    const px = Math.max(-1, Math.min(1, photo.panX || 0)), py = Math.max(-1, Math.min(1, (photo.panY ?? 0) + (photo.panY == null ? ay : 0)));
    return { x: cell.x + (cell.w - w) / 2 - px * mx, y: cell.y + (cell.h - h) / 2 - py * my, w, h };
  }

  /** Draws one photo into its cell on ctx (2D), through WebGL when it has a look. */
  drawPhoto(ctx, photo, cell, { preview, maxSide }) {
    const src = this.source(photo, maxSide);
    if (!src) return false;
    const look = photoLook(photo);
    const r = this.coverRect(src, cell, photo);
    if (look.plain) {
      ctx.drawImage(src, r.x, r.y, r.w, r.h);
      return true;
    }
    const comp = this._compositor();
    if (!comp.gl) { ctx.drawImage(src, r.x, r.y, r.w, r.h); return true; }
    // Render the visible part of the photo at cell size (capped by the GPU limits).
    const cap = Math.min(this.maxGL, preview ? 2048 : this.maxGL);
    const k = Math.min(1, cap / Math.max(cell.w, cell.h));
    const fw = Math.max(2, Math.round(cell.w * k)), fh = Math.max(2, Math.round(cell.h * k));
    comp.setSize(fw, fh);
    const clip = { transform: { x: (r.x + r.w / 2 - (cell.x + cell.w / 2)) / cell.w, y: (r.y + r.h / 2 - (cell.y + cell.h / 2)) / cell.h, scale: 1, rotation: 0 },
      opacity: 1, fit: "cover", adjust: look.adjust, effects: look.effects, duration: 10 };
    const layer = buildLayer({ clip, local: 1 }, { w: fw, h: fh }, { key: src._key, source: src, srcW: src.width, srcH: src.height, version: 1 });
    layer.w = r.w / cell.w; layer.h = r.h / cell.h;
    comp.render([{ kind: "layer", layer }], { time: 1.37 });
    ctx.drawImage(comp.canvas, cell.x, cell.y, cell.w, cell.h);
    return true;
  }

  /** Bounding box of an item in canvas pixels: { cx, cy, w, h, rotation }. */
  itemBox(it, W, H, measureOnly = true) {
    const base = Math.min(W, H);
    if (it.type === "text") {
      const res = renderText(it.content || " ", it.style, (base / 1080) * (it.scale || 1), W);
      return { cx: it.x * W, cy: it.y * H, w: res.width, h: res.height, rotation: it.rotation || 0, canvas: measureOnly ? null : res.canvas };
    }
    const img = this.stickers.get(it.stickerId || it.blobId);
    const iw = img?.width || it.width || 512, ih = img?.height || it.height || 512;
    const w = base * 0.32 * (it.scale || 1), h = (w * ih) / iw;
    return { cx: it.x * W, cy: it.y * H, w, h, rotation: it.rotation || 0, img };
  }

  /**
   * Renders the document into a 2D canvas of size W × H.
   * preview: draws placeholders for empty cells and uses smaller sources.
   */
  render(doc, canvas, W, H, { preview = false, selectedCell = -1 } = {}) {
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.fillStyle = doc.frame?.bg || "#ffffff";
    ctx.fillRect(0, 0, W, H);
    const cells = cellRects(doc, W, H);
    const radius = (doc.frame?.radius || 0) * Math.min(W, H);
    const maxSide = preview ? Math.min(2048, Math.max(W, H) * 1.5) : 16384;
    cells.forEach((cell, i) => {
      const photo = doc.photos[i];
      ctx.save();
      ctx.beginPath();
      if (radius > 0 && ctx.roundRect) ctx.roundRect(cell.x, cell.y, cell.w, cell.h, Math.min(radius, cell.w / 2, cell.h / 2)); else ctx.rect(cell.x, cell.y, cell.w, cell.h);
      ctx.clip();
      if (photo) { photo._align = doc.align; this.drawPhoto(ctx, photo, cell, { preview, maxSide }); }
      else if (preview) {
        ctx.fillStyle = "rgba(128,128,128,.22)"; ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
        const s = Math.min(cell.w, cell.h) * 0.12;
        ctx.strokeStyle = "rgba(128,128,128,.9)"; ctx.lineWidth = Math.max(2, s / 6); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(cell.x + cell.w / 2 - s, cell.y + cell.h / 2); ctx.lineTo(cell.x + cell.w / 2 + s, cell.y + cell.h / 2);
        ctx.moveTo(cell.x + cell.w / 2, cell.y + cell.h / 2 - s); ctx.lineTo(cell.x + cell.w / 2, cell.y + cell.h / 2 + s); ctx.stroke();
      }
      ctx.restore();
      if (preview && i === selectedCell) {
        ctx.save(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(2, Math.min(W, H) / 300);
        ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 4;
        ctx.strokeRect(cell.x + ctx.lineWidth / 2, cell.y + ctx.lineWidth / 2, cell.w - ctx.lineWidth, cell.h - ctx.lineWidth); ctx.restore();
      }
    });
    for (const it of doc.items) {
      const box = this.itemBox(it, W, H, false);
      ctx.save();
      ctx.translate(box.cx, box.cy);
      ctx.rotate((box.rotation * Math.PI) / 180);
      if (it.type === "text" && box.canvas) ctx.drawImage(box.canvas, -box.w / 2, -box.h / 2, box.w, box.h);
      if (it.type === "sticker" && box.img) ctx.drawImage(box.img, -box.w / 2, -box.h / 2, box.w, box.h);
      ctx.restore();
    }
    ctx.restore();
    return cells;
  }

  /** Small filter or effect preview of one photo (data URL). */
  thumb(photo, look, size = 112) {
    const src = this.source(photo, 512);
    if (!src) return null;
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d");
    const tmp = { ...photo, zoom: 1, panX: 0, panY: 0, filter: look.filter ?? null, adjust: look.adjust ?? {}, effects: look.effects ?? [] };
    this.drawPhoto(ctx, tmp, { x: 0, y: 0, w: size, h: size }, { preview: true, maxSide: 512 });
    return c.toDataURL("image/jpeg", 0.8);
  }

  dispose() {
    for (const b of this.bitmaps.values()) b.close?.();
    this.bitmaps.clear(); this.sources.clear(); this.stickers.clear();
    this.comp?.dispose(); this.comp = null;
  }
}

/** Largest canvas this browser can really allocate (some mobile browsers cap the area). */
export function canvasFits(w, h) {
  try {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    if (!g) return false;
    g.fillStyle = "#fff"; g.fillRect(w - 1, h - 1, 1, 1);
    const ok = g.getImageData(w - 1, h - 1, 1, 1).data[3] === 255;
    c.width = c.height = 1;
    return ok;
  } catch { return false; }
}
