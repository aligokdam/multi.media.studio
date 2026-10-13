/* Sticker library.
   Built-in emoji stickers drawn for this app as SVG (original artwork,
   released under CC0 1.0 with the rest of the built-in library). A sticker is
   rasterised to a 512 px PNG on the device and added to the project as a
   normal image clip on an overlay track, so it can be moved, scaled, animated
   and exported like any photo. Users can add their own PNG, JPEG, WebP, GIF,
   AVIF or SVG stickers; those are kept on this device only. */
import { putBlob, getBlob, deleteBlob } from "../storage/db.js";
import { kvGet, kvSet } from "../storage/db.js";
import { uid } from "../core/util.js";

/* Drawing style: classic flat emoji. No outlines: a yellow face with a darker
   crescent along the bottom, brown features, white teeth and red tongues and
   hearts with one lighter highlight. Every sticker is original artwork (CC0). */
const FACE = "#FFCC33", SHADE = "#F2A900", DARK = "#5A3B22", RED = "#E8414F", RED2 = "#C92C3C", PINK = "#FF8A80", BLUE = "#4FB3F2", WHITE = "#FFFFFF";
const stroke = (d, w = 5, c = DARK) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill = (d, c) => `<path d="${d}" fill="${c}"/>`;
/** Round face: base colour plus a shade crescent along the bottom edge. */
const face = (features, { cx = 64, cy = 64, r = 52, before = "" } = {}) =>
  before + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${FACE}"/>` +
  fill(`M${cx - r} ${cy}A${r} ${r} 0 0 0 ${cx + r} ${cy}A${r} ${r * 0.8} 0 0 1 ${cx - r} ${cy}z`, SHADE) + features;
const eyes = (y = 52, dx = 17, rx = 5.5, ry = 8.5) => `<ellipse cx="${64 - dx}" cy="${y}" rx="${rx}" ry="${ry}" fill="${DARK}"/><ellipse cx="${64 + dx}" cy="${y}" rx="${rx}" ry="${ry}" fill="${DARK}"/>`;
const happyEyes = (y = 56) => stroke(`M38 ${y}q9-11 18 0M72 ${y}q9-11 18 0`);
const shutEyes = (y = 54) => stroke(`M38 ${y}q9 8 18 0M72 ${y}q9 8 18 0`);
const cheeks = (y = 72, o = 0.55) => `<ellipse cx="32" cy="${y}" rx="9" ry="6" fill="${PINK}" opacity="${o}"/><ellipse cx="96" cy="${y}" rx="9" ry="6" fill="${PINK}" opacity="${o}"/>`;
const smile = (y = 76, w = 22, d = 18) => stroke(`M${64 - w} ${y}q${w} ${d} ${w * 2} 0`);
/** Open laughing mouth: dark mouth, a band of upper teeth and a tongue. */
const laughMouth = (y = 70, w = 28, d = 28) =>
  `<path d="M${64 - w} ${y}h${w * 2}q0 ${d}-${w} ${d}t-${w}-${d}z" fill="${DARK}"/>` +
  `<path d="M${64 - w + 3} ${y}h${w * 2 - 6}q-1 6-4 7h${-(w * 2 - 14)}q-3-1-4-7z" fill="${WHITE}"/>` +
  `<path d="M${64 - w * 0.5} ${y + d * 0.82}q${w * 0.5}-${d * 0.36} ${w} 0q-${w * 0.18} ${d * 0.16}-${w * 0.5} ${d * 0.16}t-${w * 0.5}-${d * 0.16}z" fill="${RED}"/>`;
const heartPath = (x, y, k = 1) => `M${x} ${y + 26 * k}s${-24 * k}-${14 * k}-${24 * k}-${30 * k}a${12 * k} ${12 * k} 0 0 1 ${24 * k}-${5 * k}a${12 * k} ${12 * k} 0 0 1 ${24 * k} ${5 * k}c0 ${16 * k}-${24 * k} ${30 * k}-${24 * k} ${30 * k}z`;
const smallHeart = (x, y, k) => fill(heartPath(x, y, k), RED) + `<ellipse cx="${x - 13 * k}" cy="${y - 4 * k}" rx="${4 * k}" ry="${2.6 * k}" fill="#fff" opacity=".55" transform="rotate(-30 ${x - 13 * k} ${y - 4 * k})"/>`;
const drop = (x, y, s = 1) => `<path d="M${x} ${y}q${-11 * s} ${15 * s}-${11 * s} ${22 * s}a${11 * s} ${11 * s} 0 0 0 ${22 * s} 0q0-${7 * s}-${11 * s}-${22 * s}z" fill="${BLUE}"/><ellipse cx="${x - 4 * s}" cy="${y + 22 * s}" rx="${2.5 * s}" ry="${4 * s}" fill="#fff" opacity=".6"/>`;
const star5 = (cx, cy, R, c) => {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? R * 0.45 : R; pts.push((cx + Math.cos(a) * rr).toFixed(1) + " " + (cy + Math.sin(a) * rr).toFixed(1)); }
  return `<path d="M${pts.join("L")}z" fill="${c}" stroke="${c}" stroke-width="${R * 0.12}" stroke-linejoin="round"/>`;
};

