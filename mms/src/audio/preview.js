/* Library preview player: plays one AudioBuffer at a time and reports progress.
   Starting a new preview stops the previous one. */
import { Emitter } from "../core/util.js";

let ctx = null;
let current = null; // { id, src, start, duration }
const bus = new Emitter();
let raf = 0;

export function audioContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

function tick() {
  if (!current) return;
  const p = Math.min(1, (ctx.currentTime - current.start) / current.duration);
  bus.emit("progress", { id: current.id, progress: p });
  raf = requestAnimationFrame(tick);
}

export async function playPreview(id, buffer, { volume = 0.9 } = {}) {
  stopPreview();
  const c = audioContext();
  if (c.state === "suspended") await c.resume();
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  g.gain.value = volume;
  src.connect(g); g.connect(c.destination);
  src.start();
  current = { id, src, start: c.currentTime, duration: buffer.duration };
  src.onended = () => { if (current?.src === src) { current = null; cancelAnimationFrame(raf); bus.emit("stop", { id }); } };
  bus.emit("play", { id });
  tick();
}

export function stopPreview() {
  if (!current) return;
  const { id, src } = current;
  current = null;
  cancelAnimationFrame(raf);
  try { src.stop(); } catch { /* already stopped */ }
  bus.emit("stop", { id });
}

export const previewingId = () => current?.id || null;
export const onPreview = (type, fn) => bus.on(type, fn);
