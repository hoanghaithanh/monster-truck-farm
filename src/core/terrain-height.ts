// Rolling hills (issue #49, ADR 0017 §Decision-1): a pure, deterministic,
// closed-form height field -- no `three`, no Rapier, no data files, no RNG,
// per ADR 0001 §4's core/ purity boundary. `terrainHeightAt` is the single
// authoritative hill surface: it is sampled both by render/scene.ts (to
// displace the ground mesh's vertices) and by core/driving/obstacle-climb.ts
// (to lift/tilt the truck rig's four wheel corners), so the rendered hills
// and the truck's climb response are guaranteed to agree -- there is
// structurally no way for the truck to float above or sink into a hill it's
// driving over, short of forking this function (ADR 0017 §Decision-1,
// §Consequences).
//
// AC8 (hard safety constraint): this module is never imported by
// core/driving/truck-motion.ts, core/driving/boundary.ts, or
// physics/world.ts -- terrain height feeds only the render-rig transform and
// dynamic-entity render Y (see obstacle-climb.ts and render/scene.ts). The
// truck's real position/velocity math stays purely 2D and has no Y axis at
// all, so there is nothing here for it to read even by mistake.
import { RIVER_ROUTE, RIVER_WIDTH, STUB_OBSTACLES, STUB_STRUCTURES, TRUCK_START } from './terrain';
import type { Vec2 } from './types';

export interface HillConfig {
  /** Amplitude (world units) of the first, broader sine term. */
  amplitude1: number;
  /** Wavelength (world units) of the first sine term. */
  wavelength1: number;
  /** Amplitude of the second, finer sine term. */
  amplitude2: number;
  /** Wavelength of the second sine term (x-axis). */
  wavelength2: number;
  /** Phase offset (radians) of the second sine term, so its ridge lines don't align with the first term's. */
  phase2: number;
  /**
   * Extra radius (world units) added beyond an object's own footprint/radius
   * before the hill field is fully damped to 0 (the flatten mask's inner
   * ring) -- keeps a comfortable flat apron around every piece of existing
   * content, not just its exact footprint edge.
   */
  flattenMargin: number;
  /**
   * Width (world units) of the smooth transition ring outside
   * `flattenMargin`: height is exactly 0 at the inner edge, full field
   * strength at inner + flattenBlend. C1-smooth (cubic smoothstep), so there
   * is no visible seam where flattened ground meets rolling terrain.
   */
  flattenBlend: number;
}

// Starting defaults recommended by ADR 0017 §Decision-1/§Open questions Q5:
// peak height ~1.0-1.5 units (an order of magnitude below the mountain
// landmark's ~16.3-unit rendered height, satisfying AC6), wavelengths
// ~18-35 units (broad, gentle -- "golf-course-like", not choppy). Peak
// magnitude of the sum below is amplitude1 + amplitude2 = 1.4, inside that
// range; see terrain-height.test.ts's bounded-field assertion.
export const DEFAULT_HILL_CONFIG: HillConfig = {
  amplitude1: 0.9,
  wavelength1: 22,
  amplitude2: 0.5,
  wavelength2: 31,
  phase2: 1.3,
  flattenMargin: 2,
  flattenBlend: 3,
};

/**
 * The raw (unflattened) sum-of-sines surface -- C1-smooth everywhere (each
 * term is a product of smooth sin/cos), bounded within
 * [-(amplitude1+amplitude2), +(amplitude1+amplitude2)]. The second term uses
 * a slightly different z-wavelength than its own x-wavelength (`* 1.15`) and
 * a phase offset so its ridge lines don't simply align with the first term's
 * -- avoids a repetitive, obviously-gridded look across the full 100x100 map.
 */
function rawHeight(x: number, z: number, config: HillConfig): number {
  const { amplitude1, wavelength1, amplitude2, wavelength2, phase2 } = config;
  return (
    amplitude1 * Math.sin(x / wavelength1) * Math.cos(z / wavelength1) +
    amplitude2 * Math.sin(x / wavelength2 + phase2) * Math.cos(z / (wavelength2 * 1.15))
  );
}

/** Cubic (C1-smooth) ease: 0 at/within `innerRadius`, 1 at/beyond `outerRadius`. */
function ringFactor(dist: number, innerRadius: number, outerRadius: number): number {
  if (dist <= innerRadius) return 0;
  if (dist >= outerRadius) return 1;
  const t = (dist - innerRadius) / (outerRadius - innerRadius);
  return t * t * (3 - 2 * t);
}

function distanceTo(p: Vec2, x: number, z: number): number {
  return Math.hypot(p.x - x, p.z - z);
}

