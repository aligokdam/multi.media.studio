/* Small previews of a look (adjustments and effects) on the procedural sample
   scene, rendered once with the real compositor and cached as data URLs.
   Used by the effect library and the filter row of the video editor. */
import { Compositor } from "./compositor.js";
import { buildLayer } from "./scene.js";
import { drawSampleScene } from "./sample.js";

const cache = new Map();
let comp = null, sample = null;

export function lookThumb(key, { adjust = {}, effects = [] } = {}) {
  if (cache.has(key)) return cache.get(key);
  try {
    if (!comp) {
      comp = new Compositor(document.createElement("canvas"), { preserveDrawingBuffer: true });
      comp.setSize(192, 120);
      sample = drawSampleScene(Object.assign(document.createElement("canvas"), { width: 384, height: 240 }), 1.5, 2);
    }
    const clip = { transform: { x: 0, y: 0, scale: 1, rotation: 0 }, opacity: 1, fit: "cover", adjust, effects, duration: 10 };
    const layer = buildLayer({ clip, local: 1 }, { w: 192, h: 120 }, { key: "sample", source: sample, srcW: 384, srcH: 240, version: 1 });
    comp.render([{ kind: "layer", layer }], { time: 1.37 });
    const url = comp.canvas.toDataURL("image/jpeg", 0.82);
    cache.set(key, url);
    return url;
  } catch { return null; }
}

export function dropThumb(key) { cache.delete(key); }

/** The compositor and sample scene, for other thumbnail renderers (transitions). */
export function thumbContext() { lookThumb("__init__"); return { comp, sample }; }
