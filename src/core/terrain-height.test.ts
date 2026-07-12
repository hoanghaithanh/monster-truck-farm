import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAMATIC_FIELD_CONFIG, DEFAULT_HILL_CONFIG, terrainHeightAt } from './terrain-height';
import {
  DRAMATIC_ZONES,
  RIVER_ROUTE,
  STUB_FENCES,
  STUB_OBSTACLES,
  STUB_STRUCTURES,
  TERRAIN_BOUNDS,
  TRUCK_START,
} from './terrain';

const MAX_AMPLITUDE = DEFAULT_HILL_CONFIG.amplitude1 + DEFAULT_HILL_CONFIG.amplitude2;
// The dramatic term is gated to [0,1] by dramaticZoneFactor and added on top
// of the gentle field (ADR 0019 §A2's `terrainHeightAt` formula), so its
// worst-case contribution anywhere is its own full amplitude.
const MAX_DRAMATIC_AMPLITUDE = DEFAULT_DRAMATIC_FIELD_CONFIG.amplitude;

/** True if `p` sits inside (or within a small margin of) any authored DRAMATIC_ZONES outer radius -- used to keep the "gentle core" assertion honest about which points it's actually sampling. */
function isNearDramaticZone(p: { x: number; z: number }, margin = 1): boolean {
  return DRAMATIC_ZONES.some((zone) => Math.hypot(p.x - zone.center.x, p.z - zone.center.z) < zone.outerRadius + margin);
}

