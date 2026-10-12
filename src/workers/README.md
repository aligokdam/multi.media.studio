# `src/workers/`: background work

| File | Purpose |
| --- | --- |
| `peaks.worker.js` | Computes waveform peaks for audio clips on the timeline |
| `stretch.worker.js` | Time stretches audio for clips played faster or slower during export |

The single-file build inlines both workers as Blob URLs.
