# `src/studio/`: the studio (project list and video editor)

| File | Purpose |
| --- | --- |
| `studio.js` | Project list (desktop grid and phone list), editor shell, panels, top bar (`?` help, undo, redo, export), autosave, shortcuts, responsive layout |
| `model.js` | Project data model: tracks, clips, transitions, helpers such as `mainTrack()` and `projectDuration()` |
| `store.js` | Editor state with undo and redo. All project changes go through `update()` or a gesture |
| `actions.js` | Every editing operation as one undoable step: add media or text, split, trim, transitions, effects, tracks (`addTrack`, `renameTrack`, `removeTrack`) |
| `timeline.js` | The multi-track timeline. Track headers can be renamed and deleted, `+ Add track` adds lanes |
| `inspector.js` | Contextual properties for the selection (text, effects, motion, color, audio) |
| `playback.js` | Real-time preview playback synced to the audio clock |
| `preview.js` | The monitor: draws the current frame and handles on-canvas moving and scaling |
| `settings.js` | Settings sheet and the "How it works" guide |

## Library panels ([`components/panels/`](../../components/README.md))

Every library follows the same layout so they feel like one system:
title, **Import** button, search, category chips, extra filters, the list or
grid, and preview and add buttons. Files can also be dropped onto any panel.

| Panel | File | Notes |
| --- | --- | --- |
| Media | `media-panel.js` | Imported files with search and a Videos, Photos, Audio filter. `importFlow()` and `dropImport()` are shared helpers |
| Music | `audio-panels.js` | Built-in tracks with genre, mood and length filters, plus your own audio |
| Sounds | `audio-panels.js` | 145 built-in sound effects in 15 categories with search, mood and length filters and waveforms. Only one preview plays at a time |
| Text | `visual-panels.js` | Three tabs: styles, 18 text transitions plus a None tile (with the automatic transition switch, off by default) and fonts (bundled, system and imported) |
| Effects | `visual-panels.js` | A No effect tile, GPU effects by category, custom `.mmsfx` effects |
| Stickers | `sticker-panel.js` | Nine built-in emoji stickers and your own PNG, JPG, WebP, GIF, AVIF or SVG images. A sticker becomes an image clip on an overlay track |
| Transitions | `visual-panels.js` | 22 built-in transitions by category, imported GL Transitions `.glsl` files |

## Tracks

The main track always exists. Deleting it clears its clips instead. Other tracks
can be added, renamed and deleted. When the user changes the lanes,
`p.settings.customLanes` is set so empty default lanes are not added back.
