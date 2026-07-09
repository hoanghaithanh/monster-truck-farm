// Per-body-tier socket offset table (ADR 0011 §4): where the wheel/engine/
// gas-tank/design-decal attachment points sit in body-local space, since the
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
//    truck-bump-flash box is 1.6x1.2x2.6). `bodyScale` below is the
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
// Engine/gas-tank/design sockets are placed fractionally against each body's
// final (post-bodyScale) bounding box -- front/top for the engine cue,
// low/rear/side for the gas-tank cue, roof-centerline for the design decal --
// the same fractional layout the old hand-authored table used, since the
// real body models don't expose named attachment points either.
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
// real built-in-node anchors (same "sample actual mesh data" technique as
// the `design` socket fix below) rather than just the front -- code review
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
//
// Sourced-art-fixes pass (issue #33 follow-up, 2026-07-09, see
// docs/qa/screenshots/adr-0011-sourced-art-fixes/): the *first* sourced-art
// pass's `design` socket Y was wrong -- it used each body mesh's *global*
// bounding-box top (`rawMaxY`), which on these models is a thin roll-bar/
// antenna strut poking well above the actual cab roof deck, with a real gap
// (no geometry at all) between the roof and the strut tip. Placing the
// decal at that Y put it floating in that empty gap -- the "flame accent
// reads as a bare arrow detached above the roof" / "racing stripe invisible"
// defects (the stripe is a thin 0.02-unit box, easy to lose entirely against
// the sky at the wrong height). Fixed by sampling each body's actual mesh
// vertices (not just min/max) binned by Y, and using the top of the last
// bin that still has solid, wide (not strut-thin) cross-section -- empirically
// ~66.6% up each tier's raw [minY, maxY] mesh span, which lands on the real
// roof deck below the strut/roll-bar gap for all 3 tiers (re-confirmed live,
// see the fixes screenshots) instead of the old ~100-103% (above everything,
// including the strut).
import * as THREE from 'three';

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
  /** Body paint-design decal attach point (ADR 0011 §2's shared-palette decal, e.g. a racing stripe). */
  design: THREE.Vector3;
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
  design: [number, number, number],
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
    design: new THREE.Vector3(...design),
  };
}

/**
 * Body-tier index (0/1/2) -> its socket table. Re-authored (2026-07-09) for
 * the sourced body/wheel models -- see module header for how `bodyScale`/
 * `wheelScale` and every position number were derived. `body`'s Y is
 * `WHEEL_RADIUS_BY_TIER[tier] - (bodyScale * that tier's raw underside Y)`,
 * i.e. the same "underside rests at wheel-center height" rule the old table
 * used, just solved against the sourced models' actual (scaled) geometry
 * instead of a hand-authored box.
 */
export const BODY_TIER_SOCKETS: Record<number, TruckSockets> = {
  0: sockets(0.1001, 0.3475, 0.5557, 0.28, 0.5207, 0.558, -0.558, [0, 0.6851, 0.648], [0.3615, 0.4089, -0.612], [0, 0.5866, 0]),
  1: sockets(0.3111, 0.3724, 0.7134, 0.4, 0.7166, 0.6355, -0.6355, [0, 0.9743, 0.738], [0.444, 0.5827, -0.697], [0, 0.8348, 0]),
  2: sockets(0.5059, 0.4125, 0.9328, 0.58, 1.039, 0.479, -0.885, [0, 1.569, 0.828], [0.5524, 0.8947, -0.782], [0, 1.3286, 0]),
};

/** Fallback socket table for an out-of-range tier index -- never crash on an unexpected build value (ADR 0010 §7's forgiving-fallback spirit). */
export const DEFAULT_SOCKETS: TruckSockets = BODY_TIER_SOCKETS[0];

export function socketsForBodyTier(tier: number): TruckSockets {
  return BODY_TIER_SOCKETS[tier] ?? DEFAULT_SOCKETS;
}

/**
 * Ground-clearance reference per body tier -- the wheel radius baked into
 * that tier's socket table, so callers (fallback geometry, camera framing)
 * can match it without duplicating the numbers. Re-tuned (2026-07-09) for
 * the sourced wheel models -- a clear Base/Off-road/Monster progression
 * (0.28 / 0.4 / 0.58), same relative growth shape as the old
 * procedurally-authored 0.3/0.4/0.5 but re-based against the real tire
 * models' own raw radius.
 */
export const WHEEL_RADIUS_BY_TIER: Record<number, number> = { 0: 0.28, 1: 0.4, 2: 0.58 };
