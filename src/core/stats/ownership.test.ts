// Unit coverage for the pure Ownership predicates/lookup (ADR 0006 §1/§2).
// GameStore.purchaseTier/selectTier delegate to these functions, but they're
// worth testing in isolation since they encode the actual unlock rules
// (sequential unlock, affordability, tier-0-is-free) independent of any
// store wiring, and across all four axes rather than treating one as a
// stand-in for the rest (their tier tables/costs all differ).
import { describe, expect, it } from 'vitest';
import { initialOwnership, owned, purchasable, selectable, tierCost, type Axis, type Ownership } from './ownership';
import { BODY_TIERS, ENGINE_TIERS, GAS_TIERS, WHEEL_TIERS } from './tiers';

const AXES: Axis[] = ['body', 'wheels', 'engine', 'gasTank'];
const TIER_TABLES = { body: BODY_TIERS, wheels: WHEEL_TIERS, engine: ENGINE_TIERS, gasTank: GAS_TIERS };

describe('initialOwnership', () => {
  it('starts with only tier 0 owned on every axis', () => {
    expect(initialOwnership).toEqual({ body: [0], wheels: [0], engine: [0], gasTank: [0] });
  });
});

describe('tierCost', () => {
  for (const axis of AXES) {
    it(`returns the exact cost for each defined tier on ${axis}`, () => {
      TIER_TABLES[axis].forEach((row, tier) => {
        expect(tierCost(axis, tier)).toBe(row.cost);
      });
    });

    it(`tier 0 is free on ${axis}`, () => {
      expect(tierCost(axis, 0)).toBe(0);
    });
  }

  it('throws for a tier index that has no row on the axis (out of range)', () => {
    expect(() => tierCost('body', 99)).toThrow();
  });
});

describe('owned', () => {
  for (const axis of AXES) {
    it(`is true for an owned tier and false for an unowned tier on ${axis}`, () => {
      const ownership: Ownership = { ...initialOwnership, [axis]: [0, 1] };
      expect(owned(ownership, axis, 0)).toBe(true);
      expect(owned(ownership, axis, 1)).toBe(true);
      expect(owned(ownership, axis, 2)).toBe(false);
    });
  }
});

describe('selectable', () => {
  for (const axis of AXES) {
    it(`mirrors owned() on ${axis} -- may equip only what is owned`, () => {
      const ownership: Ownership = { ...initialOwnership, [axis]: [0, 1] };
      expect(selectable(ownership, axis, 0)).toBe(true);
      expect(selectable(ownership, axis, 1)).toBe(true);
      expect(selectable(ownership, axis, 2)).toBe(false);
    });
  }
});

describe('purchasable', () => {
  for (const axis of AXES) {
    const cost1 = tierCost(axis, 1);
    const cost2 = tierCost(axis, 2);

    it(`allows buying tier 1 on ${axis} once affordable (tier 0 already owned by default)`, () => {
      expect(purchasable(initialOwnership, axis, 1, cost1, cost1)).toBe(true);
    });

    it(`blocks buying tier 1 on ${axis} when coins fall even 1 short`, () => {
      expect(purchasable(initialOwnership, axis, 1, cost1 - 1, cost1)).toBe(false);
    });

    it(`blocks buying tier 1 on ${axis} with zero coins`, () => {
      expect(purchasable(initialOwnership, axis, 1, 0, cost1)).toBe(false);
    });

    it(`blocks skip-buying tier 2 on ${axis} while tier 1 is unowned, even with ample coins for tier 2's cost`, () => {
      // Sequential unlock (ADR 0006 §3): affording the target tier is not
      // enough if the preceding tier hasn't been bought first.
      const ampleCoins = cost2 + 1000;
      expect(purchasable(initialOwnership, axis, 2, ampleCoins, cost2)).toBe(false);
    });

    it(`allows buying tier 2 on ${axis} once tier 1 is owned and tier 2 is affordable`, () => {
      const ownership: Ownership = { ...initialOwnership, [axis]: [0, 1] };
      expect(purchasable(ownership, axis, 2, cost2, cost2)).toBe(true);
    });

    it(`blocks re-buying an already-owned tier on ${axis} regardless of coins`, () => {
      const ownership: Ownership = { ...initialOwnership, [axis]: [0, 1] };
      expect(purchasable(ownership, axis, 1, 10_000, cost1)).toBe(false);
    });

    it(`tier 0 is never purchasable on ${axis} (already pre-owned, and there is no tier -1 to have owned)`, () => {
      expect(purchasable(initialOwnership, axis, 0, 10_000, 0)).toBe(false);
    });
  }
});
