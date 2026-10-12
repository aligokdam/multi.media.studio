/* Photo projects: one photo or a collage, with filters, effects, adjustments,
   text and stickers. Plain JSON, stored like video projects (kind: "photo").
   Coordinates of text and stickers are fractions of the canvas (0..1, centre). */
import { uid } from "../core/util.js";
import { combineLook } from "../render/filters.js";

export const MAX_PHOTOS = 9;

/** Collage layouts. cells: [x, y, w, h] in 0..1. grid: [cols, rows] for the natural aspect. */
const L = (id, grid, cells) => ({ id, grid, cells });
const rows = (n) => Array.from({ length: n }, (_, i) => [0, i / n, 1, 1 / n]);
const cols = (n) => Array.from({ length: n }, (_, i) => [i / n, 0, 1 / n, 1]);
const grid = (c, r) => { const out = []; for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) out.push([x / c, y / r, 1 / c, 1 / r]); return out; };
export const LAYOUTS = [
  L("single", [1, 1], [[0, 0, 1, 1]]),
  L("v2", [1, 2], rows(2)), L("h2", [2, 1], cols(2)),
  L("v3", [1, 3], rows(3)), L("h3", [3, 1], cols(3)),
  L("l3", [2, 2], [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]),
  L("t3", [2, 2], [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]),
  L("g4", [2, 2], grid(2, 2)), L("v4", [1, 4], rows(4)),
  L("l4", [3, 3], [[0, 0, 2 / 3, 1], [2 / 3, 0, 1 / 3, 1 / 3], [2 / 3, 1 / 3, 1 / 3, 1 / 3], [2 / 3, 2 / 3, 1 / 3, 1 / 3]]),
  L("g5", [6, 4], [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 1 / 3, 0.5], [1 / 3, 0.5, 1 / 3, 0.5], [2 / 3, 0.5, 1 / 3, 0.5]]),
  L("g6", [2, 3], grid(2, 3)), L("g6w", [3, 2], grid(3, 2)),
  L("g9", [3, 3], grid(3, 3)),
];
export const getLayout = (id) => LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];

/** Layouts that fit a number of photos (7 and 8 use the 3 × 3 grid with free cells). */
export function layoutsFor(n) {
  const k = Math.max(1, Math.min(MAX_PHOTOS, n));
  const exact = LAYOUTS.filter((l) => l.cells.length === k);
  return exact.length ? exact : LAYOUTS.filter((l) => l.cells.length >= k).sort((a, b) => a.cells.length - b.cells.length).slice(0, 1);
}

export const ASPECT_LIST = ["original", "1:1", "4:5", "3:4", "2:3", "9:16", "16:9", "4:3", "3:2", "21:9"];
export const BACKGROUNDS = ["#ffffff", "#000000", "#f2ede4", "#1c1c1e", "#f5c6cf", "#bcd7f5", "#c9e4c5", "#ffd98a"];

/* ------------------------------------------------------------ look (filters live in render/filters.js) */
export { FILTERS, getFilter, ADJUST_KEYS } from "../render/filters.js";

/** Combined adjustments and effects for one photo. */
export function photoLook(photo) {
  return combineLook({ filter: photo.filter, adjust: photo.adjust, effects: photo.effects });
}

/* ------------------------------------------------------------ documents */
export function createPhotoDoc({ name }) {
  const now = Date.now();
  return {
    kind: "photo", version: 1, id: uid("p"), name, createdAt: now, updatedAt: now,
    aspect: "original", layout: "single",
    frame: { gap: 0, radius: 0, bg: "#ffffff" },
    align: "center",
    photos: [], items: [], media: {},
  };
}

export function createPhoto({ blobId, name, width, height }) {
  return { id: uid("ph"), blobId, name, width, height, rotate: 0, flip: false, zoom: 1, panX: 0, panY: null, filter: null, adjust: {}, effects: [] };
}

export function createTextItem(content, style) {
  return { id: uid("it"), type: "text", x: 0.5, y: 0.5, scale: 1, rotation: 0, content, style };
}

export function createStickerItem({ stickerId, blobId, width = 512, height = 512 }) {
  return { id: uid("it"), type: "sticker", x: 0.5, y: 0.5, scale: 1, rotation: 0, stickerId: stickerId || null, blobId: blobId || null, width, height };
}

/** Effective aspect (width / height). */
export function docAspect(doc) {
  if (doc.aspect && doc.aspect !== "original") { const [a, b] = doc.aspect.split(":").map(Number); return a / b; }
  const lay = getLayout(doc.layout);
  const p = doc.photos[0];
  const pa = p ? (p.rotate % 180 ? p.height / p.width : p.width / p.height) : 3 / 4;
  return pa * (lay.grid[0] / lay.grid[1]);
}

/** Output size for a long side in pixels. */
export function canvasSize(doc, longSide) {
  const a = docAspect(doc);
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  return a >= 1 ? { w: even(longSide), h: even(longSide / a) } : { w: even(longSide * a), h: even(longSide) };
}

/** Pixel rectangles of the collage cells with gap and outer border. */
export function cellRects(doc, W, H) {
  const lay = getLayout(doc.layout);
  const g = (doc.frame?.gap || 0) * Math.min(W, H);
  const iw = W - 2 * g, ih = H - 2 * g;
  return lay.cells.map(([x, y, w, h]) => {
    const l = g + x * iw + (x > 0.001 ? g / 2 : 0);
    const t = g + y * ih + (y > 0.001 ? g / 2 : 0);
    const r = g + (x + w) * iw - (x + w < 0.999 ? g / 2 : 0);
    const b = g + (y + h) * ih - (y + h < 0.999 ? g / 2 : 0);
    return { x: l, y: t, w: Math.max(1, r - l), h: Math.max(1, b - t) };
  });
}

/** Picks a layout that fits the number of photos, keeping the current one when it still fits. */
export function fitLayout(doc) {
  const options = layoutsFor(doc.photos.length);
  if (!options.some((l) => l.id === doc.layout)) doc.layout = options[0].id;
}
