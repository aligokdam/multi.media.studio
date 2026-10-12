/* Effect registry.
   An effect is a GLSL function with the signature
       vec4 FX(vec2 uv, vec4 color, float amount)
   that receives premultiplied color and returns premultiplied color.
   Available inside: src(uv) (adjusted, premultiplied sample of the layer),
   rand(vec2), luma(vec3), unpremul(vec4), uTexel (1/size), uRes (layer px),
   uTime (seconds). "FX" is renamed per effect when the shader is built, so
   any number of effects can be chained in one pass.

   Built-ins are registered below. User effects (.mmsfx files) are validated
   and registered through the same function: see importEffectFile(). */
import { t } from "../core/i18n.js";

const registry = new Map();

export function registerEffect(def) {
  if (!def || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(def.id)) throw new Error("Invalid effect id");
  if (typeof def.glsl !== "string" || !/vec4\s+FX\s*\(/.test(def.glsl)) throw new Error("Effect GLSL must define vec4 FX(vec2 uv, vec4 c, float a)");
  registry.set(def.id, Object.freeze({ category: "stylize", defaultAmount: 0.6, builtIn: false, ...def }));
}

export function getEffect(id) { return registry.get(id) || null; }
export function listEffects() { return Array.from(registry.values()); }
export function effectName(def) {
  if (!def) return "";
  if (def.builtIn) return t("fx." + def.id);
  if (typeof def.name === "object") return def.name[document.documentElement.lang] || def.name.en || def.id;
  return def.name || def.id;
}
export function unregisterEffect(id) { const d = registry.get(id); if (d && !d.builtIn) registry.delete(id); }

const VHS_GLSL = `
vec4 FX(vec2 uv, vec4 c, float a) {
  float tt = uTime;
  float line = floor(uv.y * uRes.y / 2.0);
  float jitter = (rand(vec2(line, floor(tt * 24.0))) - 0.5) * 0.004 * a;
  float band = smoothstep(0.0, 0.03, abs(fract(uv.y * 0.6 - tt * 0.11) - 0.5) - 0.44);
  vec2 u = uv + vec2(jitter + (1.0 - band) * 0.01 * a * sin(uv.y * 220.0 + tt * 30.0), 0.0);
  float sh = 0.0045 * a;
  vec4 g = src(u);
  vec3 col = vec3(src(u + vec2(sh, 0.0)).r, g.g, src(u - vec2(sh, 0.0)).b);
  vec3 soft = (src(u + vec2(uTexel.x * 2.5, 0.0)).rgb + src(u - vec2(uTexel.x * 2.5, 0.0)).rgb) * 0.5;
  col = mix(col, soft, 0.35 * a);
  float l = luma(col);
  col = mix(col, vec3(l) * vec3(1.06, 1.0, 0.9), 0.28 * a);
  col *= 1.0 - a * 0.14 * (0.5 + 0.5 * sin(uv.y * uRes.y * 3.14159));
  col += (rand(uv * uRes + tt) - 0.5) * 0.07 * a;
  col += (1.0 - band) * a * 0.07;
  return vec4(clamp(col, 0.0, 1.0) * g.a, g.a);
}`;

/* Built-in effects. Each one is real image processing on the GPU and works the
   same way on photos and on video frames (preview and export).
   Optional parameters (up to four) arrive in the vec4 P, in the order of
   `params`. Parameter values are stored on the clip or photo as
   { id, amount, params: { key: value } }. */
const B = (id, category, defaultAmount, glsl, params = [], extra = {}) => registerEffect({ id, category, defaultAmount, glsl, params, builtIn: true, ...extra });
const R = (key, min, max, def, step = 1, unit = "") => ({ key, type: "range", min, max, default: def, step, unit });
const T = (key, def = 0) => ({ key, type: "toggle", default: def });

/** Categories shown in the effect libraries, in order. "tone" effects are used by filters only. */
export const EFFECT_CATEGORIES = ["cutout", "pixel", "print", "line", "lens"];

/** Parameter values of an effect entry as a vec4 (defaults filled in). */
export function effectParams(def, fx) {
  const out = [0, 0, 0, 0];
  (def?.params || []).forEach((p, i) => { if (i < 4) { const v = fx?.params?.[p.key]; out[i] = Number.isFinite(v) ? v : p.default; } });
  return out;
}

/* ---------------------------------------------------- cutout and poster */
B("cutout", "cutout", 1, `
vec4 FX(vec2 uv, vec4 c, float a) {
  // Smooth the image so shapes become flat areas, then cut the brightness into
  // a few levels while keeping each area's own colour, and ink the boundaries.
  float r = P.y;
  vec3 acc = vec3(0.0); float w = 0.0;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    vec2 o = vec2(float(x), float(y)) * r * uTexel;
    vec4 s = src(uv + o);
    float k = 1.0 / (1.0 + float(x * x + y * y));
    acc += unpremul(s) * k; w += k;
  }
  vec3 col = acc / w;
  float n = max(2.0, P.x);
  float l = luma(col);
  float q = floor(l * n) / (n - 1.0);
  q = clamp(q, 0.0, 1.0);
  vec3 hue = col / max(l, 0.04);
  vec3 flt = clamp(hue * mix(0.12, 1.0, q) * (0.85 + 0.15 * q), 0.0, 1.0);
  flt = floor(flt * (n + 1.0)) / (n + 1.0);
  float e = 0.0;
  if (P.z > 0.001) {
    vec2 d = uTexel * max(1.0, r);
    float lx = luma(unpremul(src(uv + vec2(d.x, 0.0)))) - luma(unpremul(src(uv - vec2(d.x, 0.0))));
    float ly = luma(unpremul(src(uv + vec2(0.0, d.y)))) - luma(unpremul(src(uv - vec2(0.0, d.y))));
    e = smoothstep(0.18, 0.42, length(vec2(lx, ly))) * P.z;
  }
  flt *= 1.0 - e;
  vec3 o = mix(unpremul(c), flt, a);
  return vec4(o * c.a, c.a);
}`, [R("levels", 2, 8, 4), R("smooth", 0, 4, 2, 0.5, "px"), R("edges", 0, 1, 0.35, 0.05)]);

B("posterize", "cutout", 1, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec3 col = unpremul(c);
  float n = max(2.0, P.x);
  vec3 g = pow(max(col, 0.0), vec3(1.0 / max(0.2, P.y)));
  vec3 q = floor(g * (n - 1.0) + 0.5) / (n - 1.0);
  q = pow(q, vec3(max(0.2, P.y)));
  return vec4(mix(col, q, a) * c.a, c.a);
}`, [R("levels", 2, 16, 5), R("gamma", 0.5, 2, 1, 0.05)]);

B("threshold", "cutout", 1, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec3 col = unpremul(c);
  float l = luma(col);
  float s = max(0.002, P.y);
  float v = smoothstep(P.x - s, P.x + s, l);
  if (P.z > 0.5) v = 1.0 - v;
  return vec4(mix(col, vec3(v), a) * c.a, c.a);
}`, [R("level", 0.05, 0.95, 0.5, 0.01), R("softness", 0, 0.3, 0.02, 0.01), T("invert")]);

