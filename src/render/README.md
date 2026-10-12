# `src/render/`: drawing frames

| File | Purpose |
| --- | --- |
| `scene.js` | Decides which clips and transitions are visible at a time and turns them into compositor layers |
| `compositor.js` | WebGL2 renderer: layers with transforms, color adjustments and effect chains, and transition passes |
| `effects.js` | Built-in GLSL effects in five categories (Cutout and Poster, Pixel and Digital, Print and Texture, Edges and Drawing, Lens and Light), each with a strength and up to four own parameters, and validation of custom `.mmsfx` effects |
| `filters.js` | Colour and tone filters shared by the video and photo editors (adjustments plus an optional tone effect, scaled by strength) |
| `thumbs.js` | Cached previews of effects and filters on the sample scene |
| `transitions.js` | 22 built-in transitions in four categories and imported GL Transitions shaders |
| `animations.js` | Clip in, out and loop animations, including the 18 text transitions. Pure functions of time, so preview and export match |
| `text.js` | Lays out titles on a canvas (wrapping, spacing, background, shadow) with a cache |
| `fonts.js` | Font library: system stacks, 16 bundled open-licence fonts (`assets/fonts`) and fonts the user imports |
| `stickers.js` | Nine built-in emoji stickers drawn as SVG for this app (CC0), rasterised to PNG on the device, and the user sticker library |
| `sample.js` | A procedural sample scene for effect and transition thumbnails |

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
