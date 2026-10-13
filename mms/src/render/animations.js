/* Clip animations: an "in" animation at the start, an "out" animation at the end
   and an optional loop that runs for the whole clip. All are pure functions of
   the clip-local time, so preview and export match frame for frame. */

/** The 18 text transitions. Each one works as an "in" and as an "out" animation. */
export const TEXT_TRANSITIONS = ["fade", "rise", "drop", "slide-left", "slide-right", "zoom-in", "zoom-out", "pop", "spin", "typewriter",
  "bounce", "flip", "unfold", "stretch", "swing", "flicker", "elastic", "shake"];
export const ANIM_IN = ["none", ...TEXT_TRANSITIONS];
export const ANIM_OUT = ["none", ...TEXT_TRANSITIONS];
export const ANIM_LOOP = ["none", "kenburns", "float", "pulse", "sway"];
export const DEFAULT_ANIM_DURATION = 0.6;

const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeIn = (x) => x * x * x;
const backOut = (x) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const bounceOut = (x) => {
  const n = 7.5625, d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
};
const elasticOut = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1);
/** Raw progress (linear) is used by these types, each applies its own curve. */
const RAW = new Set(["typewriter", "bounce", "elastic", "swing", "flicker", "shake"]);

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
    case "bounce": out.dy += (1 - bounceOut(k)) * 0.18 * sign; out.opacity *= Math.min(1, k * 4); break;
    case "flip": out.sy *= Math.max(0.01, k); out.opacity *= Math.min(1, k * 2); break;
    case "unfold": out.sx *= Math.max(0.01, k); out.opacity *= Math.min(1, k * 2); break;
    case "stretch": out.sx *= 1 + (1 - k) * 0.8; out.sy *= 0.4 + 0.6 * k; out.opacity *= k; break;
    case "swing": out.rotation += Math.cos(k * Math.PI * 2.5) * (1 - k) * 22 * sign; out.opacity *= Math.min(1, k * 3); break;
    case "flicker": out.opacity *= k >= 1 ? 1 : (Math.sin(k * 61) > 0.15 - k ? k : 0.05); break;
    case "elastic": out.scale *= Math.max(0.01, elasticOut(k)); out.opacity *= Math.min(1, k * 4); break;
    case "shake": out.dx += Math.sin(k * 48) * (1 - k) * 0.035; out.opacity *= Math.min(1, k * 3); break;
  }
}

/**
 * @param clip clip with animIn/animOut/animLoop ({ type, duration })
 * @param local seconds since clip start (timeline time)
 */
export function evaluateAnimation(clip, local) {
  const out = { opacity: 1, dx: 0, dy: 0, scale: 1, sx: 1, sy: 1, rotation: 0, typeProgress: 1 };
  const d = clip.duration;
  const ai = clip.animIn, ao = clip.animOut, al = clip.animLoop;
  if (ai && ai.type && ai.type !== "none") {
    const dur = Math.min(ai.duration || DEFAULT_ANIM_DURATION, d * 0.9);
    if (local < dur) {
      const x = Math.max(0, local / dur);
      apply(ai.type, ai.type === "pop" ? backOut(x) : RAW.has(ai.type) ? x : easeOut(x), out, 1);
    }
  }
  if (ao && ao.type && ao.type !== "none") {
    const dur = Math.min(ao.duration || DEFAULT_ANIM_DURATION, d * 0.9);
    const rem = d - local;
    if (rem < dur) { const x = Math.max(0, rem / dur); apply(ao.type, RAW.has(ao.type) ? x : easeIn(x), out, -1); }
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
