/* Font library for titles.
   Three kinds of fonts:
   - system stacks (always available, no download),
   - bundled open-licence fonts shipped in assets/fonts (OFL 1.1 or Apache 2.0),
     loaded on first use,
   - fonts the user imports (TTF, OTF, WOFF, WOFF2), stored on this device only.
   Text is drawn on a canvas, so a font must be loaded before it is drawn.
   When a font finishes loading the text cache is cleared and "mms:fonts" is
   dispatched on window so the preview can redraw. */
import { FONTS, clearTextCache } from "./text.js";
import { putBlob, getBlob, deleteBlob } from "../storage/db.js";
import { kvGet, kvSet } from "../storage/db.js";
import { uid } from "../core/util.js";

/** Bundled fonts: key → { name, category, files: [[file, weight]] }. Weight ranges for variable fonts. */
export const BUNDLED = {
  montserrat: { name: "Montserrat", category: "sans", files: [["montserrat.woff", "100 900"]] },
  poppins: { name: "Poppins", category: "sans", files: [["poppins-400.woff", "400"], ["poppins-700.woff", "700"]] },
  oswald: { name: "Oswald", category: "display", files: [["oswald.woff", "200 700"]] },
  "bebas-neue": { name: "Bebas Neue", category: "display", files: [["bebas-neue.woff", "400"]] },
  anton: { name: "Anton", category: "display", files: [["anton.woff", "400"]] },
  righteous: { name: "Righteous", category: "display", files: [["righteous.woff", "400"]] },
  bangers: { name: "Bangers", category: "display", files: [["bangers.woff", "400"]] },
  "abril-fatface": { name: "Abril Fatface", category: "serif", files: [["abril-fatface.woff", "400"]] },
  "playfair-display": { name: "Playfair Display", category: "serif", files: [["playfair-display.woff", "400 900"]] },
  lora: { name: "Lora", category: "serif", files: [["lora.woff", "400 700"]] },
  lobster: { name: "Lobster", category: "script", files: [["lobster.woff", "400"]] },
  pacifico: { name: "Pacifico", category: "script", files: [["pacifico.woff", "400"]] },
  "dancing-script": { name: "Dancing Script", category: "script", files: [["dancing-script.woff", "400 700"]] },
  caveat: { name: "Caveat", category: "script", files: [["caveat.woff", "400 700"]] },
  "permanent-marker": { name: "Permanent Marker", category: "script", files: [["permanent-marker.woff", "400"]] },
  "space-mono": { name: "Space Mono", category: "mono", files: [["space-mono-400.woff", "400"], ["space-mono-700.woff", "700"]] },
};

/** System stacks shown in the picker (naskh is chosen automatically for Arabic script). */
export const SYSTEM_FONTS = ["system", "serif", "rounded", "condensed", "mono", "script"];
export const FONT_CATEGORIES = ["sans", "serif", "display", "script", "mono", "yours"];
const SYSTEM_CATEGORY = { system: "sans", serif: "serif", rounded: "sans", condensed: "display", mono: "mono", script: "script" };

/* Replaced by data URLs in the single-file build. */
const FONT_DATA = null;
/* All bundled fonts live in one file, assets/fonts/fonts.pack:
   4 bytes (little endian) header length, a JSON index { "file.woff": [offset, length] },
   then the WOFF files one after another. It is fetched once, the first time a
   bundled font is needed. scripts/build-single.py --pack-fonts DIR rebuilds it. */
const FONT_PACK = new URL("../../assets/fonts/fonts.pack", import.meta.url);
let packPromise = null;
function fontPack() {
  return (packPromise ||= fetch(FONT_PACK).then((r) => { if (!r.ok) throw new Error("fonts.pack " + r.status); return r.arrayBuffer(); }).then((buf) => {
    const n = new DataView(buf).getUint32(0, true);
    return { buf, index: JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n))), base: 4 + n };
  }).catch((e) => { packPromise = null; throw e; }));
}

export const USER_FONT_EXT = ["ttf", "otf", "woff", "woff2"];
export const USER_FONT_MAX = 15 * 1024 * 1024;

const loaded = new Map();      // key → Promise
let userFonts = [];            // [{ id, name, size }]

const familyOf = (key) => (key.startsWith("u:") ? "MMS User " + key.slice(2) : "MMS " + (BUNDLED[key]?.name || key));

