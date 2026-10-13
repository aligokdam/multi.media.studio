/* Scene evaluation: which clips are visible at time t, and the layer geometry
   for each. Pure functions of the project, shared by preview and export so the
   exported file matches what you saw. */
import { clipEnd, sourceTime } from "../studio/model.js";
import { evaluateAnimation } from "./animations.js";
import { combineLook } from "./filters.js";
import { getTransition } from "./transitions.js";
import { renderText } from "./text.js";

/** Returns ops from bottom to top:
    { kind: "clip", clip, track, local, srcTime }
    { kind: "transition", a: {clip, local, srcTime}, b: {...}, track, mode, p } */
export function sceneAt(project, t) {
  const ops = [];
  const visual = project.tracks.filter((tr) => tr.kind !== "audio" && !tr.hidden);
  for (let ti = visual.length - 1; ti >= 0; ti--) {
    const track = visual[ti];
    const clips = track.clips;
    let done = false;
    // Transitions first: they extend both neighbours across the cut.
    for (let i = 1; i < clips.length && !done; i++) {
      const b = clips[i];
      if (!b.transition) continue;
      const a = clips[i - 1];
      if (Math.abs(clipEnd(a) - b.start) > 0.01) continue;
      const def = getTransition(b.transition.type);
      if (!def) continue;
      const d = Math.min(b.transition.duration || 0.8, a.duration, b.duration);
      const t0 = b.start - d / 2, t1 = b.start + d / 2;
      if (t >= t0 && t < t1) {
        ops.push({
          kind: "transition", track, mode: def.mode, custom: def.custom ? def.id : null, p: (t - t0) / Math.max(1e-6, d),
          a: { clip: a, local: t - a.start, srcTime: sourceTime(a, t, project.media[a.mediaId]) },
          b: { clip: b, local: t - b.start, srcTime: sourceTime(b, t, project.media[b.mediaId]) },
        });
        done = true;
      }
    }
    if (done) continue;
    for (const c of clips) {
      if (t >= c.start && t < clipEnd(c)) {
        ops.push({ kind: "clip", clip: c, track, local: t - c.start, srcTime: sourceTime(c, t, project.media[c.mediaId]) });
        break;
      }
      if (c.start > t) break;
    }
  }
  return ops;
}

/** Every clip that appears in the given scene ops. */
export function clipsInScene(ops) {
  const out = [];
  for (const op of ops) {
    if (op.kind === "clip") out.push(op);
    else { out.push({ ...op.a, track: op.track }, { ...op.b, track: op.track }); }
  }
  return out;
}

/**
 * Builds a compositor layer for one visible clip.
 * @param item  { clip, local, srcTime }
 * @param frame { w, h } output pixels
 * @param drawable { key, source, srcW, srcH, version } or null for text
 */
export function buildLayer(item, frame, drawable) {
  const { clip, local } = item;
  const anim = evaluateAnimation(clip, local);
  let w, h, key, source, srcW, srcH, version;

  if (clip.kind === "text") {
    const style = clip.text.style;
    let content = clip.text.content || "";
    if (anim.typeProgress < 1) content = Array.from(content).slice(0, Math.round(Array.from(content).length * anim.typeProgress)).join("");
    if (!content.trim()) return null;
    const scale = Math.min(frame.w, frame.h) / 1080;
    const r = renderText(content, style, scale, frame.w);
    key = "text:" + clip.id;
    source = r.canvas; srcW = r.width; srcH = r.height; version = r.version;
    w = r.width / frame.w; h = r.height / frame.h;
  } else {
    if (!drawable || !drawable.srcW || !drawable.srcH) return null;
    ({ key, source, srcW, srcH, version } = drawable);
    const ar = srcW / srcH, fa = frame.w / frame.h;
    const cover = clip.fit === "cover";
    if ((ar > fa) !== cover) { w = 1; h = (frame.w / ar) / frame.h; }
    else { h = 1; w = (frame.h * ar) / frame.w; }
  }
  const tf = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 };
  const s = (tf.scale ?? 1) * anim.scale;
  const opacity = (clip.opacity ?? 1) * anim.opacity;
  if (opacity <= 0.001 || s <= 0.001) return null;
  return {
    key, source, srcW, srcH, version,
    w: w * s * (anim.sx ?? 1), h: h * s * (anim.sy ?? 1),
    cx: (tf.x || 0) + anim.dx,
    cy: (tf.y || 0) + anim.dy,
    rotation: (tf.rotation || 0) + anim.rotation,
    opacity,
    ...(clip.filter?.id ? (({ adjust, effects }) => ({ adjust, effects }))(combineLook(clip)) : { adjust: clip.adjust, effects: clip.effects }),
  };
}

/** Converts scene ops to compositor ops using a drawable resolver. */
export function toRenderOps(ops, frame, resolve) {
  const out = [];
  for (const op of ops) {
    if (op.kind === "clip") {
      const layer = buildLayer(op, frame, op.clip.kind === "text" ? null : resolve(op, "a"));
      if (layer) out.push({ kind: "layer", layer });
    } else {
      const a = buildLayer(op.a, frame, op.a.clip.kind === "text" ? null : resolve(op.a, "a"));
      const b = buildLayer(op.b, frame, op.b.clip.kind === "text" ? null : resolve(op.b, "b"));
      if (a || b) out.push({ kind: "transition", a, b, mode: op.mode, custom: op.custom, p: op.p });
    }
  }
  return out;
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
