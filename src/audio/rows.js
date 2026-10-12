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
    o.wave ? waveThumb(o.id, o.load) : null,
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

/* ------------------------------------------------------------ waveform thumbnails
   Small peak plots drawn only when a row scrolls into view. Rendering runs one
   item at a time so a long list never blocks the interface. */
const waveCache = new Map();
const waveQueue = [];
let waveBusy = false;
let waveObserver = null;

function peaks(buffer, n) {
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / n));
  const out = new Float32Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (let j = i * step, e = Math.min(data.length, j + step); j < e; j += 4) { const v = Math.abs(data[j]); if (v > p) p = v; }
    out[i] = p; if (p > max) max = p;
  }
  if (max > 0) for (let i = 0; i < n; i++) out[i] /= max;
  return out;
}

function drawWave(canvas, pk) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 64, hh = canvas.clientHeight || 22;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr);
  const g = canvas.getContext("2d");
  g.scale(dpr, dpr);
  g.fillStyle = getComputedStyle(canvas).color;
  const bars = pk.length, bw = w / bars;
  for (let i = 0; i < bars; i++) {
    const bh = Math.max(1.5, pk[i] * (hh - 2));
    g.fillRect(i * bw + bw * 0.2, (hh - bh) / 2, bw * 0.6, bh);
  }
}

async function pump() {
  if (waveBusy) return;
  waveBusy = true;
  while (waveQueue.length) {
    const { canvas, id, load } = waveQueue.shift();
    if (!canvas.isConnected) continue;
    try {
      let pk = waveCache.get(id);
      if (!pk) { pk = peaks(await load(), 28); waveCache.set(id, pk); }
      drawWave(canvas, pk);
      canvas.classList.add("ready");
    } catch { canvas.classList.add("failed"); }
    await new Promise((r) => setTimeout(r, 0));
  }
  waveBusy = false;
}

/** A small waveform canvas that renders itself when it becomes visible. */
export function waveThumb(id, load) {
  const canvas = h("canvas", { class: "wave-thumb", "aria-hidden": "true" });
  canvas._wave = { id, load };
  if (!waveObserver) {
    waveObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        waveObserver.unobserve(e.target);
        const { id: wid, load: wl } = e.target._wave;
        const cached = waveCache.get(wid);
        if (cached) { requestAnimationFrame(() => { drawWave(e.target, cached); e.target.classList.add("ready"); }); continue; }
        waveQueue.push({ canvas: e.target, id: wid, load: wl });
      }
      pump();
    }, { rootMargin: "120px" });
  }
  requestAnimationFrame(() => waveObserver.observe(canvas));
  return canvas;
}
