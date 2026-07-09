import { describe, expect, it, vi } from 'vitest';
import { GameStore, nextScreen } from './game-state';
import { DEFAULT_TRUCK_BUILD } from './stats/default-truck';
import { DEFAULT_TRUCK_COSMETICS } from './cosmetics/default-cosmetics';
import { BODY_TIERS, ENGINE_TIERS, GAS_TIERS, WHEEL_TIERS } from './stats/tiers';
import type { TruckBuild } from './types';

// Buys every tier from 1 up to `tier` on `axis`, funding each purchase with
// plenty of coins. Purchases are sequential (ADR 0006 §3, purchasable()
// requires the preceding tier owned), and each purchase auto-equips, so this
// leaves `tier` both owned and equipped on that axis -- the gated
// equivalent of Sprint 1's free `selectTier(axis, tier)` in tests below that
// only care about "a higher tier is equipped," not the gating/purchase flow
// itself (which has its own dedicated describe blocks).
function buyUpTo(store: GameStore, axis: keyof TruckBuild, tier: number): void {
  for (let t = 1; t <= tier; t++) {
    store.addCoins(1000);
    const bought = store.purchaseTier(axis, t);
    if (!bought) throw new Error(`test helper: purchaseTier(${axis}, ${t}) unexpectedly failed`);
  }
}

describe('screen FSM (hello-world seam, real coverage lands with Sprint 1 stories)', () => {
  it('moves from BUILDER to DRIVING on confirm', () => {
    expect(nextScreen('BUILDER', 'confirm')).toBe('DRIVING');
  });

  it('moves from DRIVING to GAME_OVER on gameOver', () => {
    expect(nextScreen('DRIVING', 'gameOver')).toBe('GAME_OVER');
  });

  it('moves from GAME_OVER to BUILDER on restart', () => {
    expect(nextScreen('GAME_OVER', 'restart')).toBe('BUILDER');
  });

  it('ignores events that do not apply to the current screen', () => {
    expect(nextScreen('BUILDER', 'gameOver')).toBe('BUILDER');
  });
});

describe('GameStore.selectTier (builder AC1-AC6, gated by ownership per ADR 0006)', () => {
  it('starts with the default build seeded from DEFAULT_TRUCK_BUILD (all-zero, ADR 0006 §5)', () => {
    const store = new GameStore();
    expect(store.build).toEqual(DEFAULT_TRUCK_BUILD);
  });

  it('starts with only tier 0 owned on every axis', () => {
    const store = new GameStore();
    expect(store.ownership).toEqual({ body: [0], wheels: [0], engine: [0], gasTank: [0] });
  });

  it('sets the body axis independently of other axes once the tier is owned', () => {
    const store = new GameStore();
    buyUpTo(store, 'body', 2);
    store.selectTier('body', 0); // re-equip a lower owned tier
    expect(store.build).toEqual({ ...DEFAULT_TRUCK_BUILD, body: 0 });
    store.selectTier('body', 2);
    expect(store.build).toEqual({ ...DEFAULT_TRUCK_BUILD, body: 2 });
  });

  it('sets the wheels axis independently of other axes once the tier is owned', () => {
    const store = new GameStore();
    buyUpTo(store, 'wheels', 2);
    expect(store.build).toEqual({ ...DEFAULT_TRUCK_BUILD, wheels: 2 });
  });

  it('sets the engine axis independently of other axes once the tier is owned', () => {
    const store = new GameStore();
    buyUpTo(store, 'engine', 2);
    expect(store.build).toEqual({ ...DEFAULT_TRUCK_BUILD, engine: 2 });
  });

  it('sets the gasTank axis independently of other axes once the tier is owned', () => {
    const store = new GameStore();
    buyUpTo(store, 'gasTank', 2);
    expect(store.build).toEqual({ ...DEFAULT_TRUCK_BUILD, gasTank: 2 });
  });

  it('accepts the lowest valid tier index (0) on every axis, which is always owned', () => {
    const store = new GameStore();
    buyUpTo(store, 'body', 2); // move off default first
    store.selectTier('body', 0);
    expect(store.build.body).toBe(0);
  });

  it('accepts the highest valid tier index on every axis once each is purchased', () => {
    const store = new GameStore();
    buyUpTo(store, 'body', BODY_TIERS.length - 1);
    buyUpTo(store, 'wheels', WHEEL_TIERS.length - 1);
    buyUpTo(store, 'engine', ENGINE_TIERS.length - 1);
    buyUpTo(store, 'gasTank', GAS_TIERS.length - 1);
    expect(store.build).toEqual({
      body: BODY_TIERS.length - 1,
      wheels: WHEEL_TIERS.length - 1,
      engine: ENGINE_TIERS.length - 1,
      gasTank: GAS_TIERS.length - 1,
    });
  });

  it('is a no-op for a tier that is not owned (gated selection, ADR 0006 §1/§5)', () => {
    const store = new GameStore();
    store.selectTier('wheels', 2); // not owned -- default build never bought anything
    expect(store.build.wheels).toBe(0);
  });

  it('is a no-op for an out-of-range tier index (never owned, so never selectable)', () => {
    const store = new GameStore();
    store.selectTier('wheels', 99);
    expect(store.build.wheels).toBe(0);
  });

  it('does not notify subscribers when selectTier is a gated no-op', () => {
    const store = new GameStore();
    let calls = 0;
    store.subscribe(() => calls++);
    store.selectTier('body', 1); // not owned yet
    expect(calls).toBe(0);
  });

  it('notifies subscribers on a selectTier that actually equips an owned tier', () => {
    const store = new GameStore();
    store.addCoins(1000);
    store.purchaseTier('body', 1);
    let calls = 0;
    store.subscribe(() => calls++);
    store.selectTier('body', 0);
    expect(calls).toBe(1);
  });
});

