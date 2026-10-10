/* WebGL2 compositor shared by the preview, the export and the landing page.
   Input is a list of render ops (see scene.js) whose layers carry geometry,
   color adjustments, an effect chain and a drawable source (video element,
   canvas, ImageBitmap or VideoFrame). Effects are compiled into one fragment
   shader per unique chain and cached. Transitions render both clips into
   offscreen framebuffers and mix them with the transition shader. */
import { getEffect } from "./effects.js";
import { TRANSITION_GLSL } from "./transitions.js";

const MAX_FX = 8;

const VS = `#version 300 es
in vec2 aPos;
uniform mat3 uM;
uniform float uFlip;
out vec2 vUv;
void main() {
  vec3 p = uM * vec3(aPos - 0.5, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
  vUv = vec2(aPos.x, uFlip > 0.5 ? 1.0 - aPos.y : aPos.y);
}`;

const COMMON = `
precision highp float;
precision highp int;
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 unpremul(vec4 c) { return c.a > 0.0 ? c.rgb / c.a : c.rgb; }
`;

function layerFS(chain) {
  const fns = chain.map((def, i) => def.glsl.replace(/\bFX\b/g, "fx_" + i)).join("\n");
  const calls = chain.map((_, i) => `  c = fx_${i}(uv, c, uAmt[${i}]);`).join("\n");
  return `#version 300 es
${COMMON}
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform vec2 uRes;
uniform float uTime;
uniform float uOpacity;
uniform vec4 uAdj;   // exposure (stops), brightness, contrast, saturation
uniform vec4 uAdj2;  // temperature, tint, -, -
uniform float uAmt[${MAX_FX}];
in vec2 vUv;
out vec4 outColor;
vec3 adjust(vec3 c) {
  c *= exp2(uAdj.x);
  c += uAdj.y;
  c = (c - 0.5) * uAdj.z + 0.5;
  float l = luma(c);
  c = mix(vec3(l), c, uAdj.w);
  c += vec3(uAdj2.x * 0.08, -uAdj2.y * 0.02, -uAdj2.x * 0.08);
  c.g += uAdj2.y * 0.06;
  return clamp(c, 0.0, 1.0);
}
vec4 src(vec2 uv) {
  vec4 c = texture(uTex, uv);
  return vec4(adjust(c.rgb) * c.a, c.a);
}
${fns}
void main() {
  vec2 uv = vUv;
  vec4 c = src(uv);
${calls}
  outColor = c * uOpacity;
}`;
}

const TRANSITION_FS = `#version 300 es
${COMMON}
uniform sampler2D uA;
uniform sampler2D uB;
uniform int uMode;
uniform float uP;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 outColor;
bool inside(vec2 uv) { return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0; }
vec4 A(vec2 uv) { return inside(uv) ? texture(uA, uv) : vec4(0.0); }
vec4 B(vec2 uv) { return inside(uv) ? texture(uB, uv) : vec4(0.0); }
${TRANSITION_GLSL}
void main() { outColor = transition(vUv, uP); }`;

export class Compositor {
  constructor(canvas, { preserveDrawingBuffer = false } = {}) {
    this.canvas = canvas;
    this.options = { preserveDrawingBuffer };
    this.width = canvas.width || 1;
    this.height = canvas.height || 1;
    this.frameNo = 0;
    this.lost = false;
    canvas.addEventListener?.("webglcontextlost", (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener?.("webglcontextrestored", () => { this._init(); this.lost = false; this.onRestore?.(); });
    this._init();
  }

  _init() {
    const gl = this.canvas.getContext("webgl2", {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: true, preserveDrawingBuffer: this.options.preserveDrawingBuffer,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("webgl2");
    this.gl = gl;
    this.programs = new Map();
    this.textures = new Map();
    this.fbos = [];
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.transitionProgram = this._program("__transition", TRANSITION_FS);
  }

  _compile(type, source) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error("Shader compile failed: " + log);
    }
    return s;
  }

  _program(key, fs) {
    if (this.programs.has(key)) return this.programs.get(key);
    const gl = this.gl;
    const p = gl.createProgram();
    gl.attachShader(p, this._compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, this._compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("Program link failed: " + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, "");
      u[name] = gl.getUniformLocation(p, info.name);
    }
    const prog = { p, u };
    this.programs.set(key, prog);
    return prog;
  }

  /** Program for an effect chain. Unknown or failing effects are dropped (never crash a frame). */
  _layerProgram(effects) {
    const chain = [];
    const amounts = [];
    for (const fx of effects || []) {
      if (chain.length >= MAX_FX) break;
      const def = getEffect(fx.id);
      if (!def || fx.enabled === false) continue;
      chain.push(def);
      amounts.push(Math.max(0, Math.min(1, fx.amount ?? def.defaultAmount)));
    }
    const key = chain.map((d) => d.id).join("|") || "__plain";
    if (!this.programs.has(key)) {
      try { this._program(key, layerFS(chain)); }
      catch (e) {
        console.warn("Effect chain failed to compile, rendering without it:", key, e.message);
        this.programs.set(key, this._program("__plain", layerFS([])));
      }
    }
    return { prog: this.programs.get(key), amounts };
  }

  /** Validates that an effect compiles (used when importing user effects). */
  testEffect(def) {
    const key = "__test_" + def.id;
    try { this._program(key, layerFS([def])); return true; }
    catch (e) { throw new Error(e.message); }
    finally { const p = this.programs.get(key); if (p) { this.gl.deleteProgram(p.p); this.programs.delete(key); } }
  }

  setSize(w, h) {
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.width = w; this.height = h;
  }

  _texture(layer) {
    const gl = this.gl;
    const src = layer.source;
    let entry = this.textures.get(layer.key);
    if (!entry) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      entry = { tex, version: undefined, w: 0, h: 0, used: 0 };
      this.textures.set(layer.key, entry);
    }
    entry.used = this.frameNo;
    gl.bindTexture(gl.TEXTURE_2D, entry.tex);
    const isVideo = typeof HTMLVideoElement !== "undefined" && src instanceof HTMLVideoElement;
    const needsUpload = isVideo || entry.version !== layer.version || layer.version === undefined;
    if (needsUpload && src) {
      if (isVideo && src.readyState < 2) return entry.w ? entry : null;
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        entry.version = layer.version;
        entry.w = layer.srcW; entry.h = layer.srcH;
      } catch (e) {
        console.warn("Texture upload failed", e);
        return null;
      }
    }
    return entry.w || entry.version !== undefined ? entry : null;
  }

