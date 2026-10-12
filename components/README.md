# `components/`: reusable interface components

Building blocks used by the studio, the video editor and the photo editor.
They depend only on `src/core/` (DOM helper, translations, icons, preferences)
and on the render and storage modules they display.

| File | Purpose |
| --- | --- |
| `sheet.js` | Sheets with a view stack (centred card on large screens, bottom sheet on phones), `confirmDialog()` and `promptDialog()` |
| `toast.js` | One toast at a time, announced to screen readers |
| `controls.js` | Inspector controls: sliders with one undo step per drag, toggles, selects, segmented controls, colour rows |

## `panels/`: library panels of the video editor

Every library uses the same layout: Import button, search, category chips,
filters, the list or grid with previews, and drag and drop.

| File | Panels |
| --- | --- |
| `media-panel.js` | Imported media with search and a Videos, Photos, Audio filter. Also exports `importFlow()` and `dropImport()` |
| `audio-panels.js` | Music (genre, mood, length) and Sounds (145 effects in 15 categories, waveforms, your own sounds) |
| `visual-panels.js` | Text (styles, 18 text transitions, fonts), Effects (GPU effects with settings) and Transitions (22 built in, GL Transitions import) |
| `sticker-panel.js` | Nine built-in emoji stickers and your own images |
