import { describe, expect, it } from 'vitest';
import { GameStore, nextScreen } from './game-state';
import { DEFAULT_TRUCK_BUILD } from './stats/default-truck';
import { BODY_TIERS, ENGINE_TIERS, GAS_TIERS, WHEEL_TIERS } from './stats/tiers';

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

describe('GameStore.selectTier (builder AC1-AC6)', () => {
  it('starts with the default build seeded from DEFAULT_TRUCK_BUILD', () => {
    const store = new GameStore();
    expect(store.build).toEqual(DEFAULT_TRUCK_BUILD);
  });

  it('sets the body axis independently of other axes', () => {
    const store = new GameStore();
    store.selectTier('body', 2);
    expect(store.build).toEqual({ ...DEFAULT_TRUCK_BUILD, body: 2 });
  });

  it('sets the wheels axis independently of other axes', () => {
    const store = new GameStore();
    store.selectTier('wheels', 2);
    expect(store.build).toEqual({ ...DEFAULT_TRUCK_BUILD, wheels: 2 });
  });

  it('sets the engine axis independently of other axes', () => {
    const store = new GameStore();
    store.selectTier('engine', 2);
    expect(store.build).toEqual({ ...DEFAULT_TRUCK_BUILD, engine: 2 });
  });

  it('sets the gasTank axis independently of other axes', () => {
    const store = new GameStore();
    store.selectTier('gasTank', 2);
    expect(store.build).toEqual({ ...DEFAULT_TRUCK_BUILD, gasTank: 2 });
  });

  it('accepts the lowest valid tier index (0) on every axis', () => {
    const store = new GameStore();
    store.selectTier('body', 2); // move off default first
    store.selectTier('body', 0);
    expect(store.build.body).toBe(0);
  });

  it('accepts the highest valid tier index on every axis', () => {
    const store = new GameStore();
    store.selectTier('body', BODY_TIERS.length - 1);
    store.selectTier('wheels', WHEEL_TIERS.length - 1);
    store.selectTier('engine', ENGINE_TIERS.length - 1);
    store.selectTier('gasTank', GAS_TIERS.length - 1);
    expect(store.build).toEqual({
      body: BODY_TIERS.length - 1,
      wheels: WHEEL_TIERS.length - 1,
      engine: ENGINE_TIERS.length - 1,
      gasTank: GAS_TIERS.length - 1,
    });
  });

  it('does not itself clamp/reject an out-of-range tier index (selection is unchecked; confirmBuild is where it surfaces)', () => {
    // Documents actual current behavior rather than assuming validation
    // exists in selectTier: there is no bounds check here, so an
    // out-of-range index is stored as-is. resolveSpec() (exercised via
    // confirmBuild below) is what ultimately rejects it.
    const store = new GameStore();
    store.selectTier('wheels', 99);
    expect(store.build.wheels).toBe(99);
  });

  it('notifies subscribers on selectTier', () => {
    const store = new GameStore();
    let calls = 0;
    store.subscribe(() => calls++);
    store.selectTier('body', 1);
    expect(calls).toBe(1);
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

  it('resolves a non-default selection (highest wheel tier) into a TruckSpec carrying that tier\'s clearance, not the default', () => {
    const store = new GameStore();
    store.selectTier('wheels', 2); // Monster wheels -> 'large'
    store.confirmBuild();
    expect(store.spec?.clearance).toBe('large');
    expect(store.spec?.clearance).not.toBe(WHEEL_TIERS[DEFAULT_TRUCK_BUILD.wheels].clearance);
  });

  it('resolves a non-default selection across all four axes into the matching stat values', () => {
    const store = new GameStore();
    store.selectTier('body', 2);
    store.selectTier('wheels', 2);
    store.selectTier('engine', 2);
    store.selectTier('gasTank', 2);
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

  it('throws (does not silently produce a bogus spec) when an out-of-range tier index was selected', () => {
    const store = new GameStore();
    store.selectTier('wheels', 99);
    expect(() => store.confirmBuild()).toThrow();
  });

  it('leaves spec undefined until confirmBuild has been called at least once', () => {
    const store = new GameStore();
    expect(store.spec).toBeUndefined();
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

describe('GameStore.restart (builder AC7)', () => {
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
    store.selectTier('wheels', 2);
    store.confirmBuild();
    store.gameOver();
    store.restart();
    expect(store.build.wheels).toBe(2);
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
