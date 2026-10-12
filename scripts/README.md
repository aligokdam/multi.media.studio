# `scripts/`: maintenance tools

| Script | What it does |
| --- | --- |
| `check-locales.mjs` | `node scripts/check-locales.mjs` checks every locale against English |
| `build-single.py` | `python3 scripts/build-single.py` writes `dist/multi-media-studio.html`, the whole app in one file. Needs [bun](https://bun.sh) |

The single file inlines code, styles, languages, fonts and workers, has a strict
Content Security Policy and works offline when opened from disk.