describe('GameStore.selectCosmetic (ADR 0011 §3, cosmetics AC1/AC5/AC6/AC7)', () => {
  it('starts with the default cosmetics seeded from DEFAULT_TRUCK_COSMETICS', () => {
    const store = new GameStore();
    expect(store.cosmetics).toEqual(DEFAULT_TRUCK_COSMETICS);
  });

  it('sets the wheelLook cosmetic (the only surviving cosmetic axis -- body color and body design were both removed post-ship)', () => {
    const store = new GameStore();
    store.selectCosmetic('wheelLook', 'chrome');
    expect(store.cosmetics).toEqual({ ...DEFAULT_TRUCK_COSMETICS, wheelLook: 'chrome' });
  });

  it('is freely selectable with no ownership/coin gate -- unlike selectTier, works before any coins are earned or spent (cosmetics AC5/AC6)', () => {
    const store = new GameStore();
    expect(store.coins).toBe(0);
    store.selectCosmetic('wheelLook', 'redRim');
    expect(store.cosmetics.wheelLook).toBe('redRim');
  });

  it('notifies subscribers on a cosmetic change', () => {
    const store = new GameStore();
    let calls = 0;
    store.subscribe(() => calls++);
    store.selectCosmetic('wheelLook', 'redRim');
    expect(calls).toBe(1);
  });

  it('a cosmetic selection survives an unrelated functional tier purchase/equip on a different axis (structurally separate state)', () => {
    const store = new GameStore();
    store.selectCosmetic('wheelLook', 'redRim');
    buyUpTo(store, 'body', 2);
    store.selectTier('body', 0);
    expect(store.cosmetics.wheelLook).toBe('redRim');
  });

  it('a cosmetic selection carries over unchanged when the equipped tier on the same axis changes (cosmetics AC7: this project keeps a shared palette so carry-over is always valid, ADR 0011 §2)', () => {
    const store = new GameStore();
    store.selectCosmetic('wheelLook', 'chrome');
    buyUpTo(store, 'wheels', 2);
    expect(store.cosmetics.wheelLook).toBe('chrome');
    store.selectTier('wheels', 0);
    expect(store.cosmetics.wheelLook).toBe('chrome');
  });
});

describe('cosmetics AC1 structural invariant: cosmetic selection never reaches resolveSpec()/TruckSpec', () => {
  it('confirmBuild resolves an identical TruckSpec for two stores with the same build but different cosmetics', () => {
    const plain = new GameStore();
    const painted = new GameStore();
    painted.selectCosmetic('wheelLook', 'chrome');

    plain.confirmBuild();
    painted.confirmBuild();

    expect(painted.spec).toEqual(plain.spec);
  });

  it('changing a cosmetic after confirmBuild does not change the already-resolved spec', () => {
    const store = new GameStore();
    store.confirmBuild();
    const specBefore = store.spec;
    store.selectCosmetic('wheelLook', 'chrome');
    expect(store.spec).toEqual(specBefore);
  });
});

