/**
 * GRID LOCK — Seeded Pseudo-Random Number Generator (Mulberry32)
 *
 * Deterministic PRNG with 32-bit state.
 * Guarantees 100% reproducible simulations across test environments and browsers.
 */

export function createPRNG(initialSeed = 42) {
  let s = Math.floor(initialSeed) >>> 0

  function next() {
    let t = (s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    nextFloat() {
      return next()
    },

    nextInt(min, max) {
      return Math.floor(min + next() * (max - min + 1))
    },

    nextRange(min, max) {
      return min + next() * (max - min)
    },

    reset(newSeed = 42) {
      s = Math.floor(newSeed) >>> 0
    },
  }
}
