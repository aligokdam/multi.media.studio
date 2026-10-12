/* Filters: colour and tone looks (not image transformations, which are effects).
   A filter is a set of adjustments, optionally with one tone effect, scaled by
   its strength (0..1). The same filters are used by the video and the photo
   editor. Adjustment values use the ranges of the colour panel (-100..100). */

export const FILTERS = [
  { id: "vivid", adjust: { contrast: 18, saturation: 38 } },
  { id: "warm", adjust: { temperature: 40, saturation: 10, exposure: 3 } },
  { id: "cool", adjust: { temperature: -40, tint: -6, contrast: 6 } },
  { id: "golden", adjust: { temperature: 55, tint: 10, exposure: 6, contrast: 8 } },
  { id: "teal", adjust: { temperature: -28, tint: -18, contrast: 18, saturation: 8 } },
  { id: "pastel", adjust: { contrast: -22, saturation: -28, brightness: 14 } },
  { id: "matte", adjust: { contrast: -16, brightness: 8, saturation: -12 } },
  { id: "dramatic", adjust: { contrast: 45, saturation: -14, exposure: -8 } },
  { id: "mono", adjust: { saturation: -100, contrast: 14 } },
  { id: "noir", adjust: { saturation: -100, contrast: 55, exposure: -10 } },
  { id: "sepia", adjust: { contrast: 6 }, effect: "sepia" },
  { id: "faded", adjust: { contrast: -10 }, effect: "fade" },
  { id: "film", adjust: { temperature: 12, contrast: 10, saturation: -8 }, effect: "fade", effectAmount: 0.35 },
  { id: "retro", adjust: { temperature: 28, saturation: -22, contrast: -8 }, effect: "fade" },
];
export const getFilter = (id) => FILTERS.find((f) => f.id === id) || null;
export const ADJUST_KEYS = ["exposure", "brightness", "contrast", "saturation", "temperature", "tint"];

/**
 * Final adjustments and effect chain of a clip or photo:
 * the filter (scaled by its strength) plus the manual adjustments and effects.
 */
export function combineLook({ filter, adjust, effects }) {
  const out = {};
  const f = filter?.id ? getFilter(filter.id) : null;
  const k = filter?.amount ?? 1;
  for (const key of ADJUST_KEYS) out[key] = Math.max(-100, Math.min(100, (f?.adjust?.[key] || 0) * k + (adjust?.[key] || 0)));
  const fx = [];
  if (f?.effect) fx.push({ id: f.effect, amount: (f.effectAmount ?? 0.75) * k });
  for (const e of effects || []) if (!fx.some((x) => x.id === e.id)) fx.push(e);
  const plain = !fx.length && ADJUST_KEYS.every((key) => !out[key]);
  return { adjust: out, effects: fx, plain };
}
