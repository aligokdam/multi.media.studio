# `src/`: application source

Multi Media Studio is plain ES modules with no framework and no build step. The
browser loads `src/main.js` directly. `scripts/build-single.py` can optionally
bundle everything into one HTML file.

| Folder | What it contains |
| --- | --- |
| [`core/`](core/README.md) | Shared building blocks: DOM helper, i18n, preferences, icons, appearance |
| [`landing/`](landing/README.md) | The public home page (hero, how it works, FAQ) |
| [`studio/`](studio/README.md) | The studio: project list, video editor shell, timeline, inspector, settings |
| [`media/`](media/README.md) | Importing user files and keeping decoded media in memory |
| [`photo-editor/`](photo-editor/README.md) | Photo editor: single photos and collages with filters, effects, text and stickers, export up to 8K |
| [`render/`](render/README.md) | WebGL2 compositor, effects, transitions, text, fonts and animations |
| [`audio/`](audio/README.md) | Built-in music and sound effect library (synthesized, CC0) and audio previews |
| [`export/`](export/README.md) | MP4 and WebM export with WebCodecs, audio mixdown |
| [`storage/`](storage/README.md) | Local persistence (OPFS, IndexedDB) and `.mmsp` project packages |
| [`workers/`](workers/README.md) | Web workers for waveform peaks and time stretching |

Reusable interface components (sheets, toasts, inspector controls and the library
panels) live next to `src/` in [`components/`](../components/README.md).

Top-level files:

- `main.js` boots the app: applies preferences and language, registers the
  service worker, and runs the hash router (`#/`, `#/studio`, `#/privacy`, `#/terms`).
- `boot.js` runs before anything else to set theme and language attributes on
  `<html>` so the first paint is correct.
- `config.js` holds app constants (name, version, limits, formats).

## Principles

- **Local first.** Nothing the user imports leaves the device. There is no backend.
- **One source of truth.** The project is plain JSON (`editor/model.js`) changed
  only through `editor/store.js`, which gives undo and redo for free.
- **Same pipeline for preview and export.** `render/scene.js` decides what is
  visible at a time, `render/compositor.js` draws it, both for the monitor and
  for every exported frame.
