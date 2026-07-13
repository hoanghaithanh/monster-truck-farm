// Per-body-tier socket offset table (ADR 0011 §4): where the wheel/engine/
// gas-tank attachment points sit in body-local space, since the
// three body models don't (and don't need to) embed named socket empties --
// the ADR explicitly sanctions "a small per-body-model offset table ...
// authored once" as the fallback when a pack doesn't provide them.
//
// Sourced-art pass (issue #33 follow-up, 2026-07-09): re-authored against
// the real sourced body/wheel models (see repo-root CREDITS.md), replacing
// the numbers hand-tuned for scripts/generate-truck-art.mjs's procedural
// boxes. Two things changed that the old table didn't need to account for:
//
// 1. **Body scale.** The sourced bodies are FBX-origin exports baked at a
//    100x node scale (see each body-tier-N.glb's glTF JSON: the "Pickup" /
//    "Pickup_Armored" / "Truck_Armored" node's own `scale` is [100,100,100],
//    plus a -90deg-about-X node rotation that's *also* already baked in --
//    both are intrinsic to the loaded asset and untouched here). Applying
//    that scale directly would render a truck ~5 world-units long (checked
//    by transforming the glTF POSITION accessor min/max through the node's
//    own rotation+scale) against this game's existing ~1.8-2.6-unit scale
//    (TRUCK_CONTACT_RADIUS=0.9 in core/driving/config.ts, scene.ts's
//    truck-bump-flash box was 1.6x1.2x2.6 -- both pre-`TRUCK_SCALE` baseline
//    numbers as of this note, since scaled by `TRUCK_SCALE` too; see
//    `TRUCK_SCALE` above for the 2026-07-11 proportional size-up, ADR
//    0018/issue #62). `bodyScale` below is the
//    *additional* corrective scale `buildTruckRig` applies on top of that
//    baked-in transform (via `bodyResult.object.scale.setScalar(...)`) so
//    each tier's final length lands at a hand-picked target (1.8/2.05/2.3 --
//    a size progression, same spirit as the old table's 1.8/2.0/2.2) instead
//    of the raw 5.18/5.51/5.58 the asset ships at. Never applied to the
//    primitive fallback body (scripts/generate-truck-art.mjs's box is
//    already authored at final scale -- see truck-rig.ts's fallbackBody()).
// 2. **Wheel scale.** The two sourced wheel models ("Vehicle Tire" for tier
//    0, "Truck Tire" for tiers 1 and 2 at different scales -- CREDITS.md's
//    disclosed "only 2 distinct tire meshes across 3 tiers" call) are
//    authored at a real-world-ish scale (~0.53-0.56 unit outer tire radius),
//    unlike the old procedural cylinders which were already sized to their
//    final tier radius. `wheelScale` is the multiplier `buildTruckRig`
//    applies (only to loaded parts, never the primitive fallback wheel,
//    same reasoning as body) to land each tier at its
//    `WHEEL_RADIUS_BY_TIER` target.
//
// Every number below was derived by transforming the glTF POSITION accessor
// min/max through the known node transform (see the script this pass used,
// not checked in -- reproducible from the glTF JSON directly: `gzip -d`
// isn't needed, .glb's JSON chunk is readable via any glTF inspector), then
// confirmed against a live render (docs/qa/screenshots/adr-0011-sourced-art/).
// Engine/gas-tank sockets are placed fractionally against each body's
// final (post-bodyScale) bounding box -- front/top for the engine cue,
// low/rear/side for the gas-tank cue -- the same fractional layout the old
// hand-authored table used, since the real body models don't expose named
// attachment points either.
//
// Tier-2 front/rear-wheel-socket fix (issue #38, 2026-07-09): the tier-2
// body ("Truck_Armored") ships its own built-in (later-removed, see
// removeBuiltinWheelNodes in truck-rig.ts) `FrontWheel_L`/`FrontWheel_R`/
// `BackWheels` nodes -- the original artist's own wheel-well placement for
// this exact mesh. Sampling those nodes' actual (post node-transform)
// vertex centroids and scaling by this tier's `bodyScale` (0.4125) puts the
// real wheel-well centers at local Z ~0.479 (front) / ~-0.885 (rear) -- but
// the old `wheelZFront`/`wheelZRear` values below (a symmetric 0.713/-0.713,
// inherited from the same "roughly centered around the body's own
// trimmed-down front/rear span" approach used for tiers 0/1) put the front
// wheel about 0.23 units further forward than the actual wheel-well opening
// on this specific body mesh, clear of any fender geometry -- the "detached
// wheel" look reported in #38, visible in the builder's oblique preview
// camera. Tiers 0/1 share a *different* (and much closer to symmetric)
// built-in wheel-well anchor, which is why only tier 2 showed the defect.
// Re-derived *both* `wheelZFront` and `wheelZRear` for tier 2 against the
// real built-in-node anchors (same "sample actual mesh data" technique used
// elsewhere in this pass) rather than just the front -- code review
// on the first pass of this fix flagged that changing only the front would
// introduce a new, unexplained front/rear asymmetry (0.479 vs the old
// 0.713) with no evidence the rear needed to stay put; since both numbers
// come from the same underlying defect (the old symmetric-guess formula),
// both should follow the same real-anchor derivation. Re-verified live in
// both the builder's oblique preview (front wheel now reads as mounted
// under the fender, matching tiers 0/1's driving-scene screenshots) and the
// driving scene's own chase camera (front+rear wheels render as two
// clearly-separated, correctly-mounted wheels per side; the old front-only
// change had pulled the wheelbase in enough to make front/rear visually
// merge into one wheel blob from this camera, which the rear correction
// also fixes).
import * as THREE from 'three';
import { TRUCK_SCALE } from '../core/driving/config';