describe('GameStore.purchaseTier (backlog #14, ADR 0006 §3)', () => {
  it('is blocked (returns false, no-op) when the player cannot afford the tier', () => {
    const store = new GameStore();
    const bought = store.purchaseTier('body', 1);
    expect(bought).toBe(false);
    expect(store.ownership.body).toEqual([0]);
    expect(store.build.body).toBe(0);
    expect(store.coins).toBe(0);
  });

  it('makes no partial coin deduction when a purchase is blocked for insufficient funds (1 coin short)', () => {
    const store = new GameStore();
    store.addCoins(BODY_TIERS[1].cost - 1);
    const bought = store.purchaseTier('body', 1);
    expect(bought).toBe(false);
    expect(store.coins).toBe(BODY_TIERS[1].cost - 1); // unchanged, not partially spent
    expect(store.ownership.body).toEqual([0]);
    expect(store.build.body).toBe(0);
  });

  it('is blocked when the preceding tier is not yet owned (sequential unlock)', () => {
    const store = new GameStore();
    store.addCoins(10_000);
    const bought = store.purchaseTier('body', 2); // tier 1 not owned yet
    expect(bought).toBe(false);
    expect(store.ownership.body).toEqual([0]);
  });

  it('is blocked skip-buying tier 2 even with ample coins for tier 2, while tier 1 remains locked (does not accidentally deduct or partially unlock)', () => {
    const store = new GameStore();
    store.addCoins(BODY_TIERS[2].cost + 1000); // far more than enough for tier 2 alone
    const bought = store.purchaseTier('body', 2);
    expect(bought).toBe(false);
    expect(store.coins).toBe(BODY_TIERS[2].cost + 1000);
    expect(store.ownership.body).toEqual([0]);
    expect(store.build.body).toBe(0);
  });

  it('deducts the tier cost, adds the tier to ownership, and auto-equips it on a successful purchase', () => {
    const store = new GameStore();
    store.addCoins(BODY_TIERS[1].cost);
    const bought = store.purchaseTier('body', 1);
    expect(bought).toBe(true);
    expect(store.coins).toBe(0);
    expect(store.ownership.body).toEqual([0, 1]);
    expect(store.build.body).toBe(1);
  });

  it('leaves any leftover coins after paying the tier cost', () => {
    const store = new GameStore();
    store.addCoins(BODY_TIERS[1].cost + 25);
    store.purchaseTier('body', 1);
    expect(store.coins).toBe(25);
  });

  it('is a no-op if the tier is already owned (cannot re-buy, no double-charge)', () => {
    const store = new GameStore();
    store.addCoins(10_000);
    store.purchaseTier('body', 1);
    const coinsAfterFirstBuy = store.coins;
    const bought = store.purchaseTier('body', 1);
    expect(bought).toBe(false);
    expect(store.coins).toBe(coinsAfterFirstBuy);
    expect(store.ownership.body).toEqual([0, 1]); // not duplicated in the ownership array either
  });

  it('allows purchasing the next sequential tier once the preceding one is owned', () => {
    const store = new GameStore();
    store.addCoins(10_000);
    store.purchaseTier('body', 1);
    const bought = store.purchaseTier('body', 2);
    expect(bought).toBe(true);
    expect(store.ownership.body).toEqual([0, 1, 2]);
    expect(store.build.body).toBe(2);
  });

  it('notifies subscribers on a successful purchase', () => {
    const store = new GameStore();
    store.addCoins(BODY_TIERS[1].cost);
    let calls = 0;
    store.subscribe(() => calls++);
    store.purchaseTier('body', 1);
    expect(calls).toBe(1);
  });

  it('does not notify subscribers when the purchase is blocked', () => {
    const store = new GameStore();
    let calls = 0;
    store.subscribe(() => calls++);
    store.purchaseTier('body', 1); // can't afford
    expect(calls).toBe(0);
  });

  // The tests above exercise the flow once on 'body' as the primary case;
  // the remaining three axes have independent tier tables/costs (ADR 0006
  // §2) and their own TIER_TABLES entry in ownership.ts, so each is worth
  // its own successful-purchase + sequential-unlock-block assertion rather
  // than assuming 'body' is representative.
  describe.each([
    ['wheels', WHEEL_TIERS] as const,
    ['engine', ENGINE_TIERS] as const,
    ['gasTank', GAS_TIERS] as const,
  ])('axis: %s', (axis, tiers) => {
    it('deducts the exact tier cost, adds to ownership, and auto-equips on a successful purchase', () => {
      const store = new GameStore();
      store.addCoins(tiers[1].cost);
      const bought = store.purchaseTier(axis, 1);
      expect(bought).toBe(true);
      expect(store.coins).toBe(0);
      expect(store.ownership[axis]).toEqual([0, 1]);
      expect(store.build[axis]).toBe(1);
    });

    it('blocks skip-buying tier 2 while tier 1 is unowned, even with ample coins for tier 2 alone', () => {
      const store = new GameStore();
      store.addCoins(tiers[2].cost + 1000);
      const bought = store.purchaseTier(axis, 2);
      expect(bought).toBe(false);
      expect(store.ownership[axis]).toEqual([0]);
      expect(store.coins).toBe(tiers[2].cost + 1000); // no deduction
    });

    it('blocks purchase and makes no deduction when short even 1 coin', () => {
      const store = new GameStore();
      store.addCoins(tiers[1].cost - 1);
      const bought = store.purchaseTier(axis, 1);
      expect(bought).toBe(false);
      expect(store.coins).toBe(tiers[1].cost - 1);
      expect(store.ownership[axis]).toEqual([0]);
    });

    it('is a no-op with no double-charge when re-purchasing an already-owned tier', () => {
      const store = new GameStore();
      store.addCoins(10_000);
      store.purchaseTier(axis, 1);
      const coinsAfterFirstBuy = store.coins;
      const bought = store.purchaseTier(axis, 1);
      expect(bought).toBe(false);
      expect(store.coins).toBe(coinsAfterFirstBuy);
    });
  });
});

