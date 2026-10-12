# `src/export/`: video export

| File | Purpose |
| --- | --- |
| `export-sheet.js` | Export progress and result. Settings (resolution up to 8K, default 4K, frame rate, quality, format) live in the drop-down panel next to the Export button in `src/studio/studio.js`, and Export starts right away |
| `exporter.js` | Renders each frame with the compositor and encodes it with WebCodecs into MP4 or WebM (mediabunny) |
| `mixer.js` | Offline audio mixdown of all audio clips with volume, fades and speed |

Export runs fully in the browser. If the device cannot encode the chosen resolution, the highest one it can encode is used. Where the File System Access API is available
the video is written straight to disk, otherwise it is offered as a download.
