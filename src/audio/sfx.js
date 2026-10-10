/* Built-in sound effects, synthesized on the device (CC0, see music.js).
   User-imported effects are stored with the user's media and listed alongside
   (see editor/panels/sounds.js). */
import { Synth, renderOffline, midiToFreq, normalize } from "./synth.js";

export const SFX_CATEGORIES = ["whoosh", "click", "pop", "impact", "transition", "ui", "camera", "glitch", "nature", "notification"];

// Each entry: duration in seconds and a generator that receives (synth, ctx).
const DEFS = [
  { id: "s-air-whoosh", title: "Air Whoosh", category: "whoosh", duration: 1.0, seed: 11, gen: (s) => sweep(s, 0, 0.85, 500, 3800, 0.5) },
  { id: "s-fast-swish", title: "Fast Swish", category: "whoosh", duration: 0.5, seed: 12, gen: (s) => sweep(s, 0, 0.38, 1400, 7000, 0.45) },
  { id: "s-deep-swoosh", title: "Deep Swoosh", category: "whoosh", duration: 1.4, seed: 13, gen: (s) => sweep(s, 0, 1.2, 160, 1400, 0.7) },
  { id: "s-soft-click", title: "Soft Click", category: "click", duration: 0.15, seed: 21, gen: (s, c) => click(s, c, 0, 2200, 0.5) },
  { id: "s-mouse-click", title: "Mouse Click", category: "click", duration: 0.2, seed: 22, gen: (s, c) => { click(s, c, 0, 3600, 0.6); click(s, c, 0.07, 2600, 0.35); } },
  { id: "s-switch", title: "Switch", category: "click", duration: 0.25, seed: 23, gen: (s, c) => { click(s, c, 0, 1500, 0.7); tone(s, c, 0.005, 900, 0.05, 0.12, "square"); } },
  { id: "s-bubble-pop", title: "Bubble Pop", category: "pop", duration: 0.3, seed: 31, gen: (s, c) => chirp(s, c, 0, 380, 1300, 0.09, 0.5) },
  { id: "s-cork-pop", title: "Cork Pop", category: "pop", duration: 0.4, seed: 32, gen: (s, c) => { chirp(s, c, 0, 900, 260, 0.06, 0.6); burst(s, 0, 0.05, 2500, 0.5); } },
  { id: "s-cinematic-hit", title: "Cinematic Hit", category: "impact", duration: 3, seed: 41, gen: (s) => { s.boom(0.02, { gain: 0.9 }); burst(s, 0.02, 0.35, 900, 0.6); s.tom(0.02, 40, { gain: 0.6 }); } },
  { id: "s-thud", title: "Thud", category: "impact", duration: 0.8, seed: 42, gen: (s) => { s.kick(0, { gain: 1 }); burst(s, 0, 0.08, 400, 0.4); } },
  { id: "s-boom", title: "Boom", category: "impact", duration: 3, seed: 43, gen: (s) => s.boom(0, { gain: 1 }) },
  { id: "s-riser", title: "Riser", category: "transition", duration: 3, seed: 51, gen: (s) => { s.riser(0, 2.8, { gain: 0.35 }); } },
  { id: "s-reverse-swell", title: "Reverse Swell", category: "transition", duration: 2.2, seed: 52, gen: (s, c) => swell(s, c, 2.1) },
  { id: "s-downlifter", title: "Downlifter", category: "transition", duration: 2.5, seed: 53, gen: (s) => sweep(s, 0, 2.3, 6000, 200, 0.45) },
  { id: "s-tap", title: "Tap", category: "ui", duration: 0.15, seed: 61, gen: (s, c) => tone(s, c, 0, 1800, 0.05, 0.25, "sine") },
  { id: "s-confirm", title: "Confirm", category: "ui", duration: 0.5, seed: 62, gen: (s, c) => { tone(s, c, 0, midiToFreq(76), 0.12, 0.25); tone(s, c, 0.09, midiToFreq(83), 0.25, 0.25); } },
  { id: "s-error", title: "Error", category: "ui", duration: 0.5, seed: 63, gen: (s, c) => { tone(s, c, 0, 220, 0.14, 0.22, "square"); tone(s, c, 0.16, 180, 0.2, 0.22, "square"); } },
  { id: "s-shutter", title: "Shutter", category: "camera", duration: 0.4, seed: 71, gen: (s, c) => { burst(s, 0, 0.03, 3000, 0.7); click(s, c, 0.0, 1800, 0.6); burst(s, 0.09, 0.05, 2200, 0.5); click(s, c, 0.1, 1400, 0.5); } },
  { id: "s-focus-beep", title: "Focus Beep", category: "camera", duration: 0.35, seed: 72, gen: (s, c) => { tone(s, c, 0, 2600, 0.06, 0.2); tone(s, c, 0.1, 2600, 0.06, 0.2); } },
  { id: "s-film-advance", title: "Film Advance", category: "camera", duration: 0.8, seed: 73, gen: (s, c) => { for (let i = 0; i < 9; i++) click(s, c, i * 0.06, 2400 + (i % 3) * 300, 0.3); } },
  { id: "s-data-burst", title: "Data Burst", category: "glitch", duration: 0.8, seed: 81, gen: (s, c) => { for (let i = 0; i < 14; i++) tone(s, c, i * 0.045, 200 + s.rand() * 3000, 0.03, 0.18, "square"); } },
  { id: "s-bit-crush", title: "Bit Crush", category: "glitch", duration: 0.6, seed: 82, gen: (s, c) => { for (let i = 0; i < 8; i++) burst(s, i * 0.06, 0.035, 500 + s.rand() * 5000, 0.5); tone(s, c, 0, 110, 0.5, 0.12, "square"); } },
  { id: "s-wind", title: "Wind", category: "nature", duration: 6, seed: 91, gen: (s, c) => wind(s, c, 6) },
  { id: "s-rain", title: "Rain", category: "nature", duration: 6, seed: 92, gen: (s, c) => rain(s, c, 6) },
  { id: "s-birdsong", title: "Birdsong", category: "nature", duration: 5, seed: 93, gen: (s, c) => birds(s, c, 5) },
  { id: "s-chime", title: "Chime", category: "notification", duration: 2, seed: 101, gen: (s) => { s.bell(0, 84, { gain: 0.25, decay: 1.8 }); s.bell(0.12, 91, { gain: 0.2, decay: 1.6 }); } },
  { id: "s-ding", title: "Ding", category: "notification", duration: 1.6, seed: 102, gen: (s) => s.bell(0, 88, { gain: 0.3, decay: 1.5 }) },
  { id: "s-message", title: "Message", category: "notification", duration: 0.8, seed: 103, gen: (s, c) => { tone(s, c, 0, midiToFreq(81), 0.08, 0.25); tone(s, c, 0.1, midiToFreq(88), 0.18, 0.22); } },
];

