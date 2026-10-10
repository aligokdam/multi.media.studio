/* Transitions between two adjacent clips on the same track.
   Each one is a mode of the transition shader in compositor.js. A transition
   is stored on the incoming clip (clip.transition = { type, duration }) and is
   centred on the cut: it starts duration/2 before and ends duration/2 after. */
import { t } from "../core/i18n.js";

export const TRANSITIONS = [
  { id: "cut", mode: 0, icon: "split" },
  { id: "fade", mode: 1, icon: "fade" },
  { id: "dissolve", mode: 2, icon: "transition" },
  { id: "wipe", mode: 3, icon: "fit" },
  { id: "slide", mode: 4, icon: "forward" },
  { id: "push", mode: 5, icon: "forward" },
  { id: "zoom", mode: 6, icon: "zoomIn" },
  { id: "blur", mode: 7, icon: "sparkle" },
  { id: "glitch", mode: 8, icon: "effects" },
];

export const DEFAULT_TRANSITION_DURATION = 0.8;

export function getTransition(id) { return TRANSITIONS.find((x) => x.id === id) || null; }
export function transitionName(id) { return t("tr." + id); }

/** GLSL body for the transition pass. A(uv)/B(uv) sample the two clip layers. */
export const TRANSITION_GLSL = `
vec4 transition(vec2 uv, float p) {
  float e = p * p * (3.0 - 2.0 * p);
  if (uMode == 0) return p < 0.5 ? A(uv) : B(uv);
  if (uMode == 1) return p < 0.5 ? A(uv) * (1.0 - 2.0 * p) : B(uv) * (2.0 * p - 1.0);
  if (uMode == 2) return mix(A(uv), B(uv), e);
  if (uMode == 3) {
    float s = 0.08;
    float edge = e * (1.0 + s);
    float m = 1.0 - smoothstep(edge - s, edge, uv.x);
    return mix(A(uv), B(uv), m);
  }
  if (uMode == 4) {
    float o = 1.0 - e;
    return uv.x >= o ? B(vec2(uv.x - o, uv.y)) : A(uv);
  }
  if (uMode == 5) {
    return uv.x < 1.0 - e ? A(vec2(uv.x + e, uv.y)) : B(vec2(uv.x - (1.0 - e), uv.y));
  }
  if (uMode == 6) {
    vec2 c = uv - 0.5;
    vec4 a = A(c / (1.0 + e * 0.8) + 0.5);
    vec4 b = B(c / (0.75 + e * 0.25) + 0.5);
    return mix(a, b, smoothstep(0.25, 0.75, p));
  }
  if (uMode == 7) {
    float r = sin(p * 3.14159) * 22.0;
    vec4 a = vec4(0.0), b = vec4(0.0); float w = 0.0;
    for (int i = 0; i < 16; i++) {
      float fi = float(i);
      float ang = fi * 2.399963; float d = sqrt(fi + 0.5) / 4.0;
      vec2 o = vec2(cos(ang), sin(ang)) * d * r * uTexel;
      a += A(uv + o); b += B(uv + o); w += 1.0;
    }
    return mix(a / w, b / w, smoothstep(0.35, 0.65, p));
  }
  if (uMode == 8) {
    float k = sin(p * 3.14159);
    float tt = floor(p * 20.0);
    float blk = floor(uv.y * 14.0);
    float r = rand(vec2(blk, tt));
    vec2 u = uv + vec2((r - 0.5) * 0.2 * k * step(0.6, r), 0.0);
    bool showB = p > 0.5 ? rand(vec2(blk, tt + 7.0)) > 0.12 * k : rand(vec2(blk, tt + 3.0)) < 0.25 * k;
    float sh = 0.02 * k;
    vec4 g = showB ? B(u) : A(u);
    float rr = showB ? B(u + vec2(sh, 0.0)).r : A(u + vec2(sh, 0.0)).r;
    float bb = showB ? B(u - vec2(sh, 0.0)).b : A(u - vec2(sh, 0.0)).b;
    return vec4(rr, g.g, bb, g.a);
  }
  return mix(A(uv), B(uv), p);
}`;
