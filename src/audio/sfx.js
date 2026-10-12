/* Built-in sound effects, synthesized on the device (CC0, see music.js).
   Every entry has its own generator and parameters: nothing is a renamed copy of
   another sound. Sounds are rendered on first use and cached for the session.
   User-imported effects are stored with the user's media (see components/panels/audio-panels.js).

   Entry: { id, title, category, duration, seed, mood, tags, gen(synth, ctx) } */
import { Synth, renderOffline, midiToFreq, normalize } from "./synth.js";

export const SFX_CATEGORIES = ["transition", "whoosh", "impact", "ui", "ambience", "nature", "water", "mechanical", "electronic", "rise", "cinematic", "foley", "notification", "reverse", "stinger"];
export const SFX_MOODS = ["calm", "playful", "tense", "dramatic", "bright", "dark"];

const DEFS = [];
const add = (id, title, category, duration, mood, tags, gen) => DEFS.push({ id, title, category, duration, seed: DEFS.length * 7 + 11, mood, tags, gen });

/* ------------------------------------------------------------ transitions */
add("s-riser", "Riser", "transition", 3, "tense", "build up tension", (s) => s.riser(0, 2.8, { gain: 0.35 }));
add("s-reverse-swell", "Reverse Swell", "transition", 2.2, "dramatic", "swell chord", (s, c) => swell(s, c, 2.1, [57, 64, 69]));
add("s-downlifter", "Downlifter", "transition", 2.5, "dark", "fall sweep", (s) => sweep(s, 0, 2.3, 6000, 200, 0.45));
add("s-scene-wipe", "Scene Wipe", "transition", 1.2, "bright", "wipe swipe slide", (s) => { sweep(s, 0, 1.0, 900, 6500, 0.35); sweep(s, 0.05, 0.9, 400, 2600, 0.2); });
add("s-glitch-cut", "Glitch Cut", "transition", 0.7, "tense", "digital stutter cut", (s, c) => stutter(s, c, 0, 0.6, 9, 1800));
add("s-tape-stop", "Tape Stop", "transition", 1.2, "playful", "slow down vinyl", (s, c) => glide(s, c, 0, 1.1, 440, 40, "sawtooth", 0.18, 1400));
add("s-tape-start", "Tape Start", "transition", 1.0, "playful", "speed up vinyl", (s, c) => glide(s, c, 0, 0.9, 50, 440, "sawtooth", 0.18, 1600));
add("s-light-sweep", "Light Sweep", "transition", 1.6, "calm", "shimmer airy", (s, c) => { sweep(s, 0, 1.5, 2500, 9000, 0.18); sparkle(s, c, 0.2, 1.3, 9); });
add("s-cross-fade-air", "Air Crossfade", "transition", 2.0, "calm", "soft breath", (s) => breath(s, 0, 1.9, 700, 0.25));
add("s-zoom-in", "Zoom In", "transition", 0.9, "bright", "zoom forward", (s, c) => { glide(s, c, 0, 0.8, 200, 1800, "triangle", 0.15, 5000); sweep(s, 0, 0.8, 600, 5000, 0.25); });
add("s-zoom-out", "Zoom Out", "transition", 0.9, "dark", "zoom back", (s, c) => { glide(s, c, 0, 0.8, 1800, 200, "triangle", 0.15, 5000); sweep(s, 0, 0.8, 5000, 600, 0.25); });

/* ------------------------------------------------------------ whooshes */
add("s-air-whoosh", "Air Whoosh", "whoosh", 1.0, "calm", "air pass", (s) => sweep(s, 0, 0.85, 500, 3800, 0.5));
add("s-fast-swish", "Fast Swish", "whoosh", 0.5, "bright", "quick swipe", (s) => sweep(s, 0, 0.38, 1400, 7000, 0.45));
add("s-deep-swoosh", "Deep Swoosh", "whoosh", 1.4, "dark", "low pass by", (s) => sweep(s, 0, 1.2, 160, 1400, 0.7));
add("s-double-whoosh", "Double Whoosh", "whoosh", 1.0, "playful", "two passes", (s) => { sweep(s, 0, 0.4, 800, 4500, 0.4); sweep(s, 0.42, 0.45, 600, 3800, 0.4); });
add("s-sword-swing", "Sword Swing", "whoosh", 0.6, "tense", "blade cut slash", (s) => { sweep(s, 0, 0.32, 2400, 9000, 0.5); sweep(s, 0.02, 0.3, 4000, 12000, 0.2); });
add("s-cloth-whoosh", "Cloth Whoosh", "whoosh", 0.8, "calm", "fabric flap", (s, c) => flap(s, c, 0, 0.7, 6, 1100));
add("s-arrow-fly", "Arrow Fly-by", "whoosh", 1.0, "tense", "doppler pass", (s, c) => { sweep(s, 0, 0.9, 1600, 5200, 0.35); glide(s, c, 0.1, 0.8, 1300, 700, "sine", 0.06, 3000); });
add("s-heavy-whoosh", "Heavy Whoosh", "whoosh", 1.6, "dramatic", "big pass", (s) => { sweep(s, 0, 1.4, 120, 900, 0.7); sweep(s, 0.1, 1.3, 400, 2500, 0.3); });
add("s-spin-whoosh", "Spin Whoosh", "whoosh", 1.4, "playful", "rotate twirl", (s, c) => tremoloSweep(s, c, 0, 1.3, 700, 3000, 9, 0.4));
add("s-short-woosh", "Short Woosh", "whoosh", 0.35, "bright", "flick", (s) => sweep(s, 0, 0.28, 2000, 5000, 0.4));

