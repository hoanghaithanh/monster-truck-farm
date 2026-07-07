// Hardcoded default TruckSpec, standing in for the truck builder (issues
// #1-4), which is explicitly out of scope this pass. `DEFAULT_TRUCK_BUILD`
// is the one place to change to exercise a different wheel tier against the
// stub terrain's obstacles (drive AC6-AC8) — swap `wheels` below and every
// downstream system (clearance, physics obstacle setup) picks it up via
// resolveSpec(), with no other code changes needed.
import type { TruckBuild } from '../types';
import { resolveSpec } from './resolve-spec';

export const DEFAULT_TRUCK_BUILD: TruckBuild = {
  body: 0,
  wheels: 1, // Off-road (medium clearance): passes bush + rock, blocked by the derelict car.
  engine: 1,
  gasTank: 1,
};

export const DEFAULT_TRUCK_SPEC = resolveSpec(DEFAULT_TRUCK_BUILD);