/**
 * The flatten radius to use for a structure's keep-clear zone (issue #59
 * fix). `structure.footprintRadius` (per its doc comment in `core/terrain.ts`)
 * is half the structure's longest horizontal (X or Z) extent -- the same
 * number `render/scene.ts`'s `buildStructureDisplayModel` anchors its scale
 * to (`targetWidth = footprintRadius * 2`) -- not a circumscribing/diagonal
 * radius. A structure whose visual footprint is roughly as wide as it is
 * deep (barn, farmhouse, the conical mountain) can have visual corners up to
 * `footprintRadius * sqrt(2)` away from its center, which the old
 * `footprintRadius + flattenMargin` inner radius (sized for small,
 * effectively point-like obstacles like a bush or rock) didn't cover --
 * producing a visible dip/hole right at a structure's corners once the
 * flattened apron ran out before the building's own edge did. Using the
 * diagonal upper bound here instead sizes the flatten zone off the
 * structure's actual footprint rather than reusing the small-obstacle
 * radius as-is.
 */
function structureFlattenRadius(footprintRadius: number): number {
  return footprintRadius * Math.SQRT2;
}

/** Shortest distance from `p` to the line segment `a`-`b`. */
function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq < 1e-9) return distanceTo(p, a.x, a.z);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / lengthSq));
  return distanceTo(p, a.x + t * abx, a.z + t * abz);
}

/**
 * Damps the raw hill field to exactly 0 within a keep-clear radius of every
 * existing obstacle, every existing structure, the river route, and the
 * truck start coordinate (ADR 0017 §Decision-4) -- so none of that
 * hand-placed content needs repositioning: it stays flat at y=0, its
 * colliders (all flat, y=0) stay visually aligned, and (per the ADR's
 * cross-reference to ADR 0014) the corner-height sum under every obstacle
 * collapses back to the pure obstacle hump `DEFAULT_CLIMB_CONFIG` was tuned
 * against, so this feature cannot perturb that existing tuning.
 *
 * Implemented as a product of independent smoothstep rings, one per
 * keep-clear zone: the mask is 0 (fully flat) the instant `p` is within any
 * single zone's inner radius, and blends back to 1 (full hill strength) once
 * clear of every zone. Each ring is itself C1-smooth, and a product of
 * smooth [0,1] functions is smooth, so the overall mask never introduces a
 * visible seam.
 */
function flattenMask(p: Vec2, config: HillConfig): number {
  let mask = 1;

  for (const obstacle of STUB_OBSTACLES) {
    const dist = distanceTo(p, obstacle.position.x, obstacle.position.z);
    const inner = obstacle.radius + config.flattenMargin;
    mask *= ringFactor(dist, inner, inner + config.flattenBlend);
    if (mask === 0) return 0;
  }

  for (const structure of STUB_STRUCTURES) {
    const dist = distanceTo(p, structure.position.x, structure.position.z);
    const inner = structureFlattenRadius(structure.footprintRadius) + config.flattenMargin;
    mask *= ringFactor(dist, inner, inner + config.flattenBlend);
    if (mask === 0) return 0;
  }

  if (RIVER_ROUTE.length >= 2) {
    let riverDist = Infinity;
    for (let i = 0; i < RIVER_ROUTE.length - 1; i++) {
      riverDist = Math.min(riverDist, segmentDistance(p, RIVER_ROUTE[i], RIVER_ROUTE[i + 1]));
    }
    const inner = RIVER_WIDTH / 2 + config.flattenMargin;
    mask *= ringFactor(riverDist, inner, inner + config.flattenBlend);
    if (mask === 0) return 0;
  }

  // Truck start has no radius of its own (it's a point, not an
  // obstacle/structure) -- 1.5 is a small hand-picked apron, enough that the
  // truck never spawns visibly mid-slope.
  const truckStartDist = distanceTo(p, TRUCK_START.x, TRUCK_START.z);
  const truckStartInner = config.flattenMargin + 1.5;
  mask *= ringFactor(truckStartDist, truckStartInner, truckStartInner + config.flattenBlend);

  return mask;
}

/**
 * The authoritative hill height at world position `p` -- see this module's
 * header comment for why it is safe (and required) to sample this from both
 * the render layer and the obstacle-climb sampler. Pure and stateless: same
 * input always produces the same output, no time/frame dependence.
 */
export function terrainHeightAt(p: Vec2, config: HillConfig = DEFAULT_HILL_CONFIG): number {
  return flattenMask(p, config) * rawHeight(p.x, p.z, config);
}
