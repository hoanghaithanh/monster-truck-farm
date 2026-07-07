// resolveSpec: the single, unit-testable place that maps a TruckBuild
// (selected tier index per axis) to the flat TruckSpec every gameplay
// system consumes (ADR 0002). The builder UI that produces a TruckBuild is
// out of scope this pass (issues #1-4); driving/clearance/coins consume
// DEFAULT_TRUCK_SPEC (see default-truck.ts) in the meantime.
import type { TruckBuild, TruckSpec } from '../types';
import { BODY_TIERS, ENGINE_TIERS, GAS_TIERS, WHEEL_TIERS } from './tiers';

export function resolveSpec(build: TruckBuild): TruckSpec {
  const body = BODY_TIERS[build.body];
  const wheels = WHEEL_TIERS[build.wheels];
  const engine = ENGINE_TIERS[build.engine];
  const gasTank = GAS_TIERS[build.gasTank];

  if (!body || !wheels || !engine || !gasTank) {
    throw new Error(`resolveSpec: build index out of range for one or more axes: ${JSON.stringify(build)}`);
  }

  return {
    hitCapacity: body.hitCapacity,
    clearance: wheels.clearance,
    topSpeed: engine.topSpeed,
    gasCapacity: gasTank.capacity,
  };
}