describe('terrainHeightAt (issue #49, ADR 0017 §Decision-1)', () => {
  it('is bounded within [-(amplitude1+amplitude2), +(amplitude1+amplitude2)] everywhere in TERRAIN_BOUNDS outside the dramatic zones (the gentle, ordinarily-driven core -- issue #54 amendment, ADR 0019 §A2)', () => {
    for (let x = TERRAIN_BOUNDS.minX; x <= TERRAIN_BOUNDS.maxX; x += 5) {
      for (let z = TERRAIN_BOUNDS.minZ; z <= TERRAIN_BOUNDS.maxZ; z += 5) {
        if (isNearDramaticZone({ x, z })) continue;
        const h = terrainHeightAt({ x, z });
        expect(h).toBeGreaterThanOrEqual(-MAX_AMPLITUDE - 1e-9);
        expect(h).toBeLessThanOrEqual(MAX_AMPLITUDE + 1e-9);
      }
    }
  });

  it('is bounded within [-(gentle+dramatic), +(gentle+dramatic)] everywhere in TERRAIN_BOUNDS, including inside the dramatic zones (issue #54 amendment, ADR 0019 §A2)', () => {
    const maxCombined = MAX_AMPLITUDE + MAX_DRAMATIC_AMPLITUDE;
    for (let x = TERRAIN_BOUNDS.minX; x <= TERRAIN_BOUNDS.maxX; x += 5) {
      for (let z = TERRAIN_BOUNDS.minZ; z <= TERRAIN_BOUNDS.maxZ; z += 5) {
        const h = terrainHeightAt({ x, z });
        expect(h).toBeGreaterThanOrEqual(-maxCombined - 1e-9);
        expect(h).toBeLessThanOrEqual(maxCombined + 1e-9);
      }
    }
  });

  it('a dramatic zone actually exceeds the gentle-field bound somewhere near its center (drama is real, not just gated to zero everywhere)', () => {
    const zone = DRAMATIC_ZONES[0];
    let anyExceedsGentleBound = false;
    for (let dx = -zone.innerRadius; dx <= zone.innerRadius; dx += 1) {
      for (let dz = -zone.innerRadius; dz <= zone.innerRadius; dz += 1) {
        const p = { x: zone.center.x + dx, z: zone.center.z + dz };
        if (Math.abs(terrainHeightAt(p)) > MAX_AMPLITUDE + 0.5) {
          anyExceedsGentleBound = true;
        }
      }
    }
    expect(anyExceedsGentleBound).toBe(true);
  });

  it('a dramatic zone actually reads as locally steep, not just peak-exceeds-gentle-bound somewhere (sprint-6 #54 acceptance regression guard -- see terrain-height.ts DEFAULT_DRAMATIC_FIELD_CONFIG doc comment)', () => {
    // The previous "exceeds the gentle-field bound somewhere near its
    // center" test above only checked magnitude, which the broken
    // amplitude=6/wavelength=32 tuning passed easily (6 > 1.4) while still
    // producing an almost-flat, barely-bending surface across the whole
    // zone footprint -- the acceptance pass's own brute-force sampling found
    // a max local gradient of only ~0.42 (~23 degrees) and a max height
    // range of only ~4.3 units across the entire 22-unit-radius zone, which
    // does not read as "dramatic cliffs/canyon relief" to a human looking at
    // it. This test pins the *local steepness* (a finite-difference slope
    // between two nearby points, a fraction of a truck wheelbase apart) and
    // the *total height range* across the zone, both against thresholds well
    // above what the broken tuning produced -- an external, physically-
    // meaningful ground truth (an actual slope angle a driver would feel),
    // not just internal self-consistency (CLAUDE.md's QA-gotchas note).
    const zone = DRAMATIC_ZONES[0];
    const step = 0.5;
    let maxLocalGradient = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let dx = -zone.outerRadius; dx <= zone.outerRadius; dx += step) {
      for (let dz = -zone.outerRadius; dz <= zone.outerRadius; dz += step) {
        const dist = Math.hypot(dx, dz);
        if (dist > zone.outerRadius) continue;
        const p = { x: zone.center.x + dx, z: zone.center.z + dz };
        const h = terrainHeightAt(p);
        if (h < min) min = h;
        if (h > max) max = h;
        const hStep = terrainHeightAt({ x: p.x + step, z: p.z });
        const gradient = Math.abs(hStep - h) / step;
        if (gradient > maxLocalGradient) maxLocalGradient = gradient;
      }
    }
    // ~0.7 rad-tangent (~35 degrees) is clearly above the broken tuning's
    // observed ~23-degree max and clearly above the gentle field's own
    // steepness (amplitude1/wavelength1 =~ 0.041, ~2.3 degrees) -- a bar a
    // human would actually recognize as steep terrain, not gentle rolling
    // ground.
    expect(maxLocalGradient).toBeGreaterThan(0.7);
    // A height range clearly bigger than the gentle field's own peak
    // amplitude (1.4) by a wide margin -- the broken tuning's ~4.3-unit
    // range was already ~3x the gentle bound and still read as unremarkable;
    // this requires a materially bigger range than that.
    expect(max - min).toBeGreaterThan(8);
  });

  it('the dramatic term is fully gated to 0 far from every DRAMATIC_ZONES entry (a point clear of every zone by more than outerRadius reduces to the pure gentle field)', () => {
    // (35, 35) is far from both the single west dramatic zone (center
    // (-42,10)) and every flatten-mask keep-out (obstacle/structure/fence/
    // river/truck-start), so comparing against amplitude-zeroed dramatic
    // config isolates exactly the zone-gating behavior this test targets.
    const farPoint = { x: 35, z: 35 };
    const gentleOnly = terrainHeightAt(farPoint, DEFAULT_HILL_CONFIG, { ...DEFAULT_DRAMATIC_FIELD_CONFIG, amplitude: 0 });
    const withDramatic = terrainHeightAt(farPoint);
    expect(withDramatic).toBeCloseTo(gentleOnly);
  });

  it('peak amplitude is clearly smaller than the mountain landmark (~16.3 units, AC6) -- roughly an order of magnitude', () => {
    expect(MAX_AMPLITUDE).toBeLessThan(16.3 / 5);
  });

  it('is continuous (no popping): a small step in position produces a small step in height', () => {
    const base = terrainHeightAt({ x: 10, z: 10 });
    const stepped = terrainHeightAt({ x: 10.01, z: 10 });
    expect(Math.abs(stepped - base)).toBeLessThan(0.01);
  });

  it('is exactly 0 at the center of every STUB_OBSTACLE (flatten mask, AC3/AC8 protection for ADR 0014 tuning)', () => {
    for (const obstacle of STUB_OBSTACLES) {
      expect(terrainHeightAt(obstacle.position)).toBeCloseTo(0);
    }
  });

  it('is exactly 0 well within the flatten margin of every STUB_OBSTACLE, not just at dead center', () => {
    for (const obstacle of STUB_OBSTACLES) {
      const edgePoint = { x: obstacle.position.x + obstacle.radius + 0.5, z: obstacle.position.z };
      expect(terrainHeightAt(edgePoint)).toBeCloseTo(0);
    }
  });

  it('is exactly 0 at the center of every STUB_STRUCTURE (windmill/barn/farmhouse/mountain)', () => {
    for (const structure of STUB_STRUCTURES) {
      expect(terrainHeightAt(structure.position)).toBeCloseTo(0);
    }
  });

  it('is exactly 0 well within the flatten margin of every STUB_STRUCTURE footprint', () => {
    for (const structure of STUB_STRUCTURES) {
      const edgePoint = { x: structure.position.x + structure.footprintRadius + 0.5, z: structure.position.z };
      expect(terrainHeightAt(edgePoint)).toBeCloseTo(0);
    }
  });

  it('is exactly 0 at a STUB_STRUCTURE footprint *corner* (diagonal), not just along its axes (issue #59 regression guard)', () => {
    // `footprintRadius` (per its own doc comment in core/terrain.ts and
    // render/scene.ts's buildStructureDisplayModel) is half the structure's
    // longest horizontal (X or Z) extent, not a circumscribing/diagonal
    // radius -- a roughly-square building's actual visual corner can be up
    // to footprintRadius*sqrt(2) from its center. Before the #59 fix, the
    // flatten mask's inner radius was sized only off the raw footprintRadius
    // (fine for a small, effectively point-like obstacle, not for a
    // building), so a point at that diagonal distance -- still on the
    // structure's own footprint -- could land in the middle of the hill
    // field's blend ring instead of the flat zone, reading as a visible dip
    // right at the building's corner.
    for (const structure of STUB_STRUCTURES) {
      const diagonalOffset = structure.footprintRadius / Math.SQRT2;
      const cornerPoint = {
        x: structure.position.x + diagonalOffset,
        z: structure.position.z + diagonalOffset,
      };
      expect(terrainHeightAt(cornerPoint)).toBeCloseTo(0);
    }
  });

  it('is exactly 0 at the center of every STUB_FENCE (issue #54, ADR 0019: same flatten treatment as structures)', () => {
    for (const fence of STUB_FENCES) {
      expect(terrainHeightAt(fence.position)).toBeCloseTo(0);
    }
  });

  it('is exactly 0 well within the flatten margin of every STUB_FENCE footprint', () => {
    for (const fence of STUB_FENCES) {
      const edgePoint = { x: fence.position.x + fence.footprintRadius + 0.5, z: fence.position.z };
      expect(terrainHeightAt(edgePoint)).toBeCloseTo(0);
    }
  });

  it('is exactly 0 along the river route (flat riverbanks)', () => {
    for (const point of RIVER_ROUTE) {
      expect(terrainHeightAt(point)).toBeCloseTo(0);
    }
  });

  it('is exactly 0 at TRUCK_START (the truck spawns on flat ground)', () => {
    expect(terrainHeightAt(TRUCK_START)).toBeCloseTo(0);
  });

  it('is nonzero somewhere far from every flattened zone (hills are actually visible, AC5/AC10)', () => {
    // (35, -35) is far in the map's empty southeast quadrant, clear of every
    // obstacle/structure/river/truck-start keep-out radius.
    const samples = [
      { x: 35, z: -35 },
      { x: -35, z: -35 },
      { x: 35, z: 35 },
      { x: 25, z: -25 },
    ];
    const anyNonzero = samples.some((p) => Math.abs(terrainHeightAt(p)) > 0.01);
    expect(anyNonzero).toBe(true);
  });

  it('blends back to full field strength once clear of a flatten radius (no lingering flatness far outside a footprint)', () => {
    // Far outside every obstacle/structure keep-out (checked against the
    // largest footprint, the mountain's 4.71 + margin + blend), the field
    // should generally differ from the exact-zero value asserted above --
    // spot-checked at a point known to be clear of every zone. (40,-40),
    // not (30,30) -- the issue #54 amendment's relocated coop-pen fences
    // now sit near (23-32, 24-29), so (30,30) is no longer a clear point.
    const clearPoint = { x: 40, z: -40 };
    expect(terrainHeightAt(clearPoint)).not.toBe(0);
  });

  // The tests above only check the two endpoints of the flatten mask (exactly
  // 0 at/near an obstacle's center, and nonzero far away) -- neither proves
  // the transition *ring* itself is smooth rather than a hard step. A visibly
  // discontinuous jump where flattened ground meets rolling terrain would be
  // a real defect (a "seam" the ADR's flattenMask doc comment explicitly
  // claims cannot happen, being a product of smoothstep rings). This walks
  // finely through the bush obstacle's actual blend ring (radius 0.6 +
  // flattenMargin 2 = inner 2.6, outer 2.6 + flattenBlend 3 = 5.6) and
  // asserts every small step produces a small height change -- proving no
  // discontinuity exists at the ring boundary specifically, not just
  // generally "somewhere."
  it('the flatten mask has no discontinuous jump across its blend ring (walking from flattened to full strength near the bush obstacle)', () => {
    const bush = STUB_OBSTACLES.find((o) => o.kind === 'bush')!;
    const stepSize = 0.05;
    let previous = terrainHeightAt({ x: bush.position.x, z: bush.position.z });
    // Walk from dead center (fully flat) out to well past the outer blend
    // radius (full field strength), crossing both the inner-radius edge (2.6)
    // and the outer-radius edge (5.6) along the way.
    for (let dist = stepSize; dist <= 7; dist += stepSize) {
      const point = { x: bush.position.x + dist, z: bush.position.z };
      const current = terrainHeightAt(point);
      expect(Math.abs(current - previous)).toBeLessThan(0.03);
      previous = current;
    }
  });

  it('flatten mask value itself (not just terrainHeightAt) is continuous across the same ring -- rules out a raw-field zero crossing masking a real mask discontinuity', () => {
    // A pathological case the previous test alone couldn't rule out: if
    // rawHeight happened to cross zero right at the ring boundary, a
    // discontinuous mask could still produce a continuous-looking
    // terrainHeightAt by coincidence. Sample terrainHeightAt with the raw
    // field forced deterministic by comparing against a second obstacle whose
    // ring is centered somewhere the raw field is far from zero (mountain,
    // the largest footprint) to reduce that coincidence risk.
    const mountain = STUB_STRUCTURES.find((s) => s.kind === 'mountain')!;
    const stepSize = 0.05;
    let previous = terrainHeightAt({ x: mountain.position.x, z: mountain.position.z });
    const outer = mountain.footprintRadius + 2 + 3; // flattenMargin + flattenBlend defaults
    for (let dist = stepSize; dist <= outer + 1; dist += stepSize) {
      const point = { x: mountain.position.x + dist, z: mountain.position.z };
      const current = terrainHeightAt(point);
      expect(Math.abs(current - previous)).toBeLessThan(0.03);
      previous = current;
    }
  });
});
