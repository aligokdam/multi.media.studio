/* Runtime media registry for the open project.
   Project JSON only holds metadata; this module owns the actual data: Blobs,
   object URLs, decoded images, audio buffers, thumbnails and waveform peaks.
   Object URLs are created once per media item and revoked on dispose. */
import { Emitter, uid } from "../core/util.js";
import { LIMITS } from "../config.js";
import { putBlob, getBlob, requestPersistence } from "../storage/blobs.js";
import { loadTrack, getTrack } from "../audio/music.js";
import { loadSfx, getSfx } from "../audio/sfx.js";
import { audioBufferToWav } from "../audio/wav.js";

const EXT = {
  video: ["mp4", "m4v", "mov", "webm", "mkv", "ogv"],
  audio: ["mp3", "wav", "wave", "m4a", "aac", "ogg", "oga", "opus", "flac", "weba", "aif", "aiff", "aifc", "caf", "mka", "m4b"],
  image: ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "heic", "heif"],
};
export const ACCEPT = {
  video: "video/*," + EXT.video.map((e) => "." + e).join(","),
  audio: "audio/*," + EXT.audio.map((e) => "." + e).join(","),
  image: "image/*," + EXT.image.map((e) => "." + e).join(","),
};
ACCEPT.all = [ACCEPT.video, ACCEPT.audio, ACCEPT.image].join(",");

export function kindOf(file) {
  const type = (file.type || "").split("/")[0];
  if (type === "video" || type === "audio" || type === "image") {
    if (type === "video" && /\.(m4a|weba)$/i.test(file.name)) return "audio";
    return type;
  }
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  for (const [k, list] of Object.entries(EXT)) if (list.includes(ext)) return k;
  return null;
}

let mb = null;
export async function mediabunny() {
  if (!mb) mb = import("../../libraries/mediabunny/mediabunny.min.js");
  return mb;
}

let peaksWorker = null;
const peakJobs = new Map();
function computePeaks(id, buffer) {
  if (!peaksWorker) {
    peaksWorker = new Worker(new URL("../workers/peaks.worker.js", import.meta.url), { type: "module" });
    peaksWorker.onmessage = (e) => { peakJobs.get(e.data.id)?.(e.data); peakJobs.delete(e.data.id); };
  }
  return new Promise((resolve) => {
    peakJobs.set(id, resolve);
    const channels = [];
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) channels.push(buffer.getChannelData(c).slice());
    peaksWorker.postMessage({ id, channels, sampleRate: buffer.sampleRate, perSecond: 50 }, channels.map((c) => c.buffer));
  });
}

function withTimeout(p, ms, msg = "timeout") {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
}

function waitEvent(el, ok, ms = 15000) {
  return withTimeout(new Promise((res, rej) => {
    const done = () => { el.removeEventListener(ok, done); el.removeEventListener("error", fail); res(); };
    const fail = () => { el.removeEventListener(ok, done); el.removeEventListener("error", fail); rej(el.error || new Error("media-error")); };
    el.addEventListener(ok, done); el.addEventListener("error", fail);
  }), ms);
}

/** Reads duration, size and audio presence. Uses mediabunny's demuxers when they
    understand the container, otherwise falls back to a media element. */
async function probe(file, kind) {
  const info = { duration: NaN, width: 0, height: 0, hasAudio: kind === "audio" };
  if (kind === "image") {
    const bmp = await createImageBitmap(file);
    info.width = bmp.width; info.height = bmp.height; bmp.close?.();
    return info;
  }
  try {
    const MB = await mediabunny();
    const input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
    info.duration = await input.computeDuration();
    const vt = kind === "video" ? await input.getPrimaryVideoTrack() : null;
    const at = await input.getPrimaryAudioTrack();
    if (vt) { info.width = vt.displayWidth; info.height = vt.displayHeight; }
    info.hasAudio = !!at;
    // An MP4 or WebM file that only carries sound is treated as audio.
    if (kind === "video" && !vt && at) info.audioOnly = true;
    input.dispose?.();
  } catch { /* container not understood: element fallback below */ }
  if (!isFinite(info.duration) || info.duration <= 0 || (kind === "video" && !info.width && !info.audioOnly)) {
    const url = URL.createObjectURL(file);
    const el = document.createElement(kind === "video" ? "video" : "audio");
    el.preload = "metadata"; el.muted = true; el.src = url;
    try {
      await waitEvent(el, "loadedmetadata");
      if (!isFinite(el.duration)) { el.currentTime = 1e9; await waitEvent(el, "durationchange", 5000).catch(() => {}); }
      info.duration = el.duration;
      if (kind === "video") { info.width = el.videoWidth; info.height = el.videoHeight; }
    } finally { el.removeAttribute("src"); el.load(); URL.revokeObjectURL(url); }
  }
  if (!isFinite(info.duration) || info.duration <= 0) throw new Error("unreadable");
  return info;
}

export class MediaRegistry extends Emitter {
  constructor(store) {
    super();
    this.store = store;
    this.entries = new Map();
    this.thumbQueue = [];
    this.thumbBusy = false;
  }

