# `src/photo-editor/`: photo editor

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
