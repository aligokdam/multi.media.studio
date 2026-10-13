/* Video export. Frames are rendered by the same compositor as the preview,
   decoded frame-accurately from the source files (mediabunny + WebCodecs), and
   encoded by the browser's hardware encoders. The loop awaits the encoder for
   every frame, so the page stays responsive and memory stays bounded. */
import { ensureProjectFonts } from "../render/fonts.js";
import { mediabunny } from "../media/registry.js";
import { Compositor } from "../render/compositor.js";
import { sceneAt, clipsInScene, toRenderOps, hexToRgb } from "../render/scene.js";
import { frameSize, projectDuration } from "../studio/model.js";
import { mixTimeline } from "./mixer.js";
import { RESOLUTIONS } from "../config.js";

const VIDEO_CODECS = { mp4: ["avc", "hevc", "av1", "vp9"], webm: ["vp9", "av1", "vp8"] };
const AUDIO_CODECS = { mp4: ["aac", "opus"], webm: ["opus"] };
const AUDIO_RATE = 48000;

/* Compressed audio needs the browser's AudioEncoder, which some browsers (Safari
   among them) lack or refuse for some settings. Plain PCM is written by
   mediabunny itself, so a MOV file with PCM sound works everywhere. */
async function pickAudioCodec(MB, fmt) {
  if (typeof AudioEncoder === "undefined") return null;
  for (const codec of AUDIO_CODECS[fmt]) {
    for (const bitrate of [192000, 128000, undefined]) {
      try { if (await MB.canEncodeAudio(codec, { numberOfChannels: 2, sampleRate: AUDIO_RATE, bitrate })) return codec; } catch { /* try the next one */ }
    }
  }
  return null;
}

/** True when this browser has to keep the sound as PCM in a MOV file for this format. */
export async function needsMovForAudio(format) {
  return !(await pickAudioCodec(await mediabunny(), format === "webm" ? "webm" : "mp4"));
}

export function exportSupported() { return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined"; }

/** What this device can encode, for the export panel. */
export async function probeCapabilities(project) {
  const MB = await mediabunny();
  const caps = { formats: {}, resolutions: {} };
  for (const fmt of ["mp4", "webm"]) {
    const { w, h } = frameSize(project, 1080);
    const v = exportSupported() ? await MB.getFirstEncodableVideoCodec(VIDEO_CODECS[fmt], { width: w, height: h }) : null;
    const a = await pickAudioCodec(MB, fmt);
    caps.formats[fmt] = { video: v, audio: a };
  }
  for (const r of RESOLUTIONS) {
    const { w, h } = frameSize(project, r);
    const ok = {};
    for (const fmt of ["mp4", "webm"]) ok[fmt] = exportSupported() ? !!(await MB.getFirstEncodableVideoCodec(VIDEO_CODECS[fmt], { width: w, height: h })) : false;
    caps.resolutions[r] = ok;
  }
  return caps;
}

/** Sequential frame source for one clip, fed with the exact timestamps it will be asked for. */
class ClipFrames {
  constructor(entry, timestamps, maxW, maxH) {
    this.entry = entry; this.timestamps = timestamps; this.maxW = maxW; this.maxH = maxH;
    this.iter = null; this.fallback = null; this.version = 0;
  }
  async init(MB) {
    try {
      const input = new MB.Input({ source: new MB.BlobSource(this.entry.blob), formats: MB.ALL_FORMATS });
      const track = await input.getPrimaryVideoTrack();
      if (track && (await track.canDecode())) {
        const k = Math.min(1, this.maxW / track.displayWidth, this.maxH / track.displayHeight);
        const width = Math.max(2, Math.round(track.displayWidth * k)), height = Math.max(2, Math.round(track.displayHeight * k));
        const sink = new MB.CanvasSink(track, { width, height, fit: "fill", poolSize: 2 });
        this.iter = sink.canvasesAtTimestamps(this.timestamps)[Symbol.asyncIterator]();
        this.size = [width, height];
        return;
      }
    } catch (e) { console.info("Decoder fallback to media element:", e?.message || e); }
    // Fallback: seek a media element frame by frame (slower, works for anything the browser plays).
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.src = this.entry.url;
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(v.error || new Error("decode")); });
    this.fallback = v;
    this.size = [v.videoWidth, v.videoHeight];
    this.queue = this.timestamps.slice();
  }
  async next() {
    this.version++;
    if (this.iter) {
      const r = await this.iter.next();
      const c = r.value?.canvas;
      return c ? { source: c, srcW: c.width, srcH: c.height } : this.last || null;
    }
    const tt = this.queue.shift();
    const v = this.fallback;
    if (Math.abs(v.currentTime - tt) > 0.001) {
      await new Promise((res) => { const done = () => { v.removeEventListener("seeked", done); res(); }; v.addEventListener("seeked", done); v.currentTime = tt; setTimeout(done, 3000); });
    }
    return { source: v, srcW: v.videoWidth, srcH: v.videoHeight };
  }
  dispose() {
    this.iter?.return?.();
    if (this.fallback) { this.fallback.removeAttribute("src"); this.fallback.load(); }
  }
}