describe('GameStore.confirmBuild (builder AC1)', () => {
  it('resolves the default build into the matching default TruckSpec', () => {
    const store = new GameStore();
    store.confirmBuild();
    expect(store.spec).toEqual({
      hitCapacity: BODY_TIERS[DEFAULT_TRUCK_BUILD.body].hitCapacity,
      clearance: WHEEL_TIERS[DEFAULT_TRUCK_BUILD.wheels].clearance,
      topSpeed: ENGINE_TIERS[DEFAULT_TRUCK_BUILD.engine].topSpeed,
      gasCapacity: GAS_TIERS[DEFAULT_TRUCK_BUILD.gasTank].capacity,
    });
  });

  it("resolves a non-default selection (highest wheel tier, once owned) into a TruckSpec carrying that tier's clearance, not the default", () => {
    const store = new GameStore();
    buyUpTo(store, 'wheels', 2); // Monster wheels -> 'large'
    store.confirmBuild();
    expect(store.spec?.clearance).toBe('large');
    expect(store.spec?.clearance).not.toBe(WHEEL_TIERS[DEFAULT_TRUCK_BUILD.wheels].clearance);
  });

  it('resolves a non-default selection across all four axes (once owned) into the matching stat values', () => {
    const store = new GameStore();
    buyUpTo(store, 'body', 2);
    buyUpTo(store, 'wheels', 2);
    buyUpTo(store, 'engine', 2);
    buyUpTo(store, 'gasTank', 2);
    store.confirmBuild();
    expect(store.spec).toEqual({
      hitCapacity: BODY_TIERS[2].hitCapacity,
      clearance: WHEEL_TIERS[2].clearance,
      topSpeed: ENGINE_TIERS[2].topSpeed,
      gasCapacity: GAS_TIERS[2].capacity,
    });
  });

  it('moves the screen from BUILDER to DRIVING', () => {
    const store = new GameStore();
    expect(store.screen).toBe('BUILDER');
    store.confirmBuild();
    expect(store.screen).toBe('DRIVING');
  });

  it('leaves spec undefined until confirmBuild has been called at least once', () => {
    const store = new GameStore();
    expect(store.spec).toBeUndefined();
  });
});

describe('GameStore.confirmBuild — hits/gas reseeding (farmer AC3/AC6, drive AC10)', () => {
  it('seeds hitsRemaining to the resolved body tier\'s hitCapacity on confirm', () => {
    const store = new GameStore();
    store.confirmBuild();
    expect(store.hitsRemaining).toBe(BODY_TIERS[DEFAULT_TRUCK_BUILD.body].hitCapacity);
  });

  it('seeds gas to the resolved gas-tank tier\'s capacity on confirm', () => {
    const store = new GameStore();
    store.confirmBuild();
    expect(store.gas).toBe(GAS_TIERS[DEFAULT_TRUCK_BUILD.gasTank].capacity);
  });

  it('is 0 for both hitsRemaining and gas before any confirmBuild has run', () => {
    const store = new GameStore();
    expect(store.hitsRemaining).toBe(0);
    expect(store.gas).toBe(0);
  });

  it('reseeds hitsRemaining/gas to a fresh full tank/hits on a restart round trip, not stale drained values from the previous run', () => {
    const store = new GameStore();
    store.confirmBuild(); // hitsRemaining = 3, gas = 20 (default tiers)
    store.bump();
    store.bump();
    expect(store.hitsRemaining).toBe(1);
    store.setGas(2);
    expect(store.gas).toBe(2);

    store.bump(); // drains last hit -> gameOver()
    expect(store.screen).toBe('GAME_OVER');
    store.restart();
    store.confirmBuild(); // fresh run against the (possibly same) build

    expect(store.hitsRemaining).toBe(BODY_TIERS[DEFAULT_TRUCK_BUILD.body].hitCapacity);
    expect(store.gas).toBe(GAS_TIERS[DEFAULT_TRUCK_BUILD.gasTank].capacity);
  });

  it('reseeds to the newly-selected (not previous) tier\'s capacity when the player changes their build before restarting', () => {
    const store = new GameStore();
    store.confirmBuild(); // body tier 0 -> hitsRemaining 3
    store.bump();
    store.bump();
    store.bump(); // hits to 0 -> gameOver
    store.restart();

    buyUpTo(store, 'body', 2); // higher hit capacity tier
    buyUpTo(store, 'gasTank', 2); // higher gas capacity tier
    store.confirmBuild();

    expect(store.hitsRemaining).toBe(BODY_TIERS[2].hitCapacity);
    expect(store.gas).toBe(GAS_TIERS[2].capacity);
  });
});

describe('GameStore.bump (farmer AC3/AC6)', () => {
  it('decrements hitsRemaining by exactly 1 per bump', () => {
    const store = new GameStore();
    store.confirmBuild(); // default body tier 0 -> hitCapacity 3
    store.bump();
    expect(store.hitsRemaining).toBe(2);
  });

  it('decrements correctly for a higher body tier (tier 2 -> hitCapacity 5)', () => {
    const store = new GameStore();
    buyUpTo(store, 'body', 2);
    store.confirmBuild();
    expect(store.hitsRemaining).toBe(BODY_TIERS[2].hitCapacity);
    store.bump();
    expect(store.hitsRemaining).toBe(BODY_TIERS[2].hitCapacity - 1);
  });

  it('does not trigger gameOver while hitsRemaining stays above 0', () => {
    const store = new GameStore();
    buyUpTo(store, 'body', 2); // hitCapacity 5
    store.confirmBuild();
    store.bump();
    store.bump();
    expect(store.screen).toBe('DRIVING');
  });

  it('triggers gameOver (DRIVING -> GAME_OVER) exactly when the bump brings hitsRemaining to 0 (AC6)', () => {
    const store = new GameStore();
    store.confirmBuild(); // hitCapacity 3
    store.bump();
    store.bump();
    expect(store.screen).toBe('DRIVING');
    store.bump(); // 3rd bump -> 0 -> gameOver
    expect(store.hitsRemaining).toBe(0);
    expect(store.screen).toBe('GAME_OVER');
  });

  it('resets the visible coin counter to 0 as part of the hard game over (AC6c) once restart runs', () => {
    const store = new GameStore();
    store.confirmBuild();
    store.addCoins(25);
    store.bump();
    store.bump();
    store.bump(); // -> gameOver
    store.restart();
    expect(store.coins).toBe(0);
  });

  it('is a no-op once hitsRemaining is already 0 (does not go negative or double-fire gameOver)', () => {
    const store = new GameStore();
    store.confirmBuild();
    store.bump();
    store.bump();
    store.bump(); // -> 0, gameOver
    let calls = 0;
    store.subscribe(() => calls++);
    store.bump(); // extra bump after game over should be a no-op
    expect(store.hitsRemaining).toBe(0);
    expect(calls).toBe(0);
  });

  it('is a no-op when called outside DRIVING (e.g. still on BUILDER, no run started)', () => {
    const store = new GameStore();
    store.bump();
    expect(store.hitsRemaining).toBe(0);
    expect(store.screen).toBe('BUILDER');
  });

  it('notifies subscribers on a bump that does not end the run', () => {
    const store = new GameStore();
    buyUpTo(store, 'body', 2);
    store.confirmBuild();
    let calls = 0;
    store.subscribe(() => calls++);
    store.bump();
    expect(calls).toBe(1);
  });
});

