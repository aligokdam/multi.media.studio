/* Text rendering for title clips. Text is laid out on a 2D canvas at the output
   scale and handed to the compositor as a texture. Results are cached by style,
   visible text and scale, so a static title costs one draw. */

import { fontStack, ensureFont } from "./fonts.js";

export const FONTS = {
  system: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
  serif: '"New York", "Iowan Old Style", "Palatino Linotype", Georgia, "Noto Serif", serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif',
  condensed: '"Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", "Helvetica Neue", sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  script: '"Snell Roundhand", "Segoe Script", "Brush Script MT", "Apple Chancery", cursive',
  // Arabic-script content: let the system choose a matching face.
  naskh: '"Geeza Pro", "Noto Naskh Arabic", "Segoe UI", "Tahoma", sans-serif',
};

/** Presets for new text clips. Sizes are in px for a 1080 px short side. */
export const TEXT_PRESETS = {
  title: { size: 112, weight: 800, font: "system", align: "center", y: 0, letterSpacing: -0.02, lineHeight: 1.05, bg: false, shadow: 0.35 },
  subtitle: { size: 64, weight: 600, font: "system", align: "center", y: 0, letterSpacing: -0.01, lineHeight: 1.15, bg: false, shadow: 0.3 },
  caption: { size: 40, weight: 600, font: "system", align: "start", y: 0.36, x: -0.3, letterSpacing: 0, lineHeight: 1.25, bg: true, bgOpacity: 0.62, shadow: 0 },
  subtitles: { size: 46, weight: 600, font: "system", align: "center", y: 0.4, letterSpacing: 0, lineHeight: 1.25, bg: true, bgOpacity: 0.55, shadow: 0 },
  custom: { size: 72, weight: 500, font: "serif", align: "center", y: 0, letterSpacing: 0, lineHeight: 1.2, bg: false, shadow: 0.2 },
};

export function defaultTextStyle(preset = "title") {
  const p = TEXT_PRESETS[preset] || TEXT_PRESETS.title;
  return {
    preset, font: p.font, size: p.size, weight: p.weight, italic: false, align: p.align,
    color: "#ffffff", letterSpacing: p.letterSpacing, lineHeight: p.lineHeight,
    bg: p.bg, bgColor: "#000000", bgOpacity: p.bgOpacity ?? 0.6,
    shadow: p.shadow, maxWidth: 0.86,
  };
}

const RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const cache = new Map();
const CACHE_MAX = 40;
let versionCounter = 1;
let measureCtx = null;

function fontString(style, px) {
  if (style.font && !FONTS[style.font]) ensureFont(style.font);
  const family = fontStack(style.font);
  return `${style.italic ? "italic " : ""}${style.weight || 600} ${px}px ${family}`;
}

function wrapLines(ctx, text, maxW, spacingPx) {
  const out = [];
  const measure = (s) => ctx.measureText(s).width + Math.max(0, s.length - 1) * spacingPx;
  for (const para of String(text).split("\n")) {
    const words = para.split(/(\s+)/);
    let line = "";
    for (const w of words) {
      const test = line + w;
      if (line && measure(test.trimEnd()) > maxW && w.trim()) { out.push(line.trimEnd()); line = w.trimStart(); }
      else line = test;
    }
    out.push(line.trimEnd());
  }
  return out;
}

/**
 * Renders text. `scale` is output short side / 1080. Returns
 * { canvas, width, height, version } where width/height are pixels at that scale.
 */
export function renderText(content, style, scale, frameW) {
  const text = content ?? "";
  const key = JSON.stringify([text, style, Math.round(scale * 1000), Math.round(frameW)]);
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }

  const px = Math.max(4, style.size * scale);
  const spacing = (style.letterSpacing || 0) * px;
  const rtl = RTL_RE.test(text);
  const fstyle = rtl && (style.font === "system" || style.font === "condensed") ? { ...style, font: "naskh" } : style;
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  const m = measureCtx;
  m.font = fontString(fstyle, px);
  if ("letterSpacing" in m) m.letterSpacing = "0px";
  const maxW = Math.max(px * 2, frameW * (style.maxWidth || 0.86));
  const lines = text.length ? wrapLines(m, text, maxW, spacing) : [""];
  const lh = px * (style.lineHeight || 1.2) * (rtl ? 1.25 : 1);
  let textW = 0;
  for (const l of lines) textW = Math.max(textW, m.measureText(l).width + Math.max(0, l.length - 1) * spacing);
  const padX = style.bg ? px * 0.55 : px * 0.25;
  const padY = style.bg ? px * 0.32 : px * 0.25;
  const shadowPad = (style.shadow || 0) > 0 ? px * 0.3 : 0;
  const W = Math.ceil(textW + padX * 2 + shadowPad * 2) || 2;
  const H = Math.ceil(lines.length * lh + padY * 2 + shadowPad * 2) || 2;

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.font = fontString(fstyle, px);
  if ("letterSpacing" in ctx) ctx.letterSpacing = spacing + "px";
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textBaseline = "middle";

  if (style.bg) {
    ctx.fillStyle = style.bgColor || "#000";
    ctx.globalAlpha = style.bgOpacity ?? 0.6;
    const r = Math.min(px * 0.32, (H - shadowPad * 2) / 2);
    roundRect(ctx, shadowPad, shadowPad, W - shadowPad * 2, H - shadowPad * 2, r);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if ((style.shadow || 0) > 0 && !style.bg) {
    ctx.shadowColor = `rgba(0,0,0,${Math.min(0.85, style.shadow)})`;
    ctx.shadowBlur = px * 0.18;
    ctx.shadowOffsetY = px * 0.04;
  }
  ctx.fillStyle = style.color || "#fff";
  const align = style.align === "start" ? (rtl ? "right" : "left") : style.align === "end" ? (rtl ? "left" : "right") : "center";
  ctx.textAlign = align;
  const x = align === "left" ? padX + shadowPad : align === "right" ? W - padX - shadowPad : W / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, padY + shadowPad + lh * (i + 0.5)));

  const result = { canvas, width: W, height: H, version: versionCounter++ };
  cache.set(key, result);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return result;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function clearTextCache() { cache.clear(); }