/**
 * @param settings { format, resolution, fps, quality, writable? }
 * @returns { blob?, codec, audioCodec, mime }
 */
export async function exportVideo(project, registry, settings, opts = {}) {
  try { return await exportOnce(project, registry, settings, opts, false); }
  catch (e) {
    // A compressed audio encoder that accepted the settings can still fail while encoding.
    if (e?.name === "AbortError" || !e?.audioEncoding) throw e;
    if (settings.writable) throw e.cause;
    console.info("Audio encoder failed, retrying with PCM sound:", e.cause?.message || e.cause);
    return exportOnce(project, registry, settings, opts, true);
  }
}

async function exportOnce(project, registry, settings, { onProgress, signal } = {}, forcePcm) {
  const MB = await mediabunny();
  if (!exportSupported()) throw new Error("webcodecs");
  await ensureProjectFonts(project);
  const fps = settings.fps || project.settings.fps || 30;
  const duration = projectDuration(project);
  if (duration <= 0) throw new Error("empty");
  const total = Math.max(1, Math.round(duration * fps));
  const report = (phase, p) => onProgress?.({ phase, progress: p });

  // 1. Audio: mix first, then pick how to store it.
  report("audio", 0);
  const mix = await mixTimeline(project, registry, { signal, onProgress: (p) => report("audio", p) });
  let fmt = settings.format === "webm" ? "webm" : "mp4";
  let audioCodec = mix && !forcePcm ? await pickAudioCodec(MB, fmt) : null;
  if (mix && !audioCodec) { fmt = "mov"; audioCodec = "pcm-s16"; }
  const quality = { medium: MB.QUALITY_MEDIUM, high: MB.QUALITY_HIGH, "very-high": MB.QUALITY_VERY_HIGH }[settings.quality] || MB.QUALITY_HIGH;
  // Use the chosen resolution, or the highest one below it that this device can encode.
  let frame = null, videoCodec = null, resolution = 0;
  for (const r of RESOLUTIONS.filter((x) => x <= (settings.resolution || 2160)).reverse()) {
    frame = frameSize(project, r);
    videoCodec = await MB.getFirstEncodableVideoCodec(VIDEO_CODECS[fmt === "webm" ? "webm" : "mp4"], { width: frame.w, height: frame.h, bitrate: quality });
    if (videoCodec) { resolution = r; break; }
  }
  if (!videoCodec) throw new Error("codec");
  // 2. Output
  const target = settings.writable ? new MB.StreamTarget(settings.writable, { chunked: true }) : new MB.BufferTarget();
  const fastStart = settings.writable ? false : "in-memory";
  const format = fmt === "mp4" ? new MB.Mp4OutputFormat({ fastStart }) : fmt === "mov" ? new MB.MovOutputFormat({ fastStart }) : new MB.WebMOutputFormat();
  const output = new MB.Output({ format, target });
  const canvas = document.createElement("canvas");
  const comp = new Compositor(canvas, { preserveDrawingBuffer: true });
  comp.setSize(frame.w, frame.h);
  const videoSource = new MB.CanvasSource(canvas, { codec: videoCodec, bitrate: quality, keyFrameInterval: 2, latencyMode: "quality" });
  output.addVideoTrack(videoSource, { frameRate: fps });
  let audioSource = null;
  if (mix) { audioSource = new MB.AudioBufferSource(audioCodec.startsWith("pcm") ? { codec: audioCodec } : { codec: audioCodec, bitrate: quality }); output.addAudioTrack(audioSource); }

  // 3. Plan the frames each video clip will need, in order.
  const plan = new Map();
  for (let i = 0; i < total; i++) {
    for (const item of clipsInScene(sceneAt(project, i / fps))) {
      if (item.clip.kind !== "video") continue;
      if (!plan.has(item.clip.id)) plan.set(item.clip.id, { clip: item.clip, ts: [] });
      plan.get(item.clip.id).ts.push(item.srcTime);
    }
  }
  const sources = new Map();
  const cleanup = () => { for (const s of sources.values()) s.dispose(); comp.dispose(); };

  try {
    for (const [id, { clip, ts }] of plan) {
      const entry = await registry.ensure(clip.mediaId);
      if (entry.status !== "ready") continue;
      const src = new ClipFrames(entry, ts, frame.w, frame.h);
      await src.init(MB);
      sources.set(id, src);
    }
    for (const c of Object.values(project.media)) if (c.kind === "image") await registry.ensure(c.id);

    await output.start();
    if (audioSource) {
      const chunk = 5 * mix.sampleRate;
      for (let off = 0; off < mix.length; off += chunk) {
        const len = Math.min(chunk, mix.length - off);
        const part = new AudioBuffer({ length: len, numberOfChannels: mix.numberOfChannels, sampleRate: mix.sampleRate });
        for (let c = 0; c < mix.numberOfChannels; c++) part.copyToChannel(mix.getChannelData(c).subarray(off, off + len), c);
        await audioSource.add(part);
      }
      audioSource.close();
    }

    const bg = hexToRgb(project.settings.background);
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const time = i / fps;
      const ops = sceneAt(project, time);
      const frames = new Map();
      for (const item of clipsInScene(ops)) {
        if (item.clip.kind !== "video") continue;
        const src = sources.get(item.clip.id);
        if (src) frames.set(item.clip.id, { ...(await src.next()), version: src.version });
      }
      const renderOps = toRenderOps(ops, frame, (item) => {
        const c = item.clip;
        if (c.kind === "image") {
          const e = registry.entry(c.mediaId);
          return e?.bitmap ? { key: "i:" + c.mediaId, source: e.bitmap, srcW: e.bitmap.width, srcH: e.bitmap.height, version: 1 } : null;
        }
        const f = frames.get(c.id);
        return f ? { key: "x:" + c.id, ...f } : null;
      });
      comp.render(renderOps, { time, background: bg });
      await videoSource.add(time, 1 / fps);
      if (i % 4 === 0) {
        onProgress?.({ phase: "video", progress: (i + 1) / total });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    videoSource.close();
    report("finalize", 1);
    await output.finalize();
  } catch (e) {
    try { await output.cancel(); } catch { /* ignore */ }
    cleanup();
    if (e?.name !== "AbortError" && audioSource && !audioCodec.startsWith("pcm") && !e?.audioEncoding) throw Object.assign(new Error("audio"), { audioEncoding: true, cause: e });
    throw e;
  }
  cleanup();
  const mime = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" }[fmt];
  return { blob: settings.writable ? null : new Blob([target.buffer], { type: mime }), codec: videoCodec, audioCodec: mix ? (audioCodec.startsWith("pcm") ? "pcm" : audioCodec) : null, mime, extension: fmt, resolution, width: frame.w, height: frame.h };
}
