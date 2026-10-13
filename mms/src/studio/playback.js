/* Preview playback engine.
   - Clock: AudioContext time while playing (keeps picture and sound together).
   - Each visible or audible clip gets its own media element, kept in sync with
     the timeline: played at the clip's speed (pitch preserved), re-seeked when it
     drifts, paused and seeked exactly while scrubbing.
   - Sound goes element → MediaElementSource → Gain (volume × fades) → master,
     so volume above 100 % and fades are sample-accurate enough for preview.
   - Elements unused for a while are torn down to free decoders and memory. */
import { audioContext } from "../audio/preview.js";
import { sceneAt, clipsInScene } from "../render/scene.js";
import { clipEnd, sourceTime } from "./model.js";
import { prefs } from "../core/prefs.js";

const DRIFT_PLAYING = 0.25;
const PRELOAD_AHEAD = 1.5;
const IDLE_TEARDOWN_MS = 8000;

export function fadeGain(clip, local) {
  let g = clip.volume ?? 1;
  if (clip.fadeIn > 0 && local < clip.fadeIn) g *= Math.max(0, local / clip.fadeIn);
  const rem = clip.duration - local;
  if (clip.fadeOut > 0 && rem < clip.fadeOut) g *= Math.max(0, rem / clip.fadeOut);
  return g;
}

export class Playback {
  constructor(store, registry, { onFrame } = {}) {
    this.store = store;
    this.registry = registry;
    this.onFrame = onFrame;
    this.ctx = audioContext();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.els = new Map();       // clipId → { el, mediaId, node, gain, used }
    this.host = document.createElement("div");
    this.host.className = "media-host";
    this.host.setAttribute("aria-hidden", "true");
    document.body.append(this.host);
    this.raf = 0;
    this.playStart = null;      // { ctxTime, perf, time }
    this.disposed = false;
    this.offs = [
      store.on("time", (d) => { if (d?.source !== "playback") this.syncPaused(); }),
      store.on("project", () => { if (!store.state.playing) this.syncPaused(); }),
      registry.on("released", ({ id }) => this.dropMedia(id)),
    ];
  }

  /* ---------------------------------------------------------- transport */
  async play() {
    const s = this.store;
    const dur = s.duration();
    if (dur <= 0) return;
    if (s.state.time >= dur - 0.02) s.setTime(0);
    if (this.ctx.state === "suspended") { try { await this.ctx.resume(); } catch { /* no audio */ } }
    this.playStart = { ctxTime: this.ctx.currentTime, perf: performance.now(), time: s.state.time };
    s.setPlaying(true);
    this.loop();
  }

  pause() {
    if (!this.store.state.playing) return;
    this.store.setPlaying(false);
    cancelAnimationFrame(this.raf);
    for (const e of this.els.values()) { e.el.pause(); this.setGain(e, 0); }
    this.syncPaused();
  }

  toggle() { this.store.state.playing ? this.pause() : this.play(); }

  clockTime() {
    const p = this.playStart;
    if (!p) return this.store.state.time;
    const elapsed = this.ctx.state === "running" ? this.ctx.currentTime - p.ctxTime : (performance.now() - p.perf) / 1000;
    return p.time + elapsed;
  }