/** id → { svg } (viewBox 0 0 128 128). */
export const STICKERS = [
  { id: "smile", svg: face(eyes() + smile(76, 22, 18) + cheeks()) },
  { id: "laugh", svg: face(stroke("M37 46l14 8-14 8M91 46l-14 8 14 8") + laughMouth(70, 30, 30) + drop(20, 54, 0.9) + drop(108, 54, 0.9)) },
  { id: "heart-eyes", svg: face(smallHeart(47, 50, 0.62) + smallHeart(81, 50, 0.62) + laughMouth(74, 22, 22)) },
  { id: "wow", svg: face(eyes(50, 17, 6, 9.5) + stroke("M36 34q8-6 16-3M76 31q8-3 16 3", 4) + `<ellipse cx="64" cy="88" rx="10" ry="13" fill="${DARK}"/>`) },
  { id: "cool", svg: face(fill("M24 44h80v7l-3 2q-2 17-18 17q-14 0-16-14h-6q-2 14-16 14q-16 0-18-17l-3-2z", "#222") +
    stroke("M33 51q9-4 18 0M77 51q9-4 18 0", 3, "#fff") + stroke("M46 86q18 12 36-4")) },
  { id: "wink", svg: face(`<ellipse cx="47" cy="52" rx="5.5" ry="8.5" fill="${DARK}"/>` + stroke("M72 54q9-8 18 0") + smile(76, 22, 18) + cheeks()) },
  { id: "heart", svg: fill("M64 114S10 82 10 44a27 27 0 0 1 54-8a27 27 0 0 1 54 8c0 38-54 70-54 70z", RED) +
    fill("M64 114c22-13 54-38 54-70a27 27 0 0 0-23-27c14 8 18 30 6 50c-9 16-26 32-37 47z", RED2) +
    `<ellipse cx="34" cy="40" rx="11" ry="7" fill="#fff" opacity=".45" transform="rotate(-35 34 40)"/>` },
  { id: "fire", svg: fill("M64 122c-27 0-46-19-46-44c0-23 15-33 21-52c6 9 8 18 7 26c12-13 17-32 13-50c26 15 49 41 49 74c0 27-18 46-44 46z", "#F4511E") +
    fill("M64 120c-20 0-34-14-34-33c0-17 11-26 15-40c5 8 6 15 5 22c9-9 13-23 10-37c19 12 36 31 36 56c0 19-13 32-32 32z", "#FB8C00") +
    fill("M64 118c-12 0-21-9-21-21c0-12 9-19 13-31c4 7 5 13 4 19c7-5 10-14 9-23c11 9 17 21 17 34c0 13-10 22-22 22z", "#FFC107") +
    fill("M64 116c-6 0-11-5-11-11c0-7 5-11 8-18c2 4 3 8 2 11c4-3 6-7 6-12c5 5 7 11 7 18c0 7-5 12-12 12z", "#FFE57F") },
  { id: "star", svg: star5(64, 66, 54, FACE) + fill("M64 66L115 49 90 72 98 108z", SHADE) },

  /* More smiling faces */
  { id: "grin", svg: face(eyes(50) + `<path d="M34 70h60q-2 26-30 26t-30-26z" fill="${DARK}"/><path d="M38 72h52q-1 9-4 11H42q-3-2-4-11z" fill="${WHITE}"/>`) },
  { id: "beam", svg: face(happyEyes(54) + laughMouth(68, 30, 30) + cheeks(66)) },
  { id: "blush", svg: face(shutEyes(54) + smile(80, 16, 12) + cheeks(70, 0.85)) },
  { id: "kiss", svg: face(shutEyes(52) + stroke("M58 74q10-4 8 4q-3 3-8 3q8 1 8 6q-2 7-10 4", 4.5) + smallHeart(100, 80, 0.45)) },
  { id: "tongue", svg: face(eyes(50) + smile(74, 26, 18) + `<path d="M53 82h22v10a11 11 0 0 1-22 0z" fill="${RED}"/><path d="M64 85v10" stroke="${RED2}" stroke-width="2.5" stroke-linecap="round"/>`) },
  { id: "star-eyes", svg: face(star5(47, 50, 13, RED) + star5(81, 50, 13, RED) + laughMouth(72, 24, 24)) },
  { id: "party", svg: face(happyEyes(60) + laughMouth(74, 22, 22), { cy: 68, r: 50 }) +
    fill("M74 24l30-18 6 34z", BLUE) + stroke("M84 20l6 6M94 13l7 6M90 32l14-3", 3.5, "#fff") + `<circle cx="104" cy="7" r="5.5" fill="${RED}"/>` +
    `<circle cx="16" cy="34" r="4" fill="${RED}"/><circle cx="26" cy="18" r="3.5" fill="${BLUE}"/><rect x="8" y="50" width="8" height="8" rx="2" fill="#4CAF50" transform="rotate(20 12 54)"/><rect x="112" y="60" width="7" height="7" rx="2" fill="#FFB300" transform="rotate(30 115 63)"/>` },
  { id: "angel", svg: face(happyEyes(66) + smile(86, 18, 14) + cheeks(80), { cy: 72, r: 48 }) +
    `<ellipse cx="64" cy="16" rx="32" ry="9" fill="none" stroke="#8ED6F5" stroke-width="7"/>` },
  { id: "sweat-smile", svg: face(happyEyes(54) + `<path d="M36 70h56q-2 26-28 26t-28-26z" fill="${DARK}"/><path d="M40 72h48q-1 9-4 11H44q-3-2-4-11z" fill="${WHITE}"/>`) + drop(100, 14, 1.1) },
];

