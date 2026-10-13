# <img src="mms/assets/icons/logo.svg" alt="Multi Media Studio logo" width="64" height="64" align="center"> Multi Media Studio

Edit your videos right in your browser with a multi-track timeline.

Multi Media Studio is an open-source video editor that lets you cut, layer and color your clips, add titles and music, then export to MP4 or WebM. On a phone it offers a layout similar to mobile video editors; on a desktop, a full workspace.

Everything happens locally in your browser. Your media is never uploaded to any server. Projects are stored only in this browser, on this device.

🌐 **Live Demo:** https://aligokdam.github.io/multi.media.studio/

---

## Features

- 🎞️ Multi-track timeline: video, photo, text, music and audio
- ✂️ Split, trim, duplicate, speed and volume control, undo and redo
- 🎨 Color filters, Cutout and other GPU effects, transitions
- 🔤 Animated intro and outro titles, add your own fonts
- 😀 Ready-made stickers and your own images
- 🎵 Royalty-free music and sound effects (CC0)
- 🖼️ Photo editor and collage
- 💾 MP4 and WebM export up to 8K, from 24 to 60 fps
- 📱 Phone, tablet and desktop, light and dark theme, many languages
- 🔒 Everything stays on your device, nothing is uploaded

---

## How It Works

1. Tap Create and choose a photo or video. Photos open in the photo editor, videos in the video editor.
2. Add videos, photos and audio.
3. Edit on the timeline: cut, and add titles, transitions, effects and color.
4. Export your video as MP4 or WebM.

---

## Project Structure

There are only three files at the root. The app is split into two folders: `mms/` contains the app itself (code, components, styles), and `m.m.s/` contains languages, libraries, examples, scripts and the single-file build. This keeps both folders under GitHub's single-upload limit. Folder names are in English, and what each folder does is explained in the `m.m.s/DOCS.md` guide.

```text
multi.media.studio/
├── index.html              landing page and terms (the app's entry point)
├── README.md               this file
├── LICENSE                 MIT license
├── mms/                    the app
│   ├── app.webmanifest     app identity: name, icon, color (add to home screen)
│   ├── assets/
│   │   ├── css/            base, landing, studio, photo-editor styles
│   │   ├── icons/          app icons and README logo
│   │   └── fonts/          openly licensed fonts (in a single file) and license texts
│   ├── src/
│   │   ├── main.js, boot.js, config.js
│   │   ├── core/           shared helpers, language, settings and theme, icons
│   │   ├── studio/         project list, video editor, timeline, inspector
│   │   ├── photo-editor/   photo editor and collage
│   │   ├── media/          file import and validation
│   │   ├── render/         WebGL compositor, effects, filters, transitions, text, fonts, stickers
│   │   ├── audio/          synthesizer that generates music and sound effects
│   │   ├── export/         MP4 and WebM export
│   │   ├── storage/        local storage and .mmsp packages
│   │   └── workers/        waveform and time-stretch workers
│   └── components/         shared UI components and library panels
└── m.m.s/                  files that sit alongside the app
    ├── DOCS.md             developer guide (description of each folder)
    ├── locales/            languages
    ├── libraries/          mediabunny (MPL-2.0), fflate (MIT)
    ├── examples/           sample effect and transition files
    ├── standalone/         single-file build (used when index.html is opened from a folder)
    └── scripts/            locale checker, single-file build
```

The easiest way to run it locally is to double-click `index.html`. Because browsers block modules on pages opened from a folder, the app automatically switches to `m.m.s/standalone/multi-media-studio.html` in that case. You can also serve the folder with a static server if you prefer (for example `python3 -m http.server`).
`python3 m.m.s/scripts/build-single.py` rebuilds this single-file version.

---

## License

MIT License

---

Created by **Ali Gökdam**