  loop() {
    cancelAnimationFrame(this.raf);
    const step = () => {
      if (!this.store.state.playing || this.disposed) return;
      let t = this.clockTime();
      const dur = this.store.duration();
      if (t >= dur) {
        if (prefs.get("loop") && dur > 0) {
          this.store.setTime(0, "playback");
          this.playStart = { ctxTime: this.ctx.currentTime, perf: performance.now(), time: 0 };
          for (const e of this.els.values()) e.el.pause();
          t = 0;
        } else {
          this.store.setTime(dur, "playback");
          this.pause();
          return;
        }
      }
      this.store.setTime(t, "playback");
      this.sync(t, true);
      this.onFrame?.(t);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** Re-anchor the clock after a seek during playback. */
  seek(t) {
    this.store.setTime(t, "seek");
    if (this.store.state.playing) this.playStart = { ctxTime: this.ctx.currentTime, perf: performance.now(), time: this.store.state.time };
  }

  /* ---------------------------------------------------------- element sync */
  /** Clips that need an element now: visible video, audible audio/video, and
      those starting within PRELOAD_AHEAD seconds (seeked in advance). */
  wanted(t) {
    const p = this.store.project;
    const out = new Map();
    for (const item of clipsInScene(sceneAt(p, t))) {
      if (item.clip.kind === "video") out.set(item.clip.id, { clip: item.clip, track: item.track, srcTime: item.srcTime, active: true, local: item.local });
    }
    for (const track of p.tracks) {
      for (const c of track.clips) {
        if (c.kind !== "video" && c.kind !== "audio") continue;
        const end = clipEnd(c);
        if (t >= c.start && t < end) {
          const prev = out.get(c.id);
          out.set(c.id, { clip: c, track, srcTime: sourceTime(c, t, p.media[c.mediaId]), active: true, audible: true, local: t - c.start, visible: !!prev });
        } else if (c.start > t && c.start - t < PRELOAD_AHEAD && !out.has(c.id)) {
          out.set(c.id, { clip: c, track, srcTime: c.in || 0, active: false });
        }
      }
    }
    return out;
  }

  element(clip) {
    let e = this.els.get(clip.id);
    if (e && e.mediaId !== clip.mediaId) { this.destroy(clip.id); e = null; }
    if (e) return e;
    const entry = this.registry.entry(clip.mediaId);
    if (!entry || entry.status !== "ready" || !entry.url) { this.registry.ensure(clip.mediaId).then(() => this.requestSync()); return null; }
    const el = document.createElement(clip.kind === "audio" ? "audio" : "video");
    el.preload = "auto";
    el.playsInline = true;
    el.setAttribute("playsinline", "");
    el.preservesPitch = true;
    el.src = entry.url;
    el.addEventListener("seeked", () => { if (!this.store.state.playing) this.onFrame?.(this.store.state.time); });
    el.addEventListener("loadeddata", () => this.requestSync());
    this.host.append(el);
    e = { el, mediaId: clip.mediaId, node: null, gain: null, used: performance.now() };
    const meta = this.store.project.media[clip.mediaId];
    if (meta?.hasAudio !== false) {
      try {
        e.node = this.ctx.createMediaElementSource(el);
        e.gain = this.ctx.createGain();
        e.gain.gain.value = 0;
        e.node.connect(e.gain);
        e.gain.connect(this.master);
      } catch { el.muted = true; }
    } else {
      el.muted = true;
    }
    this.els.set(clip.id, e);
    return e;
  }

  setGain(e, v) {
    if (!e.gain) return;
    e.gain.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, 0.012);
  }

  sync(t, playing) {
    const wanted = this.wanted(t);
    const now = performance.now();
    for (const [id, w] of wanted) {
      const e = this.element(w.clip);
      if (!e) continue;
      e.used = now;
      const el = e.el;
      const speed = w.clip.speed || 1;
      if (Math.abs(el.playbackRate - speed) > 1e-3) el.playbackRate = speed;
      const audible = w.audible && !w.clip.muted && !w.track.muted;
      this.setGain(e, playing && audible ? fadeGain(w.clip, w.local) : 0);
      if (!w.active) {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - w.srcTime) > 0.05 && !el.seeking) el.currentTime = w.srcTime;
        continue;
      }
      if (playing) {
        if (el.readyState >= 1 && Math.abs(el.currentTime - w.srcTime) > DRIFT_PLAYING) el.currentTime = w.srcTime;
        if (el.paused) el.play().catch(() => {});
      } else {
        if (!el.paused) el.pause();
        const frame = 0.5 / (this.store.project.settings.fps || 30);
        if (el.readyState >= 1 && Math.abs(el.currentTime - w.srcTime) > frame) el.currentTime = w.srcTime;
      }
    }
    for (const [id, e] of this.els) {
      if (wanted.has(id)) continue;
      if (!e.el.paused) e.el.pause();
      this.setGain(e, 0);
      if (now - e.used > IDLE_TEARDOWN_MS) this.destroy(id);
    }
  }

  syncPaused() { if (!this.store.state.playing) { this.sync(this.store.state.time, false); this.onFrame?.(this.store.state.time); } }
  requestSync() {
    if (this.pendingSync) return;
    this.pendingSync = requestAnimationFrame(() => { this.pendingSync = 0; this.store.state.playing ? this.sync(this.store.state.time, true) : this.syncPaused(); });
  }

  /** Drawable for the compositor. */
  drawable(item) {
    const clip = item.clip;
    if (clip.kind === "image") {
      const entry = this.registry.entry(clip.mediaId);
      if (!entry?.bitmap) { if (!entry) this.registry.ensure(clip.mediaId).then(() => this.requestSync()); return null; }
      return { key: "i:" + clip.mediaId, source: entry.bitmap, srcW: entry.bitmap.width, srcH: entry.bitmap.height, version: 1 };
    }
    if (clip.kind === "video") {
      const e = this.els.get(clip.id) || this.element(clip);
      if (!e) return null;
      const el = e.el;
      return { key: "v:" + clip.id, source: el, srcW: el.videoWidth, srcH: el.videoHeight };
    }
    return null;
  }

  destroy(id) {
    const e = this.els.get(id);
    if (!e) return;
    e.el.pause();
    try { e.node?.disconnect(); e.gain?.disconnect(); } catch { /* ignore */ }
    e.el.removeAttribute("src");
    e.el.load();
    e.el.remove();
    this.els.delete(id);
  }

  dropMedia(mediaId) { for (const [id, e] of this.els) if (e.mediaId === mediaId) this.destroy(id); }

  setVolume(v) { this.master.gain.value = v; }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.offs.forEach((off) => off());
    for (const id of Array.from(this.els.keys())) this.destroy(id);
    this.host.remove();
    try { this.master.disconnect(); } catch { /* ignore */ }
  }
}
