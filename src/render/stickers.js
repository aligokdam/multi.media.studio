/* Sticker library.
   Nine built-in emoji stickers drawn for this app as SVG (original artwork,
   released under CC0 1.0 with the rest of the built-in library). A sticker is
   rasterised to a 512 px PNG on the device and added to the project as a
   normal image clip on an overlay track, so it can be moved, scaled, animated
   and exported like any photo. Users can add their own PNG, JPEG, WebP, GIF,
   AVIF or SVG stickers; those are kept on this device only. */
import { putBlob, getBlob, deleteBlob } from "../storage/blobs.js";
import { kvGet, kvSet } from "../storage/db.js";
import { uid } from "../core/util.js";

const face = (inner, id) => `
<defs>
  <radialGradient id="g${id}" cx="40%" cy="32%" r="75%">
    <stop offset="0" stop-color="#FFE68A"/><stop offset=".55" stop-color="#FFC93C"/><stop offset="1" stop-color="#F29A1F"/>
  </radialGradient>
</defs>
<circle cx="64" cy="64" r="56" fill="url(#g${id})"/>
<circle cx="64" cy="64" r="56" fill="none" stroke="#D97E0F" stroke-opacity=".35" stroke-width="2"/>
${inner}`;

const DARK = "#5B3412";

/** id → { svg } (viewBox 0 0 128 128). */
export const STICKERS = [
  { id: "smile", svg: face(`
    <path d="M38 54q8-10 16 0M74 54q8-10 16 0" fill="none" stroke="${DARK}" stroke-width="6" stroke-linecap="round"/>
    <path d="M36 74q28 30 56 0z" fill="${DARK}"/><path d="M48 86q16 9 32 0q-4 8-16 8t-16-8z" fill="#F0676B"/>
    <ellipse cx="34" cy="76" rx="8" ry="5" fill="#FF8A7A" opacity=".55"/><ellipse cx="94" cy="76" rx="8" ry="5" fill="#FF8A7A" opacity=".55"/>`, 1) },
  { id: "laugh", svg: face(`
    <path d="M34 50l16 8-16 8M94 50l-16 8 16 8" fill="none" stroke="${DARK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M32 72h64q-4 32-32 32t-32-32z" fill="${DARK}"/><path d="M40 72h48v6H40z" fill="#fff"/><path d="M48 96q16 -12 32 0q-6 8-16 8t-16-8z" fill="#F0676B"/>
    <path d="M22 60q-10 14-4 24q8 4 12-6q2-8-8-18z" fill="#5EC8F2"/><path d="M106 60q10 14 4 24q-8 4-12-6q-2-8 8-18z" fill="#5EC8F2"/>`, 2) },
  { id: "heart-eyes", svg: face(`
    <path d="M46 62s-14-8-14-17a7 7 0 0 1 14-2a7 7 0 0 1 14 2c0 9-14 17-14 17z" fill="#F0384D"/>
    <path d="M82 62s-14-8-14-17a7 7 0 0 1 14-2a7 7 0 0 1 14 2c0 9-14 17-14 17z" fill="#F0384D"/>
    <path d="M40 78q24 24 48 0z" fill="${DARK}"/><path d="M48 80h32v4H48z" fill="#fff"/>`, 3) },
  { id: "wow", svg: face(`
    <ellipse cx="46" cy="54" rx="7" ry="10" fill="${DARK}"/><ellipse cx="82" cy="54" rx="7" ry="10" fill="${DARK}"/>
    <path d="M34 38q8-6 16-3M78 35q8-3 16 3" fill="none" stroke="${DARK}" stroke-width="4.5" stroke-linecap="round"/>
    <ellipse cx="64" cy="88" rx="12" ry="15" fill="${DARK}"/>`, 4) },
  { id: "cool", svg: face(`
    <path d="M24 48h80v6l-4 2q-2 16-18 16q-14 0-16-14h-4q-2 14-16 14q-16 0-18-16l-4-2z" fill="#1E1E24"/>
    <path d="M32 54q12-4 22 0M74 54q12-4 22 0" stroke="#fff" stroke-opacity=".5" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M44 88q20 12 40-4" fill="none" stroke="${DARK}" stroke-width="6" stroke-linecap="round"/>`, 5) },
  { id: "wink", svg: face(`
    <ellipse cx="46" cy="54" rx="6" ry="9" fill="${DARK}"/>
    <path d="M74 56q8-6 16 0" fill="none" stroke="${DARK}" stroke-width="6" stroke-linecap="round"/>
    <path d="M40 78q24 22 48 0" fill="none" stroke="${DARK}" stroke-width="6" stroke-linecap="round"/>
    <path d="M70 86q10 12 16 2" fill="#F0676B"/>`, 6) },
  { id: "heart", svg: `
    <defs><linearGradient id="gh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF6B7D"/><stop offset="1" stop-color="#D81E3A"/></linearGradient></defs>
    <path d="M64 112S12 80 12 44a26 26 0 0 1 52-6a26 26 0 0 1 52 6c0 36-52 68-52 68z" fill="url(#gh)"/>
    <path d="M32 36q6-10 18-8" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="6" stroke-linecap="round"/>` },
  { id: "fire", svg: `
    <defs><linearGradient id="gf" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#E8361C"/><stop offset=".6" stop-color="#FF7A1A"/><stop offset="1" stop-color="#FFB82E"/></linearGradient></defs>
    <path d="M64 120c-26 0-42-18-42-40c0-22 16-32 20-50c8 8 10 18 8 26c10-12 14-30 10-46c22 14 40 36 40 66c0 26-14 44-36 44z" fill="url(#gf)"/>
    <path d="M64 118c-12 0-20-8-20-20c0-12 10-18 14-30c4 8 4 14 2 20c8-4 12-14 12-22c10 10 14 20 14 32c0 12-10 20-22 20z" fill="#FFD84A"/>` },
  { id: "star", svg: `
    <defs><linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE45C"/><stop offset="1" stop-color="#F7A21B"/></linearGradient></defs>
    <path d="M64 10l15 33 36 4-27 24 8 36-32-19-32 19 8-36-27-24 36-4z" fill="url(#gs)" stroke="#E08A0B" stroke-width="3" stroke-linejoin="round"/>
    <path d="M64 30l7 16" stroke="#fff" stroke-opacity=".7" stroke-width="5" stroke-linecap="round"/>` },
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