/* ------------------------------------------------------------ impacts */
add("s-cinematic-hit", "Cinematic Hit", "impact", 3, "dramatic", "trailer boom", (s) => { s.boom(0.02, { gain: 0.9 }); burst(s, 0.02, 0.35, 900, 0.6); s.tom(0.02, 40, { gain: 0.6 }); });
add("s-thud", "Thud", "impact", 0.8, "dark", "low body", (s) => { s.kick(0, { gain: 1 }); burst(s, 0, 0.08, 400, 0.4); });
add("s-boom", "Boom", "impact", 3, "dramatic", "explosion low", (s) => s.boom(0, { gain: 1 }));
add("s-punch", "Punch", "impact", 0.5, "tense", "hit fight", (s) => { s.kick(0, { gain: 0.8 }); burst(s, 0, 0.06, 3000, 0.6); burst(s, 0.005, 0.12, 700, 0.5); });
add("s-metal-clang", "Metal Clang", "impact", 2.2, "tense", "steel pipe hit", (s, c) => metal(s, c, 0, 320, 2.0, 0.3));
add("s-wood-knock", "Wood Knock", "impact", 0.4, "calm", "block tap", (s, c) => { resonant(s, c, 0, 620, 0.12, 0.5); resonant(s, c, 0, 1180, 0.08, 0.25); });
add("s-glass-hit", "Glass Clink", "impact", 1.4, "bright", "glass ting", (s, c) => glass(s, c, 0, 1));
add("s-body-fall", "Body Fall", "impact", 0.9, "dark", "drop floor", (s) => { s.kick(0, { gain: 0.9 }); burst(s, 0.01, 0.25, 500, 0.5); burst(s, 0.12, 0.1, 300, 0.3); });
add("s-door-slam", "Door Slam", "impact", 1.2, "tense", "slam bang", (s, c) => { s.kick(0, { gain: 1 }); burst(s, 0, 0.1, 1800, 0.6); resonant(s, c, 0.01, 180, 0.6, 0.3); });
add("s-stomp", "Stomp", "impact", 0.7, "dramatic", "foot stomp drum", (s) => { s.tom(0, 36, { gain: 0.9 }); burst(s, 0, 0.05, 1200, 0.5); });
add("s-anvil", "Anvil Strike", "impact", 2.5, "dramatic", "hammer metal", (s, c) => metal(s, c, 0, 820, 2.3, 0.28));
add("s-soft-drop", "Soft Drop", "impact", 0.5, "calm", "pillow land", (s) => burst(s, 0, 0.25, 350, 0.6));

/* ------------------------------------------------------------ interface */
add("s-soft-click", "Soft Click", "ui", 0.15, "calm", "click button", (s, c) => click(s, c, 0, 2200, 0.5));
add("s-mouse-click", "Mouse Click", "ui", 0.2, "calm", "click computer", (s, c) => { click(s, c, 0, 3600, 0.6); click(s, c, 0.07, 2600, 0.35); });
add("s-switch", "Switch", "ui", 0.25, "calm", "toggle", (s, c) => { click(s, c, 0, 1500, 0.7); tone(s, c, 0.005, 900, 0.05, 0.12, "square"); });
add("s-tap", "Tap", "ui", 0.15, "calm", "touch", (s, c) => tone(s, c, 0, 1800, 0.05, 0.25, "sine"));
add("s-confirm", "Confirm", "ui", 0.5, "bright", "success ok", (s, c) => { tone(s, c, 0, midiToFreq(76), 0.12, 0.25); tone(s, c, 0.09, midiToFreq(83), 0.25, 0.25); });
add("s-error", "Error", "ui", 0.5, "tense", "fail wrong", (s, c) => { tone(s, c, 0, 220, 0.14, 0.22, "square"); tone(s, c, 0.16, 180, 0.2, 0.22, "square"); });
add("s-bubble-pop", "Bubble Pop", "ui", 0.3, "playful", "pop", (s, c) => chirp(s, c, 0, 380, 1300, 0.09, 0.5));
add("s-toggle-on", "Toggle On", "ui", 0.3, "bright", "switch on up", (s, c) => { chirp(s, c, 0, 600, 1200, 0.06, 0.35); click(s, c, 0.02, 3000, 0.3); });
add("s-toggle-off", "Toggle Off", "ui", 0.3, "calm", "switch off down", (s, c) => { chirp(s, c, 0, 1200, 600, 0.06, 0.35); click(s, c, 0.02, 2000, 0.3); });
add("s-hover", "Hover", "ui", 0.2, "calm", "focus soft", (s, c) => tone(s, c, 0, 2600, 0.08, 0.08, "sine"));
add("s-swipe-ui", "Swipe", "ui", 0.35, "bright", "slide screen", (s) => sweep(s, 0, 0.28, 2500, 7000, 0.22));
add("s-typewriter-key", "Type Key", "ui", 0.25, "calm", "keyboard key", (s, c) => { click(s, c, 0, 4200, 0.5); click(s, c, 0.04, 1600, 0.3); });
add("s-delete", "Delete", "ui", 0.4, "dark", "trash remove", (s, c) => { glide(s, c, 0, 0.3, 700, 200, "triangle", 0.2, 3000); burst(s, 0.1, 0.12, 1500, 0.3); });
add("s-pop-up", "Pop Up", "ui", 0.35, "playful", "open window", (s, c) => { chirp(s, c, 0, 500, 1600, 0.12, 0.4); });

/* ------------------------------------------------------------ ambience */
add("s-room-tone", "Room Tone", "ambience", 8, "calm", "quiet room loop", (s, c) => roomTone(s, c, 8, 180, 0.12));
add("s-city-hum", "City Hum", "ambience", 8, "dark", "traffic distant loop", (s, c) => { roomTone(s, c, 8, 260, 0.2); for (let i = 0; i < 4; i++) carPass(s, c, 0.8 + i * 1.8 + s.rand(), 1.6); });
add("s-office", "Office Air", "ambience", 8, "calm", "hvac work loop", (s, c) => { roomTone(s, c, 8, 420, 0.1); typing(s, c, 1.5, 2.5, 0.12); typing(s, c, 5.2, 1.8, 0.1); });
add("s-cafe", "Cafe Murmur", "ambience", 8, "calm", "crowd chatter loop", (s, c) => { murmur(s, c, 8); for (let i = 0; i < 5; i++) glass(s, c, 0.6 + s.rand() * 7, 0.25); });
add("s-space-drone", "Space Drone", "ambience", 8, "dark", "sci-fi pad loop", (s, c) => drone(s, c, 8, [36, 43, 48], 0.07));
add("s-night", "Night Crickets", "ambience", 8, "calm", "insects evening loop", (s, c) => crickets(s, c, 8));
add("s-hall-reverb", "Empty Hall", "ambience", 8, "tense", "large room loop", (s, c) => { roomTone(s, c, 8, 120, 0.08); for (let i = 0; i < 3; i++) resonant(s, c, 1 + i * 2.4, 90 + s.rand() * 60, 1.6, 0.06); });
add("s-machine-room", "Machine Room", "ambience", 8, "dark", "server hum loop", (s, c) => { hum(s, c, 0, 8, 60, 0.12); roomTone(s, c, 8, 900, 0.06); });

