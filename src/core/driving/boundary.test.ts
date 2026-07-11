import { describe, expect, it } from 'vitest';
import { clampCameraToBounds, clampToBounds } from './boundary';
import { TERRAIN_BOUNDS, type TerrainBounds } from '../terrain';

// Soft boundary (drive AC4): truck is kept within the playable area, never off into the void.
const bounds: TerrainBounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };

describe('clampToBounds', () => {
  it('leaves a position already inside the bounds unchanged', () => {
    expect(clampToBounds({ x: 0, z: 0 }, bounds)).toEqual({ x: 0, z: 0 });
    expect(clampToBounds({ x: 19, z: -19 }, bounds)).toEqual({ x: 19, z: -19 });
  });

  it('clamps a position beyond maxX/maxZ back to the edge', () => {
    expect(clampToBounds({ x: 25, z: 30 }, bounds)).toEqual({ x: 20, z: 20 });
  });

  it('clamps a position beyond minX/minZ back to the edge', () => {
    expect(clampToBounds({ x: -25, z: -30 }, bounds)).toEqual({ x: -20, z: -20 });
  });

  it('clamps exactly at the boundary edge to itself (no off-by-one)', () => {
    expect(clampToBounds({ x: 20, z: -20 }, bounds)).toEqual({ x: 20, z: -20 });
  });

  it('clamps each axis independently when only one axis is out of bounds', () => {
    expect(clampToBounds({ x: 100, z: 5 }, bounds)).toEqual({ x: 20, z: 5 });
    expect(clampToBounds({ x: -3, z: -100 }, bounds)).toEqual({ x: -3, z: -20 });
  });
});

// Chase-camera fix (issue #17): camera position stays inset from the ground
// plane's edge, independent of the truck's own (unmargined) clamped bounds,
// so corners never expose the void background behind the ground plane.
describe('clampCameraToBounds', () => {
  it('leaves a camera position well inside the margin unchanged', () => {
    expect(clampCameraToBounds({ x: 0, z: 0 }, bounds, 3)).toEqual({ x: 0, z: 0 });
  });

  it('pulls a corner-offset camera position back in by the margin on both axes', () => {
    // Simulates the reported repro: truck near (20, 20) with a diagonal
    // heading pushes the naive camera offset past the ground plane corner.
    expect(clampCameraToBounds({ x: 24, z: 24 }, bounds, 3)).toEqual({ x: 17, z: 17 });
  });

  it('pulls a negative-corner camera position back in by the margin', () => {
    expect(clampCameraToBounds({ x: -24, z: -24 }, bounds, 3)).toEqual({ x: -17, z: -17 });
  });

  it('clamps each axis independently when only one axis exceeds the margin', () => {
    expect(clampCameraToBounds({ x: 25, z: 0 }, bounds, 3)).toEqual({ x: 17, z: 0 });
  });
});

// Terrain expansion (issue #49, ADR 0017 §Decision-4, AC2): the soft
// boundary is pure min/max on X/Z, so behavior at the real, expanded
// TERRAIN_BOUNDS (-50..50) is identical in shape to the -20..20 fixture
// above -- confirmed directly against the actual constant, not just a local
// test fixture, so a future change to TERRAIN_BOUNDS is caught here too.
describe('clampToBounds at the expanded TERRAIN_BOUNDS (issue #49, AC2)', () => {
  it('leaves a position well inside the new bounds unchanged', () => {
    expect(clampToBounds({ x: 0, z: 0 }, TERRAIN_BOUNDS)).toEqual({ x: 0, z: 0 });
    expect(clampToBounds({ x: 49, z: -49 }, TERRAIN_BOUNDS)).toEqual({ x: 49, z: -49 });
  });

  it('clamps a position beyond the new edge back to it, never leaving the truck stuck or in a void', () => {
    expect(clampToBounds({ x: 500, z: -500 }, TERRAIN_BOUNDS)).toEqual({ x: 50, z: -50 });
  });

  it('clamps exactly at the new boundary edge to itself (no off-by-one at the larger extent)', () => {
    expect(clampToBounds({ x: 50, z: -50 }, TERRAIN_BOUNDS)).toEqual({ x: 50, z: -50 });
  });
});
