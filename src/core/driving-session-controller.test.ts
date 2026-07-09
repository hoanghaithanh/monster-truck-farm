import { describe, expect, it, vi } from 'vitest';
import { GameStore } from './game-state';
import { createDrivingSessionController, type DrivingSession } from './driving-session-controller';

// Mirrors the `deferred()` helper in asset-registry.test.ts: lets a test
// control exactly when the (fake) truck-asset gate resolves, so the
// "reshop while the gate is still pending" race (issue #31) can be driven
// deterministically instead of racing real timers/network.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function fakeSession(): DrivingSession<string> {
  return {
    snapshotFarmer: () => 'farmer-snapshot',
    dispose: vi.fn(),
  };
}

// Buys tier 1 on `axis`, which changes the resolved TruckSpec (mirrors the
// `buyUpTo` helper in game-state.test.ts) -- used to simulate the player
// re-shopping mid-pause.
function buyTier1(store: GameStore, axis: 'engine' | 'wheels' | 'gasTank' | 'body'): void {
  store.addCoins(1000);
  const bought = store.purchaseTier(axis, 1);
  if (!bought) throw new Error('test helper: purchaseTier unexpectedly failed');
}

describe('createDrivingSessionController (issue #31: stale spec/gas/farmer after a mid-gate reshop)', () => {
  it('builds the session from the store state at gate-resolve time, not at gate-start time', async () => {
    const store = new GameStore();
    const gate = deferred<void>();
    const startSession = vi.fn((_spec, _gas, _farmerSeed) => fakeSession());

    createDrivingSessionController<string>({
      store,
      waitForGate: () => gate.promise,
      onGateStart: () => {},
      onGateEnd: () => {},
      onSessionActiveChange: () => {},
      startSession,
    });

    store.confirmBuild(); // BUILDER -> DRIVING, gate starts, still pending
    const specAtGateStart = store.spec;
    expect(startSession).not.toHaveBeenCalled(); // still gated

    // Reshop-during-gate repro from issue #31: pause to the builder while
    // the original gate is still in flight (the "Shop" button is reachable
    // here in the real UI because the loading overlay is pointer-events:
    // none), change the build, and resume before the gate resolves.
    store.pauseToBuilder(); // DRIVING -> BUILDER; no session exists yet, so nothing to tear down
    buyTier1(store, 'engine'); // changes the build, and therefore the resolved spec
    store.resumeDriving(); // BUILDER -> DRIVING again, re-resolves spec from the new build
    const specAfterReshop = store.spec;
    expect(specAfterReshop).not.toEqual(specAtGateStart); // the reshop actually changed the spec

    // The #21 re-entrancy guard should have blocked a second concurrent
    // beginDrivingSession() call for that resume -- still nothing built yet.
    expect(startSession).not.toHaveBeenCalled();

    // Now let the original, still-pending gate resolve.
    gate.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Exactly one session was built (issue #21 protection preserved)...
    expect(startSession).toHaveBeenCalledTimes(1);
    // ...and it was built with the RESHOPPED spec, not the stale
    // pre-pause one captured before the gate started (issue #31 fix).
    const [builtSpec] = startSession.mock.calls[0];
    expect(builtSpec).toEqual(specAfterReshop);
    expect(builtSpec).not.toEqual(specAtGateStart);
  });

  it('does not build a session if the player leaves DRIVING again before the gate resolves and never returns', async () => {
    const store = new GameStore();
    const gate = deferred<void>();
    const startSession = vi.fn(() => fakeSession());

    createDrivingSessionController<string>({
      store,
      waitForGate: () => gate.promise,
      onGateStart: () => {},
      onGateEnd: () => {},
      onSessionActiveChange: () => {},
      startSession,
    });

    store.confirmBuild();
    store.pauseToBuilder(); // leaves DRIVING while the gate is pending, and stays away

    gate.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(startSession).not.toHaveBeenCalled();
  });

  it('reports session-active transitions for HUD gating (issue #32)', async () => {
    const store = new GameStore();
    const gate = deferred<void>();
    const session = fakeSession();
    const startSession = vi.fn(() => session);
    const onSessionActiveChange = vi.fn();

    createDrivingSessionController<string>({
      store,
      waitForGate: () => gate.promise,
      onGateStart: () => {},
      onGateEnd: () => {},
      onSessionActiveChange,
      startSession,
    });

    store.confirmBuild();
    expect(onSessionActiveChange).not.toHaveBeenCalled(); // no session yet -- still gated

    gate.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onSessionActiveChange).toHaveBeenLastCalledWith(true);

    store.gameOver(); // DRIVING -> GAME_OVER, session torn down
    expect(onSessionActiveChange).toHaveBeenLastCalledWith(false);
  });

  it('calls the gate start/end hooks once per attempt, bracketing the wait', async () => {
    const store = new GameStore();
    const gate = deferred<void>();
    const onGateStart = vi.fn();
    const onGateEnd = vi.fn();

    createDrivingSessionController<string>({
      store,
      waitForGate: () => gate.promise,
      onGateStart,
      onGateEnd,
      onSessionActiveChange: () => {},
      startSession: () => fakeSession(),
    });

    store.confirmBuild();
    expect(onGateStart).toHaveBeenCalledTimes(1);
    expect(onGateEnd).not.toHaveBeenCalled();

    gate.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onGateEnd).toHaveBeenCalledTimes(1);
  });
});