/* ------------------------------------------------------------ nature */
add("s-wind", "Wind", "nature", 6, "calm", "breeze air", (s, c) => wind(s, c, 6, 300, 700));
add("s-rain", "Rain", "nature", 6, "calm", "drops shower", (s, c) => rain(s, c, 6, 22));
add("s-birdsong", "Birdsong", "nature", 5, "bright", "birds morning", (s, c) => birds(s, c, 5, 2600));
add("s-thunder", "Thunder", "nature", 6, "dramatic", "storm rumble", (s, c) => thunder(s, c, 0.2, 5.5));
add("s-storm", "Storm", "nature", 8, "dramatic", "rain thunder wind", (s, c) => { rain(s, c, 8, 40); wind(s, c, 8, 200, 500); thunder(s, c, 2.5, 5); });
add("s-forest", "Forest", "nature", 8, "calm", "birds leaves", (s, c) => { wind(s, c, 8, 900, 1800, 0.12); birds(s, c, 8, 3200); });
add("s-fire", "Campfire", "nature", 6, "calm", "crackle fire", (s, c) => fire(s, c, 6));
add("s-owl", "Owl Hoot", "nature", 2, "dark", "night bird", (s, c) => { hoot(s, c, 0.1, 380); hoot(s, c, 0.8, 360); hoot(s, c, 1.15, 370); });
add("s-light-breeze", "Light Breeze", "nature", 6, "calm", "soft wind", (s, c) => wind(s, c, 6, 1200, 2400, 0.1));
add("s-seagulls", "Seagulls", "nature", 4, "bright", "coast birds", (s, c) => { for (let i = 0; i < 4; i++) gull(s, c, 0.2 + i * 0.9 + s.rand() * 0.3); });

/* ------------------------------------------------------------ water & air */
add("s-ocean-waves", "Ocean Waves", "water", 8, "calm", "sea surf beach", (s, c) => waves(s, c, 8));
add("s-stream", "Stream", "water", 6, "calm", "brook river", (s, c) => stream(s, c, 6));
add("s-water-drip", "Water Drip", "water", 3, "calm", "drop cave", (s, c) => { for (let i = 0; i < 6; i++) drip(s, c, 0.2 + i * 0.45 + s.rand() * 0.15, 900 + s.rand() * 900); });
add("s-splash", "Splash", "water", 1.4, "playful", "water jump", (s, c) => { burst(s, 0, 0.4, 2500, 0.7); for (let i = 0; i < 12; i++) drip(s, c, 0.1 + s.rand() * 0.9, 700 + s.rand() * 1600, 0.2); });
add("s-bubbles", "Bubbles", "water", 2.5, "playful", "underwater blub", (s, c) => { for (let i = 0; i < 18; i++) chirp(s, c, s.rand() * 2.2, 250 + s.rand() * 300, 700 + s.rand() * 900, 0.05, 0.25); });
add("s-steam", "Steam Hiss", "water", 2.5, "tense", "pressure release", (s) => noiseShape(s, 0, 2.3, { type: "highpass", f0: 3500, f1: 2500, gain: 0.35, attack: 0.05 }));
add("s-air-release", "Air Release", "water", 1.2, "calm", "pneumatic psst", (s) => noiseShape(s, 0, 1.0, { type: "bandpass", f0: 5000, f1: 1200, q: 0.9, gain: 0.5, attack: 0.01 }));
add("s-pour", "Pouring", "water", 3, "calm", "liquid glass fill", (s, c) => pour(s, c, 0, 2.8));

/* ------------------------------------------------------------ mechanical */
add("s-shutter", "Shutter", "mechanical", 0.4, "calm", "camera photo", (s, c) => { burst(s, 0, 0.03, 3000, 0.7); click(s, c, 0, 1800, 0.6); burst(s, 0.09, 0.05, 2200, 0.5); click(s, c, 0.1, 1400, 0.5); });
add("s-film-advance", "Film Advance", "mechanical", 0.8, "calm", "camera wind", (s, c) => { for (let i = 0; i < 9; i++) click(s, c, i * 0.06, 2400 + (i % 3) * 300, 0.3); });
add("s-clock-tick", "Clock Tick", "mechanical", 4, "tense", "time ticking", (s, c) => { for (let i = 0; i < 8; i++) click(s, c, 0.1 + i * 0.5, i % 2 ? 2600 : 3200, 0.45); });
add("s-gears", "Gears", "mechanical", 2.5, "tense", "ratchet cogs", (s, c) => { for (let i = 0; i < 26; i++) click(s, c, i * 0.09, 1500 + (i % 4) * 400, 0.35); hum(s, c, 0, 2.4, 95, 0.05); });
add("s-servo", "Servo Motor", "mechanical", 1.5, "playful", "robot move", (s, c) => { glide(s, c, 0, 0.6, 300, 700, "sawtooth", 0.08, 2000); glide(s, c, 0.7, 0.6, 700, 350, "sawtooth", 0.08, 2000); });
add("s-engine-start", "Engine Start", "mechanical", 3, "dramatic", "car motor rev", (s, c) => engine(s, c, 0, 2.9, 32, 70));
add("s-car-pass", "Car Pass", "mechanical", 3, "calm", "vehicle drive by", (s, c) => carPass(s, c, 0.2, 2.6));
add("s-ratchet", "Ratchet", "mechanical", 1, "tense", "wrench tool", (s, c) => { for (let i = 0; i < 12; i++) click(s, c, i * 0.06, 3200, 0.5); });
add("s-lock", "Lock Click", "mechanical", 0.5, "calm", "latch key", (s, c) => { click(s, c, 0, 2000, 0.6); resonant(s, c, 0.08, 1400, 0.12, 0.3); click(s, c, 0.12, 2800, 0.5); });
add("s-cash-register", "Cash Register", "mechanical", 1.6, "playful", "money bell till", (s, c) => { for (let i = 0; i < 5; i++) click(s, c, i * 0.08, 2600, 0.4); s.bell(0.45, 96, { gain: 0.25, decay: 1 }); });