export const STICKER_EXT = ["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"];
export const STICKER_MAX = 20 * 1024 * 1024;

export function stickerSvg(s, size = 128) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}">${s.svg}</svg>`;
}

export function stickerDataUrl(s) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(stickerSvg(s));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

async function rasterize(src, size = 512) {
  const img = await loadImage(src);
  const c = document.createElement("canvas");
  const k = size / Math.max(img.naturalWidth || size, img.naturalHeight || size);
  c.width = Math.max(1, Math.round((img.naturalWidth || size) * k));
  c.height = Math.max(1, Math.round((img.naturalHeight || size) * k));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));
}

/** A PNG File for a built-in sticker. The fixed name, size and date let the
    project reuse the same media when a sticker is added twice. */
export async function builtInStickerFile(id) {
  const s = STICKERS.find((x) => x.id === id);
  const blob = await rasterize(stickerDataUrl(s));
  return new File([blob], `sticker-${id}.png`, { type: "image/png", lastModified: 1 });
}

/* ------------------------------------------------------------ user stickers */
export async function userStickers() { return (await kvGet("userStickers", [])) || []; }

/**
 * Imports sticker images. SVG files are rasterised to PNG first.
 * Returns { added: [entry], errors: [{ name, reason }] } with reason
 * unsupported | tooLarge | unreadable | duplicate | storage.
 */
export async function importStickers(files) {
  const list = await userStickers();
  const added = [], errors = [];
  for (const f of files) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!STICKER_EXT.includes(ext) && !/^image\//.test(f.type)) { errors.push({ name: f.name, reason: "unsupported" }); continue; }
    if (f.size > STICKER_MAX) { errors.push({ name: f.name, reason: "tooLarge" }); continue; }
    const name = f.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Sticker";
    if (list.some((x) => x.name === name && x.srcSize === f.size)) { errors.push({ name: f.name, reason: "duplicate" }); continue; }
    let blob = f, width = 0, height = 0;
    try {
      if (ext === "svg" || f.type === "image/svg+xml") {
        const url = URL.createObjectURL(f);
        try { blob = await rasterize(url, 1024); } finally { URL.revokeObjectURL(url); }
      }
      const bmp = await createImageBitmap(blob);
      width = bmp.width; height = bmp.height; bmp.close?.();
    } catch { errors.push({ name: f.name, reason: "unreadable" }); continue; }
    const id = uid("st");
    try { await putBlob(id, blob); } catch { errors.push({ name: f.name, reason: "storage" }); continue; }
    const entry = { id, name, type: blob.type || f.type, size: blob.size, srcSize: f.size, width, height, addedAt: Date.now() };
    list.push(entry);
    added.push(entry);
  }
  await kvSet("userStickers", list);
  return { added, errors };
}

/** A File for a user sticker, ready for the media importer. */
export async function userStickerFile(entry) {
  const blob = await getBlob(entry.id);
  if (!blob) throw new Error("missing");
  const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
  return new File([blob], `${entry.name}.${ext}`, { type: blob.type || "image/png", lastModified: entry.addedAt || 1 });
}

export async function removeUserSticker(id, inUse) {
  await kvSet("userStickers", (await userStickers()).filter((x) => x.id !== id));
  if (!inUse) await deleteBlob(id).catch(() => {});
}
