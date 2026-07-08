import { describe, expect, it } from 'vitest';
import { GameStore, nextScreen } from './game-state';
import { DEFAULT_TRUCK_BUILD } from './stats/default-truck';
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

describe('GameStore.purchaseTier (backlog #14, ADR 0006 §3)', () => {
  it('is blocked (returns false, no-op) when the player cannot afford the tier', () => {
    const store = new GameStore();
    const bought = store.purchaseTier('body', 1);
    expect(bought).toBe(false);
    expect(store.ownership.body).toEqual([0]);
    expect(store.build.body).toBe(0);
    expect(store.coins).toBe(0);
  });

  it('is blocked when the preceding tier is not yet owned (sequential unlock)', () => {
    const store = new GameStore();
    store.addCoins(10_000);
    const bought = store.purchaseTier('body', 2); // tier 1 not owned yet
    expect(bought).toBe(false);
    expect(store.ownership.body).toEqual([0]);
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

  it('is a no-op if the tier is already owned (cannot re-buy)', () => {
    const store = new GameStore();
    store.addCoins(10_000);
    store.purchaseTier('body', 1);
    const coinsAfterFirstBuy = store.coins;
    const bought = store.purchaseTier('body', 1);
    expect(bought).toBe(false);
    expect(store.coins).toBe(coinsAfterFirstBuy);
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