/** CSS font-family stack for a font key (with a system fallback). */
export function fontStack(key) {
  if (FONTS[key]) return FONTS[key];
  if (BUNDLED[key] || key?.startsWith("u:")) {
    const cat = BUNDLED[key]?.category;
    const fb = cat === "serif" ? FONTS.serif : cat === "mono" ? FONTS.mono : cat === "script" ? FONTS.script : FONTS.system;
    return `"${familyOf(key)}", ${fb}`;
  }
  return FONTS.system;
}

/** Human name for the picker; system stacks use translated labels via labelFor. */
export function fontName(key, t) {
  if (FONTS[key]) return t("font." + key);
  if (BUNDLED[key]) return BUNDLED[key].name;
  const u = userFonts.find((f) => "u:" + f.id === key);
  return u ? u.name : t("font.missing");
}

/** All picker entries: [{ key, category }]. */
export function listFonts() {
  return [
    ...SYSTEM_FONTS.map((k) => ({ key: k, category: SYSTEM_CATEGORY[k] })),
    ...Object.entries(BUNDLED).map(([k, f]) => ({ key: k, category: f.category })),
    ...userFonts.map((f) => ({ key: "u:" + f.id, category: "yours" })),
  ];
}

function announce() {
  clearTextCache();
  window.dispatchEvent(new Event("mms:fonts"));
}

/** Loads a font if needed. Resolves to true when it can be drawn. */
export function ensureFont(key) {
  if (!key || FONTS[key]) return Promise.resolve(true);
  if (loaded.has(key)) return loaded.get(key);
  let p;
  if (BUNDLED[key]) {
    p = Promise.all(BUNDLED[key].files.map(async ([file, weight]) => {
      let source;
      if (FONT_DATA) source = `url("${FONT_DATA[file]}") format("woff")`;
      else { const { buf, index, base } = await fontPack(); const [o, len] = index[file]; source = buf.slice(base + o, base + o + len); }
      const face = new FontFace(familyOf(key), source, { weight, display: "block" });
      await face.load();
      document.fonts.add(face);
    })).then(() => { announce(); return true; });
  } else if (key.startsWith("u:")) {
    p = (async () => {
      const blob = await getBlob(key.slice(2));
      if (!blob) return false;
      const face = new FontFace(familyOf(key), await blob.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      announce();
      return true;
    })();
  } else p = Promise.resolve(false);
  p = p.catch((e) => { console.warn("Font failed", key, e); loaded.delete(key); return false; });
  loaded.set(key, p);
  return p;
}

/** Loads every font a project's titles use (before export or when a project opens). */
export async function ensureProjectFonts(project) {
  const keys = new Set();
  for (const tr of project.tracks) for (const c of tr.clips) if (c.kind === "text" && c.text?.style?.font) keys.add(c.text.style.font);
  await Promise.all([...keys].map(ensureFont));
}

/* ------------------------------------------------------------ user fonts */
export async function loadUserFonts() {
  userFonts = (await kvGet("userFonts", [])) || [];
  return userFonts;
}

export function userFontList() { return userFonts; }

/**
 * Imports font files. Returns { added: [key], errors: [{ name, reason }] }.
 * reason: unsupported | tooLarge | unreadable | duplicate | storage
 */
export async function importFonts(files) {
  const added = [], errors = [];
  await loadUserFonts();
  for (const f of files) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!USER_FONT_EXT.includes(ext)) { errors.push({ name: f.name, reason: "unsupported" }); continue; }
    if (f.size > USER_FONT_MAX) { errors.push({ name: f.name, reason: "tooLarge" }); continue; }
    if (!f.size) { errors.push({ name: f.name, reason: "unreadable" }); continue; }
    const name = f.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").slice(0, 60);
    if (userFonts.some((u) => u.name === name && u.size === f.size)) { errors.push({ name: f.name, reason: "duplicate" }); continue; }
    const id = uid("uf");
    try {
      // Parse before storing so a broken file is rejected right away.
      const face = new FontFace("MMS User " + id, await f.arrayBuffer());
      await face.load();
      document.fonts.add(face);
    } catch { errors.push({ name: f.name, reason: "unreadable" }); continue; }
    try { await putBlob(id, f); } catch { errors.push({ name: f.name, reason: "storage" }); continue; }
    userFonts.push({ id, name, size: f.size, addedAt: Date.now() });
    loaded.set("u:" + id, Promise.resolve(true));
    added.push("u:" + id);
  }
  await kvSet("userFonts", userFonts);
  if (added.length) announce();
  return { added, errors };
}

export async function removeUserFont(key) {
  const id = key.slice(2);
  userFonts = userFonts.filter((u) => u.id !== id);
  await kvSet("userFonts", userFonts);
  await deleteBlob(id).catch(() => {});
  loaded.delete(key);
}
