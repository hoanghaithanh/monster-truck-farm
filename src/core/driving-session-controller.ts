// Pure-ish orchestration seam (ADR 0001 §4/§6, extracted from main.ts by
// issue #31): owns the BUILDER<->DRIVING driving-session lifecycle guard --
// starts a session exactly once per BUILDER->DRIVING transition, tears it
// down exactly once per the matching DRIVING->BUILDER/GAME_OVER transition,
// and (unlike main.ts's original inline version) re-reads GameStore state
// only AFTER the truck-asset gate settles, never before it. Pulled out of
// main.ts specifically so this state machine -- which has a history of
// subtle bugs (#18 stale-session-on-restart, #21 re-entrant recursion, #31
// stale-spec-after-gate) -- can be driven by a real GameStore and a
// manually-controlled fake gate in a vitest test, without needing DOM,
// Rapier, or three.js.
import type { GameStore } from './game-state';
import type { TruckSpec } from './types';

export interface DrivingSession<TFarmerSeed> {
  /** Captures the live session's farmer state (ADR 0009 §2c) -- must be called before dispose(). */
  snapshotFarmer(): TFarmerSeed;
  dispose(): void;
}

export interface DrivingSessionControllerOptions<TFarmerSeed> {
  store: GameStore;
  /**
   * Resolves once the truck-asset gate (ADR 0010 §4.3) has settled -- either
   * every required asset is ready, or the bounded timeout elapsed, whichever
   * comes first. This controller doesn't know or care which; it only cares
   * that this always resolves (never rejects) in bounded time.
   */
  waitForGate: () => Promise<void>;
  onGateStart: () => void;
  onGateEnd: () => void;
  /** Reflects session existence outward (issue #32: HUD gas/hits bars gate on this, not `screen` alone). */
  onSessionActiveChange: (active: boolean) => void;
  startSession: (spec: TruckSpec, gas: number, farmerSeed: TFarmerSeed | undefined) => DrivingSession<TFarmerSeed>;
}

/**
 * Wires the guarded BUILDER<->DRIVING lifecycle described above onto a
 * GameStore subscription. Returns a handle whose `dispose()` unsubscribes
 * and tears down any live session -- mirrors main.ts's old `unload` cleanup.
 */
export function createDrivingSessionController<TFarmerSeed>(
  options: DrivingSessionControllerOptions<TFarmerSeed>,
): { dispose(): void } {
  const { store, waitForGate, onGateStart, onGateEnd, onSessionActiveChange, startSession } = options;

  // A driving session is started fresh on every BUILDER -> DRIVING
  // transition and torn down on the matching DRIVING -> GAME_OVER/BUILDER
  // transition, so a restart rebuilds against a possibly-new TruckSpec
  // instead of silently continuing the stale session (issue #18). The
  // `!driving` / `driving` guards make each branch fire exactly once per
  // transition, not on every store mutation that re-fires this subscriber
  // while already mid-session.
  let driving: DrivingSession<TFarmerSeed> | undefined;
  // Guards against *re-entrant* `store.emit()` calls firing synchronously
  // while this very listener is still on the call stack constructing a
  // session (issue #21's root cause) -- and, spanning the async gate below,
  // against a second concurrent `beginDrivingSession()` call firing for a
  // mid-gate resume (issue #31). Set synchronously before the first
  // `await`, so nothing -- sync re-entrancy or an async resume -- can pass
  // this guard while a gate is still in flight.
  let startingDriving = false;
  // Farmer state-carry across a voluntary pause (ADR 0009 §2c): captured
  // (pause) / consumed (resume) below. Held here, not on GameStore, per the
  // same reasoning as the original main.ts comment -- its lifecycle is
  // bound to this controller's own session dispose/recreate, not the store.
  let pausedFarmerState: TFarmerSeed | undefined;

  const beginDrivingSession = async () => {
    onGateStart();
    await waitForGate();
    onGateEnd();

    // The player may have left DRIVING again (e.g. an immediate pause)
    // while the gate was pending -- don't construct a session for a screen
    // we're no longer on; the dispose branch below already ran (or will
    // run) for that transition and expects `driving` to still be undefined
    // here. `store.spec` is re-checked too, defensively, even though
    // `screen === 'DRIVING'` should always imply a resolved spec.
    if (store.screen !== 'DRIVING' || !store.spec) {
      startingDriving = false;
      return;
    }

    // Issue #31 fix: read current state now, AFTER the gate resolved, not
    // at the moment this whole gate started. If the player paused to the
    // builder, re-shopped, and resumed entirely during the `await` above,
    // `store.spec`/`store.gas` here already reflect that new build --
    // there is no other await between the screen/spec check above and
    // these reads for a concurrent mutation to land in (JS is
    // single-threaded), so this snapshot is consistent.
    const spec = store.spec;
    const gas = store.gas;
    const farmerSeed = pausedFarmerState;
    pausedFarmerState = undefined; // consumed

    driving = startSession(spec, gas, farmerSeed);
    onSessionActiveChange(true);
    startingDriving = false;
  };

  const unsubscribe = store.subscribe(() => {
    if (store.screen === 'DRIVING' && !driving && !startingDriving && store.spec) {
      startingDriving = true;
      void beginDrivingSession();
    } else if (store.screen !== 'DRIVING' && driving) {
      // Ordering requirement (ADR 0009 §2c): the farmer snapshot MUST be
      // captured before dispose() tears the FarmerSystem down, and only on
      // the *pause* exit (store.pausedMidRun), not a game-over -- on
      // game-over the blob stays undefined so a fresh build gets a fresh
      // farmer, matching #18's dispose-ordering fix precisely.
      pausedFarmerState = store.pausedMidRun ? driving.snapshotFarmer() : undefined;
      driving.dispose();
      driving = undefined;
      onSessionActiveChange(false);
    }
  });

  return {
    dispose() {
      unsubscribe();
      driving?.dispose();
    },
  };
}
