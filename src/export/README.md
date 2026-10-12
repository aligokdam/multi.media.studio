# `src/export/`: video export

| File | Purpose |
| --- | --- |
| `export-sheet.js` | The export sheet: resolution, frame rate, format and quality, progress and result |
| `exporter.js` | Renders each frame with the compositor and encodes it with WebCodecs into MP4 or WebM (mediabunny) |
| `mixer.js` | Offline audio mixdown of all audio clips with volume, fades and speed |

Export runs fully in the browser. Where the File System Access API is available
the video is written straight to disk, otherwise it is offered as a download.