  get project() { return this.store.project; }
  entry(id) { return this.entries.get(id) || null; }

  /* ---------------------------------------------------------- loading */
  /** Makes sure the data for a media item is available. Never throws: a missing
      file marks the entry "missing" so the UI can offer to relink it. */
  ensure(id) {
    const existing = this.entries.get(id);
    if (existing) return existing.ready;
    const meta = this.project.media[id];
    const entry = { id, status: "loading", url: null, blob: null, bitmap: null, buffer: null, peaks: null, thumbs: null, ready: null };
    this.entries.set(id, entry);
    entry.ready = (async () => {
      try {
        if (!meta) throw new Error("no-meta");
        if (meta.origin === "library" || meta.origin === "sfx") {
          const buf = meta.origin === "library" ? await loadTrack(meta.libraryId) : await loadSfx(meta.libraryId);
          entry.buffer = buf;
          entry.blob = audioBufferToWav(buf);
        } else {
          entry.blob = await getBlob(meta.blobId || id);
          if (!entry.blob) throw new Error("missing");
        }
        entry.url = URL.createObjectURL(entry.blob);
        if (meta.kind === "image") {
          entry.bitmap = await createImageBitmap(entry.blob, imageOptions(meta));
        }
        entry.status = "ready";
      } catch (e) {
        entry.status = e.message === "missing" || e.message === "no-meta" ? "missing" : "error";
        console.warn("Media unavailable:", id, e);
      }
      this.emit("status", { id, status: entry.status });
      if (entry.status === "ready") this.scheduleDerived(id);
      return entry;
    })();
    return entry.ready;
  }

  async ensureAll() {
    await Promise.all(Object.keys(this.project.media).map((id) => this.ensure(id)));
  }

  /* ---------------------------------------------------------- importing */
  /** Imports user files into the project. Returns { added: media[], errors: [{name, reason}] }. */
  async importFiles(files, { onProgress } = {}) {
    const added = [], errors = [];
    let i = 0;
    for (const file of files) {
      onProgress?.(i++, files.length, file.name);
      let kind = kindOf(file);
      if (!kind) { errors.push({ name: file.name, reason: "unsupported" }); continue; }
      // The same file (name, size and date) is only stored once per project.
      const dup = Object.values(this.project.media).find((m) => m.origin === "user" && m.name === file.name.slice(0, 160) && m.size === file.size && (!m.lastModified || m.lastModified === file.lastModified));
      if (dup) { added.push(dup); errors.push({ name: file.name, reason: "duplicate", soft: true }); continue; }
      if (file.size > LIMITS.maxImportBytes) { errors.push({ name: file.name, reason: "tooLarge" }); continue; }
      if (file.size === 0) { errors.push({ name: file.name, reason: "empty" }); continue; }
      let info;
      try { info = await probe(file, kind); }
      catch { errors.push({ name: file.name, reason: kind === "audio" ? "audioFormat" : "unreadable" }); continue; }
      if (info.audioOnly) kind = "audio";
      const id = uid("m");
      try { await putBlob(id, file); }
      catch (e) { errors.push({ name: file.name, reason: e?.name === "QuotaExceededError" ? "quota" : "storage" }); continue; }
      const meta = {
        id, kind, origin: "user", name: file.name.slice(0, 160), mime: file.type || "", size: file.size, lastModified: file.lastModified,
        duration: kind === "image" ? null : info.duration, width: info.width, height: info.height, hasAudio: info.hasAudio,
        addedAt: Date.now(),
      };
      this.store.update("import", (p) => { p.media[id] = meta; });
      added.push(meta);
      this.ensure(id);
    }
    if (added.length) requestPersistence();
    onProgress?.(files.length, files.length, "");
    return { added, errors };
  }

  /** Adds a built-in music track or sound effect to the project media (once). */
  async addLibrary(origin, libraryId) {
    const existing = Object.values(this.project.media).find((m) => m.origin === origin && m.libraryId === libraryId);
    if (existing) { await this.ensure(existing.id); return existing; }
    const def = origin === "library" ? getTrack(libraryId) : getSfx(libraryId);
    if (!def) throw new Error("unknown");
    const buf = origin === "library" ? await loadTrack(libraryId) : await loadSfx(libraryId);
    const id = uid("m");
    const meta = { id, kind: "audio", origin, libraryId, name: def.title, mime: "audio/wav", size: 0, duration: buf.duration, hasAudio: true, addedAt: Date.now() };
    this.store.update("library", (p) => { p.media[id] = meta; });
    await this.ensure(id);
    return meta;
  }

  /** Adds a sound from the user's own effect library (blob shared by id). */
  async addUserSound(sound) {
    const existing = Object.values(this.project.media).find((m) => m.blobId === sound.id);
    if (existing) { await this.ensure(existing.id); return existing; }
    const id = uid("m");
    const meta = { id, kind: "audio", origin: "user", blobId: sound.id, name: sound.name, mime: sound.mime, size: sound.size, duration: sound.duration, hasAudio: true, addedAt: Date.now() };
    this.store.update("library", (p) => { p.media[id] = meta; });
    await this.ensure(id);
    return meta;
  }