// Global uniform truck size-up factor (ADR 0018 §1, issue #62 -- "bigger
// truck: proportional size + hitbox scale-up"), canonically owned by
// `core/driving/config.ts` (see that module for the full rationale/magnitude
// note) and re-exported here for callers that import it from this module.
// Applied to every per-tier quantity this module owns --
// `BODY_TIER_SOCKETS`' position vectors, `bodyScale`/`wheelScale`, and
// `WHEEL_RADIUS_BY_TIER` -- at export time, via `scaleSockets`/
// `scaleWheelRadii` below, rather than as a `group.scale` on the assembled
// rig. ADR 0018 §1's "why fold into data" is the deciding reason: the
// whole-body climb lift/tilt (and issue #63's future per-wheel suspension)
// are computed in *world units* against these same tables and applied to
// child nodes of the rig group -- if the group itself carried a non-unit
// scale, every such child-node offset would be magnified by `TRUCK_SCALE`
// too and need dividing back out. Keeping `group.scale = 1` and enlarging
// via data keeps world units honest.
//
// Because this is a *single* factor applied identically to all three tiers,
// the existing Tier 0 < Tier 1 < Tier 2 size progression (AC1/AC2) is
// preserved by construction -- see `truck-sockets.test.ts`'s
// ratio-preserved regression test.
export { TRUCK_SCALE };

export interface TruckSockets {
  /** Where the body model itself is placed, rig-group-local -- translated up so the body's own baked-in origin (its underside, once the node's built-in 100x scale + rotation and this table's `bodyScale` are both applied) lands with its underside resting at wheel-center height (this tier's `WHEEL_RADIUS_BY_TIER`), same convention the old procedural table used. */
  body: THREE.Vector3;
  /** Uniform corrective scale `buildTruckRig` applies to a *loaded* body model on top of its own baked-in 100x node scale (see module header §1) -- never applied to the primitive fallback body, which is already authored at final scale. */
  bodyScale: number;
  /** Front-left, front-right, rear-left, rear-right wheel-center positions, rig-group-local (ground-relative -- wheel Y is that tier's wheel radius, so the wheel bottom touches the ground plane at Y=0). */
  wheels: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  /** Uniform corrective scale `buildTruckRig` applies to a *loaded* wheel model so its real ~0.53-0.56-unit raw tire radius lands at this tier's `WHEEL_RADIUS_BY_TIER` -- never applied to the primitive fallback wheel (module header §2). */
  wheelScale: number;
  /** Hood/engine-cue attach point. */
  engine: THREE.Vector3;
  /** Gas-tank-cue attach point. */
  gasTank: THREE.Vector3;
}

