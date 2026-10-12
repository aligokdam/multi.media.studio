# Multi Media Studio: developer guide

Everything below lives in the `mms/` folder next to `index.html`. One section per folder.

## `src/`: application source

Multi Media Studio is plain ES modules with no framework and no build step. The
browser loads `src/main.js` directly. `scripts/build-single.py` can optionally
bundle everything into one HTML file.

| Folder | What it contains |
| --- | --- |
| `core/` | Shared building blocks: DOM helper, i18n, preferences and theme, icons |
| `studio/` | The studio: project list, video editor shell, timeline, inspector, settings |
| `media/` | Importing user files and keeping decoded media in memory |
| `photo-editor/` | Photo editor: single photos and collages with filters, effects, text and stickers, export up to 8K |
| `render/` | WebGL2 compositor, effects, transitions, text, fonts and animations |
| `audio/` | Built-in music and sound effect library (synthesized, CC0) and audio previews |
| `export/` | MP4 and WebM export with WebCodecs, audio mixdown |
| `storage/` | Local persistence (OPFS, IndexedDB) and `.mmsp` project packages |
| `workers/` | Web workers for waveform peaks and time stretching |

Reusable interface components (sheets, toasts, inspector controls and the library
panels) live next to `src/` in `components/`.

Top-level files:

- `main.js` boots the app: applies preferences and language and runs the hash
  router (`#/`, `#/studio`, `#/privacy`, `#/terms`). The home page is static HTML
  in `index.html`. There is no service worker; older ones are removed on load.
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

## `src/core/`: shared building blocks

| File | Purpose |
| --- | --- |
| `util.js` | `h()` DOM builder, `pickFiles()`, formatting (time, bytes), ids, `Emitter`, downloads |
| `i18n.js` | Loads `locales/<code>.js`, falls back to English per key, applies `data-i18n` attributes, RTL |
| `prefs.js` | Small settings in `localStorage` (`mms.prefs`, `DEFAULTS` lists every key), and the theme (system, light, dark) and reduced motion applied to `<html>` |
| `icons.js` | The SVG icon set and the clapper logo (`MARK`) |
| `common-views.js` | Views used by both the site and the studio, such as the privacy summary sheet |

Conventions: components build DOM with `h(tag, attrs, ...children)` and own the
nodes they create. Visible text always comes from `t("section.key")`.

Sheets, toasts and inspector controls are in `components/`.

## `src/studio/`: the studio (project list and video editor)

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

## Library panels (`components/panels/`)

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

## `src/photo-editor/`: photo editor

A separate editor for single photos and collages, opened from the project
page ("Photo"). Photo projects are stored in the same project list as videos
(`kind: "photo"`) through `savePhotoProject()` in `src/storage/projects.js`.

| File | Purpose |
| --- | --- |
| `model.js` | The document: photos, collage layouts (1 to 9 photos), formats, border and background, filters, text and sticker items, export sizes |
| `render.js` | `PhotoRenderer`: draws the collage on a canvas. Photos with a filter, effect or adjustment go through the WebGL compositor of the video editor, everything else is drawn directly. Text uses the title renderer and fonts of the video editor |
| `editor.js` | The interface: top bar (format, undo, redo, export settings, export), tabs (Edit, Filter, Effect, Adjust, Text, Sticker), drawers with ✕ and ✓ on phones, a side panel on larger screens, and direct manipulation on the picture |

## Interactions

- Tap a photo to select it, drag to move it inside its frame, pinch or scroll to zoom.
- Text and stickers show a dashed frame with ✕ (delete), Edit (text) and a corner handle to resize and rotate. Rotation snaps to 0° and 90°.
- Every change is one undo step. Drawers on phones restore the previous state when ✕ is pressed.

## Export

JPEG, PNG or WebP at 1080p, 2K, 4K or 8K (long side). Before offering a size,
the editor checks that the browser can really allocate a canvas that large
(some mobile browsers limit the image area) and disables sizes it cannot
create. WebP is offered only where the browser can encode it.

## `src/media/`: imported media

`registry.js` owns everything about the files in the open project: Blobs, object
URLs, decoded images, audio buffers, thumbnails and waveform peaks. The project
JSON only stores metadata.

## Import rules

- Accepted video: MP4, M4V, MOV, WebM, MKV, OGV.
- Accepted audio: MP3, WAV, M4A, M4B, AAC, OGG, Opus, FLAC, WebM audio, AIFF, CAF, MKA.
  An MP4 or WebM file without a video stream is imported as audio.
