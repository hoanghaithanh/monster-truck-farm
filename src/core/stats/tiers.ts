// Tier tables per ADR 0002 §Decision. Pure data — the tunable tables. No
// system reads these directly; everything downstream reads a resolved
// TruckSpec (see resolve-spec.ts). Exact numbers are placeholders pending
// playtest tuning (builder Open Qs 1-3) — the shape is what matters this pass.
//
// Each tier also carries a `cost` field (ADR 0006 §2, Sprint 2): the coin
// price to unlock that tier via GameStore.purchaseTier(). Tier 0 is free on
// every axis (pre-owned, core/stats/ownership.ts). Costs are placeholders
// scaled to the Sprint 1 coin economy (a boop awards 5-45 coins), pending
// playtest tuning.
import type { ObstacleClass } from '../types';

export interface BodyTier {
  tier: number;
  hitCapacity: number;
  cost: number;
}

export interface WheelTier {
  tier: number;
  name: string;
  clearance: ObstacleClass;
  cost: number;
}

export interface EngineTier {
  tier: number;
  name: string;
  topSpeed: number;
  cost: number;
}

export interface GasTier {
  tier: number;
  name: string;
  capacity: number;
  cost: number;
}

export const BODY_TIERS: BodyTier[] = [
  { tier: 0, hitCapacity: 3, cost: 0 },
  { tier: 1, hitCapacity: 4, cost: 40 },
  { tier: 2, hitCapacity: 5, cost: 90 },
];

// Wheel tier is what this pass actually exercises: clearance maps directly
// onto the three obstacle classes placed on the stub terrain (drive AC5-AC8).
export const WHEEL_TIERS: WheelTier[] = [
  { tier: 0, name: 'Base', clearance: 'small', cost: 0 },
  { tier: 1, name: 'Off-road', clearance: 'medium', cost: 50 },
  { tier: 2, name: 'Monster', clearance: 'large', cost: 120 },
];

export const ENGINE_TIERS: EngineTier[] = [
  { tier: 0, name: 'Standard', topSpeed: 6, cost: 0 },
  { tier: 1, name: 'Tuned', topSpeed: 9, cost: 60 },
  { tier: 2, name: 'Turbo', topSpeed: 12, cost: 140 },
];

export const GAS_TIERS: GasTier[] = [
  { tier: 0, name: 'Small tank', capacity: 20, cost: 0 },
  { tier: 1, name: 'Mid tank', capacity: 30, cost: 40 },
  { tier: 2, name: 'Big tank', capacity: 45, cost: 90 },
];
