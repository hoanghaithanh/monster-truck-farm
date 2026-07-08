// `DEFAULT_TRUCK_BUILD` seeds the builder screen's initial/preselected tiers
// (issues #1-4) — the player can change any axis freely before confirming
// (builder AC6); nothing downstream reads this build directly once a game
// is running. `DEFAULT_TRUCK_SPEC` is kept as a convenience for tests/tools
// that want a ready-made spec without going through the builder UI.
import type { TruckBuild } from '../types';
import { resolveSpec } from './resolve-spec';

export const DEFAULT_TRUCK_BUILD: TruckBuild = {
  body: 0,
  wheels: 1, // Off-road (medium clearance): passes bush + rock, blocked by the derelict car.
  engine: 1,
  gasTank: 1,
};

export const DEFAULT_TRUCK_SPEC = resolveSpec(DEFAULT_TRUCK_BUILD);
