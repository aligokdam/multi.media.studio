# `locales/`: translations

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