/* ------------------------------------------------------------ electronic */
add("s-data-burst", "Data Burst", "electronic", 0.8, "tense", "glitch bits", (s, c) => { for (let i = 0; i < 14; i++) tone(s, c, i * 0.045, 200 + s.rand() * 3000, 0.03, 0.18, "square"); });
add("s-bit-crush", "Bit Crush", "electronic", 0.6, "tense", "glitch digital noise", (s, c) => { for (let i = 0; i < 8; i++) burst(s, i * 0.06, 0.035, 500 + s.rand() * 5000, 0.5); tone(s, c, 0, 110, 0.5, 0.12, "square"); });
add("s-laser", "Laser Zap", "electronic", 0.5, "playful", "sci-fi shot", (s, c) => glide(s, c, 0, 0.35, 2400, 180, "sawtooth", 0.25, 6000));
add("s-power-up", "Power Up", "electronic", 1.2, "bright", "charge level up", (s, c) => { for (let i = 0; i < 8; i++) tone(s, c, i * 0.1, midiToFreq(60 + i * 2), 0.1, 0.16, "square"); });
add("s-power-down", "Power Down", "electronic", 1.4, "dark", "shutdown off", (s, c) => glide(s, c, 0, 1.3, 900, 40, "square", 0.18, 3000));
add("s-sonar", "Sonar Ping", "electronic", 2.5, "calm", "radar submarine", (s, c) => { s.bell(0, 81, { gain: 0.3, decay: 2.2 }); });
add("s-radio-static", "Radio Static", "electronic", 2, "tense", "tuning noise", (s, c) => { noiseShape(s, 0, 1.9, { type: "bandpass", f0: 2000, f1: 2000, q: 0.6, gain: 0.25, attack: 0.05 }); glide(s, c, 0.3, 1.2, 300, 1500, "sine", 0.06, 4000); });
add("s-computer-beeps", "Computer Beeps", "electronic", 1.5, "playful", "retro terminal", (s, c) => { for (let i = 0; i < 10; i++) tone(s, c, i * 0.13, [880, 1320, 660, 1760][Math.floor(s.rand() * 4)], 0.08, 0.15, "square"); });
add("s-morse", "Morse Code", "electronic", 2.2, "tense", "telegraph signal", (s, c) => morse(s, c, "-- -- ...", 0.1));
add("s-electric-zap", "Electric Zap", "electronic", 0.7, "tense", "shock spark", (s, c) => { stutter(s, c, 0, 0.5, 14, 4000); hum(s, c, 0, 0.5, 120, 0.12); });
add("s-scanner", "Scanner", "electronic", 1.8, "calm", "scan beam", (s, c) => tremoloSweep(s, c, 0, 1.7, 1200, 2200, 14, 0.18));
add("s-hologram", "Hologram", "electronic", 2, "bright", "sci-fi shimmer", (s, c) => { sparkle(s, c, 0, 1.8, 16); drone(s, c, 2, [72, 79], 0.03); });

/* ------------------------------------------------------------ rise & fall */
add("s-noise-riser", "Noise Riser", "rise", 4, "tense", "build sweep up", (s) => sweep(s, 0, 3.9, 300, 9000, 0.4));
add("s-tone-riser", "Tone Riser", "rise", 3, "tense", "pitch climb", (s, c) => glide(s, c, 0, 2.9, 110, 1760, "sawtooth", 0.1, 4000));
add("s-sub-drop", "Sub Drop", "rise", 2.5, "dark", "bass fall drop", (s, c) => glide(s, c, 0, 1.6, 120, 30, "sine", 0.6, 300));
add("s-fall", "Falling Tone", "rise", 1.6, "playful", "slide whistle down", (s, c) => glide(s, c, 0, 1.4, 1800, 300, "sine", 0.2, 6000));
add("s-climb", "Climbing Tone", "rise", 1.6, "playful", "slide whistle up", (s, c) => glide(s, c, 0, 1.4, 300, 1800, "sine", 0.2, 6000));
add("s-shepard", "Endless Rise", "rise", 4, "tense", "tension spiral", (s, c) => { for (let k = 0; k < 3; k++) glide(s, c, k * 0.4, 3.4, 110 * (k + 1), 440 * (k + 1), "triangle", 0.05, 4000); });
add("s-drop-impact", "Drop + Hit", "rise", 3, "dramatic", "fall then boom", (s, c) => { sweep(s, 0, 1.4, 8000, 400, 0.4); s.boom(1.45, { gain: 0.8 }); });

