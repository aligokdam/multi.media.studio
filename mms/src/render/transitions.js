/* Transitions between two adjacent clips on the same track.
   Each one is a mode of the transition shader in compositor.js. A transition
   is stored on the incoming clip (clip.transition = { type, duration }) and is
   centred on the cut: it starts duration/2 before and ends duration/2 after. */
import { t } from "../core/i18n.js";

export const TRANSITION_CATEGORIES = ["basic", "wipe", "motion", "stylized"];

export const TRANSITIONS = [
  { id: "cut", mode: 0, category: "basic" },
  { id: "fade", mode: 1, category: "basic" },
  { id: "dissolve", mode: 2, category: "basic" },
  { id: "flash", mode: 9, category: "basic" },
  { id: "wipe", mode: 3, category: "wipe" },
  { id: "wipe-left", mode: 10, category: "wipe" },
  { id: "wipe-up", mode: 11, category: "wipe" },
  { id: "wipe-down", mode: 12, category: "wipe" },
  { id: "diagonal", mode: 15, category: "wipe" },
  { id: "iris", mode: 13, category: "wipe" },
  { id: "clock", mode: 14, category: "wipe" },
  { id: "blinds", mode: 16, category: "wipe" },
  { id: "barn-door", mode: 17, category: "wipe" },
  { id: "slide", mode: 4, category: "motion" },
  { id: "push", mode: 5, category: "motion" },
  { id: "slide-up", mode: 18, category: "motion" },
  { id: "push-up", mode: 19, category: "motion" },
  { id: "zoom", mode: 6, category: "motion" },
  { id: "whip", mode: 21, category: "motion" },
  { id: "blur", mode: 7, category: "stylized" },
  { id: "glitch", mode: 8, category: "stylized" },
  { id: "pixelate", mode: 20, category: "stylized" },
];


export const DEFAULT_TRANSITION_DURATION = 0.8;

/* ------------------------------------------------------------ user transitions
   Imported transitions use the GL Transitions format (https://gl-transitions.com):
   GLSL that defines vec4 transition(vec2 uv) and reads getFromColor(uv),
   getToColor(uv), progress and ratio. Each one compiles to its own program. */
const custom = new Map();

export function getTransition(id) { return TRANSITIONS.find((x) => x.id === id) || custom.get(id) || null; }
export function transitionName(id) { return custom.get(id)?.name || t("tr." + id); }
export function listTransitions() { return [...TRANSITIONS, ...custom.values()]; }
export function registerTransition(def) { custom.set(def.id, Object.freeze({ ...def, mode: -1, category: "custom", custom: true })); }
export function unregisterTransition(id) { custom.delete(id); }

export const USER_TRANSITION_MAX = 32 * 1024;

/** Turns a .glsl (GL Transitions) or .json/.mmstr file into a transition definition. Throws on invalid input. */
export function parseTransitionFile(text, fileName) {
  let name = (fileName || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 40) || "Transition";
  let glsl = text;
  if (/^\s*\{/.test(text)) {
    const obj = JSON.parse(text);
    if (typeof obj.glsl !== "string") throw new Error("glsl");
    glsl = obj.glsl;
    if (typeof obj.name === "string" && obj.name.trim()) name = obj.name.trim().slice(0, 40);
  }
  if (glsl.length > USER_TRANSITION_MAX) throw new Error("size");
  if (!/vec4\s+transition\s*\(\s*vec2\s+\w+\s*\)/.test(glsl)) throw new Error("format");
  if (/#\s*(version|extension)/.test(glsl)) throw new Error("directive");
  const nm = /^\s*\/\/\s*name\s*:\s*(.+)$/im.exec(glsl);
  if (nm && !/^\s*\{/.test(text)) name = nm[1].trim().slice(0, 40);
  return { id: "u:" + Math.random().toString(36).slice(2, 10), name, glsl };
}

/** Fragment shader source for a user transition. Uniform defaults written as
    "uniform float x; // = 1.0" become constants. */
export function customTransitionBody(glsl) {
  return glsl
    .replace(/^\s*precision\s+\w+\s+float\s*;/gm, "")
    .replace(/^\s*uniform\s+(float|int|bool|vec2|vec3|vec4|ivec2)\s+(\w+)\s*;\s*\/\/\s*=\s*([^;\n]+);?.*$/gm, (_, ty, n, v) => `const ${ty} ${n} = ${ty === "float" && /^-?\d+$/.test(v.trim()) ? v.trim() + ".0" : v.trim()};`)
    .replace(/^\s*uniform\s+(float|int|bool|vec2|vec3|vec4|ivec2)\s+(\w+)\s*;.*$/gm, (_, ty, n) => `const ${ty} ${n} = ${ty}(0);`)
    .replace(/\btexture2D\b/g, "texture");
}

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
  if (uMode == 9) {
    vec4 c = p < 0.5 ? A(uv) : B(uv);
    float w = 1.0 - abs(p * 2.0 - 1.0);
    return mix(c, vec4(1.0), w * w);
  }
  if (uMode >= 10 && uMode <= 17) {
    float s = 0.06;
    float v = uv.x;
    if (uMode == 10) v = 1.0 - uv.x;
    if (uMode == 11) v = uv.y;
    if (uMode == 12) v = 1.0 - uv.y;
    if (uMode == 13) { vec2 d = (uv - 0.5) * vec2(uTexel.y / uTexel.x, 1.0); v = length(d) / length(vec2(0.5 * uTexel.y / uTexel.x, 0.5)); }
    if (uMode == 14) { v = (atan(uv.x - 0.5, uv.y - 0.5) + 3.14159265) / 6.2831853; s = 0.01; }
    if (uMode == 15) v = (uv.x + 1.0 - uv.y) * 0.5;
    if (uMode == 16) { v = fract(uv.y * 8.0); s = 0.04; }
    if (uMode == 17) v = abs(uv.x - 0.5) * 2.0;
    float edge = e * (1.0 + s);
    float m = 1.0 - smoothstep(edge - s, edge, v);
    return mix(A(uv), B(uv), m);
  }
  if (uMode == 18) {
    float o = 1.0 - e;
    return uv.y >= o ? B(vec2(uv.x, uv.y - o)) : A(uv);
  }
  if (uMode == 19) {
    return uv.y < 1.0 - e ? A(vec2(uv.x, uv.y + e)) : B(vec2(uv.x, uv.y - (1.0 - e)));
  }
  if (uMode == 20) {
    float k = sin(p * 3.14159);
    vec2 cell = uTexel * max(1.0, floor(k * 48.0));
    vec2 q = (floor(uv / cell) + 0.5) * cell;
    return mix(A(q), B(q), smoothstep(0.4, 0.6, p));
  }
  if (uMode == 21) {
    float k = sin(p * 3.14159);
    vec4 a = vec4(0.0), b = vec4(0.0);
    for (int i = 0; i < 12; i++) {
      float o = (float(i) / 11.0 - 0.5) * 0.18 * k;
      a += A(vec2(uv.x + o - e * 0.3, uv.y)); b += B(vec2(uv.x + o + (1.0 - e) * 0.3, uv.y));
    }
    return mix(a / 12.0, b / 12.0, smoothstep(0.42, 0.58, p));
  }
  return mix(A(uv), B(uv), p);
}`;
