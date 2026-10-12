/* Built-in music library.
   Every track is a recipe (genre, key, tempo, seed) rendered on the device by
   the synthesizer in synth.js. Because nothing is sampled or recorded, the
   output is original work and is dedicated to the public domain (CC0 1.0).

   The catalog is data: to extend the library, add entries here. A future
   file-based track can use { source: "file", url, license } and the loader
   below will fetch it from the app's own origin instead of composing it. */
import { Synth, renderOffline, chordMidis, degreeToMidi, normalize } from "./synth.js";
import { rng } from "../core/util.js";

export const MUSIC_LICENSE = Object.freeze({
  id: "CC0-1.0",
  name: "CC0 1.0 Universal (Public Domain Dedication)",
  url: "https://creativecommons.org/publicdomain/zero/1.0/",
  commercial: true,
  attribution: false,
  composer: "Multi Media Studio generator",
});

export const GENRES = ["ambient", "cinematic", "chill", "electronic", "documentary", "lofi", "corporate", "emotional", "upbeat"];
export const MOODS = ["calm", "dreamy", "hopeful", "epic", "tense", "dark", "relaxed", "warm", "happy", "energetic", "playful", "curious", "inspiring", "nostalgic", "sad", "tender"];

export const TRACKS = [
  { id: "m-northern-quiet", title: "Northern Quiet", genre: "ambient", moods: ["calm", "dreamy"], duration: 60, seed: 101, root: 50, scale: "major" },
  { id: "m-glass-horizon", title: "Glass Horizon", genre: "ambient", moods: ["dreamy", "hopeful"], duration: 90, seed: 102, root: 52, scale: "dorian" },
  { id: "m-first-light-ascent", title: "First Light Ascent", genre: "cinematic", moods: ["epic", "hopeful"], duration: 75, seed: 201, root: 45, scale: "minor" },
  { id: "m-iron-tide", title: "Iron Tide", genre: "cinematic", moods: ["dark", "tense"], duration: 60, seed: 202, root: 43, scale: "minor" },
  { id: "m-sunday-window", title: "Sunday Window", genre: "chill", moods: ["relaxed", "warm"], duration: 90, seed: 301, root: 53, scale: "major" },
  { id: "m-citrus-haze", title: "Citrus Haze", genre: "chill", moods: ["happy", "relaxed"], duration: 60, seed: 302, root: 55, scale: "mixolydian" },
  { id: "m-neon-transit", title: "Neon Transit", genre: "electronic", moods: ["energetic", "tense"], duration: 90, seed: 401, root: 45, scale: "minor" },
  { id: "m-pulse-arcade", title: "Pulse Arcade", genre: "electronic", moods: ["energetic", "playful"], duration: 60, seed: 402, root: 48, scale: "dorian" },
  { id: "m-field-notes", title: "Field Notes", genre: "documentary", moods: ["curious", "warm"], duration: 90, seed: 501, root: 50, scale: "major" },
  { id: "m-open-atlas", title: "Open Atlas", genre: "documentary", moods: ["inspiring", "curious"], duration: 75, seed: 502, root: 48, scale: "mixolydian" },
  { id: "m-rainy-study", title: "Rainy Study", genre: "lofi", moods: ["relaxed", "nostalgic"], duration: 90, seed: 601, root: 51, scale: "major" },
  { id: "m-tape-garden", title: "Tape Garden", genre: "lofi", moods: ["nostalgic", "calm"], duration: 60, seed: 602, root: 49, scale: "dorian" },
  { id: "m-bright-agenda", title: "Bright Agenda", genre: "corporate", moods: ["inspiring", "happy"], duration: 60, seed: 701, root: 52, scale: "major" },
  { id: "m-clear-forward", title: "Clear Forward", genre: "corporate", moods: ["inspiring", "hopeful"], duration: 90, seed: 702, root: 50, scale: "major" },
  { id: "m-letters-unsent", title: "Letters Unsent", genre: "emotional", moods: ["sad", "tender"], duration: 75, seed: 801, root: 48, scale: "minor" },
  { id: "m-slow-return", title: "Slow Return", genre: "emotional", moods: ["hopeful", "tender"], duration: 90, seed: 802, root: 53, scale: "major" },
  { id: "m-good-morning-run", title: "Good Morning Run", genre: "upbeat", moods: ["happy", "energetic"], duration: 60, seed: 901, root: 52, scale: "major" },
  { id: "m-paper-confetti", title: "Paper Confetti", genre: "upbeat", moods: ["playful", "happy"], duration: 75, seed: 902, root: 55, scale: "mixolydian" },
];

