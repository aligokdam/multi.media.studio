/* A small subtractive/FM synthesizer for offline rendering. Everything the
   built-in music and sound libraries play is produced here from oscillators and
   noise: there are no samples or third-party recordings, which is what makes
   the library safe to release under CC0. */
import { rng } from "../core/util.js";

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

/** Midi note for a scale degree (may exceed 7 or be negative). */
export function degreeToMidi(root, scale, degree) {
  const s = SCALES[scale];
  const oct = Math.floor(degree / 7);
  const idx = ((degree % 7) + 7) % 7;
  return root + oct * 12 + s[idx];
}

export function chordMidis(root, scale, degree, size = 3) {
  const out = [];
  for (let i = 0; i < size; i++) out.push(degreeToMidi(root, scale, degree + i * 2));
  return out;
}

export class Synth {
  constructor(ctx, seed = 1, { reverb = 0.25, reverbTime = 2.6 } = {}) {
    this.ctx = ctx;
    this.rand = rng(seed);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(reverbTime, 3.2);
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = reverb;
    this.verb.connect(this.verbGain);
    this.verbGain.connect(this.comp);
    this.noiseBuf = this.noiseBuffer(2);
    this.buses = new Map();
    this.voices = [];          // finished voices are disconnected during rendering (see gc)
    this.rec = null;
    (ctx.__synths ||= []).push(this);
    // Record every node an instrument call creates, so the whole voice can be
    // disconnected once its last source has stopped.
    for (const name of ["createGain", "createBiquadFilter", "createOscillator", "createBufferSource", "createStereoPanner"]) {
      const orig = ctx[name].bind(ctx);
      ctx[name] = (...a) => { const n = orig(...a); if (this.rec) this.rec.nodes.push(n); return n; };
    }
    const proto = Object.getPrototypeOf(this);
    for (const m of ["pad", "keys", "piano", "pluck", "bell", "bass", "lead", "kick", "snare", "clap", "hat", "shaker", "tom", "boom", "riser"]) {
      const fn = proto[m];
      this[m] = (...args) => {
        const outer = this.rec;
        const voice = { nodes: [], end: 0 };
        this.rec = voice;
        try { return fn.apply(this, args); }
        finally { this.rec = outer; if (voice.nodes.length) this.voices.push(voice); }
      };
    }
  }

  /** Disconnects voices that ended before time t (called at render suspensions). */
  gc(t) {
    const keep = [];
    for (const v of this.voices) {
      if (v.end && v.end < t - 0.05) { for (const n of v.nodes) { try { n.disconnect(); } catch { /* ignore */ } } }
      else keep.push(v);
    }
    this.voices = keep;
  }

