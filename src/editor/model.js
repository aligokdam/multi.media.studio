/* Project data model. Plain JSON so it can be saved, diffed for undo and
   exported as-is. All times are in seconds on the timeline.

   project = {
     id, name, schema, createdAt, updatedAt,
     settings: { aspect, fps, background },
     media:    { [id]: { id, kind: video|audio|image, name, mime, size, duration,
                         width, height, hasAudio, origin: user|library|sfx, libraryId } },
     tracks:   [ { id, kind: text|video|audio, role: text|overlay|main|music|sfx,
                   muted, hidden, locked, clips: [...] } ]   // UI order, top to bottom
   }
   clip = { id, kind: video|image|audio|text, start, duration, ... } (see create*) */
import { uid, clamp } from "../core/util.js";
import { ASPECTS, LIMITS } from "../config.js";
import { defaultTextStyle, TEXT_PRESETS } from "../render/text.js";

export const SCHEMA = 1;
const EPS = 1e-4;

export function createProject({ name = "Untitled", aspect = "16:9", fps = 30 } = {}) {
  const now = Date.now();
  return {
    id: uid("p"),
    name,
    schema: SCHEMA,
    createdAt: now,
    updatedAt: now,
    settings: { aspect: ASPECTS[aspect] ? aspect : "16:9", fps, background: "#000000" },
    media: {},
    tracks: [
      createTrack("text"),
      createTrack("video", "main"),
      createTrack("audio", "music"),
      createTrack("audio", "sfx"),
    ],
  };
}

export function createTrack(kind, role) {
  return {
    id: uid("t"),
    kind,
    role: role || (kind === "text" ? "text" : kind === "video" ? "overlay" : "music"),
    muted: false,
    hidden: false,
    locked: false,
    clips: [],
  };
}

const baseVisual = () => ({
  transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  opacity: 1,
  fit: "contain",
  adjust: { exposure: 0, brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 },
  effects: [],
  animIn: { type: "none", duration: 0.6 },
  animOut: { type: "none", duration: 0.6 },
  animLoop: { type: "none" },
  transition: null,
});

export function createMediaClip(media, { start = 0, duration } = {}) {
  const kind = media.kind;
  const clip = { id: uid("c"), kind, mediaId: media.id, start, in: 0, speed: 1 };
  if (kind === "image") {
    clip.duration = duration || 5;
    Object.assign(clip, baseVisual());
  } else {
    clip.duration = Math.max(LIMITS.minClipDuration, duration || media.duration || 1);
    if (kind === "video") Object.assign(clip, baseVisual());
    clip.volume = 1;
    clip.fadeIn = 0;
    clip.fadeOut = 0;
    clip.muted = false;
  }
  return clip;
}

export function createTextClip(preset = "title", { start = 0, duration = 4, content } = {}) {
  const p = TEXT_PRESETS[preset] || TEXT_PRESETS.title;
  const clip = { id: uid("c"), kind: "text", start, duration, ...baseVisual() };
  clip.transform = { x: p.x || 0, y: p.y || 0, scale: 1, rotation: 0 };
  clip.text = { content: content ?? "", style: defaultTextStyle(preset) };
  clip.animIn = { type: preset === "subtitles" || preset === "caption" ? "fade" : "rise", duration: 0.5 };
  clip.animOut = { type: "fade", duration: 0.4 };
  return clip;
}

/* ------------------------------------------------------------ queries */
export const clipEnd = (c) => c.start + c.duration;
export const isVisual = (c) => c.kind === "video" || c.kind === "image" || c.kind === "text";
export const hasAudio = (c, media) => c.kind === "audio" || (c.kind === "video" && media?.hasAudio !== false);

export function projectDuration(p) {
  let d = 0;
  for (const tr of p.tracks) for (const c of tr.clips) d = Math.max(d, clipEnd(c));
  return d;
}

export function findClip(p, id) {
  for (const track of p.tracks) {
    const index = track.clips.findIndex((c) => c.id === id);
    if (index >= 0) return { clip: track.clips[index], track, index };
  }
  return null;
}

export const findTrack = (p, id) => p.tracks.find((t) => t.id === id) || null;
export const mainTrack = (p) => p.tracks.find((t) => t.role === "main") || p.tracks.find((t) => t.kind === "video");

/** Longest timeline duration a clip may have, given its source media. */
export function maxDuration(clip, media) {
  if (clip.kind === "video" || clip.kind === "audio") {
    if (!media || !isFinite(media.duration)) return Infinity;
    return Math.max(LIMITS.minClipDuration, (media.duration - clip.in) / (clip.speed || 1));
  }
  return 3600;
}

/** Source time (seconds into the media file) for timeline time t. */
export function sourceTime(clip, t, media) {
  let s = (clip.in || 0) + (t - clip.start) * (clip.speed || 1);
  if (media && isFinite(media.duration)) s = clamp(s, 0, Math.max(0, media.duration - 0.001));
  return Math.max(0, s);
}

/** Which kinds a track accepts. */
export function trackAccepts(track, clipKind) {
  if (track.kind === "text") return clipKind === "text";
  if (track.kind === "video") return clipKind === "video" || clipKind === "image";
  if (track.kind === "audio") return clipKind === "audio";
  return false;
}

