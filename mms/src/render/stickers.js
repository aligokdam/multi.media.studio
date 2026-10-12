/* Sticker library.
   Built-in emoji and hand stickers drawn for this app as SVG (original artwork,
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

/** Hands: the same yellow, fingers drawn as rounded bars, with a thin darker
    line where fingers meet so they read as separate. */
const SK = FACE, SKL = "#E0A100";
const hand = (inner) => `<g fill="${SK}" stroke="${SKL}" stroke-width="2.5" stroke-linejoin="round">${inner}</g>`;

/** id → { svg, cat } (viewBox 0 0 128 128). cat is "emoji" (faces and symbols) unless set to "hands". */
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

  /* Hands */
  { id: "thumbs-up", cat: "hands", svg: hand(`
    <rect x="20" y="58" width="22" height="54" rx="6" fill="#3F8EF0" stroke="#2F6FC0"/>
    <rect x="40" y="56" width="58" height="56" rx="16"/>
    <rect x="72" y="58" width="34" height="14" rx="7"/><rect x="72" y="72" width="36" height="14" rx="7"/><rect x="72" y="86" width="34" height="14" rx="7"/><rect x="70" y="99" width="30" height="13" rx="6.5"/>
    <rect x="44" y="12" width="21" height="56" rx="10.5" transform="rotate(-8 54 40)"/>`) },
  { id: "thumbs-down", cat: "hands", svg: hand(`<g transform="rotate(180 64 64)">
    <rect x="20" y="58" width="22" height="54" rx="6" fill="#3F8EF0" stroke="#2F6FC0"/>
    <rect x="40" y="56" width="58" height="56" rx="16"/>
    <rect x="72" y="58" width="34" height="14" rx="7"/><rect x="72" y="72" width="36" height="14" rx="7"/><rect x="72" y="86" width="34" height="14" rx="7"/><rect x="70" y="99" width="30" height="13" rx="6.5"/>
    <rect x="44" y="12" width="21" height="56" rx="10.5" transform="rotate(-8 54 40)"/></g>`) },
  { id: "peace", cat: "hands", svg: hand(`
    <rect x="40" y="12" width="18" height="64" rx="9" transform="rotate(-12 49 44)"/>
    <rect x="68" y="12" width="18" height="64" rx="9" transform="rotate(12 77 44)"/>
    <rect x="38" y="62" width="56" height="54" rx="18"/>
    <rect x="70" y="62" width="26" height="15" rx="7.5"/><rect x="70" y="76" width="24" height="15" rx="7.5"/>
    <rect x="30" y="82" width="40" height="16" rx="8" transform="rotate(-10 50 90)"/>`) },
  { id: "wave", cat: "hands", svg: hand(`
    <rect x="34" y="22" width="15" height="52" rx="7.5" transform="rotate(-8 41 48)"/>
    <rect x="49" y="12" width="15" height="58" rx="7.5" transform="rotate(-3 56 41)"/>
    <rect x="64" y="12" width="15" height="58" rx="7.5" transform="rotate(3 71 41)"/>
    <rect x="79" y="22" width="14" height="50" rx="7" transform="rotate(8 86 47)"/>
    <rect x="34" y="54" width="60" height="58" rx="22"/>
    <rect x="14" y="62" width="16" height="40" rx="8" transform="rotate(-38 22 82)"/>`) +
    stroke("M102 22q9 7 11 18M107 10q13 9 15 26", 4.5, "#8ED6F5") },
  { id: "ok", cat: "hands", svg: hand(`
    <rect x="58" y="10" width="16" height="60" rx="8" transform="rotate(6 66 40)"/>
    <rect x="74" y="16" width="15" height="56" rx="7.5" transform="rotate(14 81 44)"/>
    <rect x="86" y="30" width="14" height="46" rx="7" transform="rotate(22 93 53)"/>
    <rect x="40" y="58" width="58" height="56" rx="20"/>
    <path d="M40 31a19 19 0 1 1-0.1 0z m0 11a8 8 0 1 0 0.1 0z" fill-rule="evenodd"/>`) },
  { id: "clap", cat: "hands", svg: hand(`
    <rect x="30" y="26" width="40" height="84" rx="20" transform="rotate(-18 50 70)"/>
    <rect x="60" y="30" width="40" height="84" rx="20" transform="rotate(14 80 72)"/>`) +
    `<g transform="rotate(-18 50 70)">${stroke("M40 30v20M50 27v22M60 30v20", 2.5, SKL)}</g><g transform="rotate(14 80 72)">${stroke("M70 34v20M80 31v22M90 34v20", 2.5, SKL)}</g>` +
    stroke("M60 6v10M46 9l5 8M74 9l-5 8", 4.5, "#FFB300") },
  { id: "point-up", cat: "hands", svg: hand(`
    <rect x="50" y="6" width="18" height="70" rx="9"/>
    <rect x="40" y="58" width="56" height="56" rx="18"/>
    <rect x="66" y="60" width="32" height="15" rx="7.5"/><rect x="66" y="74" width="32" height="15" rx="7.5"/><rect x="64" y="88" width="30" height="14" rx="7"/>
    <rect x="28" y="74" width="34" height="16" rx="8" transform="rotate(-20 45 82)"/>`) },
  { id: "rock", cat: "hands", svg: hand(`
    <rect x="40" y="8" width="17" height="66" rx="8.5" transform="rotate(-4 48 41)"/>
    <rect x="82" y="30" width="15" height="44" rx="7.5" transform="rotate(14 89 52)"/>
    <rect x="38" y="58" width="58" height="56" rx="18"/>
    <rect x="54" y="52" width="15" height="22" rx="7.5"/><rect x="68" y="52" width="15" height="22" rx="7.5"/>
    <rect x="28" y="80" width="44" height="16" rx="8" transform="rotate(-8 50 88)"/>`) },
  { id: "pray", cat: "hands", svg: hand(`
    <rect x="34" y="20" width="32" height="96" rx="16" transform="rotate(14 50 68)"/>
    <rect x="62" y="20" width="32" height="96" rx="16" transform="rotate(-14 78 68)"/>`) +
    stroke("M24 30l-8-6M20 46H10M104 30l8-6M108 46h10", 4.5, "#FFB300") },
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