/* ------------------------------------------------------------ cinematic */
add("s-braam", "Braam", "cinematic", 4, "dramatic", "trailer horn brass", (s, c) => braam(s, c, 0, 3.8));
add("s-tension-drone", "Tension Drone", "cinematic", 6, "tense", "suspense low", (s, c) => drone(s, c, 6, [38, 39, 45], 0.07));
add("s-heartbeat", "Heartbeat", "cinematic", 4, "tense", "pulse heart", (s) => { for (let i = 0; i < 4; i++) { s.kick(0.1 + i * 0.95, { gain: 0.8 }); s.kick(0.32 + i * 0.95, { gain: 0.55 }); } });
add("s-trailer-boom", "Trailer Boom", "cinematic", 4, "dramatic", "epic hit reverb", (s, c) => { s.boom(0, { gain: 1 }); metal(s, c, 0, 110, 3.5, 0.12); });
add("s-suspense-strings", "Suspense Strings", "cinematic", 5, "tense", "eerie tremolo", (s, c) => tremoloChord(s, c, 0, 4.8, [64, 65], 11, 0.06));
add("s-epic-pulse", "Epic Pulse", "cinematic", 4, "dramatic", "drums ostinato", (s) => { for (let i = 0; i < 8; i++) s.tom(i * 0.45, 38 + (i % 2) * 3, { gain: 0.6 }); });
add("s-mystery-chime", "Mystery Chime", "cinematic", 4, "dark", "eerie bell", (s) => { s.bell(0, 70, { gain: 0.25, decay: 3.5 }); s.bell(0.35, 71, { gain: 0.18, decay: 3.2 }); });
add("s-slow-motion", "Slow Motion", "cinematic", 3, "dramatic", "time slow down", (s, c) => { glide(s, c, 0, 2.6, 300, 60, "sawtooth", 0.1, 800); sweep(s, 0, 2.6, 2000, 200, 0.2); });

/* ------------------------------------------------------------ foley */
add("s-footsteps", "Footsteps", "foley", 4, "calm", "walk steps", (s, c) => { for (let i = 0; i < 7; i++) step(s, c, 0.2 + i * 0.52, 500); });
add("s-running", "Running", "foley", 3, "tense", "run steps fast", (s, c) => { for (let i = 0; i < 10; i++) step(s, c, 0.1 + i * 0.27, 650); });
add("s-gravel-steps", "Gravel Steps", "foley", 4, "calm", "walk path crunch", (s, c) => { for (let i = 0; i < 6; i++) { step(s, c, 0.2 + i * 0.6, 400); for (let k = 0; k < 6; k++) click(s, c, 0.2 + i * 0.6 + k * 0.02, 3000 + s.rand() * 2000, 0.12); } });
add("s-door-knock", "Door Knock", "foley", 1.6, "tense", "knock knock", (s, c) => { [0, 0.18, 0.36, 0.9, 1.08].forEach((t) => { resonant(s, c, t, 210, 0.15, 0.6); click(s, c, t, 1600, 0.25); }); });
add("s-paper-rustle", "Paper Rustle", "foley", 1.5, "calm", "page sheet", (s, c) => { for (let i = 0; i < 16; i++) burst(s, i * 0.08 + s.rand() * 0.04, 0.05, 3000 + s.rand() * 4000, 0.25); });
add("s-page-turn", "Page Turn", "foley", 0.9, "calm", "book flip", (s, c) => { flap(s, c, 0, 0.6, 4, 2500); });
add("s-zipper", "Zipper", "foley", 1.0, "playful", "zip bag", (s, c) => { for (let i = 0; i < 24; i++) click(s, c, i * 0.035, 3800 - i * 40, 0.3); });
add("s-typing", "Keyboard Typing", "foley", 3, "calm", "type keys", (s, c) => typing(s, c, 0, 2.9, 0.4));
add("s-cork-pop", "Cork Pop", "foley", 0.4, "playful", "bottle open", (s, c) => { chirp(s, c, 0, 900, 260, 0.06, 0.6); burst(s, 0, 0.05, 2500, 0.5); });
add("s-applause", "Applause", "foley", 4, "bright", "clap crowd", (s, c) => { for (let i = 0; i < 160; i++) burst(s, 0.1 + s.rand() * 3.4, 0.03, 2500 + s.rand() * 3500, 0.12 + s.rand() * 0.1); });
add("s-hand-clap", "Hand Clap", "foley", 0.5, "bright", "clap", (s) => s.clap(0, { gain: 0.7 }));
add("s-whip", "Whip Crack", "foley", 0.7, "tense", "lash snap", (s) => { sweep(s, 0, 0.18, 1200, 6000, 0.3); burst(s, 0.19, 0.04, 9000, 0.9); });
add("s-coins", "Coins", "foley", 1.2, "bright", "money drop", (s, c) => { for (let i = 0; i < 7; i++) glass(s, c, i * 0.09 + s.rand() * 0.04, 0.35, 2400 + s.rand() * 1500); });
add("s-chair-creak", "Chair Creak", "foley", 1.4, "dark", "wood squeak", (s, c) => { glide(s, c, 0, 0.6, 340, 280, "sawtooth", 0.06, 1200); glide(s, c, 0.7, 0.5, 300, 360, "sawtooth", 0.05, 1200); });

/* ------------------------------------------------------------ notifications */
add("s-chime", "Chime", "notification", 2, "bright", "alert bell", (s) => { s.bell(0, 84, { gain: 0.25, decay: 1.8 }); s.bell(0.12, 91, { gain: 0.2, decay: 1.6 }); });
add("s-ding", "Ding", "notification", 1.6, "bright", "bell single", (s) => s.bell(0, 88, { gain: 0.3, decay: 1.5 }));
add("s-message", "Message", "notification", 0.8, "bright", "text received", (s, c) => { tone(s, c, 0, midiToFreq(81), 0.08, 0.25); tone(s, c, 0.1, midiToFreq(88), 0.18, 0.22); });
add("s-alert", "Alert", "notification", 1.2, "tense", "warning attention", (s, c) => { for (let i = 0; i < 3; i++) tone(s, c, i * 0.3, 1000, 0.15, 0.2, "square"); });
add("s-success", "Success", "notification", 1.2, "bright", "complete win", (s, c) => { [72, 76, 79, 84].forEach((m, i) => tone(s, c, i * 0.09, midiToFreq(m), 0.22, 0.18, "triangle")); });
add("s-reminder", "Reminder", "notification", 1.6, "calm", "soft bell", (s) => { s.bell(0, 79, { gain: 0.2, decay: 1.4 }); s.bell(0.25, 84, { gain: 0.18, decay: 1.3 }); });
add("s-alarm", "Alarm", "notification", 2.5, "tense", "siren urgent", (s, c) => siren(s, c, 0, 2.4, 700, 1100, 2.2, 0.12));
add("s-level-up", "Level Up", "notification", 1.4, "playful", "game reward", (s, c) => { [67, 71, 74, 79, 83].forEach((m, i) => tone(s, c, i * 0.07, midiToFreq(m), 0.12, 0.16, "square")); });