const RECIPES = {
  ambient: { bpm: 60, prog: [0, 5, 3, 4], reverb: 0.5 },
  cinematic: { bpm: 84, prog: [0, 5, 2, 6], reverb: 0.45 },
  chill: { bpm: 88, prog: [0, 3, 5, 4], reverb: 0.25 },
  electronic: { bpm: 122, prog: [0, 5, 3, 4], reverb: 0.18 },
  documentary: { bpm: 96, prog: [0, 4, 5, 3], reverb: 0.3 },
  lofi: { bpm: 76, prog: [1, 4, 0, 5], reverb: 0.2 },
  corporate: { bpm: 112, prog: [0, 4, 5, 3], reverb: 0.2 },
  emotional: { bpm: 66, prog: [5, 3, 0, 4], reverb: 0.4 },
  upbeat: { bpm: 126, prog: [0, 4, 5, 3], reverb: 0.15 },
};

/** A short melodic motif built from chord tones, reused with variation. */
function motif(rand, length = 8) {
  const steps = [];
  let d = 4;
  for (let i = 0; i < length; i++) {
    const r = rand();
    if (r < 0.18) steps.push(null);
    else { d += [-2, -1, 0, 1, 2, 2, 4, -3][Math.floor(rand() * 8)]; d = Math.max(0, Math.min(9, d)); steps.push(d); }
  }
  return steps;
}

