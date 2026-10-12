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
