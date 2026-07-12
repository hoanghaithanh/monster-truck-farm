import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// AC8 (hard safety constraint) / AC9 (hills never wheel-tier gated) --
// issue #49, ADR 0017. The existing "movement isolation" test in
// truck-motion.test.ts proves AC8 *behaviorally* (two independent
// trajectories are byte-identical) but that test would also pass in a world
// where someone quietly threaded a `sampleTerrainHeight` parameter into
// `integrateTruckMotion` and then always called it with the same sampler --
// it doesn't prove the sim module has literally no path to terrain data.
// This file adds the missing *structural* guarantee ADR 0017 §Testing calls
// "the strongest guarantee": grep the actual source text of the modules that
// must never see terrain height, so this test breaks the instant a future
// import is added, rather than relying on a comment or a coincidence of test
// inputs.
//
// Also covers AC9: `core/clearance.ts` (the wheel-tier gating module) must
// never import terrain-height either -- hills are not a clearance-gated
// obstacle class, and this proves it the same structural way.
const CORE_DIR = join(dirname(fileURLToPath(import.meta.url)));

function readSource(relativePath: string): string {
  return readFileSync(join(CORE_DIR, relativePath), 'utf-8');
}

describe('AC8/AC9 structural isolation: terrain-height.ts is never imported by the sim/clearance modules', () => {
  it('core/driving/truck-motion.ts does not import core/terrain-height.ts', () => {
    const source = readSource('driving/truck-motion.ts');
    expect(source).not.toMatch(/from ['"].*terrain-height['"]/);
  });

  it('core/driving/boundary.ts does not import core/terrain-height.ts', () => {
    const source = readSource('driving/boundary.ts');
    expect(source).not.toMatch(/from ['"].*terrain-height['"]/);
  });

  it('core/clearance.ts (the wheel-tier gating module) does not import core/terrain-height.ts (AC9)', () => {
    const source = readSource('clearance.ts');
    expect(source).not.toMatch(/from ['"].*terrain-height['"]/);
  });

  it('physics/world.ts (the Rapier collider adapter) does not import core/terrain-height.ts', () => {
    const source = readFileSync(join(CORE_DIR, '..', 'physics', 'world.ts'), 'utf-8');
    expect(source).not.toMatch(/from ['"].*terrain-height['"]/);
  });

  it('integrateTruckMotion has no terrain/hill-shaped parameter in its signature (a future dev cannot silently add one without this test failing)', () => {
    const source = readSource('driving/truck-motion.ts');
    const signatureMatch = source.match(/export function integrateTruckMotion\(([\s\S]*?)\):/);
    expect(signatureMatch).not.toBeNull();
    const signature = signatureMatch![1];
    expect(signature).not.toMatch(/terrain/i);
    expect(signature).not.toMatch(/hill/i);
  });

  it('clampToBounds/clampCameraToBounds have no terrain-height-shaped parameter in their signatures', () => {
    const source = readSource('driving/boundary.ts');
    expect(source).not.toMatch(/terrain-?[Hh]eight/);
  });
});

// AC12 (issue #63, ADR 0018 §3/§6): per-wheel suspension is visual-only, the
// same category of decision already made (and structurally proven above) for
// the whole-body climb lift/tilt it extends -- it must never influence
// forward progress, the kinematic sim, or the Rapier collider. Same
// technique as the AC8/AC9 block above: grep the actual source text rather
// than trust a comment, so this breaks the instant a future edit threads
// `wheelSuspension`/suspension-shaped data into the sim/collider modules.
describe('AC12 structural isolation: per-wheel suspension is never referenced by the sim/collider modules (issue #63)', () => {
  it('core/driving/truck-motion.ts does not reference wheelSuspension/suspension-travel', () => {
    const source = readSource('driving/truck-motion.ts');
    expect(source).not.toMatch(/wheelSuspension|suspension/i);
  });

  it('core/driving/boundary.ts does not reference wheelSuspension/suspension-travel', () => {
    const source = readSource('driving/boundary.ts');
    expect(source).not.toMatch(/wheelSuspension|suspension/i);
  });

  it('core/clearance.ts does not reference wheelSuspension/suspension-travel', () => {
    const source = readSource('clearance.ts');
    expect(source).not.toMatch(/wheelSuspension|suspension/i);
  });

  it('physics/world.ts (the Rapier collider adapter) does not reference wheelSuspension/suspension-travel', () => {
    const source = readFileSync(join(CORE_DIR, '..', 'physics', 'world.ts'), 'utf-8');
    expect(source).not.toMatch(/wheelSuspension|suspension/i);
  });

  it('integrateTruckMotion has no suspension/travel-shaped parameter in its signature', () => {
    const source = readSource('driving/truck-motion.ts');
    const signatureMatch = source.match(/export function integrateTruckMotion\(([\s\S]*?)\):/);
    expect(signatureMatch).not.toBeNull();
    const signature = signatureMatch![1];
    expect(signature).not.toMatch(/suspension/i);
  });
});
