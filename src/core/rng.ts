/** Pure seeded PRNG (mulberry32). State is a number carried inside game state,
 * so the whole core stays a pure function (AC-6): same seed → same stream. */

export function seedRng(seed: number): number {
  return seed >>> 0;
}

/** Returns [random in [0,1), next state]. */
export function nextRand(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) >>> 0;
  let x = t;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  const r = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  return [r, t];
}
