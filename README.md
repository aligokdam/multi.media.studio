## <img src="assets/icon.svg" alt="Multi Media Studio logo" width="32" height="32" align="center"> Multi Media Studio

Edit videos with a multi-track timeline directly in your browser.

Multi Media Studio is an open-source video editor that lets you cut, layer, color, title and score your clips, then export them as MP4 or WebM, with a phone layout modelled on mobile video editors and a full workspace on desktop.

All processing happens locally in your browser. Your media is never uploaded. Projects are saved only in this browser, on this device.

🌐 **Live Demo Link :** https://aligokdam.github.io/multi-media-studio/

---

## Features

- 🎞️ Multi-track timeline for video, photos, text, music and sound effects
- ✂️ Split, trim, join, duplicate and reorder clips
- 🎨 Color adjustments and GPU effects (Blur, Film Grain, VHS, Glitch, Vignette and more)
- 🔀 Transitions: Cut, Fade, Dissolve, Wipe, Slide, Push, Zoom, Blur, Glitch
- 🔤 Titles, subtitles and captions with animations
- 🎵 Built-in royalty-free music and sound library (CC0)
- ⏩ Speed, volume and fades
- ↩️ Undo and redo
- 💾 MP4 & WebM export up to 4K, 24 to 60 fps
- 📦 Project export and import (.mmsp)
- 📱 Dedicated phone layout, dark and light themes
- 🌍 24 languages with right-to-left support
- 🔒 Fully client-side processing

---

## How It Works

1. Create a project and pick a format.
2. Add videos, photos and audio.
3. Edit on the timeline: cut, add titles, transitions, effects and color.
4. Export your video as MP4 or WebM.

---

## Project Structure

```text
multi-media-studio/
├── index.html
├── src/          app code (editor, rendering, audio, export, storage)
├── assets/       styles and icons
├── locales/      24 languages
├── vendor/       mediabunny (MPL-2.0), fflate (MIT)
├── scripts/      locale checker, single-file build
└── README.md
```

To run it locally, serve the folder with any static server (for example `python3 -m http.server`).
`python3 scripts/build-single.py` builds the whole app as one HTML file in `dist/`.

---

## License

MIT License

---

Created by **Ali Gökdam**