describe('GameStore.gameOver', () => {
  it('moves the screen from DRIVING to GAME_OVER', () => {
    const store = new GameStore();
    store.confirmBuild(); // BUILDER -> DRIVING
    store.gameOver();
    expect(store.screen).toBe('GAME_OVER');
  });

  it('is a no-op on the screen when called outside DRIVING (e.g. still on BUILDER)', () => {
    const store = new GameStore();
    store.gameOver();
    expect(store.screen).toBe('BUILDER');
  });
});

describe('GameStore.restart (builder AC7, ADR 0006 §4)', () => {
  it('moves the screen from GAME_OVER back to BUILDER', () => {
    const store = new GameStore();
    store.confirmBuild();
    store.gameOver();
    store.restart();
    expect(store.screen).toBe('BUILDER');
  });

  it('resets coins to 0 (AC7)', () => {
    const store = new GameStore();
    store.confirmBuild();
    store.addCoins(50);
    expect(store.coins).toBe(50);
    store.gameOver();
    store.restart();
    expect(store.coins).toBe(0);
  });

  it('preserves the prior builder selection rather than resetting it back to defaults (AC7: "no other builder state ... required to persist" -- current implementation keeps it, verified here rather than assumed)', () => {
    const store = new GameStore();
    buyUpTo(store, 'wheels', 2);
    store.confirmBuild();
    store.gameOver();
    store.restart();
    expect(store.build.wheels).toBe(2);
  });

  it('preserves tier ownership across a hard game-over (ADR 0006 §4, human-confirmed: progression survives, coins do not)', () => {
    const store = new GameStore();
    buyUpTo(store, 'body', 2);
    store.confirmBuild();
    store.gameOver();
    store.restart();
    expect(store.ownership.body).toEqual([0, 1, 2]);
  });

  it('preserves ownership independently across all four axes on a single restart round trip, while coins reset and equipped build is retained (full ADR 0006 §4 round trip)', () => {
    const store = new GameStore();
    buyUpTo(store, 'body', 1);
    buyUpTo(store, 'wheels', 2);
    buyUpTo(store, 'engine', 1);
    buyUpTo(store, 'gasTank', 2);
    store.addCoins(999); // leftover run coins on top of purchase spend
    store.confirmBuild();
    store.gameOver();
    store.restart();

    expect(store.ownership).toEqual({ body: [0, 1], wheels: [0, 1, 2], engine: [0, 1], gasTank: [0, 1, 2] });
    expect(store.build).toEqual({ body: 1, wheels: 2, engine: 1, gasTank: 2 });
    expect(store.coins).toBe(0);
  });

  it('allows purchasing the next tier after a restart, carrying forward the ownership gained before the game-over (progression is not frozen at the ownership snapshot from before restart)', () => {
    const store = new GameStore();
    buyUpTo(store, 'body', 1); // owns tier 0, 1
    store.confirmBuild();
    store.gameOver();
    store.restart();

    store.addCoins(BODY_TIERS[2].cost);
    const bought = store.purchaseTier('body', 2);
    expect(bought).toBe(true);
    expect(store.ownership.body).toEqual([0, 1, 2]);
    expect(store.build.body).toBe(2);
  });

  it('a brand new session (no purchases made) starts from DEFAULT_TRUCK_BUILD\'s all-zero build with only tier 0 owned per axis -- the intended first-run baseline that restart must not regress toward', () => {
    const store = new GameStore();
    expect(store.build).toEqual(DEFAULT_TRUCK_BUILD);
    expect(store.ownership).toEqual({ body: [0], wheels: [0], engine: [0], gasTank: [0] });
    expect(store.coins).toBe(0);
  });

  it('is a no-op on the screen when called outside GAME_OVER (e.g. still on BUILDER)', () => {
    const store = new GameStore();
    store.restart();
    expect(store.screen).toBe('BUILDER');
  });

  it('notifies subscribers on restart', () => {
    const store = new GameStore();
    store.confirmBuild();
    store.gameOver();
    let calls = 0;
    store.subscribe(() => calls++);
    store.restart();
    expect(calls).toBe(1);
  });
});