function sockets(
  bodyCenterY: number,
  bodyScale: number,
  wheelX: number,
  wheelY: number,
  wheelScale: number,
  wheelZFront: number,
  wheelZRear: number,
  engine: [number, number, number],
  gasTank: [number, number, number],
): TruckSockets {
  return {
    body: new THREE.Vector3(0, bodyCenterY, 0),
    bodyScale,
    wheels: [
      new THREE.Vector3(wheelX, wheelY, wheelZFront),
      new THREE.Vector3(-wheelX, wheelY, wheelZFront),
      new THREE.Vector3(wheelX, wheelY, wheelZRear),
      new THREE.Vector3(-wheelX, wheelY, wheelZRear),
    ],
    wheelScale,
    engine: new THREE.Vector3(...engine),
    gasTank: new THREE.Vector3(...gasTank),
  };
}

/**
 * Uniformly scales one tier's socket table by `factor` (ADR 0018 §1): every
 * position vector, plus `bodyScale`/`wheelScale`, is multiplied by the same
 * number. A fresh `TruckSockets` is returned (never mutates the authored
 * table this reads from) so `RAW_BODY_TIER_SOCKETS` below stays the readable,
 * un-scaled source of truth the module header's derivation notes describe.
 */
function scaleSockets(s: TruckSockets, factor: number): TruckSockets {
  return {
    body: s.body.clone().multiplyScalar(factor),
    bodyScale: s.bodyScale * factor,
    wheels: s.wheels.map((w) => w.clone().multiplyScalar(factor)) as TruckSockets['wheels'],
    wheelScale: s.wheelScale * factor,
    engine: s.engine.clone().multiplyScalar(factor),
    gasTank: s.gasTank.clone().multiplyScalar(factor),
  };
}

// Truck-body-lift stance (ADR 0020, issue #65): a single global factor,
// proposed default 0.6 (playtest range 0.4-0.8), multiplied by *that tier's
// own* (already-`TRUCK_SCALE`-scaled) wheel radius to get an absolute,
// per-tier Y offset added to the body-mounted sockets only (body/engine/
// gasTank -- the engine and gas-tank cues are props positioned relative to
// the rig group, not parented under the body node, so they must rise by the
// same amount or they'd be left floating at the old height, detached from
// the risen body; ADR 0020 §1). Wheels are intentionally left untouched --
// that is the increased body-to-wheel daylight this feature wants (AC1).
//
// Because the lift is `factor * WHEEL_RADIUS_BY_TIER[tier]` and
// `WHEEL_RADIUS_BY_TIER` is strictly increasing across tiers (0.378 < 0.54 <
// 0.783 post-TRUCK_SCALE), the lift amplifies rather than flattens the
// existing Tier 0 < Tier 1 < Tier 2 body-height ordering (AC2 satisfied by
// construction, ADR 0020 §2) -- pinned by `truck-sockets.test.ts`'s
// post-lift ordering + constant-overlap-ratio regression tests.
//
// Live-render pass (2026-07-12, developer implementing #65, screenshots in
// docs/qa/screenshots/issue-65-body-lift/): confirmed at 0.6 all three
// tiers' fender/wheel-well silhouettes still visually cover their tire (no
// arch separating from the tire, no exposed gap) -- the ADR's proposed
// default is kept as shipped, no per-tier override needed.
export const BODY_LIFT_FACTOR = 0.6;

/**
 * Adds `BODY_LIFT_FACTOR * wheelRadius` to the body-mounted sockets
 * (`body`/`engine`/`gasTank`) of an already-`TRUCK_SCALE`-scaled
 * `TruckSockets` -- see the `BODY_LIFT_FACTOR` comment above. `wheelRadius`
 * must already be `TRUCK_SCALE`-scaled (i.e. this tier's own
 * `WHEEL_RADIUS_BY_TIER` entry) so the result stays in final world units,
 * matching `scaleSockets`'s "no double-scaling" property. Wheel sockets are
 * returned unchanged. A fresh `TruckSockets` is returned, same
 * never-mutate-the-input discipline as `scaleSockets`.
 */
