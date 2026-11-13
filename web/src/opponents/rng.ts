/**
 * Small seeded PRNG (mulberry32). A seed makes the placeholder opponent
 * reproducible in tests: same seed + same position = same move.
 */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick an index from a probability vector that sums to ~1. */
export function sampleIndex(probabilities: number[], rng: Rng): number {
  const r = rng();
  let acc = 0;
  for (let i = 0; i < probabilities.length; i++) {
    acc += probabilities[i];
    if (r < acc) return i;
  }
  return probabilities.length - 1;
}