  _fbo(i) {
    const gl = this.gl;
    let f = this.fbos[i];
    if (!f || f.w !== this.width || f.h !== this.height) {
      if (f) { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex); }
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      f = this.fbos[i] = { fb, tex, w: this.width, h: this.height };
    }
    return f;
  }

  _drawLayer(layer, time) {
    const gl = this.gl;
    const entry = this._texture(layer);
    if (!entry) return;
    const { prog, amounts } = this._layerProgram(layer.effects);
    gl.useProgram(prog.p);
    const W = this.width, H = this.height;
    const w = layer.w * W, h = layer.h * H;      // layer size is relative to the frame
    const cx = layer.cx * W, cy = layer.cy * H;
    const r = ((layer.rotation || 0) * Math.PI) / 180;
    const c = Math.cos(r), s = Math.sin(r);
    gl.uniformMatrix3fv(prog.u.uM, false, [
      (2 / W) * c * w, (-2 / H) * s * w, 0,
      (2 / W) * s * h, (2 / H) * c * h, 0,
      (2 * cx) / W, (-2 * cy) / H, 1,
    ]);
    gl.uniform1f(prog.u.uFlip, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, entry.tex);
    gl.uniform1i(prog.u.uTex, 0);
    if (prog.u.uTexel) gl.uniform2f(prog.u.uTexel, 1 / Math.max(1, w), 1 / Math.max(1, h));
    if (prog.u.uRes) gl.uniform2f(prog.u.uRes, Math.max(1, w), Math.max(1, h));
    if (prog.u.uTime) gl.uniform1f(prog.u.uTime, time || 0);
    gl.uniform1f(prog.u.uOpacity, Math.max(0, Math.min(1, layer.opacity ?? 1)));
    const a = layer.adjust || {};
    gl.uniform4f(prog.u.uAdj, (a.exposure || 0) / 50, (a.brightness || 0) / 330, 1 + (a.contrast || 0) / 100, 1 + (a.saturation || 0) / 100);
    gl.uniform4f(prog.u.uAdj2, (a.temperature || 0) / 100, (a.tint || 0) / 100, 0, 0);
    if (prog.u.uAmt) {
      const arr = new Float32Array(MAX_FX);
      amounts.forEach((v, i) => (arr[i] = v));
      gl.uniform1fv(prog.u.uAmt, arr);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  _bindTarget(fb) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb ? fb.fb : null);
    gl.viewport(0, 0, this.width, this.height);
  }

  /** Renders a list of ops: { kind: "layer", layer } | { kind: "transition", a, b, mode, p }.
      `background` is an [r,g,b] triple in 0..1. */
  render(ops, { time = 0, background = [0, 0, 0] } = {}) {
    if (this.lost) return;
    const gl = this.gl;
    this.frameNo++;
    this._bindTarget(null);
    gl.clearColor(background[0], background[1], background[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const op of ops) {
      if (op.kind === "layer") {
        this._drawLayer(op.layer, time);
      } else if (op.kind === "transition") {
        const fa = this._fbo(0), fb = this._fbo(1);
        for (const [f, l] of [[fa, op.a], [fb, op.b]]) {
          this._bindTarget(f);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          if (l) this._drawLayer(l, time);
        }
        this._bindTarget(null);
        const prog = this.transitionProgram;
        gl.useProgram(prog.p);
        gl.uniformMatrix3fv(prog.u.uM, false, [2, 0, 0, 0, 2, 0, 0, 0, 1]);
        gl.uniform1f(prog.u.uFlip, 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fa.tex); gl.uniform1i(prog.u.uA, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fb.tex); gl.uniform1i(prog.u.uB, 1);
        gl.uniform1i(prog.u.uMode, op.mode);
        gl.uniform1f(prog.u.uP, Math.max(0, Math.min(1, op.p)));
        if (prog.u.uTexel) gl.uniform2f(prog.u.uTexel, 1 / this.width, 1 / this.height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.activeTexture(gl.TEXTURE0);
      }
    }
    // Free textures that have not been used for a while (removed clips, old text).
    if (this.frameNo % 120 === 0) this.prune(240);
  }

  prune(maxAge = 240) {
    for (const [key, e] of this.textures) {
      if (this.frameNo - e.used > maxAge) { this.gl.deleteTexture(e.tex); this.textures.delete(key); }
    }
  }

  release(key) {
    const e = this.textures.get(key);
    if (e) { this.gl.deleteTexture(e.tex); this.textures.delete(key); }
  }

  dispose() {
    const gl = this.gl;
    if (!gl) return;
    for (const e of this.textures.values()) gl.deleteTexture(e.tex);
    for (const f of this.fbos) if (f) { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex); }
    for (const p of this.programs.values()) gl.deleteProgram(p.p);
    this.textures.clear(); this.programs.clear(); this.fbos = [];
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = null;
  }
}

export function webgl2Supported() {
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
}