function compose(synth, track, duration) {
  const r = RECIPES[track.genre] || RECIPES.ambient;
  const rand = rng(track.seed * 7919);
  const beat = 60 / r.bpm, bar = beat * 4;
  const bars = Math.max(2, Math.floor((duration - 0.5) / bar));
  const root = track.root, sc = track.scale;
  const chord = (b) => r.prog[b % r.prog.length];
  const seventh = ["chill", "lofi", "documentary"].includes(track.genre);
  const m1 = motif(rand), m2 = motif(rand);
  const swing = track.genre === "lofi" ? beat * 0.09 : 0;

  for (let b = 0; b < bars; b++) {
    const t0 = 0.25 + b * bar;
    const deg = chord(b);
    const notes = chordMidis(root + 12, sc, deg, seventh ? 4 : 3);
    const intro = b < 2, outro = b >= bars - 2;
    const section = Math.floor(b / 8) % 2; // A / B alternation
    const bassMidi = degreeToMidi(root - 12, sc, deg);

    switch (track.genre) {
      case "ambient": {
        synth.pad(t0, notes, bar * 1.2, { cutoff: 900 + 500 * section, attack: 2, release: 3, wave: "triangle", gain: 0.14 });
        synth.pad(t0, [bassMidi], bar * 1.1, { bus: "sub", wave: "sine", cutoff: 300, attack: 1.5, gain: 0.22 });
        for (let i = 0; i < 4; i++) if (rand() < 0.38 && !intro) synth.bell(t0 + i * beat + rand() * 0.1, degreeToMidi(root + 24, sc, Math.floor(rand() * 8)), { gain: 0.05 });
        break;
      }
      case "cinematic": {
        synth.pad(t0, notes, bar * 1.05, { bus: "strings", cutoff: 1200 + section * 900, attack: 1.4, release: 2, gain: 0.11 });
        synth.pad(t0, [bassMidi, bassMidi + 12], bar, { bus: "low", cutoff: 500, attack: 0.6, gain: 0.12 });
        if (b % 4 === 0) synth.boom(t0, { gain: 0.6 });
        if (b >= 4 && !outro) for (let i = 0; i < 8; i++) synth.pluck(t0 + i * beat / 2, notes[i % notes.length] + 12, { gain: 0.07, cutoff: 2200, decay: 0.22 });
        if (b >= 8 && !outro && section === 1) for (let i = 0; i < 4; i++) synth.tom(t0 + i * beat, 43 + (i % 2) * 5, { gain: 0.35 });
        if (b === bars - 3) synth.riser(t0, bar, { gain: 0.08 });
        break;
      }
      case "chill":
      case "lofi": {
        const lofi = track.genre === "lofi";
        synth.keys(t0, notes[0], beat * 2, { gain: 0.12, bright: lofi ? 0.5 : 0.8 });
        notes.slice(1).forEach((n, i) => synth.keys(t0 + i * 0.012, n, beat * 2, { gain: 0.09, bright: lofi ? 0.5 : 0.8 }));
        notes.forEach((n, i) => synth.keys(t0 + beat * 2.5 + i * 0.012, n, beat * 1.2, { gain: 0.07, bright: lofi ? 0.45 : 0.7 }));
        synth.bass(t0, bassMidi, beat * 1.6, { gain: 0.2, cutoff: 300 });
        synth.bass(t0 + beat * 2.5, bassMidi + (rand() < 0.5 ? 7 : 12), beat * 1.2, { gain: 0.16, cutoff: 300 });
        if (!intro) {
          synth.kick(t0, { gain: lofi ? 0.55 : 0.6 });
          synth.kick(t0 + beat * 2.5, { gain: 0.45 });
          synth.snare(t0 + beat + swing, { gain: lofi ? 0.2 : 0.14 });
          synth.snare(t0 + beat * 3 + swing, { gain: lofi ? 0.2 : 0.14 });
          for (let i = 0; i < 8; i++) synth.hat(t0 + i * beat / 2 + (i % 2 ? swing : 0), { gain: i % 2 ? 0.035 : 0.05 });
        }
        if (!intro && section === 1 && !lofi) m1.forEach((d, i) => d != null && synth.bell(t0 + i * beat / 2, degreeToMidi(root + 24, sc, d), { gain: 0.035 }));
        break;
      }
      case "electronic": {
        const duck = synth.bus("pad", { gain: 1, send: 0.35 });
        synth.pad(t0, notes, bar, { cutoff: 1100 + section * 1300, attack: 0.05, release: 0.3, gain: 0.08 });
        for (let i = 0; i < 4; i++) { duck.gain.setValueAtTime(0.35, t0 + i * beat); duck.gain.linearRampToValueAtTime(1, t0 + i * beat + beat * 0.6); }
        if (!intro) {
          for (let i = 0; i < 4; i++) synth.kick(t0 + i * beat, { gain: 0.85 });
          synth.clap(t0 + beat, { gain: 0.25 }); synth.clap(t0 + beat * 3, { gain: 0.25 });
          for (let i = 0; i < 4; i++) synth.hat(t0 + i * beat + beat / 2, { gain: 0.07, open: i === 3 });
          for (let i = 0; i < 8; i++) synth.bass(t0 + i * beat / 2 + (i % 2 ? 0 : 0.0), bassMidi + (i % 2 ? 12 : 0), beat / 2 * 0.8, { gain: 0.17, cutoff: 600 + section * 400 });
        }
        if (b >= 4 && !outro) for (let i = 0; i < 8; i++) synth.pluck(t0 + i * beat / 2, notes[(i * 2 + (i >> 2)) % notes.length] + 12, { gain: 0.065, cutoff: 2600 + section * 1500, decay: 0.14 });
        if (b % 8 === 7) synth.riser(t0, bar, { gain: 0.07 });
        break;
      }
      case "documentary": {
        for (let i = 0; i < 8; i++) synth.piano(t0 + i * beat / 2, notes[[0, 1, 2, 3, 2, 1, 2, 3][i] % notes.length] + (i > 3 ? 0 : 0), beat * 0.9, { gain: 0.11 });
        synth.pad(t0, notes.slice(0, 3), bar, { cutoff: 900, attack: 1, gain: 0.07 });
        synth.bass(t0, bassMidi, beat * 1.8, { gain: 0.16, wave: "triangle", cutoff: 350 });
        synth.bass(t0 + beat * 2, bassMidi + 7, beat * 1.8, { gain: 0.13, wave: "triangle", cutoff: 350 });
        if (!intro) for (let i = 0; i < 8; i++) synth.shaker(t0 + i * beat / 2, { gain: 0.035 });
        if (!intro && b % 2 === 1) synth.kick(t0, { gain: 0.35 });
        break;
      }
      case "corporate":
      case "upbeat": {
        const up = track.genre === "upbeat";
        for (let i = 0; i < 8; i++) synth.pluck(t0 + i * beat / 2, notes[i % notes.length] + (up ? 12 : 0), { gain: 0.08, cutoff: 2400, decay: 0.16, wave: up ? "square" : "sawtooth" });
        synth.pad(t0, notes, bar, { cutoff: 1500, attack: 0.3, gain: 0.05 });
        if (!intro) {
          if (up) for (let i = 0; i < 4; i++) synth.kick(t0 + i * beat, { gain: 0.8 });
          else { synth.kick(t0, { gain: 0.7 }); synth.kick(t0 + beat * 2, { gain: 0.7 }); }
          synth.clap(t0 + beat, { gain: 0.24 }); synth.clap(t0 + beat * 3, { gain: 0.24 });
          for (let i = 0; i < (up ? 16 : 8); i++) up ? synth.hat(t0 + i * beat / 4, { gain: i % 4 === 2 ? 0.06 : 0.03 }) : synth.shaker(t0 + i * beat / 2);
          for (let i = 0; i < 8; i++) synth.bass(t0 + i * beat / 2, bassMidi + (up && i % 2 ? 12 : 0), beat * 0.4, { gain: 0.17, cutoff: 500 });
          const mel = section ? m2 : m1;
          if (b >= 4 && !outro) mel.forEach((d, i) => d != null && synth.lead(t0 + i * beat / 2, degreeToMidi(root + 24, sc, d), beat * 0.45, { gain: up ? 0.07 : 0.05, wave: up ? "square" : "triangle" }));
        }
        break;
      }
      case "emotional": {
        synth.piano(t0, bassMidi + 12, bar, { gain: 0.14 });
        notes.forEach((n, i) => synth.piano(t0 + beat + i * 0.03, n, beat * 2.5, { gain: 0.09 }));
        notes.forEach((n, i) => synth.piano(t0 + beat * 3 + i * 0.03, n, beat, { gain: 0.06 }));
        if (b >= 2) { const mel = section ? m2 : m1; mel.forEach((d, i) => d != null && i % 2 === 0 && synth.piano(t0 + i * beat / 2, degreeToMidi(root + 24, sc, d), beat * 0.9, { gain: 0.1 })); }
        if (b >= 4) synth.pad(t0, notes, bar * 1.05, { bus: "strings", cutoff: 1100, attack: 1.6, release: 2, gain: 0.07 });
        break;
      }
    }
  }
  if (track.genre === "lofi") synth.crackle(duration, { gain: 0.06 });
  // Final chord so the track resolves instead of stopping mid-phrase.
  const end = 0.25 + bars * bar;
  if (end < duration - 0.5) synth.pad(end, chordMidis(root + 12, sc, 0, 3), Math.max(0.5, duration - end - 1.5), { attack: 0.3, release: 1.4, gain: 0.08, cutoff: 1200 });
  synth.fades(duration, 0.3, Math.min(3, duration * 0.08));
}

