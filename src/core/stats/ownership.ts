// Ownership: the additive wrapper ADR 0002 predicted, realized by ADR 0006.
// Pure, unit-testable predicates over which tiers a player has unlocked per
// axis (backlog #14). Tier tables and resolveSpec() (ADR 0002) stay
// unchanged; ownership layers on top, and every gameplay system still reads
// only the resolved TruckSpec.
import type { TruckBuild } from '../types';
import { BODY_TIERS, ENGINE_TIERS, GAS_TIERS, WHEEL_TIERS } from './tiers';

export type Axis = keyof TruckBuild;

export type Ownership = {
  body: number[];
  wheels: number[];
  engine: number[];
  gasTank: number[];
};

/** Tier 0 is free/pre-owned on every axis (ADR 0006 §1). */
export const initialOwnership: Ownership = { body: [0], wheels: [0], engine: [0], gasTank: [0] };

const TIER_TABLES: Record<Axis, { tier: number; cost: number }[]> = {
  body: BODY_TIERS,
  wheels: WHEEL_TIERS,
  engine: ENGINE_TIERS,
  gasTank: GAS_TIERS,
};

/** Looks up a tier's coin cost from the tier tables (ADR 0006 §2). */
export function tierCost(axis: Axis, tier: number): number {
  const row = TIER_TABLES[axis][tier];
  if (!row) throw new Error(`tierCost: no tier ${tier} on axis ${axis}`);
  return row.cost;
}

export function owned(ownership: Ownership, axis: Axis, tier: number): boolean {
  return ownership[axis].includes(tier);
}

/** A tier may be equipped only if it's already owned (ADR 0006 §1/§5). */
export function selectable(ownership: Ownership, axis: Axis, tier: number): boolean {
  return owned(ownership, axis, tier);
}

/**
 * A tier may be purchased only if it isn't already owned, the immediately
 * preceding tier on that axis is owned (sequential unlock, ADR 0006 §3), and
 * the player can afford its cost.
 */
export function purchasable(ownership: Ownership, axis: Axis, tier: number, coins: number, cost: number): boolean {
  return !owned(ownership, axis, tier) && owned(ownership, axis, tier - 1) && coins >= cost;
}
