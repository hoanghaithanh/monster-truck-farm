import { describe, expect, it } from 'vitest';
import { clampToBounds } from './boundary';
import type { TerrainBounds } from '../terrain';

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
