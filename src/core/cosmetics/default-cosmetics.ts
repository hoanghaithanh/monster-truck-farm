// `DEFAULT_TRUCK_COSMETICS` seeds GameStore's initial cosmetic selection —
// mirrors default-truck.ts's DEFAULT_TRUCK_BUILD, but this is an appearance
// default, not a progression default: cosmetics are freely selectable from
// the start (ADR 0011 §6, cosmetics Open Q1), so there is no ownership gate
// to satisfy here, unlike DEFAULT_TRUCK_BUILD's all-zeros/earn-it stance.
// The ids here must exist in render/cosmetics/cosmetic-manifest.ts's option
// lists (that module owns id -> THREE.Material; core/ only knows the ids
// are strings, per ADR 0001 §4).
import type { TruckCosmetics } from '../types';

export const DEFAULT_TRUCK_COSMETICS: TruckCosmetics = {
  wheelLook: 'standard',
};