- Accepted images: PNG, JPEG, WebP, GIF, AVIF, BMP, HEIC (when the browser can decode it).
- Each file is checked by extension and MIME type, size (up to 4 GB) and then
  actually probed with mediabunny or a media element. A file that cannot be
  read is rejected with a clear message. Formats the browser cannot play, such
  as AIFF in some browsers, are reported instead of being accepted silently.
- The same file (name, size and modification date) is stored only once per project.
- Files are written to local storage (`storage/db.js`). Nothing is uploaded.

## `src/render/`: drawing frames

| File | Purpose |
| --- | --- |
| `scene.js` | Decides which clips and transitions are visible at a time and turns them into compositor layers |
| `compositor.js` | WebGL2 renderer: layers with transforms, color adjustments and effect chains, and transition passes |
| `effects.js` | Built-in GLSL effects in five categories (Cutout and Poster, Pixel and Digital, Print and Texture, Edges and Drawing, Lens and Light), each with a strength and up to four own parameters, and validation of custom `.mmsfx` effects |
| `filters.js` | Colour and tone filters shared by the video and photo editors (adjustments plus an optional tone effect, scaled by strength) |
| `thumbs.js` | The procedural sample scene and cached previews of effects and filters drawn on it |
| `transitions.js` | 22 built-in transitions in four categories and imported GL Transitions shaders |
| `animations.js` | Clip in, out and loop animations, including the 18 text transitions. Pure functions of time, so preview and export match |
| `text.js` | Lays out titles on a canvas (wrapping, spacing, background, shadow) with a cache |
| `fonts.js` | Font library: system stacks, 16 bundled open-licence fonts (`assets/fonts/fonts.pack`) and fonts the user imports |
| `stickers.js` | Built-in emoji, face and hand stickers (27) drawn as SVG for this app (CC0), rasterised to PNG on the device, and the user sticker library |

## Custom transitions

