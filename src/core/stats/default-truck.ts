// `DEFAULT_TRUCK_BUILD` seeds the builder screen's initial/preselected tiers
// (issues #1-4) — nothing downstream reads this build directly once a game
// is running. As of Sprint 2 (ADR 0006 §5), tier selection is gated to owned
// tiers and only tier 0 is owned on a first-ever run, so the default build is
// all-zeros: the first-run truck is deliberately all-base, and upgrades must
// be earned via GameStore.purchaseTier().
import type { TruckBuild } from '../types';

export const DEFAULT_TRUCK_BUILD: TruckBuild = {
  body: 0,
  wheels: 0,
  engine: 0,
  gasTank: 0,
};
