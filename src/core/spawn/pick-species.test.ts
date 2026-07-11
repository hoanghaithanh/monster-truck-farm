import { describe, expect, it } from 'vitest';
import { pickSpecies } from './pick-species';

// Weighted species picker (issue #48, ADR 0016 §1: chicken 0.7 / pig 0.25 /
// cow 0.05). A seeded fake Rng makes the boundary/distribution behavior
// deterministic to assert against, rather than relying on Math.random.
describe('pickSpecies', () => {
  it('picks chicken for a roll in [0, 0.7)', () => {
    expect(pickSpecies(() => 0)).toBe('chicken');
    expect(pickSpecies(() => 0.3)).toBe('chicken');
    expect(pickSpecies(() => 0.6999)).toBe('chicken');
  });

  it('picks pig for a roll in [0.7, 0.95)', () => {
    expect(pickSpecies(() => 0.7)).toBe('pig');
    expect(pickSpecies(() => 0.8)).toBe('pig');
    expect(pickSpecies(() => 0.9499)).toBe('pig');
  });

  it('picks cow for a roll in [0.95, 1)', () => {
    expect(pickSpecies(() => 0.95)).toBe('cow');
    expect(pickSpecies(() => 0.999999)).toBe('cow');
  });

  it('falls back to the last species (cow) for a roll that reaches/exceeds 1 -- floating-point-rounding robustness, not reachable by a real Math.random() in [0,1)', () => {
    expect(pickSpecies(() => 1)).toBe('cow');
  });

  it('defaults to Math.random when no rng is supplied -- always returns a valid species', () => {
    const species = pickSpecies();
    expect(['chicken', 'pig', 'cow']).toContain(species);
  });

  it('over many draws with a real Math.random-like source, produces roughly the 0.7/0.25/0.05 mix (AC4 "reasonable mix", not starved/dominated)', () => {
    // Deterministic pseudo-random sequence (mulberry32) instead of
    // Math.random -- reproducible across CI runs.
    let seed = 42;
    const rng = () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const counts = { chicken: 0, pig: 0, cow: 0 };
    const draws = 20000;
    for (let i = 0; i < draws; i++) {
      counts[pickSpecies(rng)]++;
    }

    expect(counts.chicken / draws).toBeGreaterThan(0.6);
    expect(counts.chicken / draws).toBeLessThan(0.8);
    expect(counts.pig / draws).toBeGreaterThan(0.15);
    expect(counts.pig / draws).toBeLessThan(0.35);
    expect(counts.cow / draws).toBeGreaterThan(0.01);
    expect(counts.cow / draws).toBeLessThan(0.1);
  });
});
