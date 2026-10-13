/* Multi Media Studio icon set.
   24×24 grid, 1.7 stroke, rounded joins. Drawn for this app: tracks, frames and
   waveforms rather than generic glyphs, so the family resemblance stays in the
   stroke style, not the shapes. */

const P = {
  play: '<path d="M8 5.6v12.8a.9.9 0 0 0 1.37.77l10.2-6.4a.9.9 0 0 0 0-1.54L9.37 4.83A.9.9 0 0 0 8 5.6z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  forward: '<path d="M9 5l7 7-7 7"/>',
  chevron: '<path d="M9.5 6l6 6-6 6"/>',
  chevronDown: '<path d="M6 9.5l6 6 6-6"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  more: '<circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  undo: '<path d="M9 8H5V4"/><path d="M5.3 8A8 8 0 1 1 4 13"/>',
  redo: '<path d="M15 8h4V4"/><path d="M18.7 8A8 8 0 1 0 20 13"/>',
  // Editing
  split: '<path d="M12 3v18"/><path d="M4 8h5v8H4zM15 8h5v8h-5z"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7"/>',
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="2.4"/><path d="M16 8V6.4A2.4 2.4 0 0 0 13.6 4H6.4A2.4 2.4 0 0 0 4 6.4v7.2A2.4 2.4 0 0 0 6.4 16H8"/>',
  join: '<path d="M3 8h6v8H3zM15 8h6v8h-6z"/><path d="M9 12h6"/>',
  speed: '<path d="M4.6 17a8 8 0 1 1 14.8 0"/><path d="M12 13l4-4.5"/><circle cx="12" cy="13" r="1.3" fill="currentColor" stroke="none"/>',
  volume: '<path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  fade: '<path d="M3 19L9 7h6l6 12"/><path d="M3 19h18"/>',
  adjust: '<path d="M5 6h9M18 6h1M5 12h3M12 12h7M5 18h11M20 18h-1"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  animate: '<rect x="11" y="6" width="9" height="12" rx="2.2"/><path d="M7.5 8.5v7M4 10v4"/>',
  transform: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.4"/>',
  magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4"/><path d="M6 8h4M14 8h4"/><path d="M10 4v8a2 2 0 0 0 4 0V4"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20M10.5 8v5M8 10.5h5"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20M8 10.5h5"/>',
  fit: '<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"/>',
  // Library
  emptyTray: '<path d="M14.5 18.5H4.6a1.1 1.1 0 0 1-1.1-1.1V12l2.3-6.4a1.1 1.1 0 0 1 1-.7h10.4a1.1 1.1 0 0 1 1 .7l2.3 6.4v.8"/><path d="M3.5 12h4.2c.5 0 .8.4.9.8.3 1.3 1.4 2.2 3.4 2.2.9 0 1.6-.2 2.2-.5"/><circle cx="18.2" cy="17.6" r="3.3"/><path d="M15.9 19.9l4.6-4.6"/>',
  media: '<rect x="3.5" y="5" width="17" height="14" rx="2.6"/><path d="M3.5 9h17M3.5 15h17M8 5v4M8 15v4M16 5v4M16 15v4"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.6"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
  clapper: '<rect x="3.5" y="10" width="17" height="9.6" rx="2.2" fill="currentColor" stroke="none"/><path d="M5.2 4.6h3.4l-2 4H3.5V6.3a1.7 1.7 0 0 1 1.7-1.7zM10.6 4.6H14l-2 4H8.6zM16 4.6h2.8a1.7 1.7 0 0 1 1.7 1.7v2.3H14z" fill="currentColor" stroke="none"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2.4"/><path d="M16 10.5l5-3v9l-5-3"/>',
  music: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  sticker: '<path d="M20 12.5V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h5.5z"/><path d="M12.5 20v-4.5a3 3 0 0 1 3-3H20"/><path d="M8.5 9.5v.5M14.5 9.5v.5M8.5 14q1.5 1.6 3.5 1.6"/>',
  none: '<circle cx="12" cy="12" r="8.5"/><path d="M6 18L18 6"/>',
  devices: '<rect x="2.5" y="5" width="13" height="10" rx="1.6"/><path d="M6 19h6"/><rect x="17" y="8" width="4.5" height="11" rx="1.2"/>',
  timeline: '<rect x="3" y="4.5" width="10" height="4" rx="1.2"/><rect x="7" y="10" width="14" height="4" rx="1.2"/><rect x="3" y="15.5" width="8" height="4" rx="1.2"/><path d="M15 3v18"/>',
  wave: '<path d="M3 12h1.5M6.5 8v8M10 5v14M13.5 9v6M17 7v10M20.5 11v2"/>',
  text: '<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6"/>',
  effects: '<path d="M12 3l1.8 4.6L18.5 9.5l-4.7 1.9L12 16l-1.8-4.6L5.5 9.5l4.7-1.9z"/><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  transition: '<rect x="3" y="6" width="11" height="12" rx="2.2"/><path d="M14 6h4.8A2.2 2.2 0 0 1 21 8.2v7.6a2.2 2.2 0 0 1-2.2 2.2H14" stroke-dasharray="2 2.4"/>',
  layers: '<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5"/><path d="M3.5 16.5L12 21l8.5-4.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  importFile: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4 15v2.6A2.4 2.4 0 0 0 6.4 20h11.2a2.4 2.4 0 0 0 2.4-2.4V15"/>',
  exportFile: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4 15v2.6A2.4 2.4 0 0 0 6.4 20h11.2a2.4 2.4 0 0 0 2.4-2.4V15"/>',
  folder: '<path d="M3.5 7.4A2.4 2.4 0 0 1 5.9 5h3.6l2 2.2h6.6a2.4 2.4 0 0 1 2.4 2.4v7.9a2.4 2.4 0 0 1-2.4 2.4H5.9a2.4 2.4 0 0 1-2.4-2.4z"/>',
  // Track state
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M4 4l16 16M9.9 6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.3 7.6A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.2-1"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8 10.5V8a4 4 0 0 1 7.7-1.5"/>',
  // App chrome
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8l1.6 2.3 2.8-.4.9 2.6 2.6 1-.4 2.8L21.2 12l-1.7 1.9.4 2.8-2.6 1-.9 2.6-2.8-.4L12 21.2l-1.6-2.3-2.8.4-.9-2.6-2.6-1 .4-2.8L2.8 12l1.7-1.9-.4-2.8 2.6-1 .9-2.6 2.8.4z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18"/>',
  appearance: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none"/>',
  playback: '<rect x="3" y="4.5" width="18" height="13" rx="2.6"/><path d="M10.5 8.5v5l4-2.5z" fill="currentColor"/><path d="M7 20.5h10"/>',
  storage: '<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.4-7.5 9.5-4.3-1.1-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12l2.3 2.3 4.2-4.6"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.4"/><path d="M6 9.5h.01M9.3 9.5h.01M12.6 9.5h.01M15.9 9.5h.01M18 9.5h.01M6 12.5h.01M18 12.5h.01M9 15h6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.01"/>',
  general: '<rect x="4" y="4" width="7" height="7" rx="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  github: '<path fill="currentColor" stroke="none" d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.65-.2.65-.46v-1.6c-2.64.57-3.2-1.27-3.2-1.27-.43-1.1-1.05-1.4-1.05-1.4-.86-.59.07-.58.07-.58.95.07 1.45.98 1.45.98.85 1.45 2.22 1.03 2.76.79.09-.61.33-1.03.6-1.27-2.1-.24-4.32-1.05-4.32-4.7 0-1.03.37-1.88.98-2.54-.1-.24-.42-1.2.09-2.5 0 0 .8-.26 2.6.97a9 9 0 0 1 4.75 0c1.8-1.23 2.6-.97 2.6-.97.51 1.3.19 2.26.1 2.5.6.66.97 1.5.97 2.54 0 3.66-2.23 4.46-4.35 4.7.34.29.65.87.65 1.76v2.6c0 .26.16.57.66.47A9.5 9.5 0 0 0 12 2.5z"/>',
  fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  home: '<path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19z"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="2.6"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  sparkle: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5L9 15M15 9l2.5-2.5"/>',
  star: '<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
  code: '<path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.6 5l-3.2 14"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.6"/><path d="M8.2 12.3l2.6 2.6 5.6-6.2"/>',
  caret: '<path d="M7.5 10h9l-4.5 5z" fill="currentColor" stroke="none"/>',
  help: '<circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.2-2.5 3.7"/><circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none"/>',
  heart: '<path d="M12 20s-7.5-4.5-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.5-7.5 10-7.5 10z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  license: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M10 12h5M10 15.5h5"/>',
  offline: '<path d="M2.5 8.5a14 14 0 0 1 19 0M5.5 12a9.5 9.5 0 0 1 13 0M8.6 15.4a5 5 0 0 1 6.8 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/>',
  device: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M10.5 18.5h3"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9.5 9.5h5v5h-5zM9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  noUpload: '<path d="M12 15V5M8 9l4-4 4 4M5 19h14"/><path d="M4 4l16 16"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.7 6.7a1.4 1.4 0 0 1-2 0z"/><circle cx="8" cy="8" r="1.4"/>',
  align: { left: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>', center: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>', right: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>' },
  marker: '<path d="M6 3.5h12v13l-6 4-6-4z"/>',
  aspect: '<rect x="3" y="6" width="18" height="12" rx="2.2"/><path d="M7 10v-1h2M17 14v1h-2"/>',
};

/** Returns inline SVG markup for an icon. `size` is the CSS box in px (optional). */
export function icon(name, cls = "") {
  let body = P[name];
  if (name.startsWith("align-")) body = P.align[name.slice(6)];
  if (!body) body = P.info;
  return `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** The product mark: a clapperboard in the label color (black on light, white on dark). */
export const MARK = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false" style="fill:var(--label)"><path d="M4.6 3h5L6.6 9.2H2V5.6A2.6 2.6 0 0 1 4.6 3z"/><path d="M12 3h5.2l-3 6.2H9z"/><path d="M19.6 3h7.8A2.6 2.6 0 0 1 30 5.6v3.6H16.6z"/><rect x="2" y="11.4" width="28" height="17.6" rx="3.6"/></svg>`;
