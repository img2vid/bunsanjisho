// Stroke-order data loader — KanjiVG (CC BY-SA 3.0) preprocessed into 4 lazy chunks.
// viewBox is always "0 0 109 109"; paths are in document (stroke) order.
export interface StrokeData {
  c: string;
  p: string[];
}

const CHUNKS: Array<{ i: number; min: number; max: number }> = [
  { i: 0, min: 19968, max: 24076 },
  { i: 1, min: 24086, max: 28500 },
  { i: 2, min: 28508, max: 35328 },
  { i: 3, min: 35330, max: 40845 },
];

const cache = new Map<string, string[]>();

/** Load stroke paths for a kanji. Returns null if unknown (lazy chunk import). */
export async function loadStrokes(ch: string): Promise<string[] | null> {
  if (cache.has(ch)) return cache.get(ch)!;
  const cp = ch.codePointAt(0)!;
  const bucket = CHUNKS.find(c => cp >= c.min && cp <= c.max);
  if (!bucket) return null;
  const mod = await import(`@/lib/data/strokes-${bucket.i}`);
  const list: StrokeData[] = mod[`STROKES_${bucket.i}`];
  // fill cache for the whole bucket hit-rate (single scan)
  const map = new Map<string, string[]>();
  for (const d of list) map.set(d.c, d.p);
  for (const [k, v] of map) if (!cache.has(k)) cache.set(k, v);
  return cache.get(ch) ?? null;
}

export const STROKE_VIEWBOX = 109;