describe('screen FSM: pause/resume events (ADR 0009 §1)', () => {
  it('moves DRIVING -> BUILDER on pause', () => {
    expect(nextScreen('DRIVING', 'pause')).toBe('BUILDER');
  });

  it('moves BUILDER -> DRIVING on resume', () => {
    expect(nextScreen('BUILDER', 'resume')).toBe('DRIVING');
  });

  it('ignores pause/resume events that do not apply to the current screen', () => {
    expect(nextScreen('BUILDER', 'pause')).toBe('BUILDER');
    expect(nextScreen('GAME_OVER', 'resume')).toBe('GAME_OVER');
  });
});

describe('GameStore.pauseToBuilder (ADR 0009 §1, human decisions 1-2)', () => {
  it('moves DRIVING -> BUILDER and sets pausedMidRun', () => {
    const store = new GameStore();
    store.confirmBuild();
    store.pauseToBuilder();
    expect(store.screen).toBe('BUILDER');
    expect(store.pausedMidRun).toBe(true);
  });

  it('leaves coins, ownership, build, hits, and gas completely untouched (preserved by omission)', () => {
    const store = new GameStore();
    buyUpTo(store, 'wheels', 1);
    store.confirmBuild();
    store.addCoins(42);
    store.bump(); // 1 hit taken
    store.setGas(5);
    const { coins, ownership, build, hitsRemaining, gas } = store;

    store.pauseToBuilder();

    expect(store.coins).toBe(coins);
    expect(store.ownership).toEqual(ownership);
    expect(store.build).toEqual(build);
    expect(store.hitsRemaining).toBe(hitsRemaining);
    expect(store.gas).toBe(gas);
  });

  it('notifies subscribers', () => {
    const store = new GameStore();
    store.confirmBuild();
    let calls = 0;
    store.subscribe(() => calls++);
    store.pauseToBuilder();
    expect(calls).toBe(1);
  });
});

describe('GameStore.resumeDriving (ADR 0009 §3)', () => {
  it('moves BUILDER -> DRIVING, re-resolves spec, and clears pausedMidRun', () => {
    const store = new GameStore();
    store.confirmBuild();
    store.pauseToBuilder();
    store.resumeDriving();
    expect(store.screen).toBe('DRIVING');
    expect(store.pausedMidRun).toBe(false);
  });

  it('preserves gas/hits exactly when capacities are unchanged (no refill)', () => {
    const store = new GameStore();
    store.confirmBuild();
    store.bump();
    store.setGas(6);
    store.pauseToBuilder();
    store.resumeDriving();
    expect(store.hitsRemaining).toBe(BODY_TIERS[DEFAULT_TRUCK_BUILD.body].hitCapacity - 1);
    expect(store.gas).toBe(6);
  });

  it('clamps gas to the new (smaller) tank capacity rather than exceeding it', () => {
    const store = new GameStore();
    buyUpTo(store, 'gasTank', 2);
    store.confirmBuild(); // full big tank
    store.pauseToBuilder();
    store.selectTier('gasTank', 0); // swap to the smaller owned tank while paused
    store.resumeDriving();
    expect(store.gas).toBe(GAS_TIERS[0].capacity);
  });

  it('does NOT refill gas when a bigger tank is bought while paused (absolute remaining carries over)', () => {
    const store = new GameStore();
    store.confirmBuild(); // default (smallest) tank
    store.setGas(3);
    store.pauseToBuilder();
    store.addCoins(10_000);
    store.purchaseTier('gasTank', 1); // bigger tank, not pre-filled
    store.resumeDriving();
    expect(store.gas).toBe(3);
  });
});

