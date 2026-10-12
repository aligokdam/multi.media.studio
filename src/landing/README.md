# `src/landing/`: home page

The home page is static markup in `index.html` (hero, how it works, values,
GitHub card and FAQ), styled by `assets/css/landing.css`. `landing.js` only
provides the `show()` and `hide()` hooks the router calls. Each FAQ item is a
native `<details>` element, so any number of answers can be open at the same time.
The logo scrolls back to the top and the privacy links open the privacy summary
sheet (both handled in `src/main.js`).