  /** Replaces the file behind a missing media item. */
  async relink(id, file) {
    const meta = this.project.media[id];
    if (!meta) return false;
    const kind = kindOf(file);
    if (kind !== meta.kind) throw new Error("kind");
    const info = await probe(file, kind);
    await putBlob(id, file);
    this.release(id);
    this.store.update("relink", (p) => {
      Object.assign(p.media[id], { name: file.name, size: file.size, mime: file.type, duration: kind === "image" ? null : info.duration, width: info.width, height: info.height, hasAudio: info.hasAudio, blobId: undefined });
    });
    await this.ensure(id);
    return true;
  }

  /* ---------------------------------------------------------- derived data */
  async audioBuffer(id) {
    const e = await this.ensure(id);
    if (e.status !== "ready") return null;
    if (e.buffer) return e.buffer;
    if (!e.decoding) {
      e.decoding = (async () => {
        if (e.blob.size > LIMITS.maxDecodeAudioBytes) return null;
        const ctx = new OfflineAudioContext(2, 1, 48000);
        try { return await ctx.decodeAudioData(await e.blob.arrayBuffer()); } catch { return null; }
      })();
    }
    const buf = await e.decoding;
    // Keep decoded audio only for audio files (small); video audio is decoded on demand.
    if (buf && this.project.media[id]?.kind === "audio") e.buffer = buf;
    return buf;
  }

  scheduleDerived(id) {
    const meta = this.project.media[id];
    if (!meta) return;
    if (meta.kind === "audio") this.loadPeaks(id);
    if (meta.kind === "video" || meta.kind === "image") { this.thumbQueue.push(id); this.pumpThumbs(); }
  }

  async loadPeaks(id) {
    const e = this.entries.get(id);
    if (!e || e.peaks) return;
    const buf = await this.audioBuffer(id);
    if (!buf) return;
    const res = await computePeaks(id, buf);
    e.peaks = res;
    this.emit("peaks", { id });
  }

  async pumpThumbs() {
    if (this.thumbBusy) return;
    this.thumbBusy = true;
    while (this.thumbQueue.length) {
      const id = this.thumbQueue.shift();
      try { await this.makeThumbs(id); } catch (e) { console.warn("thumbnails failed", e); }
    }
    this.thumbBusy = false;
  }

  async makeThumbs(id) {
    const e = this.entries.get(id), meta = this.project.media[id];
    if (!e || e.status !== "ready" || !meta) return;
    const H = 96;
    if (meta.kind === "image") {
      const c = document.createElement("canvas");
      c.height = H; c.width = Math.max(1, Math.round((H * e.bitmap.width) / e.bitmap.height));
      c.getContext("2d").drawImage(e.bitmap, 0, 0, c.width, c.height);
      e.thumbs = [{ t: 0, canvas: c }];
      this.emit("thumbs", { id });
      return;
    }
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.playsInline = true; v.src = e.url;
    try {
      await waitEvent(v, "loadeddata");
      const count = Math.max(4, Math.min(48, Math.round(meta.duration / 1.5)));
      const ar = (v.videoWidth || 16) / (v.videoHeight || 9);
      const thumbs = [];
      for (let i = 0; i < count; i++) {
        const tt = Math.min(meta.duration - 0.05, (meta.duration * (i + 0.5)) / count);
        v.currentTime = Math.max(0, tt);
        await waitEvent(v, "seeked", 8000);
        const c = document.createElement("canvas");
        c.height = H; c.width = Math.round(H * ar);
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        thumbs.push({ t: tt, canvas: c });
        if (i === 0 || i === count - 1 || i % 6 === 5) { e.thumbs = thumbs.slice(); this.emit("thumbs", { id }); }
      }
      e.thumbs = thumbs;
      this.emit("thumbs", { id });
    } finally {
      v.removeAttribute("src"); v.load();
    }
  }

  /** Thumbnail canvas closest to a source time. */
  thumbAt(id, t) {
    const list = this.entries.get(id)?.thumbs;
    if (!list || !list.length) return null;
    let best = list[0];
    for (const th of list) if (Math.abs(th.t - t) < Math.abs(best.t - t)) best = th;
    return best.canvas;
  }

  release(id) {
    const e = this.entries.get(id);
    if (!e) return;
    if (e.url) URL.revokeObjectURL(e.url);
    e.bitmap?.close?.();
    this.entries.delete(id);
    this.emit("released", { id });
  }

  dispose() {
    for (const id of Array.from(this.entries.keys())) this.release(id);
    this.thumbQueue = [];
  }
}

function imageOptions(meta) {
  const opts = { premultiplyAlpha: "none", colorSpaceConversion: "default" };
  const max = 4096;
  if (meta.width > max || meta.height > max) {
    const k = max / Math.max(meta.width, meta.height);
    opts.resizeWidth = Math.round(meta.width * k);
    opts.resizeHeight = Math.round(meta.height * k);
    opts.resizeQuality = "high";
  }
  return opts;
}