function liftSockets(s: TruckSockets, wheelRadius: number): TruckSockets {
  const lift = BODY_LIFT_FACTOR * wheelRadius;
  return {
    body: s.body.clone().add(new THREE.Vector3(0, lift, 0)),
    bodyScale: s.bodyScale,
    wheels: s.wheels.map((w) => w.clone()) as TruckSockets['wheels'],
    wheelScale: s.wheelScale,
    engine: s.engine.clone().add(new THREE.Vector3(0, lift, 0)),
    gasTank: s.gasTank.clone().add(new THREE.Vector3(0, lift, 0)),
  };
}

/**
 * Body-tier index (0/1/2) -> its *authored*, un-scaled socket table.
 * Re-authored (2026-07-09) for the sourced body/wheel models -- see module
 * header for how `bodyScale`/`wheelScale` and every position number were
 * derived. `body`'s Y is `WHEEL_RADIUS_BY_TIER[tier] - (bodyScale * that
 * tier's raw underside Y)`, i.e. the same "underside rests at wheel-center
 * height" rule the old table used, just solved against the sourced models'
 * actual (scaled) geometry instead of a hand-authored box. Not exported --
 * `BODY_TIER_SOCKETS` below is the `TRUCK_SCALE`-scaled table every caller
 * should read (ADR 0018 §1, issue #62).
 */
// Gas-tank socket X fix (issue #64, 2026-07-12, direct human report --
// "stray yellow cylinder connecting left rear wheel to truck body"): the
// gas-tank cue prop (see truck-rig.ts's gasResult) is never scaled by
// bodyScale/wheelScale/TRUCK_SCALE the way the body/wheel meshes are (ADR
// 0011 §... "cosmetically minor by design ... small prop" -- it's meant to
// stay a small, fixed-size prop), but its *socket* X offset below is scaled
// by TRUCK_SCALE like every other socket position (module header §1's
// `scaleSockets`). Live-measuring both boxes (`THREE.Box3.setFromObject`, a
// temporary console.log added to truck-rig.ts for this investigation and
// removed afterward) in a running scene confirmed the old X below put the
// tank's own outer edge consistently ~0.07-0.10 world units past the body's
// own *overall* bounding-box edge on all 3 tiers -- reading as a small amber
// cylinder poking sideways out of the body into the wheel-well gap toward
// the rear-left wheel, rather than a tank mounted flush against the body's
// side. An initial pass that pulled `x` in just enough to match the body's
// overall bounding-box edge left a faint residual sliver on tiers 1/2 (the
// body narrows locally near the rear relative to its widest point elsewhere,
// e.g. the front fenders, so "inside the overall bbox" wasn't the same as
// "inside the local cross-section at the tank's own Z") -- each `gasTank`'s
// `x` below was pulled in by a further ~0.05 raw units on top of that first
// pass to clear that margin too. Verified live (screenshots, all 3 tiers):
// the tank now reads as mounted flush against/inside the body, no visible
// sliver poking toward the wheel.
const RAW_BODY_TIER_SOCKETS: Record<number, TruckSockets> = {
  0: sockets(0.1001, 0.3475, 0.5557, 0.28, 0.5207, 0.558, -0.558, [0, 0.6851, 0.648], [0.23, 0.4089, -0.612]),
  1: sockets(0.3111, 0.3724, 0.7134, 0.4, 0.7166, 0.6355, -0.6355, [0, 0.9743, 0.738], [0.325, 0.5827, -0.697]),
  2: sockets(0.5059, 0.4125, 0.9328, 0.58, 1.039, 0.479, -0.885, [0, 1.569, 0.828], [0.445, 0.8947, -0.782]),
};

