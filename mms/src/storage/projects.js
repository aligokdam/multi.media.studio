/* Project records. The project JSON and its media are stored separately: the
   media blobs are written first (blobs.js), the project record last, in one
   IndexedDB transaction, so a saved project never points at media that was
   not stored. */
import { tx, get, getAll, del, clearAll, kvGet, kvSet } from "./db.js";
import { deleteBlob, listBlobIds, clearOPFS, getBlob, putBlob } from "./db.js";
import { projectDuration, normalizeProject } from "../studio/model.js";
import { APP } from "../config.js";
import { uid } from "../core/util.js";

export async function listProjects() {
  const all = await getAll("projects").catch(() => []);
  return all
    .map(({ data, ...meta }) => meta)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function loadProject(id) {
  const rec = await get("projects", id);
  if (!rec) return null;
  // Photo projects have their own model (src/photo-editor/model.js).
  if (rec.data?.kind === "photo") return structuredClone(rec.data);
  return normalizeProject(structuredClone(rec.data));
}

/** Saves a photo project (collage, filters, text and stickers). */
export async function savePhotoProject(doc, { thumb } = {}) {
  const prev = thumb === undefined ? await get("projects", doc.id).catch(() => null) : null;
  const rec = {
    id: doc.id, kind: "photo", name: doc.name, createdAt: doc.createdAt, updatedAt: doc.updatedAt || Date.now(),
    duration: 0, aspect: doc.aspect, clipCount: doc.photos.length + doc.items.length,
    thumb: thumb !== undefined ? thumb : prev?.thumb || null,
    data: doc,
  };
  await tx("projects", "readwrite", (s) => { s.projects.put(rec); });
  return rec;
}

export async function saveProject(project, { thumb } = {}) {
  const prev = thumb === undefined ? await get("projects", project.id).catch(() => null) : null;
  const rec = {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt || Date.now(),
    duration: projectDuration(project),
    aspect: project.settings.aspect,
    clipCount: project.tracks.reduce((n, t) => n + t.clips.length, 0),
    thumb: thumb !== undefined ? thumb : prev?.thumb || null,
    data: project,
  };
  await tx("projects", "readwrite", (s) => { s.projects.put(rec); });
  return rec;
}

export async function renameProject(id, name) {
  const rec = await get("projects", id);
  if (!rec) return;
  rec.name = name; rec.data.name = name; rec.updatedAt = Date.now();
  await tx("projects", "readwrite", (s) => { s.projects.put(rec); });
}

/** Media ids referenced by any stored project or by the user's sound library. */
async function referencedMedia(exceptProjectId) {
  const refs = new Set();
  for (const rec of await getAll("projects")) {
    if (rec.id === exceptProjectId) continue;
    for (const m of Object.values(rec.data?.media || {})) refs.add(m.blobId || m.id);
  }
  // User libraries keep their own files.
  for (const key of ["userSounds", "userStickers", "userFonts"]) for (const s of (await kvGet(key, [])) || []) refs.add(s.id);
  return refs;
}

export async function deleteProject(id) {
  const rec = await get("projects", id);
  await del("projects", id);
  if (!rec) return;
  const keep = await referencedMedia(id);
  for (const m of Object.values(rec.data?.media || {})) {
    const bid = m.blobId || m.id;
    if (m.origin === "user" && !keep.has(bid)) await deleteBlob(bid).catch(() => {});
  }
}

/** Removes stored media that no project or library entry references any more. */
export async function collectGarbage() {
  const keep = await referencedMedia(null);
  let removed = 0;
  for (const id of await listBlobIds()) if (!keep.has(id) && !id.startsWith("lib-")) { await deleteBlob(id).catch(() => {}); removed++; }
  return removed;
}

export async function deleteEverything() {
  await clearAll();
  await clearOPFS();
  try { localStorage.removeItem("mms.prefs"); } catch { /* ignore */ }
}

export { kvGet, kvSet };

/* ---------------------------------------------------------------- .mmsp project packages */
/* Project packages (.mmsp): a ZIP with
     manifest.json   { format, version, app, exportedAt }
     project.json    the timeline
     media/<id>      original media files (stored, not recompressed)
   Built-in music and sounds are not embedded; they are regenerated from their
   ids on import. Media is streamed in chunks so large files are not copied twice. */

let ff = null;
const fflate = () => (ff ||= import("../../../m.m.s/libraries/fflate/fflate.min.js"));

/** Builds the package. Returns a Blob, or writes into `writable` when given. */
export async function exportPackage(project, { onProgress, writable } = {}) {
  const { Zip, ZipPassThrough, ZipDeflate, strToU8 } = await fflate();
  const parts = [];
  let pending = Promise.resolve();
  let finished;
  const done = new Promise((res, rej) => { finished = { res, rej }; });
  const zip = new Zip((err, chunk, final) => {
    if (err) return finished.rej(err);
    if (writable) pending = pending.then(() => writable.write(chunk));
    else parts.push(chunk);
    if (final) pending.then(() => finished.res(), finished.rej);
  });
  const addJson = (name, obj) => { const f = new ZipDeflate(name, { level: 6 }); zip.add(f); f.push(strToU8(JSON.stringify(obj, null, 1)), true); };

  addJson("manifest.json", { format: APP.projectFormat, version: APP.projectFormatVersion, app: APP.name, appVersion: APP.version, exportedAt: new Date().toISOString() });
  addJson("project.json", project);

  const media = Object.values(project.media).filter((m) => m.origin === "user");
  const totalBytes = media.reduce((n, m) => n + (m.size || 0), 0) || 1;
  let written = 0;
  for (const m of media) {
    const blob = await getBlob(m.blobId || m.id);
    if (!blob) continue;
    const entry = new ZipPassThrough("media/" + m.id);
    zip.add(entry);
    const reader = blob.stream().getReader();
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      entry.push(value, false);
      written += value.length;
      onProgress?.(written / totalBytes);
      await pending;
    }
    entry.push(new Uint8Array(0), true);
  }
  zip.end();
  await done;
  if (writable) { await writable.close(); return null; }
  return new Blob(parts, { type: "application/zip" });
}

