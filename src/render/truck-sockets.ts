// Per-body-tier socket offset table (ADR 0011 §4): where the wheel/engine/
// gas-tank/design-decal attachment points sit in body-local space, since the
// three body models don't (and don't need to) embed named socket empties --
// the ADR explicitly sanctions "a small per-body-model offset table ...
// authored once" as the fallback when a pack doesn't provide them, and these
// procedurally authored bodies (scripts/generate-truck-art.mjs) don't.
//
// Authored once, by hand, against the exact dimensions used in
// generate-truck-art.mjs's bodyTierN() functions -- keep the two in sync if
// either changes (this is the mitigation for the ADR's named "socket
// mismatch across the 3 body models" risk: a single authored table per
// tier, not a formula that could silently drift from the geometry).
import * as THREE from 'three';

export interface TruckSockets {
  /** Where the body model itself is placed, rig-group-local -- the body's own geometry is authored centered on its local origin (see scripts/generate-truck-art.mjs), so it must be translated up to rest on top of the wheels rather than half-buried at ground level. */
  body: THREE.Vector3;
  /** Front-left, front-right, rear-left, rear-right wheel-center positions, rig-group-local (ground-relative -- wheel Y is that tier's wheel radius, so the wheel bottom touches the ground plane at Y=0). */
  wheels: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  /** Hood/engine-cue attach point. */
  engine: THREE.Vector3;
  /** Gas-tank-cue attach point. */
  gasTank: THREE.Vector3;
  /** Body paint-design decal attach point (ADR 0011 §2's shared-palette decal, e.g. a racing stripe). */
  design: THREE.Vector3;
}

function sockets(
  bodyCenterY: number,
  wheelX: number,
  wheelY: number,
  wheelZFront: number,
  wheelZRear: number,
  engine: [number, number, number],
  gasTank: [number, number, number],
  design: [number, number, number],
): TruckSockets {
  return {
    body: new THREE.Vector3(0, bodyCenterY, 0),
    wheels: [
      new THREE.Vector3(wheelX, wheelY, wheelZFront),
      new THREE.Vector3(-wheelX, wheelY, wheelZFront),
      new THREE.Vector3(wheelX, wheelY, wheelZRear),
      new THREE.Vector3(-wheelX, wheelY, wheelZRear),
    ],
    engine: new THREE.Vector3(...engine),
    gasTank: new THREE.Vector3(...gasTank),
    design: new THREE.Vector3(...design),
  };
}

/**
 * Body-tier index (0/1/2) -> its socket table. Authored once, by hand,
 * against the exact dimensions used in generate-truck-art.mjs's
 * bodyTierN()/wheelTierN() functions:
 *   bodyCenterY = wheelRadius + bodyHeight/2 (body rests directly on the
 *   wheels); wheel Y = wheelRadius (wheel bottom touches the ground plane).
 */
export const BODY_TIER_SOCKETS: Record<number, TruckSockets> = {
  0: sockets(0.6, 0.6, 0.3, 0.6, -0.6, [0, 0.84, 0.495], [0.4675, 0.55, -0.54], [0, 0.92, 0]),
  1: sockets(0.75, 0.65, 0.4, 0.7, -0.7, [0, 1.03, 0.55], [0.51, 0.7, -0.6], [0, 1.12, 0]),
  2: sockets(0.925, 0.7, 0.5, 0.8, -0.8, [0, 1.265, 0.605], [0.5525, 0.875, -0.66], [0, 1.37, 0]),
};

/** Fallback socket table for an out-of-range tier index -- never crash on an unexpected build value (ADR 0010 §7's forgiving-fallback spirit). */
export const DEFAULT_SOCKETS: TruckSockets = BODY_TIER_SOCKETS[0];

export function socketsForBodyTier(tier: number): TruckSockets {
  return BODY_TIER_SOCKETS[tier] ?? DEFAULT_SOCKETS;
}

/** Ground-clearance reference per body tier -- the wheel radius baked into that tier's socket table, so callers (fallback geometry, camera framing) can match it without duplicating the numbers. */
export const WHEEL_RADIUS_BY_TIER: Record<number, number> = { 0: 0.3, 1: 0.4, 2: 0.5 };
