# `src/core/`: shared building blocks

| File | Purpose |
| --- | --- |
| `util.js` | `h()` DOM builder, `pickFiles()`, formatting (time, bytes), ids, `Emitter`, downloads |
| `i18n.js` | Loads `locales/<code>.js`, falls back to English per key, applies `data-i18n` attributes, RTL |
| `prefs.js` | Small settings in `localStorage` (`mms.prefs`). `DEFAULTS` lists every key |
| `appearance.js` | Applies theme (system, light, dark) and reduced motion to `<html>` |
| `icons.js` | The SVG icon set and the clapper logo (`MARK`) |
| `common-views.js` | Views used by both the site and the studio, such as the privacy summary sheet |

Conventions: components build DOM with `h(tag, attrs, ...children)` and own the
nodes they create. Visible text always comes from `t("section.key")`.

Sheets, toasts and inspector controls are in [`components/`](../../components/README.md).
