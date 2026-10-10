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

const B = (id, category, defaultAmount, glsl) => registerEffect({ id, category, defaultAmount, glsl, builtIn: true });

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

B("grain", "film", 0.5, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec2 p = floor(uv * uRes / 1.5);
  float n = rand(p + fract(uTime * 7.13) * 97.0) - 0.5;
  float l = luma(c.rgb);
  c.rgb += n * a * 0.34 * (1.0 - l * 0.55) * c.a;
  return c;
}`);

B("vhs", "retro", 0.7, `
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
}`);

B("glitch", "digital", 0.6, `
vec4 FX(vec2 uv, vec4 c, float a) {
  float tt = floor(uTime * 12.0);
  float blk = floor(uv.y * 16.0);
  float on = step(1.0 - a * 0.55, rand(vec2(blk, tt)));
  vec2 u = uv;
  u.x += (rand(vec2(tt, blk * 3.1)) - 0.5) * 0.16 * a * on;
  float sh = (0.004 + 0.022 * on) * a;
  vec4 g = src(u);
  vec4 o = vec4(src(u + vec2(sh, 0.0)).r, g.g, src(u - vec2(sh, 0.0)).b, g.a);
  float bar = step(0.988 - a * 0.03, rand(vec2(floor(uv.y * 70.0), tt)));
  o.rgb = mix(o.rgb, vec3(rand(uv + tt)) * o.a, bar * 0.6 * a);
  return o;
}`);

B("noise", "digital", 0.4, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec2 p = floor(uv * uRes);
  vec3 n = vec3(rand(p + uTime * 13.1), rand(p + uTime * 7.7 + 3.1), rand(p + uTime * 5.3 + 7.9)) - 0.5;
  c.rgb += n * a * 0.42 * c.a;
  c.rgb *= 1.0 + (rand(vec2(floor(uTime * 24.0), 1.7)) - 0.5) * 0.14 * a;
  return vec4(clamp(c.rgb, 0.0, c.a), c.a);
}`);

B("sharpen", "lens", 0.5, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec2 d = uTexel * 1.25;
  vec4 s = src(uv + vec2(d.x, 0.0)) + src(uv - vec2(d.x, 0.0)) + src(uv + vec2(0.0, d.y)) + src(uv - vec2(0.0, d.y));
  vec4 o = c + (c * 4.0 - s) * a * 1.5;
  return vec4(clamp(o.rgb, 0.0, c.a), c.a);
}`);

B("pixelate", "digital", 0.4, `
vec4 FX(vec2 uv, vec4 c, float a) {
  if (a < 0.01) return c;
  float px = mix(2.0, 72.0, a * a);
  vec2 cell = px * uTexel;
  return src((floor(uv / cell) + 0.5) * cell);
}`);

B("chromatic", "lens", 0.5, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec2 d = uv - 0.5;
  float k = a * 0.03;
  return vec4(src(uv + d * k).r, c.g, src(uv - d * k).b, c.a);
}`);

B("fade", "film", 0.6, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec3 col = unpremul(c);
  col = mix(col, col * 0.8 + 0.13, a);
  col = mix(col, vec3(luma(col)), 0.22 * a);
  col *= mix(vec3(1.0), vec3(1.04, 1.0, 0.93), a);
  return vec4(clamp(col, 0.0, 1.0) * c.a, c.a);
}`);

B("vignette", "lens", 0.6, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec2 d = uv - 0.5;
  d.x *= uRes.x / max(uRes.y, 1.0);
  float r = length(d) / length(vec2(0.5 * uRes.x / max(uRes.y, 1.0), 0.5));
  c.rgb *= 1.0 - smoothstep(0.42, 1.05, r) * a * 0.9;
  return c;
}`);

B("mono", "color", 1, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec3 col = unpremul(c);
  float l = luma(col);
  col = mix(col, vec3(smoothstep(0.02, 0.98, l)), a);
  return vec4(col * c.a, c.a);
}`);

B("sepia", "color", 0.8, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec3 col = unpremul(c);
  vec3 s = vec3(dot(col, vec3(0.393, 0.769, 0.189)), dot(col, vec3(0.349, 0.686, 0.168)), dot(col, vec3(0.272, 0.534, 0.131)));
  return vec4(clamp(mix(col, s, a), 0.0, 1.0) * c.a, c.a);
}`);

B("posterize", "color", 0.5, `
vec4 FX(vec2 uv, vec4 c, float a) {
  vec3 col = unpremul(c);
  float n = mix(14.0, 3.0, a);
  col = floor(col * n + 0.5) / n;
  return vec4(col * c.a, c.a);
}`);

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