/* ---------------------------------------------------- pixel and digital */
B("pixelate", "pixel", 1, `
vec4 FX(vec2 uv, vec4 c, float a) {
  float px = max(1.0, P.x);
  vec2 cell = px * uTexel;
  vec4 p = src((floor(uv / cell) + 0.5) * cell);
  return mix(c, p, a);
}`, [R("size", 2, 96, 12, 1, "px")]);

B("glitch", "pixel", 0.6, `
vec4 FX(vec2 uv, vec4 c, float a) {
  float tt = floor(uTime * 12.0);
  float blk = floor(uv.y * max(2.0, P.x));
  float on = step(1.0 - a * 0.55, rand(vec2(blk, tt)));
  vec2 u = uv;
  u.x += (rand(vec2(tt, blk * 3.1)) - 0.5) * 0.32 * P.y * a * on;
  float sh = (0.004 + 0.022 * on) * a;
  vec4 g = src(u);
  vec4 o = vec4(src(u + vec2(sh, 0.0)).r, g.g, src(u - vec2(sh, 0.0)).b, g.a);
  float bar = step(0.988 - a * 0.03, rand(vec2(floor(uv.y * 70.0), tt)));
  o.rgb = mix(o.rgb, vec3(rand(uv + tt)) * o.a, bar * 0.6 * a);
  return o;
}`, [R("blocks", 4, 40, 16), R("shift", 0, 1, 0.5, 0.05)]);

B("rgb-split", "pixel", 1, `
vec4 FX(vec2 uv, vec4 c, float a) {
  float ang = radians(P.y);
  vec2 d = vec2(cos(ang), sin(ang)) * P.x * uTexel * a;
  vec4 r = src(uv + d), b = src(uv - d);
  return vec4(r.r, c.g, b.b, max(c.a, max(r.a, b.a)));
}`, [R("offset", 0, 40, 8, 1, "px"), R("angle", 0, 360, 0, 5, "°")]);

