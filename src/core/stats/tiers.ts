// Tier tables per ADR 0002 §Decision. Pure data — the tunable tables. No
// system reads these directly; everything downstream reads a resolved
// TruckSpec (see resolve-spec.ts). Exact numbers are placeholders pending
// playtest tuning (builder Open Qs 1-3) — the shape is what matters this pass.
import type { ObstacleClass } from '../types';

export interface BodyTier {
  tier: number;
  hitCapacity: number;
}

export interface WheelTier {
  tier: number;
  name: string;
  clearance: ObstacleClass;
}

export interface EngineTier {
  tier: number;
  name: string;
  topSpeed: number;
}

export interface GasTier {
  tier: number;
  name: string;
  capacity: number;
}

export const BODY_TIERS: BodyTier[] = [
  { tier: 0, hitCapacity: 3 },
  { tier: 1, hitCapacity: 4 },
  { tier: 2, hitCapacity: 5 },
];

// Wheel tier is what this pass actually exercises: clearance maps directly
// onto the three obstacle classes placed on the stub terrain (drive AC5-AC8).
export const WHEEL_TIERS: WheelTier[] = [
  { tier: 0, name: 'Base', clearance: 'small' },
  { tier: 1, name: 'Off-road', clearance: 'medium' },
  { tier: 2, name: 'Monster', clearance: 'large' },
];

export const ENGINE_TIERS: EngineTier[] = [
  { tier: 0, name: 'Standard', topSpeed: 6 },
  { tier: 1, name: 'Tuned', topSpeed: 9 },
  { tier: 2, name: 'Turbo', topSpeed: 12 },
];

export const GAS_TIERS: GasTier[] = [
  { tier: 0, name: 'Small tank', capacity: 20 },
  { tier: 1, name: 'Mid tank', capacity: 30 },
  { tier: 2, name: 'Big tank', capacity: 45 },
];
