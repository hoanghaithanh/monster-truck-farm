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
//
// Issue #54 amendment (2026-07-12, ADR 0019 §A2): extended with a
// zone-gated "dramatic relief" term (`dramaticField`/`dramaticZoneFactor`
// below) for cliff/canyon terrain in a few authored peripheral pockets --
// still the exact same pure, three/Rapier-free, render+climb-shared
// function, AC8 above unchanged and unaffected.
import { DRAMATIC_ZONES, RIVER_ROUTE, RIVER_WIDTH, STUB_FENCES, STUB_OBSTACLES, STUB_STRUCTURES, TRUCK_START } from './terrain';
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

// Dramatic terrain relief (issue #54 amendment, ADR 0019 §A2): a second,
// larger-amplitude/longer-wavelength sum-of-sines, gated to the small
// authored `DRAMATIC_ZONES` set (core/terrain.ts) so drama is confined to
// otherwise-empty peripheral map pockets instead of a global steepness bump
// that would ruin the deliberately gentle, "golf-course-like" drivable core
// (ADR 0017 §Decision-1). Still a closed-form C1-smooth sum of sin/cos --
// no vertical discontinuity, so a dramatic zone reads as a big, steep-but-
// continuous mesa/ridge the truck climbs exactly like a gentle hill, never a
// teleport-like wall.
export interface DramaticFieldConfig {
  /** Amplitude (world units) of the dramatic term -- gives height/drama. */
  amplitude: number;
  /** Wavelength (world units) of the dramatic term -- kept long relative to amplitude so the per-wheelbase gradient stays a comfortable climb (ADR 0019 §A2 "steepness vs. height"). */
  wavelength: number;
  /** Phase offset so the dramatic term's ridge lines don't align with the gentle field's. */
  phase: number;
}

// Retuned 2026-07-12 (Sprint 6 acceptance defect, ADR 0019 §A2 amendment):
// the original amplitude 6 / wavelength 32 was picked assuming
// `Math.sin(x / wavelength)`'s spatial period is ~`wavelength` world units --
// it's actually `2*PI*wavelength` (~201 units for wavelength 32), roughly
// double the entire 100x100 map's diagonal. The sole authored DRAMATIC_ZONES
// entry (outerRadius 22, a 44-unit footprint) only ever covered ~22% of one
// period, i.e. a nearly-flat, barely-bending stretch of the curve --
// confirmed dead-on-arrival by the sprint-6 acceptance pass's brute-force
// grid search (max local gradient ~23 degrees, max height range ~4.3 units
// across the whole zone -- see docs/acceptance/sprint-6-issue54-farmstead-
// redesign-2026-07-12.md).
//
// This is a genuine *retune*, not just an algebraic correction that
// preserves the originally-intended ~32-unit period (that would only
// reproduce the same "kept long to protect the per-wheelbase gradient"
// caution the original comment already (mis)applied, with no dramatic
// visual payoff). Amplitude 7 / wavelength 8 was chosen by grid-searching
// height-range/steepness/per-wheelbase-smoothness together (see this
// module's PR/commit notes) against the truck's actual four-corner
// footprint (~1.8-unit wheelbase, TRUCK_SCALE-scaled, obstacle-climb.ts):
// - True spatial period is 2*PI*8 =~ 50 units -- about 1.1 cycles across the
//   zone's 44-unit footprint, so the zone reads as multiple real
//   ridges/valleys, not one imperceptible bend.
// - Peak-to-trough height range across the zone is ~10.75 units (vs. the
//   broken tuning's ~4.3, and nearly 8x the gentle field's own 1.4-unit
//   peak amplitude) -- unambiguously dramatic against the "golf course"
//   baseline.
// - Max local gradient is ~39 degrees (vs. the broken tuning's ~23) -- a
//   genuinely steep slope, while max height delta across one truck
//   wheelbase (~1.8 units) is ~1.44 units, only pegging
//   DEFAULT_CLIMB_CONFIG's maxPitch=0.45rad anti-chaos clamp in ~9% of the
//   zone's footprint (not chronically maxed-out) -- reads as a big,
//   steep-but-continuous hill climb, not a lurch/stutter. Still the exact
//   same C1-smooth sum-of-sines shape, so there is no vertical
//   discontinuity at any wavelength/amplitude choice -- only the
//   steepness/height changes.
export const DEFAULT_DRAMATIC_FIELD_CONFIG: DramaticFieldConfig = {
  amplitude: 7,
  wavelength: 8,
  phase: 0.9,
};

/** The raw dramatic-relief term, same C1-smooth sum-of-sines shape as `rawHeight` but its own amplitude/wavelength/phase -- sampled independently so it can be gated on/off by `dramaticZoneFactor` without disturbing the gentle field. */
function dramaticField(x: number, z: number, config: DramaticFieldConfig): number {
  const { amplitude, wavelength, phase } = config;
  return amplitude * Math.sin(x / wavelength + phase) * Math.cos(z / (wavelength * 1.1));
}

/**
 * The dramatic-zone gate: 1 (full drama) at/inside a zone's `innerRadius`,
 * smoothly easing to 0 (pure gentle field) by `outerRadius` -- the exact
 * inverse ramp direction of `ringFactor` (which goes 0->1 with *increasing*
 * distance), reused here rather than duplicated since it's the same cubic
 * smoothstep shape run backwards. Takes the max across zones so overlapping
 * zones (none authored today, but a future addition) combine sensibly
 * instead of multiplying toward an unintended near-zero.
 */
function dramaticZoneFactor(p: Vec2): number {
  let factor = 0;
  for (const zone of DRAMATIC_ZONES) {
    const dist = distanceTo(p, zone.center.x, zone.center.z);
    const zoneFactor = 1 - ringFactor(dist, zone.innerRadius, zone.outerRadius);
    if (zoneFactor > factor) factor = zoneFactor;
  }
  return factor;
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

  // Fences (issue #54, ADR 0019): same flatten treatment as structures --
  // both the render mesh (render/scene.ts) and the physics collider
  // (physics/world.ts's createFenceColliders) place a fence at a fixed
  // y=0/0.5 with no hill-height offset, so without this a fence on sloped
  // ground would visibly float/sink against the surrounding rolling
  // terrain, exactly the defect this flatten mask exists to prevent for
  // every other piece of hand-placed content.
  for (const fence of STUB_FENCES) {
    const dist = distanceTo(p, fence.position.x, fence.position.z);
    const inner = structureFlattenRadius(fence.footprintRadius) + config.flattenMargin;
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
export function terrainHeightAt(
  p: Vec2,
  config: HillConfig = DEFAULT_HILL_CONFIG,
  dramaticConfig: DramaticFieldConfig = DEFAULT_DRAMATIC_FIELD_CONFIG,
): number {
  // Issue #54 amendment (ADR 0019 §A2): dramaticZoneFactor(p) * dramaticField(p)
  // is *added* to the gentle field before the flatten mask is applied -- the
  // mask still damps the combined field to exactly 0 at every piece of
  // authored content (structures/fences/river/truck-start), the same
  // defence-in-depth argument the ADR makes for why dramatic zones (authored
  // away from content) can never reopen the corner-flatten guarantee
  // obstacle-climb.ts's tuning depends on.
  return (
    flattenMask(p, config) *
    (rawHeight(p.x, p.z, config) + dramaticZoneFactor(p) * dramaticField(p.x, p.z, dramaticConfig))
  );
}