/* ------------------------------------------------------------ reverse */
add("s-reverse-cymbal", "Reverse Cymbal", "reverse", 2.5, "tense", "swell crash backwards", (s) => reverseNoise(s, 0, 2.4, 6000, 0.45));
add("s-reverse-piano", "Reverse Piano", "reverse", 2.5, "dramatic", "backwards chord", (s, c) => reverseTones(s, c, 0, 2.3, [57, 60, 64]));
add("s-reverse-bell", "Reverse Bell", "reverse", 2, "dark", "backwards ding", (s, c) => reverseTones(s, c, 0, 1.9, [84, 91], "sine"));
add("s-reverse-whoosh", "Reverse Whoosh", "reverse", 1.6, "tense", "suck in", (s) => reverseNoise(s, 0, 1.5, 2500, 0.4));
add("s-reverse-hit", "Reverse Hit", "reverse", 2.5, "dramatic", "pre-hit swell", (s) => { reverseNoise(s, 0, 2.0, 900, 0.5); s.boom(2.0, { gain: 0.7 }); });

/* ------------------------------------------------------------ stingers */
add("s-stinger-reveal", "Reveal", "stinger", 2.5, "bright", "ta-da magic", (s, c) => { sparkle(s, c, 0, 1.2, 14); [72, 76, 79].forEach((m) => s.bell(0.15, m, { gain: 0.12, decay: 2 })); });
add("s-stinger-comedy", "Comedy Boing", "stinger", 1, "playful", "funny spring", (s, c) => siren(s, c, 0, 0.8, 300, 600, 12, 0.18, "sine"));
add("s-stinger-sad", "Sad Trombone", "stinger", 2.5, "dark", "fail wah", (s, c) => { [62, 61, 60, 59].forEach((m, i) => glide(s, c, i * 0.5, i === 3 ? 1.0 : 0.45, midiToFreq(m), midiToFreq(m) * 0.98, "sawtooth", 0.1, 1200)); });
add("s-stinger-magic", "Magic Sparkle", "stinger", 2, "bright", "fairy glitter", (s, c) => sparkle(s, c, 0, 1.8, 24));
add("s-stinger-horror", "Horror Sting", "stinger", 3, "dark", "scare shock", (s, c) => { tremoloChord(s, c, 0, 2.6, [70, 71, 76], 18, 0.08); s.boom(0, { gain: 0.5 }); });
add("s-stinger-news", "News Sting", "stinger", 2, "dramatic", "broadcast intro", (s, c) => { [60, 67, 72].forEach((m, i) => tone(s, c, i * 0.12, midiToFreq(m), 0.6 - i * 0.12, 0.14, "sawtooth")); s.boom(0, { gain: 0.4 }); });
add("s-stinger-win", "Win", "stinger", 1.8, "playful", "victory fanfare", (s, c) => { [72, 72, 72, 79].forEach((m, i) => tone(s, c, i * 0.14, midiToFreq(m), i === 3 ? 0.7 : 0.1, 0.16, "square")); });
add("s-stinger-logo", "Logo Hit", "stinger", 3, "dramatic", "brand intro", (s, c) => { s.boom(0, { gain: 0.6 }); s.bell(0, 72, { gain: 0.2, decay: 2.8 }); s.bell(0, 79, { gain: 0.14, decay: 2.6 }); });

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

function noiseShape(s, t, dur, { type = "bandpass", f0 = 1000, f1 = 1000, q = 1, gain = 0.3, attack = 0.02 } = {}) {
  const n = s.noise(t, t + dur + 0.05);
  const f = s.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = s.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.setValueAtTime(gain, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f); f.connect(g); g.connect(out(s));
}

function breath(s, t, dur, freq, gain) {
  const n = s.noise(t, t + dur);
  const f = s.ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 0.5;
  const g = s.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + dur / 2); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  n.connect(f); f.connect(g); g.connect(out(s));
}

function reverseNoise(s, t, dur, freq, gain) {
  const n = s.noise(t, t + dur + 0.02);
  const f = s.ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.setValueAtTime(freq * 0.3, t); f.frequency.exponentialRampToValueAtTime(freq, t + dur);
  const g = s.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur - 0.01); g.gain.linearRampToValueAtTime(0, t + dur);
  n.connect(f); f.connect(g); g.connect(out(s));
}