const cache = new Map();
const PREVIEW_SECONDS = 20;

function render(track, length) {
  return renderOffline(length, (ctx) => {
    const r = RECIPES[track.genre] || RECIPES.ambient;
    const synth = new Synth(ctx, track.seed, { reverb: r.reverb });
    compose(synth, track, track.duration);
  }).then((buf) => {
    normalize(buf, -1.5);
    if (length < track.duration) {
      // Short preview: fade the cut end.
      const n = Math.min(buf.length, Math.floor(buf.sampleRate * 1.2));
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < n; i++) d[d.length - 1 - i] *= i / n;
      }
    }
    return buf;
  });
}

/** Full track. Rendered once, then kept on the device (blob store) so it is
    not composed again in later sessions. */
export function loadTrack(id) {
  if (cache.has(id)) return cache.get(id);
  const track = TRACKS.find((t) => t.id === id);
  if (!track) return Promise.reject(new Error("Unknown track " + id));
  const p = (async () => {
    const key = "lib-" + id + "-v" + CACHE_VERSION;
    try {
      const { getBlob } = await import("../storage/blobs.js");
      const blob = await getBlob(key);
      if (blob) return await new OfflineAudioContext(2, 1, 44100).decodeAudioData(await blob.arrayBuffer());
    } catch { /* not cached */ }
    const buf = await render(track, track.duration);
    try {
      const [{ putBlob }, { audioBufferToWav }] = await Promise.all([import("../storage/blobs.js"), import("./wav.js")]);
      putBlob(key, audioBufferToWav(buf)).catch(() => {});
    } catch { /* caching is optional */ }
    return buf;
  })().catch((e) => { cache.delete(id); throw e; });
  cache.set(id, p);
  return p;
}

/** Quick preview: the first seconds of the track (full track if already loaded). */
export function loadPreview(id) {
  if (cache.has(id)) return cache.get(id);
  const key = "preview:" + id;
  if (cache.has(key)) return cache.get(key);
  const track = TRACKS.find((t) => t.id === id);
  if (!track) return Promise.reject(new Error("Unknown track " + id));
  const p = render(track, Math.min(PREVIEW_SECONDS, track.duration)).catch((e) => { cache.delete(key); throw e; });
  cache.set(key, p);
  return p;
}

const CACHE_VERSION = 2;

export const getTrack = (id) => TRACKS.find((t) => t.id === id) || null;
