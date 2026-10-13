/* Editor state with undo/redo.
   The project is mutated only through update() (one undoable step) or through a
   gesture (begin → live… → commit), which records a single step for a whole
   drag or slider movement. History entries are JSON snapshots: projects are
   small (media lives elsewhere), so this is simple and robust. */
import { Emitter, clamp } from "../core/util.js";
import { normalizeTracks, projectDuration, findClip } from "./model.js";
import { LIMITS } from "../config.js";

export function createStore(project) {
  const bus = new Emitter();
  const state = {
    project,
    selection: [],      // clip ids
    junction: null,     // { trackId, clipId } for transitions
    time: 0,
    playing: false,
    zoom: 80,           // px per second
  };
  let undo = [], redo = [];
  let gesture = null;   // { label, before }
  let lastCoalesce = null;

  const snapshot = () => JSON.stringify(state.project);

  function emitProject(detail) {
    bus.emit("project", detail);
    bus.emit("history");
  }

  function pushUndo(before, label) {
    undo.push({ json: before, label });
    if (undo.length > LIMITS.historyDepth) undo.shift();
    redo = [];
  }

  function finish(label, live = false) {
    normalizeTracks(state.project, { resolve: !live });
    state.project.updatedAt = Date.now();
    pruneSelection();
    emitProject({ label, live });
  }

  function pruneSelection() {
    const before = state.selection.length;
    state.selection = state.selection.filter((id) => findClip(state.project, id));
    if (state.junction && !findClip(state.project, state.junction.clipId)) state.junction = null;
    if (state.selection.length !== before) bus.emit("selection");
  }

  const store = {
    state,
    on: (type, fn) => bus.on(type, fn),
    get project() { return state.project; },

    /** One undoable change. `coalesce` merges rapid repeats (e.g. arrow-key nudges). */
    update(label, fn, { coalesce } = {}) {
      if (gesture) { fn(state.project); finish(label, true); return; }
      const before = snapshot();
      const res = fn(state.project);
      if (res === false) return false;
      const now = performance.now();
      if (!(coalesce && lastCoalesce && lastCoalesce.key === coalesce && now - lastCoalesce.at < 1200)) pushUndo(before, label);
      lastCoalesce = coalesce ? { key: coalesce, at: now } : null;
      finish(label);
      return res;
    },

    begin(label) { if (!gesture) gesture = { label, before: snapshot() }; },
    live(fn) { fn(state.project); finish(gesture?.label || "", true); },
    commit() {
      if (!gesture) return;
      const g = gesture; gesture = null;
      if (snapshot() !== g.before) pushUndo(g.before, g.label);
      finish(g.label);
    },
    cancel() {
      if (!gesture) return;
      state.project = JSON.parse(gesture.before);
      gesture = null;
      finish("cancel");
    },
    get inGesture() { return !!gesture; },

    canUndo: () => undo.length > 0,
    canRedo: () => redo.length > 0,
    undoLabel: () => undo[undo.length - 1]?.label || "",
    redoLabel: () => redo[redo.length - 1]?.label || "",
    undo() {
      if (gesture) store.commit();
      const e = undo.pop();
      if (!e) return null;
      redo.push({ json: snapshot(), label: e.label });
      state.project = JSON.parse(e.json);
      lastCoalesce = null;
      finish("undo");
      return e.label;
    },
    redo() {
      const e = redo.pop();
      if (!e) return null;
      undo.push({ json: snapshot(), label: e.label });
      state.project = JSON.parse(e.json);
      finish("redo");
      return e.label;
    },

    /* ---------------------------------------------- selection & transport */
    select(ids, { add = false } = {}) {
      const list = Array.isArray(ids) ? ids : ids ? [ids] : [];
      state.selection = add ? Array.from(new Set([...state.selection, ...list])) : list;
      state.junction = null;
      bus.emit("selection");
    },
    selectJunction(j) { state.junction = j; state.selection = []; bus.emit("selection"); },
    get selectedClip() {
      const id = state.selection[state.selection.length - 1];
      return id ? findClip(state.project, id) : null;
    },
    duration: () => projectDuration(state.project),
    setTime(t, source) {
      const d = projectDuration(state.project);
      const v = clamp(t, 0, Math.max(0, d));
      if (v === state.time) return;
      state.time = v;
      bus.emit("time", { source });
    },
    setPlaying(p) { if (state.playing !== p) { state.playing = p; bus.emit("playing"); } },
    setZoom(z) {
      const v = clamp(z, LIMITS.minZoom, LIMITS.maxZoom);
      if (v !== state.zoom) { state.zoom = v; bus.emit("zoom"); }
    },
    emit: (type, d) => bus.emit(type, d),
  };
  return store;
}
