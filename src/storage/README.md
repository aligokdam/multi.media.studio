# `src/storage/`: local persistence

| File | Purpose |
| --- | --- |
| `db.js` | IndexedDB wrapper with `projects`, `blobs` and `kv` stores |
| `blobs.js` | Media files in the Origin Private File System, with an IndexedDB fallback and size checks |
| `projects.js` | Saving, loading, listing and deleting projects |
| `package.js` | `.mmsp` project packages (ZIP via fflate) for moving projects between devices |

Everything is stored only in this browser, on this device. Clearing site data
removes it, which is why the app recommends exporting important work regularly.
User libraries (imported sounds, effects, transitions and fonts) live in the
`kv` store and in blob storage.
