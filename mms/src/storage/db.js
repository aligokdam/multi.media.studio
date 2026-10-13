/* IndexedDB wrapper. Stores:
     projects  { id, name, updatedAt, createdAt, duration, aspect, thumb, data }
     blobs     { id, blob }            media fallback when OPFS is unavailable
     kv        { key, value }          small records (blob sizes, user library) */
const DB_NAME = "multi-media-studio";
const VERSION = 1;
let dbp = null;

export function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("indexeddb-unavailable"));
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "key" });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbp = null; };
      resolve(db);
    };
    req.onerror = () => { dbp = null; reject(req.error); };
    req.onblocked = () => console.warn("IndexedDB upgrade blocked by another tab");
  });
  return dbp;
}

/** Runs fn(stores) inside one transaction and resolves when it commits. */
export async function tx(names, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const list = Array.isArray(names) ? names : [names];
    const t = db.transaction(list, mode);
    const stores = Object.fromEntries(list.map((n) => [n, t.objectStore(n)]));
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("transaction aborted"));
    try { result = fn(stores); } catch (e) { t.abort(); reject(e); }
  });
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export async function get(store, key) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).get(key));
}
export async function getAll(store) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).getAll());
}
export async function getAllKeys(store) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).getAllKeys());
}
export const put = (store, value) => tx(store, "readwrite", (s) => { s[store].put(value); });
export const del = (store, key) => tx(store, "readwrite", (s) => { s[store].delete(key); });

export async function kvGet(key, fallback = null) {
  try { const r = await get("kv", key); return r ? r.value : fallback; } catch { return fallback; }
}
export const kvSet = (key, value) => put("kv", { key, value });
export const kvDel = (key) => del("kv", key);

export async function clearAll() {
  await tx(["projects", "blobs", "kv"], "readwrite", (s) => { s.projects.clear(); s.blobs.clear(); s.kv.clear(); });
}

/* ---------------------------------------------------------------- media blobs (OPFS with IndexedDB fallback) */
/* Media file storage. Prefers the Origin Private File System (fast, streams
   large files to disk); falls back to IndexedDB. Each write records the expected
   size in kv, and reads verify it, so a half-written file (tab closed mid-write,
   quota error) is reported as missing instead of being used corrupted. */

let dirPromise = null;

/** OPFS media directory, or null. Memoised as a promise so concurrent callers
    wait for the same probe instead of seeing a half-initialised state. */
function mediaDir() {
  if (!dirPromise) dirPromise = (async () => {
    try {
      if (!navigator.storage?.getDirectory) return null;
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("media", { create: true });
      // Writing needs createWritable (main thread). Probe it once.
      const probe = await dir.getFileHandle(".probe", { create: true });
      if (typeof probe.createWritable !== "function") return null;
      const w = await probe.createWritable();
      await w.write(new Uint8Array([1]));
      await w.close();
      await dir.removeEntry(".probe");
      return dir;
    } catch (e) {
      console.info("OPFS unavailable, using IndexedDB for media:", e?.message || e);
      return null;
    }
  })();
  return dirPromise;
}

export async function storageBackend() { return (await mediaDir()) ? "opfs" : "indexeddb"; }

const metaKey = (id) => "blob:" + id;

/** Stores a Blob under id. Throws on quota or write errors. */
export async function putBlob(id, blob) {
  const dir = await mediaDir();
  await kvSet(metaKey(id), { size: blob.size, type: blob.type, complete: false, backend: dir ? "opfs" : "idb" });
  if (dir) {
    const fh = await dir.getFileHandle(id, { create: true });
    const w = await fh.createWritable();
    try {
      if (blob.stream && w.write) await blob.stream().pipeTo(w);
      else { await w.write(blob); await w.close(); }
    } catch (e) {
      try { await w.abort?.(); } catch { /* ignore */ }
      await dir.removeEntry(id).catch(() => {});
      await kvDel(metaKey(id));
      throw e;
    }
    const written = await fh.getFile();
    if (written.size !== blob.size) { await dir.removeEntry(id).catch(() => {}); await kvDel(metaKey(id)); throw new Error("write-incomplete"); }
  } else {
    await tx("blobs", "readwrite", (s) => { s.blobs.put({ id, blob }); });
  }
  await kvSet(metaKey(id), { size: blob.size, type: blob.type, complete: true, backend: dir ? "opfs" : "idb" });
}

/** Returns the stored Blob/File, or null if missing or incomplete. */
export async function getBlob(id) {
  const meta = await kvGet(metaKey(id));
  if (!meta || !meta.complete) return null;
  try {
    if (meta.backend === "opfs") {
      const dir = await mediaDir();
      if (!dir) return null;
      const file = await (await dir.getFileHandle(id)).getFile();
      if (file.size !== meta.size) return null;
      return meta.type && file.type !== meta.type ? new Blob([file], { type: meta.type }) : file;
    }
    const rec = await get("blobs", id);
    return rec?.blob && rec.blob.size === meta.size ? rec.blob : null;
  } catch {
    return null;
  }
}

export async function deleteBlob(id) {
  const meta = await kvGet(metaKey(id));
  try {
    if (!meta || meta.backend === "opfs") { const dir = await mediaDir(); await dir?.removeEntry(id).catch(() => {}); }
    if (!meta || meta.backend === "idb") await del("blobs", id);
  } finally {
    await kvDel(metaKey(id));
  }
}

export async function listBlobIds() {
  const keys = await getAllKeys("kv");
  return keys.filter((k) => typeof k === "string" && k.startsWith("blob:")).map((k) => k.slice(5));
}

export async function clearOPFS() {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry("media", { recursive: true });
  } catch { /* nothing to remove */ }
  dirPromise = null;
}

/** Usage estimate and persistence state for the Storage settings page. */
export async function storageInfo() {
  const est = (await navigator.storage?.estimate?.().catch(() => null)) || {};
  const persisted = (await navigator.storage?.persisted?.().catch(() => false)) || false;
  return { usage: est.usage ?? NaN, quota: est.quota ?? NaN, persisted, backend: await storageBackend() };
}

export async function requestPersistence() {
  try { return (await navigator.storage?.persist?.()) || false; } catch { return false; }
}
