/* Editing actions. UI controls and keyboard shortcuts call these; each one is a
   single undoable step. */
import { uid } from "../core/util.js";
import { prefs } from "../core/prefs.js";
import { t as tr } from "../core/i18n.js";
import {
  createMediaClip, createTextClip, createTrack, clipEnd, findClip, mainTrack,
  splitClip, canJoin, trackAccepts, maxDuration, projectDuration,
} from "./model.js";
import { DEFAULT_TRANSITION_DURATION } from "../render/transitions.js";
import { getEffect } from "../render/effects.js";

export function createActions(store, registry) {
  const P = () => store.project;

  function overlaps(track, start, end, ignoreId) {
    return track.clips.some((c) => c.id !== ignoreId && start < clipEnd(c) - 1e-4 && end > c.start + 1e-4);
  }

  /** First non-main track of a kind with room at [start, end), creating one if needed. */
  function freeTrack(p, kind, role, start, end) {
    const candidates = p.tracks.filter((t) => t.kind === kind && t.role !== "main" && (!role || t.role === role) && !t.locked);
    const found = candidates.find((t) => !overlaps(t, start, end));
    if (found) return found;
    const tr = createTrack(kind, role);
    if (kind === "text") p.tracks.unshift(tr);
    else if (kind === "video") p.tracks.splice(p.tracks.indexOf(mainTrack(p)), 0, tr);
    else {
      const lastAudio = p.tracks.map((t) => t.kind).lastIndexOf("audio");
      p.tracks.splice(lastAudio + 1, 0, tr);
    }
    return tr;
  }

  /** Index in the main track where a clip inserted at time t should go. */
  function mainInsertIndex(track, t) {
    for (let i = 0; i < track.clips.length; i++) {
      const c = track.clips[i];
      if (t < c.start + c.duration / 2) return i;
    }
    return track.clips.length;
  }

  const actions = {
    /** Adds media to the timeline. Visual media goes on the main track (or an
        overlay track when overlay = true); audio goes on a music/sfx track. */
    addMedia(media, { at, overlay = false, trackId, role, sticker = false } = {}) {
      if (sticker) overlay = true;
      const time = at ?? store.state.time;
      let clipId = null;
      store.update("add", (p) => {
        const dur = sticker ? 3 : media.kind === "image" ? prefs.get("imageDuration") : undefined;
        const clip = createMediaClip(media, { start: time, duration: dur });
        clipId = clip.id;
        let track = trackId ? p.tracks.find((t) => t.id === trackId) : null;
        if (track && !trackAccepts(track, clip.kind)) track = null;
        if (media.kind === "audio") {
          if (!track || overlaps(track, time, time + clip.duration)) track = freeTrack(p, "audio", role || (media.origin === "sfx" ? "sfx" : "music"), time, time + clip.duration);
          track.clips.push(clip);
        } else if (overlay || (track && track.role !== "main")) {
          if (!track || overlaps(track, time, time + clip.duration)) track = freeTrack(p, "video", "overlay", time, time + clip.duration);
          if (sticker) { clip.transform.scale = 0.3; clip.fit = "contain"; clip.animIn = { type: "pop", duration: 0.4 }; }
          else if (overlay) { clip.transform.scale = 0.42; clip.transform.x = 0.26; clip.transform.y = -0.24; }
          track.clips.push(clip);
        } else {
          const main = mainTrack(p);
          main.clips.splice(mainInsertIndex(main, time), 0, clip);
          // Main track is packed after update; place the playhead on the new clip.
          let tt = 0; for (const c of main.clips) { if (c === clip) break; tt += c.duration; }
          clip.start = tt;
        }
      });
      if (clipId) { store.select(clipId); const f = findClip(P(), clipId); if (f) store.setTime(f.clip.start); }
      return clipId;
    },

    addText(preset = "title", content, opts = {}) {
      const time = store.state.time;
      let id = null;
      store.update("text", (p) => {
        const clip = createTextClip(preset, { start: time, duration: preset === "subtitles" ? 3 : 4, content: content ?? defaultContent(preset) });
        if (opts.font) clip.text.style.font = opts.font;
        id = clip.id;
        freeTrack(p, "text", "text", time, time + clip.duration).clips.push(clip);
      });
      store.select(id);
      return id;
    },

    /** Merges style fields into a text clip's style. */
    setTextStyle(clipId, patch) {
      return store.update("text", (p) => {
        const f = findClip(p, clipId);
        if (!f || f.clip.kind !== "text") return false;
        Object.assign(f.clip.text.style, patch);
      });
    },

    /** Sets the same in and out transition on a text clip ("none" removes both). */
    setTextTransition(clipId, type) {
      return store.update("animation", (p) => {
        const f = findClip(p, clipId);
        if (!f || f.clip.kind !== "text") return false;
        if (type === "none") { f.clip.animIn = { type: "none", duration: 0.6 }; f.clip.animOut = { type: "none", duration: 0.6 }; }
        else { f.clip.animIn = { type, duration: f.clip.animIn?.duration || 0.6 }; f.clip.animOut = { type, duration: f.clip.animOut?.duration || 0.6 }; }
      });
    },

    split() {
      const t = store.state.time;
      const sel = store.selectedClip;
      let targets = [];
      // The selected clip if the playhead is over it, otherwise the main-track clip under the playhead.
      if (sel && !sel.track.locked && t > sel.clip.start && t < clipEnd(sel.clip)) targets = [sel.clip.id];
      else {
        const main = mainTrack(P());
        const c = main.clips.find((x) => t > x.start && t < clipEnd(x));
        if (c && !main.locked) targets = [c.id];
      }
      if (!targets.length) return false;
      let newId = null;
      const ok = store.update("split", (p) => {
        const f = findClip(p, targets[0]);
        if (!f) return false;
        const right = splitClip(f.clip, t);
        if (!right) return false;
        f.track.clips.splice(f.index + 1, 0, right);
        newId = right.id;
      });
      if (ok !== false && newId) store.select(newId);
      return ok !== false;
    },

    remove(ids = store.state.selection) {
      if (!ids.length) return false;
      store.update("delete", (p) => {
        for (const id of ids) {
          const f = findClip(p, id);
          if (f && !f.track.locked) f.track.clips.splice(f.track.clips.indexOf(f.clip), 1);
        }
        pruneEmptyTracks(p);
      });
      store.select([]);
      return true;
    },

    duplicate(ids = store.state.selection) {
      if (!ids.length) return false;
      const newIds = [];
      store.update("duplicate", (p) => {
        for (const id of ids) {
          const f = findClip(p, id);
          if (!f) continue;
          const copy = structuredClone(f.clip);
          copy.id = uid("c");
          copy.transition = null;
          copy.start = clipEnd(f.clip);
          if (f.track.role === "main") f.track.clips.splice(f.index + 1, 0, copy);
          else {
            const tr = overlaps(f.track, copy.start, copy.start + copy.duration) ? freeTrack(p, f.track.kind, f.track.role, copy.start, copy.start + copy.duration) : f.track;
            tr.clips.push(copy);
          }
          newIds.push(copy.id);
        }
      });
      store.select(newIds);
      return true;
    },

    canJoinSelected() {
      const sel = store.selectedClip;
      if (!sel) return false;
      return canJoin(sel.track.clips[sel.index], sel.track.clips[sel.index + 1]) || canJoin(sel.track.clips[sel.index - 1], sel.track.clips[sel.index]);
    },

    join() {
      const sel = store.selectedClip;
      if (!sel) return false;
      let a = sel.track.clips[sel.index], b = sel.track.clips[sel.index + 1];
      if (!canJoin(a, b)) { b = a; a = sel.track.clips[sel.index - 1]; }
      if (!canJoin(a, b)) return false;
      const aId = a.id, bId = b.id;
      store.update("join", (p) => {
        const fa = findClip(p, aId), fb = findClip(p, bId);
        fa.clip.duration += fb.clip.duration;
        if (fb.clip.animOut) fa.clip.animOut = fb.clip.animOut;
        if (fb.clip.fadeOut != null) fa.clip.fadeOut = fb.clip.fadeOut;
        fb.track.clips.splice(fb.index, 1);
      });
      store.select(aId);
      return true;
    },

    /** Sets (or clears, with type "cut") the transition into clipId. */
    setTransition(clipId, type, duration) {
      return store.update("transition", (p) => {
        const f = findClip(p, clipId);
        if (!f || f.index === 0) return false;
        const prev = f.track.clips[f.index - 1];
        if (Math.abs(clipEnd(prev) - f.clip.start) > 0.01) return false;
        if (!type || type === "cut") f.clip.transition = null;
        else f.clip.transition = { type, duration: duration ?? f.clip.transition?.duration ?? DEFAULT_TRANSITION_DURATION };
      }) !== false;
    },

    /** Junction (cut point) to target: selected junction, else the one nearest the playhead on the main track. */
    targetJunction() {
      if (store.state.junction) return store.state.junction;
      const sel = store.selectedClip;
      const track = sel && sel.track.kind !== "audio" ? sel.track : mainTrack(P());
      const t = store.state.time;
      let best = null, bestD = Infinity;
      track.clips.forEach((c, i) => {
        if (i === 0) return;
        const prev = track.clips[i - 1];
        if (Math.abs(clipEnd(prev) - c.start) > 0.01) return;
        const d = Math.abs(c.start - t);
        if (d < bestD) { bestD = d; best = { trackId: track.id, clipId: c.id }; }
      });
      return best;
    },

    addEffect(clipId, effectId) {
      const def = getEffect(effectId);
      if (!def) return false;
      return store.update("effect", (p) => {
        const f = findClip(p, clipId);
        if (!f || f.clip.kind === "audio") return false;
        if (f.clip.effects.some((e) => e.id === effectId)) return false;
        if (f.clip.effects.length >= 8) return false;
        f.clip.effects.push({ id: effectId, amount: def.defaultAmount, enabled: true });
      }) !== false;
    },

    removeEffect(clipId, effectId) {
      store.update("effect", (p) => {
        const f = findClip(p, clipId);
        if (f) f.clip.effects = f.clip.effects.filter((e) => e.id !== effectId);
      });
    },

    /** Removes every effect from a clip in one undo step. */
    clearEffects(clipId) {
      return store.update("effect", (p) => {
        const f = findClip(p, clipId);
        if (!f || !f.clip.effects?.length) return false;
        f.clip.effects = [];
      });
    },

    /** Moves the playhead to the previous/next edit point. */
    jumpEdit(dir) {
      const t = store.state.time;
      const pts = new Set([0, projectDuration(P())]);
      for (const tr of P().tracks) for (const c of tr.clips) { pts.add(c.start); pts.add(clipEnd(c)); }
      const sorted = Array.from(pts).sort((a, b) => a - b);
      const target = dir > 0 ? sorted.find((x) => x > t + 1e-3) : sorted.reverse().find((x) => x < t - 1e-3);
      if (target != null) store.setTime(target);
    },

    /** Nudges selected clips on free tracks by `delta` seconds. */
    nudge(delta) {
      const ids = store.state.selection;
      if (!ids.length) return;
      store.update("move", (p) => {
        for (const id of ids) {
          const f = findClip(p, id);
          if (!f || f.track.role === "main" || f.track.locked) continue;
          f.clip.start = Math.max(0, f.clip.start + delta);
        }
      }, { coalesce: "nudge" });
    },

    trimToPlayhead(side) {
      const sel = store.selectedClip;
      if (!sel) return;
      const t = store.state.time, c = sel.clip;
      if (t <= c.start || t >= clipEnd(c)) return;
      store.update("trim", (p) => {
        const f = findClip(p, c.id);
        const media = p.media[f.clip.mediaId];
        if (side === "start") {
          const d = t - f.clip.start;
          if (f.clip.in != null) f.clip.in += d * (f.clip.speed || 1);
          f.clip.duration -= d;
          if (f.track.role !== "main") f.clip.start = t;
        } else {
          f.clip.duration = Math.min(t - f.clip.start, maxDuration(f.clip, media));
        }
      });
    },

    /* ---------------- tracks (layers) */
    /** Adds an empty track the user asked for. Video layers go just above the main track,
        text at the top, audio at the bottom. User tracks stay even while empty. */
    addTrack(kind, role) {
      let id = null;
      store.update("track-add", (p) => {
        customizeLanes(p);
        const tr = createTrack(kind, role);
        tr.pinned = true;
        id = tr.id;
        if (kind === "text") p.tracks.unshift(tr);
        else if (kind === "video") p.tracks.splice(p.tracks.indexOf(mainTrack(p)), 0, tr);
        else p.tracks.push(tr);
      });
      return id;
    },
    /** Deletes a track with its clips. The main track is required by the editor, so
        "deleting" it removes all of its clips and keeps the empty track. */
    removeTrack(trackId) {
      store.update("track-remove", (p) => {
        const tr = p.tracks.find((x) => x.id === trackId);
        if (!tr) return;
        customizeLanes(p);
        if (tr.role === "main") { tr.clips = []; return; }
        p.tracks = p.tracks.filter((x) => x !== tr);
      });
      store.select([]);
    },
    renameTrack(trackId, name) {
      store.update("track-rename", (p) => {
        const tr = p.tracks.find((x) => x.id === trackId);
        if (tr) tr.name = String(name || "").trim().slice(0, 40) || undefined;
      });
    },
  };
  return actions;
}

/** From the first manual track change on, the project keeps its own lane layout:
    existing lanes stay even when empty and default lanes are no longer re-added. */
function customizeLanes(p) {
  if (p.settings.customLanes) return;
  p.settings.customLanes = true;
  for (const tr of p.tracks) tr.pinned = true;
}

function defaultContent(preset) {
  return tr("text.sample." + preset);
}

/** Removes extra empty tracks, keeping one of each default role. */
export function pruneEmptyTracks(p) {
  const keep = new Set();
  p.tracks = p.tracks.filter((tr) => {
    if (tr.clips.length || tr.role === "main" || tr.pinned) return true;
    const key = tr.kind + ":" + tr.role;
    if (keep.has(key)) return false;
    if (tr.role === "overlay") return false;
    keep.add(key);
    return true;
  });
  // Ensure default lanes exist (unless the user arranged the lanes themselves).
  if (p.settings.customLanes) return;
  if (!p.tracks.some((t) => t.kind === "text")) p.tracks.unshift(createTrack("text"));
  if (!p.tracks.some((t) => t.role === "music")) p.tracks.push(createTrack("audio", "music"));
  if (!p.tracks.some((t) => t.role === "sfx")) p.tracks.push(createTrack("audio", "sfx"));
}