describe('GameStore.purchaseTier body-upgrade paid heal (ADR 0009 §3b, human decision 4)', () => {
  it('heals hitsRemaining to the newly-purchased body tier\'s full capacity', () => {
    const store = new GameStore();
    store.confirmBuild(); // hitCapacity 3 (tier 0)
    store.bump();
    store.bump();
    expect(store.hitsRemaining).toBe(1);
    store.pauseToBuilder();

    store.addCoins(10_000);
    store.purchaseTier('body', 1);
    expect(store.hitsRemaining).toBe(BODY_TIERS[1].hitCapacity);
  });

  it('does not heal on a non-body purchase', () => {
    const store = new GameStore();
    store.confirmBuild();
    store.bump();
    store.bump();
    store.pauseToBuilder();
    store.addCoins(10_000);
    store.purchaseTier('wheels', 1);
    expect(store.hitsRemaining).toBe(1);
  });

  it('does not heal on selectTier (re-equipping an already-owned body) -- coin cost is the anti-exploit gate', () => {
    const store = new GameStore();
    buyUpTo(store, 'body', 1); // owns body 0, 1; equipped 1
    store.confirmBuild(); // resolves against body tier 1
    store.bump(); // 1 hit taken, hitsRemaining = hitCapacity - 1
    const beforeSwap = store.hitsRemaining;
    store.pauseToBuilder();
    store.selectTier('body', 0); // re-equip an already-owned lower tier -- no purchase
    expect(store.hitsRemaining).toBe(beforeSwap); // unchanged -- no free heal
  });

  it('last purchase wins when buying tier 1 then tier 2 in the same pause', () => {
    const store = new GameStore();
    store.confirmBuild();
    store.bump();
    store.pauseToBuilder();
    store.addCoins(10_000);
    store.purchaseTier('body', 1);
    expect(store.hitsRemaining).toBe(BODY_TIERS[1].hitCapacity);
    store.purchaseTier('body', 2);
    expect(store.hitsRemaining).toBe(BODY_TIERS[2].hitCapacity);
  });

  it('chain-purchase before resume: buying tier 1 then tier 2 in the same pause, resumeDriving reflects tier 2\'s capacity, not tier 1\'s (QA gap: developer report did not explicitly test the resume call after a chain purchase)', () => {
    const store = new GameStore();
    store.confirmBuild();
    store.bump();
    store.bump();
    store.pauseToBuilder();
    store.addCoins(10_000);
    store.purchaseTier('body', 1);
    store.purchaseTier('body', 2);
    store.resumeDriving();
    expect(store.hitsRemaining).toBe(BODY_TIERS[2].hitCapacity);
    expect(store.hitsRemaining).not.toBe(BODY_TIERS[1].hitCapacity);
  });

  it('composes with the resume clamp: buying a body then equipping a lower owned body clamps hits to the lower body\'s capacity on resume', () => {
    const store = new GameStore();
    buyUpTo(store, 'body', 1); // owns 0, 1; equipped 1
    store.confirmBuild();
    store.pauseToBuilder();
    store.addCoins(10_000);
    store.purchaseTier('body', 2); // heals to tier 2 capacity, equips tier 2
    expect(store.hitsRemaining).toBe(BODY_TIERS[2].hitCapacity);

    store.selectTier('body', 0); // swap to a lower owned body before resuming
    store.resumeDriving();
    expect(store.hitsRemaining).toBe(BODY_TIERS[0].hitCapacity);
  });

  it('is a harmless no-op-in-effect on a fresh (pre-first-drive) build purchase -- confirmBuild reseeds hits anyway', () => {
    const store = new GameStore();
    store.addCoins(10_000);
    store.purchaseTier('body', 1); // pre-first-drive purchase; hitsRemaining set early but not observable yet
    store.confirmBuild();
    expect(store.hitsRemaining).toBe(BODY_TIERS[1].hitCapacity);
  });
});

describe('GameStore.beginDrive (ADR 0009 §6)', () => {
  it('calls confirmBuild when not paused (fresh build / post-game-over)', () => {
    const store = new GameStore();
    store.beginDrive();
    expect(store.screen).toBe('DRIVING');
    expect(store.hitsRemaining).toBe(BODY_TIERS[DEFAULT_TRUCK_BUILD.body].hitCapacity);
  });

  it('calls resumeDriving when paused mid-run', () => {
    const store = new GameStore();
    store.confirmBuild();
    store.bump();
    store.pauseToBuilder();
    store.beginDrive();
    expect(store.screen).toBe('DRIVING');
    expect(store.pausedMidRun).toBe(false);
    expect(store.hitsRemaining).toBe(BODY_TIERS[DEFAULT_TRUCK_BUILD.body].hitCapacity - 1); // preserved, not reseeded to full
  });
});

describe('confirmBuild/restart clear pausedMidRun (ADR 0009 §5)', () => {
  it('confirmBuild clears pausedMidRun', () => {
    const store = new GameStore();
    store.confirmBuild();
    store.pauseToBuilder();
    expect(store.pausedMidRun).toBe(true);
    store.confirmBuild();
    expect(store.pausedMidRun).toBe(false);
  });

  it('restart clears pausedMidRun', () => {
    const store = new GameStore();
    store.confirmBuild();
    store.pauseToBuilder();
    store.resumeDriving();
    store.bump();
    store.bump();
    store.bump(); // -> gameOver
    store.restart();
    expect(store.pausedMidRun).toBe(false);
  });
});