function reverseTones(s, c, t, dur, midis, type = "triangle") {
  midis.forEach((m) => {
    const o = s.osc(type, midiToFreq(m), t, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + dur - 0.02); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(out(s));
  });
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

/** Oscillator glide with a lowpass, for lasers, tape stops, slide whistles. */
function glide(s, c, t, dur, f0, f1, type, gain, cutoff) {
  const o = s.osc(type, f0, t, t + dur + 0.05);
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cutoff;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.setValueAtTime(gain, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(out(s));
}

function siren(s, c, t, dur, f0, f1, rate, gain, type = "square") {
  const o = s.osc(type, (f0 + f1) / 2, t, t + dur);
  const lfo = s.osc("sine", rate, t, t + dur);
  const depth = c.createGain(); depth.gain.value = (f1 - f0) / 2;
  lfo.connect(depth); depth.connect(o.frequency);
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 3000;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
  g.gain.setValueAtTime(gain, t + dur - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(out(s));
}

function tremoloSweep(s, c, t, dur, f0, f1, rate, gain) {
  const n = s.noise(t, t + dur);
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 2;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain(); g.gain.value = 0;
  const lfo = s.osc("sine", rate, t, t + dur);
  const d = c.createGain(); d.gain.value = gain / 2;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(1, t + dur * 0.4); env.gain.linearRampToValueAtTime(0.0001, t + dur);
  lfo.connect(d); d.connect(g.gain);
  n.connect(f); f.connect(g); g.connect(env); env.connect(out(s));
}

function tremoloChord(s, c, t, dur, midis, rate, gain) {
  midis.forEach((m) => {
    const o = s.osc("sawtooth", midiToFreq(m), t, t + dur);
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1800;
    const g = c.createGain(); g.gain.value = 0;
    const lfo = s.osc("sine", rate, t, t + dur);
    const d = c.createGain(); d.gain.value = gain;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(1, t + 0.6); env.gain.setValueAtTime(1, t + dur - 0.6); env.gain.linearRampToValueAtTime(0.0001, t + dur);
    lfo.connect(d); d.connect(g.gain);
    o.connect(f); f.connect(g); g.connect(env); env.connect(out(s));
  });
}

function burst(s, t, dur, freq, gain) {
  const n = s.noise(t, t + dur + 0.05);
  const f = s.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq;
  const g = s.ctx.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f); f.connect(g); g.connect(out(s));
}

function resonant(s, c, t, freq, dur, gain) {
  const o = s.osc("sine", freq, t, t + dur + 0.05);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out(s));
}

/** Inharmonic partials: metal and anvils. */
function metal(s, c, t, base, dur, gain) {
  [1, 2.76, 5.4, 8.93, 13.34].forEach((k, i) => resonant(s, c, t, base * k, dur / (1 + i * 0.5), gain / (1 + i * 0.7)));
  burst(s, t, 0.03, 6000, 0.4);
}

function glass(s, c, t, gain, base = 2800) {
  [1, 1.47, 2.09, 2.56].forEach((k, i) => resonant(s, c, t, base * k, 0.9 / (1 + i * 0.4), gain * 0.2 / (1 + i * 0.5)));
}

function stutter(s, c, t, dur, n, freq) {
  for (let i = 0; i < n; i++) {
    const at = t + (i / n) * dur;
    if (s.rand() < 0.75) burst(s, at, dur / n * 0.7, freq * (0.5 + s.rand()), 0.5);
    if (s.rand() < 0.4) tone(s, c, at, 120 + s.rand() * 1500, dur / n * 0.6, 0.12, "square");
  }
}

function flap(s, c, t, dur, n, freq) {
  for (let i = 0; i < n; i++) burst(s, t + (i / n) * dur, dur / n * 0.9, freq * (0.8 + s.rand() * 0.5), 0.4 * (1 - i / n) + 0.1);
}

function sparkle(s, c, t, dur, n) {
  for (let i = 0; i < n; i++) s.bell(t + s.rand() * dur, 84 + Math.floor(s.rand() * 16), { gain: 0.05 + s.rand() * 0.05, decay: 0.5 + s.rand() * 0.6 });
}

function swell(s, c, dur, midis) {
  midis.forEach((m) => {
    const o = s.osc("sawtooth", midiToFreq(m), 0, dur);
    const f = c.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(200, 0); f.frequency.exponentialRampToValueAtTime(4000, dur - 0.05);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.09, dur - 0.05); g.gain.linearRampToValueAtTime(0, dur);
    o.connect(f); f.connect(g); g.connect(out(s));
  });
}

function drone(s, c, dur, midis, gain) {
  midis.forEach((m, i) => {
    const o = s.osc(i % 2 ? "triangle" : "sawtooth", midiToFreq(m), 0, dur, (i - 1) * 6);
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 500 + i * 200;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(gain, 1.2); g.gain.setValueAtTime(gain, dur - 1.2); g.gain.linearRampToValueAtTime(0.0001, dur);
    o.connect(f); f.connect(g); g.connect(out(s));
  });
}

function braam(s, c, t, dur) {
  [33, 40, 45, 52].forEach((m, i) => {
    const o = s.osc("sawtooth", midiToFreq(m), t, t + dur, i * 7 - 10);
    const f = c.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(180, t); f.frequency.exponentialRampToValueAtTime(1500, t + 0.35); f.frequency.exponentialRampToValueAtTime(300, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(out(s));
  });
}

function hum(s, c, t, dur, freq, gain) {
  const o = s.osc("sawtooth", freq, t, t + dur);
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq * 4;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.2); g.gain.setValueAtTime(gain, t + dur - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(out(s));
}

function roomTone(s, c, dur, freq, gain) {
  const n = s.noise(0, dur);
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(gain, 0.8); g.gain.setValueAtTime(gain, dur - 0.8); g.gain.linearRampToValueAtTime(0.0001, dur);
  n.connect(f); f.connect(g); g.connect(out(s));
}

function murmur(s, c, dur) {
  roomTone(s, c, dur, 700, 0.12);
  for (let t = 0.3; t < dur - 0.4; t += 0.12 + s.rand() * 0.2) {
    const f = 180 + s.rand() * 160;
    const o = s.osc("sawtooth", f, t, t + 0.25);
    const fl = c.createBiquadFilter(); fl.type = "bandpass"; fl.frequency.value = 700 + s.rand() * 900; fl.Q.value = 4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.012, t + 0.05); g.gain.linearRampToValueAtTime(0.0001, t + 0.22);
    o.connect(fl); fl.connect(g); g.connect(out(s));
  }
}

function typing(s, c, t, dur, gain) {
  for (let x = t; x < t + dur; x += 0.07 + s.rand() * 0.16) { click(s, c, x, 3000 + s.rand() * 1800, gain); click(s, c, x + 0.03, 1200, gain * 0.5); }
}

function carPass(s, c, t, dur) {
  const n = s.noise(t, t + dur);
  const f = c.createBiquadFilter(); f.type = "lowpass";
  f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1500, t + dur / 2); f.frequency.linearRampToValueAtTime(250, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + dur / 2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f); f.connect(g); g.connect(out(s));
  glide(s, c, t, dur, 120, 80, "sawtooth", 0.05, 600);
}

function engine(s, c, t, dur, f0, f1) {
  const o = s.osc("sawtooth", f0, t, t + dur);
  o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur * 0.4); o.frequency.linearRampToValueAtTime(f0 * 1.4, t + dur);
  const lfo = s.osc("square", 22, t, t + dur);
  const d = c.createGain(); d.gain.value = 0.06;
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.3); g.gain.setValueAtTime(0.18, t + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lfo.connect(d); d.connect(g.gain);
  o.connect(f); f.connect(g); g.connect(out(s));
}