  impulse(seconds, decay) {
    const sr = this.ctx.sampleRate, len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (this.rand() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  noiseBuffer(seconds) {
    const sr = this.ctx.sampleRate, len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = this.rand() * 2 - 1;
    return buf;
  }

  /** A mixer channel: gain → pan → compressor, plus a reverb send. */
  bus(name, { gain = 0.5, pan = 0, send = 0.2, filter = null } = {}) {
    if (this.buses.has(name)) return this.buses.get(name);
    const rec = this.rec; this.rec = null;
    try { return this._bus(name, gain, pan, send, filter); } finally { this.rec = rec; }
  }

  /** Filters shared per bus keep the node count per note low (rendering cost
      grows with the number of nodes, not with the length of the track). */
  _bus(name, gain, pan, send, filter) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    if (filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = filter.type; f.frequency.value = filter.freq; f.Q.value = filter.Q ?? 0.7;
      g.connect(f); f.connect(p);
    } else g.connect(p);
    p.connect(this.comp);
    if (send > 0) {
      const s = this.ctx.createGain();
      s.gain.value = send;
      p.connect(s);
      s.connect(this.verb);
    }
    this.buses.set(name, g);
    return g;
  }

  /** ADSR with finite ramps only. Asymptotic curves (setTargetAtTime) never
      finish, which keeps every voice "automated" and makes offline rendering
      very slow, so each segment here ends at a definite time. */
  env(param, t, { a = 0.005, d = 0.1, s = 0.6, r = 0.2, dur = 0.3, peak = 1 }) {
    const sus = Math.max(0.0001, peak * s);
    const end = t + Math.max(dur, a + 0.001);
    const dEnd = Math.min(end, t + a + d);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    if (dEnd > t + a) param.exponentialRampToValueAtTime(sus, dEnd);
    param.setValueAtTime(sus, end);
    param.exponentialRampToValueAtTime(0.0001, end + r);
    param.setValueAtTime(0, end + r + 0.001);
    return end + r;
  }

  /** Percussive decay: attack, then exponential fall to silence at t + len. */
  decay(param, t, peak, len, attack = 0.004) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + len);
    param.setValueAtTime(0, t + attack + len + 0.001);
    return t + attack + len;
  }

  osc(type, freq, t, stop, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.start(t);
    o.stop(stop);
    if (this.rec) this.rec.end = Math.max(this.rec.end, stop);
    return o;
  }

  noise(t, stop) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = true;
    n.start(t, this.rand() * 1.5);
    n.stop(stop);
    if (this.rec) this.rec.end = Math.max(this.rec.end, stop);
    return n;
  }

  /* ---------------------------------------------------------- tonal voices */
  pad(t, midis, dur, { bus = "pad", cutoff = 1400, attack = 1.2, release = 1.8, wave = "sawtooth", gain = 0.12 } = {}) {
    const out = this.bus(bus, { gain: 1, send: 0.45 });
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(cutoff * 0.6, t);
    f.frequency.linearRampToValueAtTime(cutoff, t + attack + dur * 0.4);
    f.Q.value = 0.4;
    const stop = this.env(g.gain, t, { a: attack, d: 0.5, s: 0.85, r: release, dur, peak: gain }) + 0.1;
    for (const m of midis) {
      const fr = midiToFreq(m);
      this.osc(wave, fr, t, stop, -7).connect(f);
      this.osc(wave, fr, t, stop, 7).connect(f);
    }
    f.connect(g); g.connect(out);
  }

  keys(t, midi, dur, { bus = "keys", gain = 0.16, bright = 1, decay = 1.6 } = {}) {
    const out = this.bus(bus, { gain: 1, send: 0.25 });
    const fr = midiToFreq(midi);
    const stop = t + Math.min(dur, decay) + 0.6;
    const car = this.osc("sine", fr, t, stop);
    const mod = this.osc("sine", fr * 2, t, stop);
    const mg = this.ctx.createGain();
    mg.gain.setValueAtTime(fr * 1.6 * bright, t);
    mg.gain.exponentialRampToValueAtTime(fr * 0.2, t + 0.35);
    mod.connect(mg); mg.connect(car.frequency);
    const g = this.ctx.createGain();
    const end = t + Math.max(0.05, Math.min(dur, decay));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(gain * 0.3, end);
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.3);
    car.connect(g); g.connect(out);
  }

  piano(t, midi, dur, { bus = "piano", gain = 0.2 } = {}) {
    const out = this.bus(bus, { gain: 1, send: 0.3 });
    const fr = midiToFreq(midi);
    const decay = 2.6 - Math.min(1.6, (midi - 48) / 30);
    const stop = t + Math.min(dur + 0.4, decay + 0.5);
    const g = this.ctx.createGain();
    const len = Math.min(dur + 0.3, decay);
    this.decay(g.gain, t, gain, len);
    [[1, 1], [2, 0.42], [3, 0.18], [4.01, 0.08]].forEach(([mul, amp]) => {
      const pg = this.ctx.createGain();
      pg.gain.value = amp;
      this.osc(mul === 1 ? "triangle" : "sine", fr * mul, t, stop).connect(pg);
      pg.connect(g);
    });
    g.connect(out);
  }

  pluck(t, midi, { bus = "pluck", gain = 0.14, cutoff = 3200, decay = 0.28, wave = "sawtooth", send } = {}) {
    const out = this.bus(bus, { gain: 1, send: send ?? 0.22 });
    const fr = midiToFreq(midi);
    const stop = t + decay * 3 + 0.05;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(cutoff * 0.12 + 200, t + decay * 1.5);
    f.Q.value = 2;
    const g = this.ctx.createGain();
    this.decay(g.gain, t, gain, decay * 2.6, 0.003);
    this.osc(wave, fr, t, stop).connect(f);
    f.connect(g); g.connect(out);
  }

  bell(t, midi, { bus = "bell", gain = 0.07, decay = 2.4 } = {}) {
    const out = this.bus(bus, { gain: 1, send: 0.55 });
    const fr = midiToFreq(midi);
    const g = this.ctx.createGain();
    this.decay(g.gain, t, gain, decay);
    const stop = t + decay + 0.05;
    this.osc("sine", fr, t, stop).connect(g);
    const g2 = this.ctx.createGain(); g2.gain.value = 0.35;
    this.osc("sine", fr * 2.76, t, stop).connect(g2); g2.connect(g);
    g.connect(out);
  }

  bass(t, midi, dur, { bus = "bass", gain = 0.22, cutoff = 420, wave = "sawtooth" } = {}) {
    const out = this.bus(bus + ":" + Math.round(cutoff / 100), { gain: 1, send: 0.02, filter: { type: "lowpass", freq: cutoff, Q: 1.1 } });
    const g = this.ctx.createGain();
    const stop = this.env(g.gain, t, { a: 0.008, d: 0.2, s: 0.7, r: 0.08, dur, peak: gain * 1.25 }) + 0.05;
    this.osc(wave, midiToFreq(midi), t, stop).connect(g);
    g.connect(out);
  }

  lead(t, midi, dur, { bus = "lead", gain = 0.09, wave = "square", cutoff = 2600 } = {}) {
    const out = this.bus(bus, { gain: 1, send: 0.3 });
    const fr = midiToFreq(midi);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    const stop = this.env(g.gain, t, { a: 0.02, d: 0.15, s: 0.7, r: 0.12, dur, peak: gain }) + 0.05;
    const o = this.osc(wave, fr, t, stop);
    const lfo = this.osc("sine", 5.2, t, stop);
    const lg = this.ctx.createGain(); lg.gain.value = 6;
    lfo.connect(lg); lg.connect(o.detune);
    o.connect(f); f.connect(g); g.connect(out);
  }

  /* ---------------------------------------------------------- percussion */
  kick(t, { gain = 0.9, bus = "drums" } = {}) {
    const out = this.bus(bus, { gain: 1, send: 0.04 });
    const o = this.osc("sine", 150, t, t + 0.5);
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.connect(g); g.connect(out);
  }

  snare(t, { gain = 0.35, bus = "snare", tone = 190 } = {}) {
    const out = this.bus(bus, { gain: 1, send: 0.1, filter: { type: "bandpass", freq: 1900, Q: 0.7 } });
    const n = this.noise(t, t + 0.22);
    const g = this.ctx.createGain();
    this.decay(g.gain, t, gain * 1.4, 0.19, 0.001);
    n.connect(g); g.connect(out);
    const o = this.osc("triangle", tone, t, t + 0.13);
    const og = this.ctx.createGain();
    this.decay(og.gain, t, gain * 0.8, 0.1, 0.001);
    o.connect(og); og.connect(this.bus("drums", { gain: 1, send: 0.04 }));
  }

  clap(t, { gain = 0.3, bus = "clap" } = {}) {
    const out = this.bus(bus, { gain: 1, send: 0.2, filter: { type: "bandpass", freq: 1200, Q: 1 } });
    const n = this.noise(t, t + 0.26);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 3; i++) { g.gain.setValueAtTime(gain, t + i * 0.011); g.gain.linearRampToValueAtTime(0.0001, t + i * 0.011 + 0.009); }
    g.gain.setValueAtTime(gain * 0.8, t + 0.034); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24); g.gain.setValueAtTime(0, t + 0.241);
    n.connect(g); g.connect(out);
  }

  hat(t, { gain = 0.08, open = false, bus = "hats" } = {}) {
    const out = this.bus(bus, { gain: 1, pan: 0.15, send: 0.05, filter: { type: "highpass", freq: 7600 } });
    const len = open ? 0.28 : 0.045;
    const n = this.noise(t, t + len + 0.02);
    const g = this.ctx.createGain();
    this.decay(g.gain, t, gain, len, 0.001);
    n.connect(g); g.connect(out);
  }

  shaker(t, { gain = 0.045, bus = "shaker" } = {}) {
    const out = this.bus(bus, { gain: 1, pan: -0.2, send: 0.08, filter: { type: "bandpass", freq: 6200, Q: 1.4 } });
    const n = this.noise(t, t + 0.1);
    const g = this.ctx.createGain();
    this.decay(g.gain, t, gain, 0.07, 0.02);
    n.connect(g); g.connect(out);
  }

  tom(t, midi, { gain = 0.5, bus = "drums" } = {}) {
    const out = this.bus(bus, { gain: 1, send: 0.3 });
    const fr = midiToFreq(midi);
    const o = this.osc("sine", fr, t, t + 0.6);
    o.frequency.exponentialRampToValueAtTime(fr * 0.6, t + 0.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); g.connect(out);
  }

  boom(t, { gain = 0.8, bus = "fx" } = {}) {
    const out = this.bus(bus, { gain: 1, send: 0.6 });
    const o = this.osc("sine", 70, t, t + 2.6);
    o.frequency.exponentialRampToValueAtTime(28, t + 1.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
    o.connect(g); g.connect(out);
    const n = this.noise(t, t + 1.2);
    const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 260;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.6, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 1);
    n.connect(f); f.connect(ng); ng.connect(out);
  }

  riser(t, dur, { gain = 0.12, bus = "fx" } = {}) {
    const out = this.bus(bus, { gain: 1, send: 0.5 });
    const n = this.noise(t, t + dur + 0.1);
    const f = this.ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 2.5;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.08);
    n.connect(f); f.connect(g); g.connect(out);
  }

  /** Vinyl texture: low hiss plus sparse crackles, for the whole duration. */
  crackle(duration, { gain = 0.05 } = {}) {
    const sr = this.ctx.sampleRate, len = Math.floor(sr * duration);
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp = lp * 0.97 + (this.rand() * 2 - 1) * 0.03;
      d[i] = lp * 0.6 + (this.rand() < 0.00035 ? (this.rand() * 2 - 1) * 0.9 : 0);
    }
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(g); g.connect(this.comp);
    s.start(0);
  }

  /** Fade in/out on the master bus. */
  fades(duration, fadeIn = 0.4, fadeOut = 2.5) {
    const g = this.master.gain, v = g.value;
    g.setValueAtTime(0.0001, 0);
    g.linearRampToValueAtTime(v, fadeIn);
    g.setValueAtTime(v, Math.max(fadeIn, duration - fadeOut));
    g.linearRampToValueAtTime(0.0001, duration);
  }
}

/** Renders `fn(ctx)` into an AudioBuffer offline. */
export async function renderOffline(duration, fn, { sampleRate = 44100, channels = 2 } = {}) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctx(channels, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
  await fn(ctx);
  // Periodically pause rendering to disconnect finished voices. Without this,
  // every note ever played stays in the graph and cost grows with notes × time.
  const synths = ctx.__synths || [];
  if (synths.length && typeof ctx.suspend === "function") {
    const step = 2;
    for (let t = step; t < duration - 0.1; t += step) {
      const at = Math.round((t * sampleRate) / 128) * 128 / sampleRate;
      ctx.suspend(at).then(() => { synths.forEach((sy) => sy.gc(at)); ctx.resume(); }).catch(() => {});
    }
  }
  return ctx.startRendering();
}

/** Scales a buffer so its peak sits at `targetDb` (only ever turns quiet audio up
    to a consistent level, never clips). */
export function normalize(buf, targetDb = -1.5) {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const v = d[i] < 0 ? -d[i] : d[i]; if (v > peak) peak = v; }
  }
  if (peak <= 1e-6) return buf;
  const k = Math.pow(10, targetDb / 20) / peak;
  if (Math.abs(k - 1) < 0.01) return buf;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
  return buf;
}