describe('GameStore.sessionActive (issue #32: HUD gas/hits bars gate on this, not `screen` alone)', () => {
  it('starts false', () => {
    const store = new GameStore();
    expect(store.sessionActive).toBe(false);
  });

  it('is independent of screen -- confirmBuild() alone does not set it', () => {
    const store = new GameStore();
    store.confirmBuild();
    expect(store.screen).toBe('DRIVING');
    expect(store.sessionActive).toBe(false); // main.ts's driving-session controller sets this once the session actually exists
  });

  it('setSessionActive() flips the flag and notifies subscribers', () => {
    const store = new GameStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setSessionActive(true);
    expect(store.sessionActive).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    store.setSessionActive(false);
    expect(store.sessionActive).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('driving-session lifecycle across a full DRIVING -> GAME_OVER -> BUILDER -> DRIVING round trip (issue #18)', () => {
  // main.ts wires a rAF/render/physics driving session to the screen FSM via
  // exactly this start/dispose guard shape (start on BUILDER -> DRIVING while
  // no session is active, dispose on DRIVING -> GAME_OVER). Three.js/Rapier
  // can't be exercised in core/'s unit tests (ADR 0001 §4/§6 boundary), but
  // the guard logic itself — the actual bug in #18 — is pure and reproduced
  // here against a real GameStore so a regression trips a fast unit test
  // instead of only being catchable by manually restarting the running app.
  function wireFakeDrivingSession(store: GameStore) {
    let started = 0;
    let disposed = 0;
    let active = false;
    store.subscribe(() => {
      if (store.screen === 'DRIVING' && !active && store.spec) {
        active = true;
        started++;
      } else if (store.screen === 'GAME_OVER' && active) {
        active = false;
        disposed++;
      }
    });
    return {
      get started() {
        return started;
      },
      get disposed() {
        return disposed;
      },
      get active() {
        return active;
      },
    };
  }

  it('starts a session on the first BUILDER -> DRIVING transition', () => {
    const store = new GameStore();
    const session = wireFakeDrivingSession(store);
    store.confirmBuild();
    expect(session.started).toBe(1);
    expect(session.active).toBe(true);
  });

  it('disposes the session on DRIVING -> GAME_OVER and starts a fresh one on the next DRIVING entry', () => {
    const store = new GameStore();
    const session = wireFakeDrivingSession(store);

    store.confirmBuild(); // BUILDER -> DRIVING: session #1 starts
    store.gameOver(); // DRIVING -> GAME_OVER: session #1 disposed
    expect(session.disposed).toBe(1);
    expect(session.active).toBe(false);

    store.restart(); // GAME_OVER -> BUILDER
    store.confirmBuild(); // BUILDER -> DRIVING: session #2 starts

    expect(session.started).toBe(2);
    expect(session.disposed).toBe(1);
    expect(session.active).toBe(true);
  });

  it('does not double-start when other store mutations (e.g. addCoins) re-fire the subscriber while already DRIVING', () => {
    const store = new GameStore();
    const session = wireFakeDrivingSession(store);

    store.confirmBuild();
    store.addCoins(10);
    store.addCoins(5);

    expect(session.started).toBe(1);
  });
});

describe('main.ts dispose-branch farmer-snapshot ordering (ADR 0009 §2c/Risks) — pinned via the same fake-session shape #18 uses', () => {
  // main.ts's real subscriber can't be unit-tested directly (it imports
  // three.js/Rapier browser globals), same limitation as the #18 block
  // above. This mirrors main.ts's *exact* dispose-branch shape --
  // `pausedFarmerState = store.pausedMidRun ? driving.snapshotFarmer() : undefined; driving.dispose();`
  // -- against a fake driving session, so a regression that (a) captures
  // AFTER dispose, or (b) captures on a game-over exit too, trips a fast
  // unit test instead of only being catchable by the live farmer-continuity
  // smoke test (which fails *quietly*, per the ADR's own Risks section).
  function wireFakeDrivingSessionWithFarmer(store: GameStore) {
    let driving: { snapshotFarmer: () => string; dispose: () => void } | undefined;
    let pausedFarmerState: string | undefined;
    const callOrder: string[] = [];
    store.subscribe(() => {
      if (store.screen === 'DRIVING' && !driving && store.spec) {
        driving = {
          snapshotFarmer: () => {
            callOrder.push('snapshot');
            return 'LIVE_FARMER_SNAPSHOT';
          },
          dispose: () => callOrder.push('dispose'),
        };
      } else if (store.screen !== 'DRIVING' && driving) {
        // The exact ordering this ADR's Risks section calls out: capture
        // BEFORE dispose, and only when pausedMidRun.
        pausedFarmerState = store.pausedMidRun ? driving.snapshotFarmer() : undefined;
        driving.dispose();
        driving = undefined;
      }
    });
    return {
      get pausedFarmerState() {
        return pausedFarmerState;
      },
      get callOrder() {
        return callOrder;
      },
    };
  }

  it('captures the farmer snapshot BEFORE dispose on a voluntary pause exit', () => {
    const store = new GameStore();
    const session = wireFakeDrivingSessionWithFarmer(store);
    store.confirmBuild();
    store.pauseToBuilder();
    expect(session.pausedFarmerState).toBe('LIVE_FARMER_SNAPSHOT');
    expect(session.callOrder).toEqual(['snapshot', 'dispose']); // snapshot strictly precedes dispose
  });

  it('does NOT capture a farmer snapshot on a game-over exit (blob stays undefined so a fresh build gets a fresh farmer, per ADR 0009 §2c)', () => {
    const store = new GameStore();
    const session = wireFakeDrivingSessionWithFarmer(store);
    store.confirmBuild();
    store.bump();
    store.bump();
    store.bump(); // hits -> 0 -> gameOver(), NOT a pause
    expect(store.screen).toBe('GAME_OVER');
    expect(session.pausedFarmerState).toBeUndefined();
    expect(session.callOrder).toEqual(['dispose']); // no 'snapshot' entry at all
  });

  it('a pause followed by a resume-then-gameOver correctly drops the stale farmer blob on the second (game-over) exit', () => {
    const store = new GameStore();
    const session = wireFakeDrivingSessionWithFarmer(store);
    store.confirmBuild();
    store.pauseToBuilder(); // first exit: captures a snapshot
    expect(session.pausedFarmerState).toBe('LIVE_FARMER_SNAPSHOT');

    store.resumeDriving();
    store.bump();
    store.bump();
    store.bump(); // second exit: gameOver -- must clear the blob, not keep the stale pause snapshot
    expect(session.pausedFarmerState).toBeUndefined();
  });
});