export function frameSize(project, shortSide = 1080) {
  const [aw, ah] = ASPECTS[project.settings.aspect] || ASPECTS["16:9"];
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  return aw >= ah ? { w: even((shortSide * aw) / ah), h: even(shortSide) } : { w: even(shortSide), h: even((shortSide * ah) / aw) };
}

/* ------------------------------------------------------------ mutations (call inside store.update) */
export function sortTrack(track) { track.clips.sort((a, b) => a.start - b.start); }

/** The main track is magnetic: clips sit end to end from zero, in order. */
export function packTrack(track) {
  sortTrack(track);
  let t = 0;
  for (const c of track.clips) { c.start = t; t += c.duration; }
  // A transition needs a neighbour on the left.
  if (track.clips[0]) track.clips[0].transition = null;
}

/** Keeps tracks consistent. During a live drag overlaps are allowed (`resolve`
    false) so neighbours are not pushed around until the gesture ends. */
export function normalizeTracks(p, { resolve = true } = {}) {
  for (const tr of p.tracks) {
    if (tr.role === "main") packTrack(tr);
    else { sortTrack(tr); if (resolve) resolveOverlaps(tr); }
    for (let i = 0; i < tr.clips.length; i++) {
      const c = tr.clips[i];
      if (c.transition) {
        const prev = tr.clips[i - 1];
        if (!prev || Math.abs(clipEnd(prev) - c.start) > 0.01) c.transition = null;
      }
    }
  }
}

/** Free tracks never overlap: later clips are pushed right. */
export function resolveOverlaps(track) {
  sortTrack(track);
  for (let i = 1; i < track.clips.length; i++) {
    const prev = track.clips[i - 1], c = track.clips[i];
    if (c.start < clipEnd(prev) - EPS) c.start = clipEnd(prev);
  }
}

/** Splits clip at timeline time t. Returns the new right-hand clip, or null. */
export function splitClip(clip, t) {
  const local = t - clip.start;
  if (local < LIMITS.minClipDuration || clip.duration - local < LIMITS.minClipDuration) return null;
  const right = structuredClone(clip);
  right.id = uid("c");
  right.start = t;
  right.duration = clip.duration - local;
  if (clip.in != null) right.in = clip.in + local * (clip.speed || 1);
  right.transition = null;
  if (right.animIn) right.animIn = { ...right.animIn, type: "none" };
  if (right.fadeIn != null) right.fadeIn = 0;
  clip.duration = local;
  if (clip.animOut) clip.animOut = { ...clip.animOut, type: "none" };
  if (clip.fadeOut != null) clip.fadeOut = 0;
  return right;
}

/** Two clips can be joined back when they are consecutive pieces of one source. */
export function canJoin(a, b) {
  if (!a || !b || a.kind !== b.kind || a.kind === "text") return false;
  if (a.mediaId !== b.mediaId || (a.speed || 1) !== (b.speed || 1)) return false;
  if (Math.abs(clipEnd(a) - b.start) > 0.01) return false;
  if (a.kind === "image") return true;
  return Math.abs(a.in + a.duration * (a.speed || 1) - b.in) < 0.02;
}

/** Fills defaults so older or imported projects load safely. */
export function normalizeProject(p) {
  if (!p || typeof p !== "object") throw new Error("Invalid project");
  p.schema = SCHEMA;
  p.name = String(p.name || "Untitled").slice(0, 120);
  p.settings = Object.assign({ aspect: "16:9", fps: 30, background: "#000000" }, p.settings || {});
  if (!ASPECTS[p.settings.aspect]) p.settings.aspect = "16:9";
  p.media = p.media && typeof p.media === "object" ? p.media : {};
  if (!Array.isArray(p.tracks) || !p.tracks.length) p.tracks = createProject().tracks;
  if (!p.tracks.some((t) => t.role === "main")) p.tracks.splice(1, 0, createTrack("video", "main"));
  for (const tr of p.tracks) {
    tr.clips = Array.isArray(tr.clips) ? tr.clips.filter((c) => c && isFinite(c.start) && isFinite(c.duration) && c.duration > 0) : [];
    for (const c of tr.clips) {
      if (isVisual(c)) {
        const d = baseVisual();
        for (const k of Object.keys(d)) if (c[k] == null) c[k] = d[k];
        c.adjust = Object.assign(d.adjust, c.adjust);
        c.transform = Object.assign(d.transform, c.transform);
      }
      if (c.kind === "video" || c.kind === "audio") {
        c.in = Math.max(0, +c.in || 0); c.speed = clamp(+c.speed || 1, 0.25, 4);
        if (c.volume == null) c.volume = 1;
        c.fadeIn = +c.fadeIn || 0; c.fadeOut = +c.fadeOut || 0;
      }
      if (c.kind === "text") c.text = { content: String(c.text?.content ?? ""), style: Object.assign(defaultTextStyle(c.text?.style?.preset), c.text?.style || {}) };
    }
  }
  normalizeTracks(p);
  return p;
}
