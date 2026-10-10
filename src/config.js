/* Multi Media Studio: product configuration.
   Everything that identifies the product or could change between releases lives here,
   so the rest of the code never hard-codes names, links or versions. */

export const APP = Object.freeze({
  name: "Multi Media Studio",
  shortName: "MM Studio",
  version: "1.0.0",
  author: "Ali Gökdam",
  repository: "https://github.com/aligokdam/multi.media.studio",
  issues: "https://github.com/aligokdam/multi.media.studio/issues",
  license: "MIT",
  projectFormat: "multi-media-studio-project",
  projectFormatVersion: 1,
  projectExtension: ".mmsp",
  effectExtension: ".mmsfx",
});

/* Sustainability hooks. The app is free and has no paywall. If a donation or sponsor
   page is ever added, switch `enabled` on and fill in the link: the About page shows
   it as a single, quiet row. Nothing else in the app reads this. */
export const SUPPORT = Object.freeze({
  enabled: false,
  url: "",
  labelKey: "about.support",
});

/* Limits that keep the browser responsive. */
export const LIMITS = Object.freeze({
  maxImportBytes: 4 * 1024 ** 3,       // 4 GB per file
  maxDecodeAudioBytes: 512 * 1024 ** 2, // fallback full-file audio decode
  historyDepth: 120,
  minClipDuration: 0.1,
  maxZoom: 600,                         // pixels per second
  minZoom: 2,
});

export const ASPECTS = Object.freeze({
  "16:9": [16, 9],
  "9:16": [9, 16],
  "1:1": [1, 1],
  "4:5": [4, 5],
  "4:3": [4, 3],
  "21:9": [21, 9],
});

export const RESOLUTIONS = Object.freeze([720, 1080, 1440, 2160]);
export const FRAME_RATES = Object.freeze([24, 25, 30, 60]);