/**
 * Ground-clearance reference per body tier -- the wheel radius baked into
 * that tier's socket table, so callers (fallback geometry, camera framing)
 * can match it without duplicating the numbers. Re-tuned (2026-07-09) for
 * the sourced wheel models -- a clear Base/Off-road/Monster progression
 * (0.28 / 0.4 / 0.58), same relative growth shape as the old
 * procedurally-authored 0.3/0.4/0.5 but re-based against the real tire
 * models' own raw radius. `RAW_WHEEL_RADIUS_BY_TIER` is the authored,
 * un-scaled source; the exported table is scaled by `TRUCK_SCALE` (ADR 0018
 * §1, issue #62), same pattern as `BODY_TIER_SOCKETS`/`RAW_BODY_TIER_SOCKETS`
 * above. Defined ahead of `BODY_TIER_SOCKETS` (2026-07-12, ADR 0020/issue
 * #65) because that table's own derivation now needs each tier's scaled
 * wheel radius to compute `BODY_LIFT_FACTOR * wheelRadius` (`liftSockets`).
 */
const RAW_WHEEL_RADIUS_BY_TIER: Record<number, number> = { 0: 0.28, 1: 0.4, 2: 0.58 };

export const WHEEL_RADIUS_BY_TIER: Record<number, number> = Object.fromEntries(
  Object.entries(RAW_WHEEL_RADIUS_BY_TIER).map(([tier, radius]) => [Number(tier), radius * TRUCK_SCALE]),
);

/**
 * Body-tier index (0/1/2) -> its `TRUCK_SCALE`-scaled AND `BODY_LIFT_FACTOR`-
 * lifted socket table (ADR 0018 §1 / issue #62, ADR 0020 / issue #65). Every
 * caller (`buildTruckRig`, `footprintForBodyTier`, camera framing, etc.)
 * reads this scaled+lifted table, not `RAW_BODY_TIER_SOCKETS` -- both
 * factors live in one place and every downstream consumer picks them up
 * automatically with zero call-site edits. `liftSockets` runs *after*
 * `scaleSockets` (ADR 0020 §1 -- lift is computed from the already-scaled
 * `WHEEL_RADIUS_BY_TIER`, so everything stays in final world units, no
 * double-scaling).
 */
export const BODY_TIER_SOCKETS: Record<number, TruckSockets> = Object.fromEntries(
  Object.entries(RAW_BODY_TIER_SOCKETS).map(([tier, raw]) => {
    const tierNumber = Number(tier);
    return [tierNumber, liftSockets(scaleSockets(raw, TRUCK_SCALE), WHEEL_RADIUS_BY_TIER[tierNumber])];
  }),
);

/** Fallback socket table for an out-of-range tier index -- never crash on an unexpected build value (ADR 0010 §7's forgiving-fallback spirit). */
export const DEFAULT_SOCKETS: TruckSockets = BODY_TIER_SOCKETS[0];

export function socketsForBodyTier(tier: number): TruckSockets {
  return BODY_TIER_SOCKETS[tier] ?? DEFAULT_SOCKETS;
}

/**
 * Plain-number wheel footprint for the obstacle-climb four-corner sampling
 * (ADR 0014, issue #42): `core/driving/obstacle-climb.ts` needs the truck's
 * wheelbase/track to sample per-wheel, but must stay `three`-free (ADR 0001
 * §4) -- this is the one place a `THREE.Vector3`-based socket gets unwrapped
 * into plain numbers for `core/` to consume. `wheels[0]`/`wheels[2]` are the
 * front-left/rear-left sockets (see `sockets()` above -- `wheelX` is
 * authored positive, i.e. +X, which per `truck-motion.ts`'s Forward x Up
 * convention is the truck's physical LEFT, not right; this comment
 * previously said "front-right/rear-right", which was stale/wrong and part
 * of what made the #63 fl/fr suspension-side sign-inversion bug easy to miss
 * in review -- it only matters for the doc's own clarity here, since
 * `footprintForBodyTier` only reads `.x`/`.z` magnitudes, not the L/R
 * label); `halfTrack` uses `Math.abs` since some tiers author `wheelX` on
 * the -X (right) side.
 */
export interface TruckFootprint {
  halfTrack: number;
  zFront: number;
  zRear: number;
}

export function footprintForBodyTier(tier: number): TruckFootprint {
  const s = socketsForBodyTier(tier);
  return { halfTrack: Math.abs(s.wheels[0].x), zFront: s.wheels[0].z, zRear: s.wheels[2].z };
}
