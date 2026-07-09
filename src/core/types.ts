// Shared plain-data types for core/. Per ADR 0001 §4, core/ deals only in
// plain numbers and typed data — no three/rapier types leak in here.

/** Obstacle size classes and the wheel-tier clearance they require (ADR 0002). */
export type ObstacleClass = 'small' | 'medium' | 'large';

export interface Vec2 {
  x: number;
  z: number;
}

/** A resolved, run-ready truck build — the one contract every gameplay system reads (ADR 0002). */
export interface TruckSpec {
  hitCapacity: number;
  clearance: ObstacleClass;
  topSpeed: number;
  gasCapacity: number;
}

/** Selected tier index per axis (ADR 0002) — resolved once via resolveSpec(). */
export interface TruckBuild {
  body: number;
  wheels: number;
  engine: number;
  gasTank: number;
}

/**
 * The player's cosmetic (appearance-only) selection (ADR 0011 §3, cosmetics
 * AC1). Ids only, never `THREE` objects — `core/` stays pure per ADR 0001
 * §4; the id -> `THREE.Material`/texture mapping lives in `render/`.
 * Structurally separate from `TruckBuild`/`TruckSpec`: `resolveSpec()` and
 * every gameplay system must never read this type. That omission (not a
 * runtime check) is what makes cosmetics AC1 a structural guarantee.
 */
export interface TruckCosmetics {
  bodyDesign: string;
  wheelLook: string;
}

export type ObstacleKind = 'bush' | 'rock' | 'derelictCar';

/** A placed, functional obstacle instance on the stub terrain (drive AC5). */
export interface ObstacleInstance {
  id: string;
  kind: ObstacleKind;
  sizeClass: ObstacleClass;
  position: Vec2;
  /** Circle collision radius used for both clearance blocking and spawn-avoidance. */
  radius: number;
}

export type SizeTier = 'small' | 'medium' | 'large';
export type SpeedTier = 'slow' | 'medium' | 'fast';
export type AnimalSpecies = 'chicken';

/** Animal run state (animal AC1-AC8). */
export interface AnimalState {
  id: string;
  species: AnimalSpecies;
  position: Vec2;
  sizeTier: SizeTier;
  speedTier: SpeedTier;
  alive: boolean;
}

/** A fuel pickup on the map (ADR 0008 §1, fuel AC1-AC13) -- mirrors AnimalState minus alive/species/scatter, since collection is instant with no fleeing. */
export interface FuelPickupState {
  id: string;
  position: Vec2;
}

/** Keyboard-derived driving intent (drive AC1-AC3). Values are normalized -1..1. */
export interface DriveIntent {
  /** +1 = accelerate forward, -1 = brake/reverse, 0 = neither. */
  throttle: number;
  /** +1 = steer right, -1 = steer left, 0 = neither. */
  steer: number;
}