B("noise", "pixel", 0.4, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec2 p = floor(uv * uRes);
  vec3 n = vec3(rand(p + uTime * 13.1), rand(p + uTime * 7.7 + 3.1), rand(p + uTime * 5.3 + 7.9)) - 0.5;
  c.rgb += n * a * 0.42 * c.a;
  c.rgb *= 1.0 + (rand(vec2(floor(uTime * 24.0), 1.7)) - 0.5) * 0.14 * a;
  return vec4(clamp(c.rgb, 0.0, c.a), c.a);
}`);

/* ---------------------------------------------------- print and texture */
B("halftone", "print", 1, `
vec4 FX(vec2 uv, vec4 c, float a) {
  // Rotated dot screen: each cell takes the colour at its centre and draws a
  // dot whose area matches the ink coverage.
  float size = max(2.0, P.x);
  float ang = radians(P.y);
  mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 px = uv * uRes;
  vec2 rp = rot * px;
  vec2 cellC = (floor(rp / size) + 0.5) * size;
  vec2 centre = transpose(rot) * cellC;
  vec3 col = unpremul(src(centre / uRes));
  float ink = 1.0 - luma(col);
  float rad = sqrt(clamp(ink, 0.0, 1.0)) * size * 0.62;
  float d = length(rp - cellC);
  float dotm = 1.0 - smoothstep(rad - 0.9, rad + 0.9, d);
  vec3 paper = vec3(0.97, 0.955, 0.93);
  vec3 dotCol = P.z > 0.5 ? clamp(col / max(1.0 - ink * 0.6, 0.2), 0.0, 1.0) * 0.85 : vec3(0.08);
  vec3 o = mix(paper, dotCol, dotm);
  return vec4(mix(unpremul(c), o, a) * c.a, c.a);
}`, [R("size", 3, 40, 10, 1, "px"), R("angle", 0, 90, 45, 5, "°"), T("color")]);

B("print", "print", 0.7, `
vec4 FX(vec2 uv, vec4 c, float a) {
  // Worn print: slightly misregistered ink, paper fibres and missing ink.
  vec2 off = P.y * uTexel;
  vec3 col = vec3(unpremul(src(uv + off)).r, unpremul(c).g, unpremul(src(uv - off)).b);
  vec2 g = floor(uv * uRes / max(1.0, P.z));
  float fib = rand(g) * 0.6 + rand(floor(g / 7.0)) * 0.4;
  float wear = smoothstep(1.0 - P.x * 0.5, 1.0, rand(floor(uv * uRes / (2.5 * max(1.0, P.z)))) * 0.7 + fib * 0.3);
  vec3 paper = vec3(0.96, 0.93, 0.86);
  col = mix(col, col * vec3(1.04, 1.0, 0.9), 0.5);
  col = mix(col, paper, wear * 0.85);
  col *= 0.92 + fib * 0.1;
  return vec4(mix(unpremul(c), clamp(col, 0.0, 1.0), a) * c.a, c.a);
}`, [R("wear", 0, 1, 0.5, 0.05), R("offset", 0, 6, 2, 0.5, "px"), R("grain", 1, 4, 2, 0.5)]);

B("grain", "print", 0.5, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec2 p = floor(uv * uRes / max(1.0, P.x));
  float n = rand(p + fract(uTime * 7.13) * 97.0) - 0.5;
  float l = luma(c.rgb);
  c.rgb += n * a * 0.34 * (1.0 - l * 0.55) * c.a;
  return c;
}`, [R("size", 1, 4, 1.5, 0.5)]);

/* ---------------------------------------------------- edges and drawing */
B("edges", "line", 1, `
vec4 FX(vec2 uv, vec4 c, float a) {
  // Sobel edges on brightness, drawn as ink over the image or on white paper.
  vec2 d = uTexel * max(0.5, P.x);
  float tl = luma(unpremul(src(uv + vec2(-d.x, -d.y)))), t = luma(unpremul(src(uv + vec2(0.0, -d.y)))), tr = luma(unpremul(src(uv + vec2(d.x, -d.y))));
  float l = luma(unpremul(src(uv + vec2(-d.x, 0.0)))), r = luma(unpremul(src(uv + vec2(d.x, 0.0))));
  float bl = luma(unpremul(src(uv + vec2(-d.x, d.y)))), b = luma(unpremul(src(uv + vec2(0.0, d.y)))), br = luma(unpremul(src(uv + vec2(d.x, d.y))));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float e = smoothstep(P.y, P.y + 0.25, length(vec2(gx, gy)));
  vec3 base = P.z > 0.5 ? vec3(1.0) : unpremul(c);
  vec3 o = base * (1.0 - e);
  return vec4(mix(unpremul(c), o, a) * c.a, c.a);
}`, [R("thickness", 0.5, 4, 1.2, 0.1, "px"), R("threshold", 0, 1, 0.25, 0.01), T("paper")]);