function wind(s, c, dur, lo = 300, hi = 700, level = 0.25) {
  const n = s.noise(0, dur);
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.8;
  const g = c.createGain();
  for (let t = 0; t < dur; t += 0.5) {
    f.frequency.linearRampToValueAtTime(lo + s.rand() * (hi - lo), t + 0.5);
    g.gain.linearRampToValueAtTime(level * (0.7 + s.rand()), t + 0.5);
  }
  g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(level * 1.2, 0.8);
  g.gain.setValueAtTime(level * 1.2, dur - 1); g.gain.linearRampToValueAtTime(0.0001, dur);
  n.connect(f); f.connect(g); g.connect(out(s));
}

function rain(s, c, dur, density) {
  const n = s.noise(0, dur);
  const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1200;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.12, 0.6);
  g.gain.setValueAtTime(0.12, dur - 0.8); g.gain.linearRampToValueAtTime(0.0001, dur);
  n.connect(f); f.connect(g); g.connect(out(s));
  for (let i = 0; i < dur * density; i++) click(s, c, 0.3 + s.rand() * (dur - 0.8), 2500 + s.rand() * 4000, 0.04 + s.rand() * 0.08);
}

function birds(s, c, dur, base0) {
  let t = 0.2;
  while (t < dur - 0.6) {
    const base = base0 + s.rand() * 1600;
    const notes = 2 + Math.floor(s.rand() * 4);
    for (let i = 0; i < notes; i++) chirp(s, c, t + i * 0.09, base * (1 + s.rand() * 0.2), base * (0.7 + s.rand() * 0.6), 0.07, 0.12);
    t += 0.4 + s.rand() * 0.9;
  }
}

function gull(s, c, t) {
  for (let i = 0; i < 3; i++) glide(s, c, t + i * 0.16, 0.14, 1600, 1100, "sawtooth", 0.06, 3500);
}

function hoot(s, c, t, f) {
  const o = s.osc("sine", f, t, t + 0.45);
  o.frequency.setValueAtTime(f * 1.05, t); o.frequency.linearRampToValueAtTime(f * 0.92, t + 0.4);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3, t + 0.08); g.gain.linearRampToValueAtTime(0.0001, t + 0.42);
  o.connect(g); g.connect(out(s));
}

function crickets(s, c, dur) {
  roomTone(s, c, dur, 300, 0.05);
  for (let t = 0.2; t < dur - 0.4; t += 0.5 + s.rand() * 0.4) for (let k = 0; k < 4; k++) tone(s, c, t + k * 0.045, 4300 + s.rand() * 200, 0.03, 0.06, "sine");
}

function thunder(s, c, t, dur) {
  const n = s.noise(t, t + dur);
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(120, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.08);
  for (let x = t + 0.3; x < t + dur * 0.6; x += 0.25) g.gain.linearRampToValueAtTime(0.3 + s.rand() * 0.5, x);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f); f.connect(g); g.connect(out(s));
}

function fire(s, c, dur) {
  roomTone(s, c, dur, 500, 0.12);
  for (let i = 0; i < dur * 18; i++) click(s, c, 0.2 + s.rand() * (dur - 0.4), 1800 + s.rand() * 5000, 0.08 + s.rand() * 0.25);
}

function waves(s, c, dur) {
  const n = s.noise(0, dur);
  const f = c.createBiquadFilter(); f.type = "lowpass";
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, 0);
  for (let t = 0; t < dur; t += 2.6) {
    f.frequency.linearRampToValueAtTime(600, t + 0.1); f.frequency.linearRampToValueAtTime(2600, t + 1.3); f.frequency.linearRampToValueAtTime(500, t + 2.5);
    g.gain.linearRampToValueAtTime(0.05, t + 0.1); g.gain.linearRampToValueAtTime(0.5, t + 1.2); g.gain.linearRampToValueAtTime(0.08, t + 2.5);
  }
  g.gain.linearRampToValueAtTime(0.0001, dur);
  n.connect(f); f.connect(g); g.connect(out(s));
}

function stream(s, c, dur) {
  roomTone(s, c, dur, 2200, 0.1);
  for (let i = 0; i < dur * 30; i++) chirp(s, c, s.rand() * (dur - 0.2), 900 + s.rand() * 1800, 1200 + s.rand() * 2400, 0.03, 0.05);
}

function drip(s, c, t, f, gain = 0.35) { chirp(s, c, t, f, f * 2.2, 0.05, gain); }

function pour(s, c, t, dur) {
  const n = s.noise(t, t + dur);
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 4;
  f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(1800, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.4, t + 0.2); g.gain.setValueAtTime(0.4, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  n.connect(f); f.connect(g); g.connect(out(s));
}

function step(s, c, t, freq) {
  burst(s, t, 0.07, freq * 2, 0.6);
  resonant(s, c, t, freq / 4, 0.09, 0.4);
}

function morse(s, c, code, unit) {
  let t = 0.1;
  for (const ch of code) {
    if (ch === " ") { t += unit * 3; continue; }
    const len = ch === "-" ? unit * 3 : unit;
    tone(s, c, t, 700, len, 0.2, "sine");
    t += len + unit;
  }
}

/* ------------------------------------------------------------ rendering */
const cache = new Map();
export function loadSfx(id) {
  if (cache.has(id)) return cache.get(id);
  const def = DEFS.find((d) => d.id === id);
  if (!def) return Promise.reject(new Error("Unknown sound " + id));
  const p = renderOffline(def.duration, (ctx) => {
    const s = new Synth(ctx, def.seed, { reverb: 0.15, reverbTime: 1.4 });
    def.gen(s, ctx);
  }).then((buf) => normalize(buf, ["nature", "ambience", "water"].includes(def.category) ? -6 : -3)).catch((e) => { cache.delete(id); throw e; });
  cache.set(id, p);
  return p;
}

export const getSfx = (id) => SFX.find((s) => s.id === id) || null;
