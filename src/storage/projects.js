/* Project records. The project JSON and its media are stored separately: the
   media blobs are written first (blobs.js), the project record last, in one
   IndexedDB transaction, so a saved project never points at media that was
   not stored. */
import { tx, get, getAll, del, clearAll, kvGet, kvSet } from "./db.js";
import { deleteBlob, listBlobIds, clearOPFS } from "./blobs.js";
import { projectDuration, normalizeProject } from "../studio/model.js";

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
