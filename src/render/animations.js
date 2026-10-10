/* Clip animations: an "in" animation at the start, an "out" animation at the end
   and an optional loop that runs for the whole clip. All are pure functions of
   the clip-local time, so preview and export match frame for frame. */

export const ANIM_IN = ["none", "fade", "rise", "drop", "slide-left", "slide-right", "zoom-in", "zoom-out", "pop", "spin", "typewriter"];
export const ANIM_OUT = ["none", "fade", "rise", "drop", "slide-left", "slide-right", "zoom-in", "zoom-out", "spin"];
export const ANIM_LOOP = ["none", "kenburns", "float", "pulse", "sway"];
export const DEFAULT_ANIM_DURATION = 0.6;

const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeIn = (x) => x * x * x;
const backOut = (x) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

/** Applies one directional animation. `k` = 0 (hidden) … 1 (at rest). */
function apply(type, k, out, sign) {
  switch (type) {
    case "fade": out.opacity *= k; break;
    case "rise": out.dy += (1 - k) * 0.12 * sign; out.opacity *= Math.min(1, k * 1.4); break;
    case "drop": out.dy -= (1 - k) * 0.12 * sign; out.opacity *= Math.min(1, k * 1.4); break;
    case "slide-left": out.dx += (1 - k) * 0.6 * sign; out.opacity *= Math.min(1, k * 2); break;
    case "slide-right": out.dx -= (1 - k) * 0.6 * sign; out.opacity *= Math.min(1, k * 2); break;
    case "zoom-in": out.scale *= 0.6 + 0.4 * k; out.opacity *= k; break;
    case "zoom-out": out.scale *= 1.5 - 0.5 * k; out.opacity *= k; break;
    case "pop": out.scale *= Math.max(0.01, k); out.opacity *= Math.min(1, k * 3); break;
    case "spin": out.rotation += (1 - k) * -90 * sign; out.scale *= 0.5 + 0.5 * k; out.opacity *= k; break;
    case "typewriter": out.typeProgress = Math.min(out.typeProgress, k); break;
  }
}

/**
 * @param clip clip with animIn/animOut/animLoop ({ type, duration })
 * @param local seconds since clip start (timeline time)
 */
export function evaluateAnimation(clip, local) {
  const out = { opacity: 1, dx: 0, dy: 0, scale: 1, rotation: 0, typeProgress: 1 };
  const d = clip.duration;
  const ai = clip.animIn, ao = clip.animOut, al = clip.animLoop;
  if (ai && ai.type && ai.type !== "none") {
    const dur = Math.min(ai.duration || DEFAULT_ANIM_DURATION, d * 0.9);
    if (local < dur) {
      const x = Math.max(0, local / dur);
      apply(ai.type, ai.type === "pop" ? backOut(x) : ai.type === "typewriter" ? x : easeOut(x), out, 1);
    }
  }
  if (ao && ao.type && ao.type !== "none") {
    const dur = Math.min(ao.duration || DEFAULT_ANIM_DURATION, d * 0.9);
    const rem = d - local;
    if (rem < dur) apply(ao.type, easeIn(Math.max(0, rem / dur)) , out, -1);
  }
  if (al && al.type && al.type !== "none") {
    const p = d > 0 ? local / d : 0;
    switch (al.type) {
      case "kenburns": out.scale *= 1 + 0.12 * p; out.dx += 0.02 * p; out.dy -= 0.015 * p; break;
      case "float": out.dy += Math.sin(local * 2.2) * 0.012; break;
      case "pulse": out.scale *= 1 + Math.sin(local * 4) * 0.025; break;
      case "sway": out.rotation += Math.sin(local * 1.6) * 3; break;
    }
  }
  return out;
}