B("emboss", "line", 0.7, `
vec4 FX(vec2 uv, vec4 c, float a) {
  float ang = radians(P.x);
  vec2 d = vec2(cos(ang), sin(ang)) * uTexel * 1.5;
  float h = luma(unpremul(src(uv - d))) - luma(unpremul(src(uv + d)));
  vec3 relief = vec3(0.5 + h * 2.2);
  vec3 o = mix(unpremul(c), relief * mix(vec3(1.0), unpremul(c) * 1.4, 0.35), a);
  return vec4(clamp(o, 0.0, 1.0) * c.a, c.a);
}`, [R("angle", 0, 360, 135, 5, "°")]);

/* ---------------------------------------------------- lens and light */
B("blur", "lens", 0.5, `
vec4 FX(vec2 uv, vec4 c, float a) {
  float r = a * 18.0;
  if (r < 0.05) return c;
  vec4 acc = c; float w = 1.0;
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float ang = fi * 2.399963;
    float d = sqrt(fi + 0.5) / 4.9;
    vec2 o = vec2(cos(ang), sin(ang)) * d * r * uTexel;
    float k = 1.0 - d * 0.55;
    acc += src(uv + o) * k; w += k;
  }
  return acc / w;
}`);

B("sharpen", "lens", 0.5, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec2 d = uTexel * 1.25;
  vec4 s = src(uv + vec2(d.x, 0.0)) + src(uv - vec2(d.x, 0.0)) + src(uv + vec2(0.0, d.y)) + src(uv - vec2(0.0, d.y));
  vec4 o = c + (c * 4.0 - s) * a * 1.5;
  return vec4(clamp(o.rgb, 0.0, c.a), c.a);
}`);

B("chromatic", "lens", 0.5, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec2 d = uv - 0.5;
  float k = a * 0.03;
  return vec4(src(uv + d * k).r, c.g, src(uv - d * k).b, c.a);
}`);

B("vignette", "lens", 0.6, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec2 d = uv - 0.5;
  d.x *= uRes.x / max(uRes.y, 1.0);
  float r = length(d) / length(vec2(0.5 * uRes.x / max(uRes.y, 1.0), 0.5));
  c.rgb *= 1.0 - smoothstep(0.42, 1.05, r) * a * 0.9;
  return c;
}`);

B("vhs", "print", 0.7, VHS_GLSL);

/* ---------------------------------------------------- tone (used by filters, not listed as effects) */
B("mono", "tone", 1, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec3 col = unpremul(c);
  float l = luma(col);
  col = mix(col, vec3(smoothstep(0.02, 0.98, l)), a);
  return vec4(col * c.a, c.a);
}`);

B("sepia", "tone", 0.8, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec3 col = unpremul(c);
  vec3 s = vec3(dot(col, vec3(0.393, 0.769, 0.189)), dot(col, vec3(0.349, 0.686, 0.168)), dot(col, vec3(0.272, 0.534, 0.131)));
  return vec4(clamp(mix(col, s, a), 0.0, 1.0) * c.a, c.a);
}`);

B("fade", "tone", 0.6, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec3 col = unpremul(c);
  col = mix(col, col * 0.8 + 0.13, a);
  col = mix(col, vec3(luma(col)), 0.22 * a);
  col *= mix(vec3(1.0), vec3(1.04, 1.0, 0.93), a);
  return vec4(clamp(col, 0.0, 1.0) * c.a, c.a);
}`);

/** Effects for the libraries (tone effects are reached through filters). */
export function libraryEffects() { return listEffects().filter((d) => d.category !== "tone"); }

/* ------------------------------------------------------------- user effects */
/** Validates a parsed .mmsfx object and registers it. Returns the definition.
    Format: { "format": "mms-effect", "version": 1, "id": "...", "name": "..." | {lang: "..."},
              "defaultAmount": 0.5, "glsl": "vec4 FX(vec2 uv, vec4 c, float a) { ... }" } */
export function validateEffectFile(obj) {
  if (!obj || obj.format !== "mms-effect" || obj.version !== 1) throw new Error("format");
  const id = "user-" + String(obj.id || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32);
  if (id.length < 7) throw new Error("id");
  if (typeof obj.glsl !== "string" || obj.glsl.length > 20000) throw new Error("glsl");
  // Shaders run on the GPU sandbox; still, keep the source to one function body
  // so it cannot redeclare uniforms or main().
  if (/\b(void\s+main|uniform|#\s*(version|extension))\b/.test(obj.glsl)) throw new Error("glsl");
  const name = typeof obj.name === "string" ? obj.name.slice(0, 40) : (obj.name && typeof obj.name === "object" ? obj.name : id);
  const amt = Number(obj.defaultAmount);
  return { id, name, glsl: obj.glsl, defaultAmount: isFinite(amt) ? Math.min(1, Math.max(0, amt)) : 0.6, category: "custom", builtIn: false };
}