Imported transitions use the [GL Transitions](https://gl-transitions.com) format:
GLSL that defines `vec4 transition(vec2 uv)` and reads `getFromColor(uv)`,
`getToColor(uv)`, `progress` and `ratio`. Uniform defaults written as
`uniform float x; // = 1.0` become constants. Each transition is compiled when it
is imported, and a transition that fails to compile falls back to a dissolve.
See `examples/transitions/`.

## Fonts

Bundled fonts are loaded only when they are first used. Titles redraw when a font
finishes loading, and export waits until every font in the project is ready.
Imported fonts (TTF, OTF, WOFF, WOFF2, up to 15 MB) are parsed before they are
stored, and stay on the device.

## Effects and filters

Filters change colour and tone (Vivid, Warm, Mono, Sepia and so on). Effects
transform the image itself and run as GLSL on the GPU, the same code for the
preview, video export and photo export:

| Category | Effects | Parameters |
| --- | --- | --- |
| Cutout and Poster | Cutout, Posterize, Threshold | tone levels, smoothing, outline, gamma, threshold, softness, invert |
| Pixel and Digital | Pixel, Glitch, RGB Shift, Noise | pixel size, blocks, shift, offset, angle |
| Print and Texture | Halftone, Worn Print, Film Grain, VHS | dot size, screen angle, colour dots, wear, misregistration, texture size |
| Edges and Drawing | Edges and Outline, Emboss | line width, sensitivity, lines only, light angle |
| Lens and Light | Blur, Sharpen, Chromatic Aberration, Vignette | strength |

Parameters reach the shader in `vec4 P` (see `effectParams()`); a clip or photo
stores them as `{ id, amount, params: { key: value } }`. Animated effects
(Glitch, Noise, Grain, VHS) move over time in videos and use a fixed frame in photos.

## `src/audio/`: built-in audio library

| File | Purpose |
| --- | --- |
| `synth.js` | A small offline synthesizer (oscillators, noise, filters, envelopes, reverb) on `OfflineAudioContext` |
| `music.js` | Built-in music tracks (genre, moods, length) generated by `synth.js` |
| `sfx.js` | 145 sound effects generated by `synth.js`, each with a category, mood and search tags |
| `preview.js` | Plays one preview at a time and reports progress |
| `rows.js` | The shared list row (play, title, details, waveform, add) and lazy waveform thumbnails |
| `wav.js` | Encodes an `AudioBuffer` as WAV |

## Sound effect categories

transition, whoosh, impact, ui (interface), ambience, nature, water (water and
air), mechanical, electronic, rise (rise and fall), cinematic, foley,
notification, reverse, stinger (short accents).

Every effect is a distinct generator function. None is a renamed copy of another.
Because everything is synthesized on the device, the whole library is CC0 1.0.
See the `audio/` section below for how to add entries.

## `src/export/`: video export

| File | Purpose |
| --- | --- |
| `export-sheet.js` | Export progress and result. Settings (resolution up to 8K, default 4K, frame rate, quality, format) live in the drop-down panel next to the Export button in `src/studio/studio.js`, and Export starts right away |
| `exporter.js` | Renders each frame with the compositor and encodes it with WebCodecs into MP4 or WebM (mediabunny) |
| `mixer.js` | Offline audio mixdown of all audio clips with volume, fades and speed |

Export runs fully in the browser. If the device cannot encode the chosen resolution, the highest one it can encode is used. Where the File System Access API is available
the video is written straight to disk, otherwise it is offered as a download.

## `src/storage/`: local persistence

| File | Purpose |
| --- | --- |
| `db.js` | IndexedDB wrapper with `projects`, `blobs` and `kv` stores, and media files in the Origin Private File System with an IndexedDB fallback and size checks |
| `projects.js` | Saving, loading, listing and deleting projects, and `.mmsp` project packages (ZIP via fflate) for moving projects between devices |

Everything is stored only in this browser, on this device. Clearing site data
removes it, which is why the app recommends exporting important work regularly.
User libraries (imported sounds, effects, transitions and fonts) live in the
`kv` store and in blob storage.

## `src/workers/`: background work

| File | Purpose |
| --- | --- |
| `peaks.worker.js` | Computes waveform peaks for audio clips on the timeline |
| `stretch.worker.js` | Time stretches audio for clips played faster or slower during export |

The single-file build inlines both workers as Blob URLs.

## `components/`: reusable interface components

Building blocks used by the studio, the video editor and the photo editor.
They depend only on `src/core/` (DOM helper, translations, icons, preferences)
and on the render and storage modules they display.

| File | Purpose |
| --- | --- |
| `sheet.js` | Sheets with a view stack (centred card on large screens, bottom sheet on phones), `confirmDialog()`, `promptDialog()` and `toast()` (one at a time, announced to screen readers) |
| `controls.js` | Inspector controls: sliders with one undo step per drag, toggles, selects, segmented controls, colour rows |

## `panels/`: library panels of the video editor

Every library uses the same layout: Import button, search, category chips,
filters, the list or grid with previews, and drag and drop.

| File | Panels |
| --- | --- |
| `media-panel.js` | Imported media with search and a Videos, Photos, Audio filter. Also exports `importFlow()` and `dropImport()` |
| `audio-panels.js` | Music (genre, mood, length) and Sounds (145 effects in 15 categories, waveforms, your own sounds) |
| `visual-panels.js` | Text styles (entrance, exit and fonts are set in the inspector), Effects (GPU effects with settings) and Transitions (22 built in, GL Transitions import) |
| `sticker-panel.js` | Built-in emoji and hand stickers and your own images |

## `assets/`: styles, icons and fonts

| Path | Purpose |
| --- | --- |
| `css/base.css` | Design tokens (colors for light and dark, radii, type), base elements, sheets, lists |
| `css/landing.css` | Home page, privacy and terms pages |
| `css/studio.css` | Project list, video editor, timeline, panels and phone layout |
| `css/photo-editor.css` | Photo editor: canvas, tool panel, drawers and selection handles |
| `icons/icon.svg`, `icons/icon-*.png` | App icon (clapper) for the browser and home screen |
| `icons/logo.svg` | Black and white logo shown at the top of the README |
| `fonts/fonts.pack` | The 16 open-licence title fonts (WOFF, subset to Latin, Latin Extended, Cyrillic and Vietnamese) in one file, loaded the first time a title font is needed. Rebuild with `python3 scripts/build-single.py --pack-fonts FOLDER` |
| `fonts/LICENSES.txt` | The licence text of every bundled font in one file (SIL Open Font License 1.1, Permanent Marker under Apache 2.0) |

Fonts: Montserrat, Poppins, Oswald, Bebas Neue, Anton, Righteous, Bangers,
Abril Fatface, Playfair Display, Lora, Lobster, Pacifico, Dancing Script,
Caveat, Permanent Marker, Space Mono. Source: the Google Fonts repository.

## `locales/`: translations

24 languages, one file each, in this order: en, fil, fr, de, ha, id, it, pt, es,
tr, vi, ar, fa, ur, ru, zh, ja, ko, hi, mr, bn, pa, ta, te. Arabic, Persian and
Urdu are shown right to left.

- Each file exports one flat object of `"section.key": "text"`.
- `en.js` is the reference and the fallback for any missing key.
- `{name}` style placeholders must stay unchanged.
- Visible text avoids semicolons and dashes (house style).
- `index.js` lists the languages with their native names and direction.

Run `node scripts/check-locales.mjs` to check every file against English for
missing or extra keys and placeholder mismatches.

## Built-in music and sound library

There are no audio files to ship:
every track and sound effect is synthesized in the browser by the code in
`src/audio/`, which is why the whole library is CC0.

All built-in music and sound effects are **generated on the user's device** by the
synthesizer in `src/audio/synth.js`. There are no samples, loops or third-party
recordings in this repository, which is why the library can be released under
**CC0 1.0** (public domain) and used commercially without attribution.

## Adding a track

Tracks are data in `src/audio/music.js` (`TRACKS`):

```js
{ id: "m-my-track", title: "My Track", genre: "chill", moods: ["warm"], duration: 60, seed: 1234, root: 50, scale: "major" }
```

- `genre` selects the arrangement recipe (see `RECIPES` and `compose()`).
- `seed` makes melodies and textures reproducible.
- `root` is the MIDI note of the key, `scale` one of `major`, `minor`, `dorian`, `mixolydian`.

Sound effects are added the same way in `src/audio/sfx.js` with `add()`:

```js
add("s-my-sound", "My Sound", "impact", 1.2, "dramatic", "hit boom deep", (s) => burst(s, 0, 1.1, 90, 0.8));
```

- `category` is one of the 15 categories in `SFX_CATEGORIES`.
- `mood` is one of `SFX_MOODS` (calm, playful, tense, dramatic, bright, dark).
- `tags` are English search words.
- The generator must make a sound that is really different from every other
  entry. Do not add renamed copies.

The library currently has 145 sound effects and every one of them is generated.

## Licensing rule

Only add audio whose license is certain. Generated material is CC0. If file-based
audio is ever added, keep it on the app's own origin and record its license next
to the entry so it is shown in **Music › License information**.

## `libraries/`: third-party libraries

| Library | License | Used for |
| --- | --- | --- |
| [mediabunny](https://github.com/Vanilagy/mediabunny) | MPL-2.0 | Reading and writing MP4 and WebM, decoding with WebCodecs |
| [fflate](https://github.com/101arrowz/fflate) | MIT | ZIP for `.mmsp` project packages |

Both are included unmodified as minified builds with their licence files.
They are loaded on demand, never from a CDN.

## Custom video effects (`.mmsfx`)

A custom effect is a small JSON file with one GLSL function. Import it from
**Effects → Import**. It is compiled once on import and stored in your
browser; nothing is uploaded.

```json
{
  "format": "mms-effect",
  "version": 1,
  "id": "duotone",
  "name": { "en": "Duotone", "tr": "Çift Ton" },
  "defaultAmount": 0.8,
  "glsl": "vec4 FX(vec2 uv, vec4 c, float a) { ... }"
}
```

The function receives premultiplied color `c` at texture coordinate `uv` and the
strength `a` (0–1) and returns premultiplied color. These helpers are available:

| Name | Meaning |
|---|---|
| `src(vec2 uv)` | Color-adjusted, premultiplied sample of the clip |
| `unpremul(vec4 c)` | Straight RGB from premultiplied color |
| `luma(vec3 rgb)` | Rec. 709 luminance |
| `rand(vec2 p)` | Hash-based pseudo-random number 0–1 |
| `uTexel` | 1 / layer size in pixels |
| `uRes` | Layer size in pixels |
| `uTime` | Timeline time in seconds |

Rules: the source must define `vec4 FX(...)`, must not declare uniforms or
`main()`, and is limited to 20 KB. See `duotone.mmsfx` for a complete example.

## Custom transitions

Import a transition from **Transitions → Import**. Two file types work:

- `.glsl` in the [GL Transitions](https://gl-transitions.com) format, the open
  collection of transition shaders. Most of its transitions can be imported as they are.
- `.mmstr`, a JSON file: `{ "name": "My Transition", "glsl": "vec4 transition(vec2 uv) { ... }" }`

The shader defines `vec4 transition(vec2 uv)` and can use:

| Name | Meaning |
| --- | --- |
| `getFromColor(uv)` | The outgoing clip |
| `getToColor(uv)` | The incoming clip |
| `progress` | 0 to 1 across the transition |
| `ratio` | Width divided by height |

`uniform float strength; // = 0.5` style defaults become constants. A comment
`// name: My Transition` sets the display name. Files up to 32 KB are accepted.
The shader is compiled once when imported and stored only in your browser.

## `scripts/`: maintenance tools

| Script | What it does |
| --- | --- |
| `check-locales.mjs` | `node scripts/check-locales.mjs` checks every locale against English |
| `build-single.py` | `python3 scripts/build-single.py` writes `standalone/multi-media-studio.html`, the whole app in one file. Needs [bun](https://bun.sh) |

The single file inlines code, styles, languages, fonts and workers, has a strict
Content Security Policy and works without a server: `index.html` opens it automatically when the folder is opened from disk.
