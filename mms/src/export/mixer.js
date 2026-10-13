/* Offline audio mixdown of the whole timeline for export. Only the needed part
   of each source is decoded (mediabunny), sped-up/slowed clips are time-stretched
   in a worker, and volume and fades are applied as gain automation. */
import { projectDuration, clipEnd } from "../studio/model.js";
import { mediabunny } from "../media/registry.js";

const SR = 48000;
let worker = null, jobId = 0;
const jobs = new Map();

function stretchChannels(channels, speed) {
  if (!worker) {
    worker = new Worker(new URL("../workers/stretch.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => { jobs.get(e.data.id)?.(e.data.channels); jobs.delete(e.data.id); };
  }
  return new Promise((resolve) => {
    const id = ++jobId;
    jobs.set(id, resolve);
    worker.postMessage({ id, channels, speed }, channels.map((c) => c.buffer));
  });
}

/** Decodes [from, to) seconds of a media file's audio into planar channels. */
async function decodeRange(registry, mediaId, from, to) {
  const meta = registry.project.media[mediaId];
  const entry = await registry.ensure(mediaId);
  if (entry.status !== "ready") return null;
  // Small audio files and generated library audio: decode once, slice.
  if (meta.kind === "audio") {
    const buf = await registry.audioBuffer(mediaId);
    return buf ? slice(buf, from, to) : null;
  }
  try {
    const MB = await mediabunny();
    const input = new MB.Input({ source: new MB.BlobSource(entry.blob), formats: MB.ALL_FORMATS });
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    if (await track.canDecode()) {
      const sink = new MB.AudioBufferSink(track);
      const parts = [];
      let sr = track.sampleRate, chs = Math.min(2, track.numberOfChannels || 2);
      for await (const { buffer, timestamp } of sink.buffers(from, to)) parts.push({ buffer, timestamp });
      if (!parts.length) return null;
      sr = parts[0].buffer.sampleRate;
      const len = Math.max(1, Math.round((to - from) * sr));
      const out = Array.from({ length: chs }, () => new Float32Array(len));
      for (const { buffer, timestamp } of parts) {
        const off = Math.round((timestamp - from) * sr);
        for (let c = 0; c < chs; c++) {
          const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
          for (let i = Math.max(0, -off); i < src.length && off + i < len; i++) out[c][off + i] = src[i];
        }
      }
      return { channels: out, sampleRate: sr };
    }
  } catch (e) { console.info("Range decode fallback:", e?.message || e); }
  const buf = await registry.audioBuffer(mediaId);
  return buf ? slice(buf, from, to) : null;
}

function slice(buf, from, to) {
  const sr = buf.sampleRate;
  const a = Math.max(0, Math.floor(from * sr)), b = Math.min(buf.length, Math.ceil(to * sr));
  const chs = Math.min(2, buf.numberOfChannels);
  const channels = [];
  for (let c = 0; c < chs; c++) channels.push(buf.getChannelData(c).slice(a, Math.max(a, b)));
  return { channels, sampleRate: sr };
}

/** Returns an AudioBuffer for the whole timeline, or null when nothing is audible. */
export async function mixTimeline(project, registry, { onProgress, signal } = {}) {
  const duration = projectDuration(project);
  const items = [];
  for (const track of project.tracks) {
    if (track.muted) continue;
    for (const c of track.clips) {
      if (c.muted || (c.volume ?? 1) <= 0) continue;
      const meta = project.media[c.mediaId];
      if (c.kind === "audio" || (c.kind === "video" && meta?.hasAudio !== false)) items.push(c);
    }
  }
  if (!items.length || duration <= 0) return null;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SR), SR);
  let done = 0;
  for (const c of items) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const speed = c.speed || 1;
    const from = c.in || 0, to = from + c.duration * speed;
    const seg = await decodeRange(registry, c.mediaId, from, to);
    onProgress?.(++done / items.length);
    if (!seg || !seg.channels[0]?.length) continue;
    let chans = seg.channels;
    if (Math.abs(speed - 1) > 1e-3) chans = await stretchChannels(chans.map((x) => x.slice()), speed);
    const buf = ctx.createBuffer(chans.length, chans[0].length, seg.sampleRate);
    chans.forEach((ch, i) => buf.copyToChannel(ch, i));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const v = c.volume ?? 1, s = c.start, e = clipEnd(c);
    g.gain.setValueAtTime(c.fadeIn > 0 ? 0 : v, s);
    if (c.fadeIn > 0) g.gain.linearRampToValueAtTime(v, s + c.fadeIn);
    if (c.fadeOut > 0) { g.gain.setValueAtTime(v, Math.max(s, e - c.fadeOut)); g.gain.linearRampToValueAtTime(0, e); }
    src.connect(g); g.connect(ctx.destination);
    src.start(s, 0, c.duration);
  }
  return ctx.startRendering();
}
