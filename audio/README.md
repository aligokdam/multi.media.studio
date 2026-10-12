# `audio/`: built-in music and sound library

This folder documents the audio library. There are no audio files to ship:
every track and sound effect is synthesized in the browser by the code in
[`src/audio/`](../src/audio/README.md), which is why the whole library is CC0.

All built-in music and sound effects are **generated on the user's device** by the
synthesizer in `src/audio/synth.js`. There are no samples, loops or third-party
recordings in this repository, which is why the library can be released under
**CC0 1.0** (public domain) and used commercially without attribution.

## Adding a track

Tracks are data in `src/audio/music.js` (`TRACKS`):

```js
{ id: "m-my-track", title: "My Track", genre: "chill", moods: ["warm"], duration: 60, seed: 1234, root: 50, scale: "major" }
```

- `genre` selects the arrangement recipe (see `RECIPES` and `compose()`).
- `seed` makes melodies and textures reproducible.
- `root` is the MIDI note of the key, `scale` one of `major`, `minor`, `dorian`, `mixolydian`.

Sound effects are added the same way in `src/audio/sfx.js` with `add()`:

```js
add("s-my-sound", "My Sound", "impact", 1.2, "dramatic", "hit boom deep", (s) => burst(s, 0, 1.1, 90, 0.8));
```

- `category` is one of the 15 categories in `SFX_CATEGORIES`.
- `mood` is one of `SFX_MOODS` (calm, playful, tense, dramatic, bright, dark).
- `tags` are English search words.
- The generator must make a sound that is really different from every other
  entry. Do not add renamed copies.

The library currently has 145 sound effects and every one of them is generated.

## Licensing rule

Only add audio whose license is certain. Generated material is CC0. If file-based
audio is ever added, keep it on the app's own origin and record its license next
to the entry so it is shown in **Music › License information**.