/** Imports a package as a new project (new ids, so it never overwrites). */
export async function importPackage(file, { onProgress } = {}) {
  const { Unzip, UnzipInflate, strFromU8 } = await fflate();
  const files = new Map();     // name → Uint8Array[]
  const unzip = new Unzip((stream) => {
    const chunks = [];
    files.set(stream.name, chunks);
    stream.ondata = (err, data) => { if (err) throw err; chunks.push(data); };
    stream.start();
  });
  unzip.register(UnzipInflate);
  const reader = file.stream().getReader();
  let read = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) { unzip.push(new Uint8Array(0), true); break; }
    unzip.push(value, false);
    read += value.length;
    onProgress?.(Math.min(0.9, read / file.size));
  }
  const text = (name) => { const c = files.get(name); return c ? strFromU8(concat(c)) : null; };
  const manifest = JSON.parse(text("manifest.json") || "null");
  if (!manifest || manifest.format !== APP.projectFormat) throw new Error("not-a-project");
  if (manifest.version > APP.projectFormatVersion) throw new Error("newer-version");
  const project = normalizeProject(JSON.parse(text("project.json") || "null"));

  // Fresh ids for the project and its media.
  const idMap = new Map();
  project.id = uid("p");
  project.updatedAt = Date.now();
  const media = {};
  for (const m of Object.values(project.media)) {
    const nid = uid("m");
    idMap.set(m.id, nid);
    const chunks = files.get("media/" + m.id) || (m.blobId ? files.get("media/" + m.id) : null);
    const copy = { ...m, id: nid };
    delete copy.blobId;
    if (m.origin === "user") {
      if (!chunks) { copy.missing = true; media[nid] = copy; continue; }
      await putBlob(nid, new Blob(chunks, { type: m.mime || "" }));
    }
    media[nid] = copy;
  }
  project.media = media;
  for (const tr of project.tracks) for (const c of tr.clips) if (c.mediaId) c.mediaId = idMap.get(c.mediaId) || c.mediaId;
  await saveProject(project);
  onProgress?.(1);
  return project;
}

function concat(chunks) {
  const n = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