export const SFX = DEFS.map(({ gen, ...rest }) => rest);

/* ------------------------------------------------------------ generators */
function out(s) { return s.bus("sfx", { gain: 1, send: 0.12 }); }

function sweep(s, t, dur, f0, f1, gain) {
  const n = s.noise(t, t + dur + 0.1);
  const f = s.ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.6;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = s.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f); f.connect(g); g.connect(out(s));
}

function click(s, c, t, freq, gain) {
  const n = s.noise(t, t + 0.03);
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 3;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
  n.connect(f); f.connect(g); g.connect(out(s));
}

function tone(s, c, t, freq, dur, gain, type = "sine") {
  const o = s.osc(type, freq, t, t + dur + 0.1);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.setValueAtTime(gain, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out(s));
}

function chirp(s, c, t, f0, f1, dur, gain) {
  const o = s.osc("sine", f0, t, t + dur + 0.05);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out(s));
}

function burst(s, t, dur, freq, gain) {
  const n = s.noise(t, t + dur + 0.05);
  const f = s.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq;
  const g = s.ctx.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f); f.connect(g); g.connect(out(s));
}

function swell(s, c, dur) {
  [57, 64, 69].forEach((m) => {
    const o = s.osc("sawtooth", midiToFreq(m), 0, dur);
    const f = c.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(200, 0); f.frequency.exponentialRampToValueAtTime(4000, dur - 0.05);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.09, dur - 0.05); g.gain.linearRampToValueAtTime(0, dur);
    o.connect(f); f.connect(g); g.connect(out(s));
  });
}

function wind(s, c, dur) {
  const n = s.noise(0, dur);
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.8;
  const g = c.createGain();
  for (let t = 0; t < dur; t += 0.5) {
    f.frequency.linearRampToValueAtTime(300 + s.rand() * 700, t + 0.5);
    g.gain.linearRampToValueAtTime(0.18 + s.rand() * 0.25, t + 0.5);
  }
  g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.3, 0.8);
  g.gain.setValueAtTime(0.3, dur - 1); g.gain.linearRampToValueAtTime(0.0001, dur);
  n.connect(f); f.connect(g); g.connect(out(s));
}

function rain(s, c, dur) {
  const n = s.noise(0, dur);
  const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1200;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.12, 0.6);
  g.gain.setValueAtTime(0.12, dur - 0.8); g.gain.linearRampToValueAtTime(0.0001, dur);
  n.connect(f); f.connect(g); g.connect(out(s));
  for (let i = 0; i < dur * 22; i++) click(s, c, 0.3 + s.rand() * (dur - 0.8), 2500 + s.rand() * 4000, 0.04 + s.rand() * 0.08);
}

function birds(s, c, dur) {
  let t = 0.2;
  while (t < dur - 0.6) {
    const base = 2600 + s.rand() * 1600;
    const notes = 2 + Math.floor(s.rand() * 4);
    for (let i = 0; i < notes; i++) chirp(s, c, t + i * 0.09, base * (1 + s.rand() * 0.2), base * (0.7 + s.rand() * 0.6), 0.07, 0.12);
    t += 0.4 + s.rand() * 0.9;
  }
}

const cache = new Map();
export function loadSfx(id) {
  if (cache.has(id)) return cache.get(id);
  const def = DEFS.find((d) => d.id === id);
  if (!def) return Promise.reject(new Error("Unknown sound " + id));
  const p = renderOffline(def.duration, (ctx) => {
    const s = new Synth(ctx, def.seed, { reverb: 0.15, reverbTime: 1.4 });
    def.gen(s, ctx);
  }).then((buf) => normalize(buf, def.category === "nature" ? -6 : -3)).catch((e) => { cache.delete(id); throw e; });
  cache.set(id, p);
  return p;
}

export const getSfx = (id) => SFX.find((s) => s.id === id) || null;
