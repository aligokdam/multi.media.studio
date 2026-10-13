/* Small previews of a look (adjustments and effects) on the procedural sample
   scene, rendered once with the real compositor and cached as data URLs.
   Used by the effect library and the filter row of the video editor. */
import { Compositor } from "./compositor.js";
import { buildLayer } from "./scene.js";

const cache = new Map();
let comp = null, sample = null;

export function lookThumb(key, { adjust = {}, effects = [] } = {}) {
  if (cache.has(key)) return cache.get(key);
  try {
    if (!comp) {
      comp = new Compositor(document.createElement("canvas"), { preserveDrawingBuffer: true });
      comp.setSize(192, 120);
      sample = drawSampleScene(Object.assign(document.createElement("canvas"), { width: 384, height: 240 }), 1.5, 2);
    }
    const clip = { transform: { x: 0, y: 0, scale: 1, rotation: 0 }, opacity: 1, fit: "cover", adjust, effects, duration: 10 };
    const layer = buildLayer({ clip, local: 1 }, { w: 192, h: 120 }, { key: "sample", source: sample, srcW: 384, srcH: 240, version: 1 });
    comp.render([{ kind: "layer", layer }], { time: 1.37 });
    const url = comp.canvas.toDataURL("image/jpeg", 0.82);
    cache.set(key, url);
    return url;
  } catch { return null; }
}

export function dropThumb(key) { cache.delete(key); }

/** The compositor and sample scene, for other thumbnail renderers (transitions). */
export function thumbContext() { lookThumb("__init__"); return { comp, sample }; }

/* ---------------------------------------------------------------- sample scene for effect and filter thumbnails */
/* A procedural sample scene (no bundled photos): a mountain lake at golden hour.
   Used for effect thumbnails, the landing page and empty states. */

export function drawSampleScene(canvas, time = 0, variant = 0) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const horizon = H * 0.62;

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  const palettes = [
    ["#1f3b73", "#e9846a", "#ffd39a"],
    ["#0e2a47", "#4f8bb8", "#cfe6f2"],
    ["#2b1846", "#c4527a", "#ffb37a"],
  ];
  const [c0, c1, c2] = palettes[variant % palettes.length];
  sky.addColorStop(0, c0);
  sky.addColorStop(0.62, c1);
  sky.addColorStop(1, c2);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon + 1);

  // Sun
  const sunX = W * (0.62 + 0.04 * Math.sin(time * 0.25)), sunY = horizon - H * (0.16 + 0.03 * Math.cos(time * 0.25));
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, H * 0.45);
  glow.addColorStop(0, "rgba(255,240,200,0.9)");
  glow.addColorStop(0.12, "rgba(255,220,160,0.55)");
  glow.addColorStop(1, "rgba(255,200,140,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, horizon);
  ctx.fillStyle = "#fff4dc";
  ctx.beginPath(); ctx.arc(sunX, sunY, H * 0.055, 0, Math.PI * 2); ctx.fill();

  // Clouds
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 0.27 + time * 0.012 * (1 + i * 0.2)) % 1.3 - 0.15) * W;
    const cy = H * (0.12 + i * 0.07);
    ctx.beginPath(); ctx.ellipse(cx, cy, W * 0.12, H * 0.022, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Mountain layers
  const ridge = (base, amp, freq, seed, color) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, horizon);
    for (let x = 0; x <= W; x += W / 80) {
      const u = x / W;
      const y = base - amp * (0.55 * Math.sin(u * freq + seed) + 0.3 * Math.sin(u * freq * 2.3 + seed * 1.7) + 0.15 * Math.sin(u * freq * 5.1 + seed * 0.3));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, horizon); ctx.closePath(); ctx.fill();
  };
  ridge(horizon - H * 0.12, H * 0.13, 5, 1.2, "rgba(92,78,120,0.85)");
  ridge(horizon - H * 0.05, H * 0.1, 7, 3.4, "rgba(56,48,84,0.95)");
  ridge(horizon, H * 0.06, 11, 0.4, "#241f3a");

  // Lake with reflection
  const water = ctx.createLinearGradient(0, horizon, 0, H);
  water.addColorStop(0, c1);
  water.addColorStop(1, "#1a1730");
  ctx.fillStyle = water;
  ctx.fillRect(0, horizon, W, H - horizon);
  ctx.globalAlpha = 0.35;
  ctx.save(); ctx.translate(0, horizon * 2); ctx.scale(1, -1);
  ctx.drawImage(canvas, 0, horizon * 0.55, W, horizon * 0.45, 0, horizon * 0.55, W, horizon * 0.45);
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,236,200,0.45)";
  ctx.lineWidth = Math.max(1, H / 300);
  for (let i = 0; i < 14; i++) {
    const y = horizon + (H - horizon) * (i / 14) + Math.sin(time * 1.3 + i) * 2;
    const len = W * (0.05 + 0.08 * (1 - i / 14));
    ctx.beginPath(); ctx.moveTo(sunX - len / 2 + Math.sin(time + i * 2) * 6, y); ctx.lineTo(sunX + len / 2, y); ctx.stroke();
  }

  // Pines
  ctx.fillStyle = "#120f1f";
  for (let i = 0; i < 9; i++) {
    const x = W * (0.02 + i * 0.045), base = horizon + H * 0.02, ht = H * (0.12 + ((i * 37) % 7) * 0.012);
    ctx.beginPath(); ctx.moveTo(x, base - ht); ctx.lineTo(x - ht * 0.22, base); ctx.lineTo(x + ht * 0.22, base); ctx.closePath(); ctx.fill();
  }
  return canvas;
}
