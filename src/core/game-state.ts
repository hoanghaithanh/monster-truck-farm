// Pure-TS seam per ADR 0001 §4/§6. Screen FSM + run state (coins, the
// player's builder selection, and the TruckSpec resolved from it) all live
// here so main.ts (and later the farmer/game-over pass) drive the whole run
// through one store rather than inventing a parallel mechanism.
import type { TruckBuild, TruckSpec } from './types';
import { DEFAULT_TRUCK_BUILD } from './stats/default-truck';
import { resolveSpec } from './stats/resolve-spec';
import { initialOwnership, purchasable, selectable, tierCost, type Ownership } from './stats/ownership';

export type Screen = 'BUILDER' | 'DRIVING' | 'GAME_OVER';

export function nextScreen(current: Screen, event: 'confirm' | 'gameOver' | 'restart' | 'pause' | 'resume'): Screen {
  if (current === 'BUILDER' && event === 'confirm') return 'DRIVING';
  if (current === 'DRIVING' && event === 'gameOver') return 'GAME_OVER';
  if (current === 'GAME_OVER' && event === 'restart') return 'BUILDER';
  if (current === 'DRIVING' && event === 'pause') return 'BUILDER';
  if (current === 'BUILDER' && event === 'resume') return 'DRIVING';
  return current;
}

type Listener = () => void;

/**
 * Pub/sub run state (ADR 0001 §6).
 *
 * `build` is the player's in-progress builder selection (issues #1-4);
 * `DEFAULT_TRUCK_BUILD` only seeds the builder's initial/preselected tiers —
 * once the player confirms, `confirmBuild()` resolves *their* selection into
 * `spec`, which is the one TruckSpec every gameplay system should read from
 * here on (ADR 0002). Coin-spend/tier-locking (Sprint 2, ADR 0006): tiers
 * must be owned (`_ownership`) before they can be equipped via `selectTier`;
 * `purchaseTier` spends coins to unlock (and auto-equip) the next tier in an
 * axis's sequential ladder.
 */
export class GameStore {
  private _coins = 0;
  private _screen: Screen = 'BUILDER';
  private _build: TruckBuild = { ...DEFAULT_TRUCK_BUILD };
  private _ownership: Ownership = { ...initialOwnership };
  private _spec: TruckSpec | undefined;
  private _hitsRemaining = 0;
  private _gas = 0;
  private _pausedMidRun = false;
  private _sessionActive = false;
  private listeners = new Set<Listener>();

  get coins(): number {
    return this._coins;
  }

  get screen(): Screen {
    return this._screen;
  }

  get build(): TruckBuild {
    return this._build;
  }

  /** Owned tier indices per axis (ADR 0006 §1) — tier 0 is pre-owned on every axis. */
  get ownership(): Ownership {
    return this._ownership;
  }

  /** The resolved TruckSpec for the current run — undefined until the builder is confirmed at least once. */
  get spec(): TruckSpec | undefined {
    return this._spec;
  }

  /** Remaining farmer-bump hits out of `spec.hitCapacity` (farmer AC3/AC4); 0 until a run starts. */
  get hitsRemaining(): number {
    return this._hitsRemaining;
  }

  /** Remaining gas out of `spec.gasCapacity` (drive AC10/AC12); 0 until a run starts. */
  get gas(): number {
    return this._gas;
  }

  /** True when the current BUILDER visit is a voluntary pause mid-run (ADR 0009), not a fresh build/post-game-over visit. Drives the builder UI's "Resume driving!" label and beginDrive()'s routing. */
  get pausedMidRun(): boolean {
    return this._pausedMidRun;
  }

  /**
   * True once a driving session (scene/physics/rAF loop) actually exists,
   * as opposed to `screen === 'DRIVING'` alone -- which flips synchronously
   * on `confirmBuild()`/`resumeDriving()`, up to `TRUCK_GATE_TIMEOUT_MS`
   * (ADR 0010 §4.3) before main.ts's truck-asset gate resolves and a session
   * is actually constructed. Set by main.ts, not derived from `screen`, so
   * DRIVING-only UI (HUD gas/hits bars, issue #32) can distinguish "on the
   * driving screen" from "there is something to render behind the loading
   * overlay."
   */
  get sessionActive(): boolean {
    return this._sessionActive;
  }

  /** See `sessionActive` — main.ts flips this exactly when it constructs/tears down a driving session. */
  setSessionActive(active: boolean): void {
    this._sessionActive = active;
    this.emit();
  }

  addCoins(amount: number): void {
    this._coins += amount;
    this.emit();
  }

  /** Sets the current gas gauge reading (drive AC10/AC12) — driven each frame by the gas system. */
  setGas(value: number): void {
    this._gas = value;
    this.emit();
  }

  /**
   * Resolves a farmer contact into a hit (farmer AC3): drains one hit from
   * the truck's remaining capacity. When that hit brings capacity to 0, ends
   * the run via `gameOver()` (farmer AC6) — hit accounting and the fail-state
   * trigger are both a pure GameStore/core concern (ADR 0003). The i-frame
   * cooldown that prevents multiple bumps per contact lives in the farmer
   * system (core/farmer/invuln.ts), not here.
   */
  bump(): void {
    if (this._screen !== 'DRIVING' || this._hitsRemaining <= 0) return;
    this._hitsRemaining -= 1;
    this.emit();
    if (this._hitsRemaining <= 0) {
      this.gameOver();
    }
  }

  /**
   * Sets one axis's selected tier index (builder AC1-AC6) — gated (ADR 0006
   * §1/§5): a tier can only be equipped if it's already owned. A no-op
   * (silent, no emit) when the requested tier isn't owned.
   */
  selectTier(axis: keyof TruckBuild, tierIndex: number): void {
    if (!selectable(this._ownership, axis, tierIndex)) return;
    this._build = { ...this._build, [axis]: tierIndex };
    this.emit();
  }

  /**
   * Spends coins to unlock (and immediately equip) the next tier in an
   * axis's sequential ladder (backlog #14, ADR 0006 §3). Requires the
   * preceding tier already owned and enough coins for `tierIndex`'s cost;
   * a no-op (returns false, no emit) otherwise. On success, deducts the
   * cost, adds the tier to ownership, and sets it as the equipped tier on
   * that axis in one action ("buy-equips").
   */
  purchaseTier(axis: keyof TruckBuild, tierIndex: number): boolean {
    const cost = tierCost(axis, tierIndex);
    if (!purchasable(this._ownership, axis, tierIndex, this._coins, cost)) return false;
    this._coins -= cost;
    this._ownership = { ...this._ownership, [axis]: [...this._ownership[axis], tierIndex] };
    this._build = { ...this._build, [axis]: tierIndex };
    // Body-upgrade paid heal (ADR 0009 §3b, human decision 4): buying a new
    // body tier heals hits to that tier's full capacity. Heal-on-*purchase*
    // only (not selectTier) so re-equipping an already-owned body can't be
    // used to dodge a near-death bump for free — the coin cost is the gate.
    // Unconditional (no pausedMidRun check): on a fresh build this is a
    // harmless no-op-in-effect, since confirmBuild() reseeds hits anyway and
    // the HUD hides hits off-DRIVING; on a pause it's the intended heal.
    if (axis === 'body') this._hitsRemaining = resolveSpec(this._build).hitCapacity;
    this.emit();
    return true;
  }

  /** Resolves the current selection into a TruckSpec and moves BUILDER -> DRIVING (builder AC1). */
  confirmBuild(): void {
    this._spec = resolveSpec(this._build);
    // Fresh run state: full hits and a full tank for the newly resolved spec
    // (farmer AC3/AC6, drive AC10) — matters on a restart round trip just as
    // much as the first run, since a prior run may have drained both to 0.
    this._hitsRemaining = this._spec.hitCapacity;
    this._gas = this._spec.gasCapacity;
    this._pausedMidRun = false;
    this._screen = nextScreen(this._screen, 'confirm');
    this.emit();
  }

  gameOver(): void {
    this._screen = nextScreen(this._screen, 'gameOver');
    this.emit();
  }

  /**
   * Returns to the builder after a hard game over; coins reset, prior
   * selection (builder AC7) and tier ownership (ADR 0006 §4, human-confirmed)
   * are both kept — progression survives a game-over within the session,
   * only the run's coin balance does not.
   */
  restart(): void {
    this._screen = nextScreen(this._screen, 'restart');
    this._coins = 0;
    this._pausedMidRun = false;
    this.emit();
  }

  /**
   * Voluntary DRIVING -> BUILDER exit (ADR 0009 §1, human decision 1-2): a
   * mid-run trip to the shop, not a game-over. Deliberately touches ONLY the
   * screen + `_pausedMidRun` flag — coins, ownership, build, hits, and gas
   * are all preserved *by omission*, not by anything this method does. Kept
   * as its own method (not an overload of `gameOver()`, which routes through
   * `restart()`'s coin wipe) so "never zero coins voluntarily" is a
   * structural guarantee, not a conditional.
   */
  pauseToBuilder(): void {
    this._screen = nextScreen(this._screen, 'pause');
    this._pausedMidRun = true;
    this.emit();
  }

  /**
   * Resumes a paused run: BUILDER -> DRIVING, re-resolving `spec` from the
   * (possibly shopped) build. Gas/hits are PRESERVED, not reseeded to full —
   * absolute remaining, clamped to the new spec's capacity in case a lower
   * tier was equipped while paused (ADR 0009 §3a/§3b). The farmer carry
   * itself lives outside the store entirely (ADR 0009 §2c) — main.ts seeds
   * the fresh FarmerSystem from its own module-scoped snapshot; this method
   * has nothing to do for the farmer.
   */
  resumeDriving(): void {
    this._spec = resolveSpec(this._build);
    this._gas = Math.min(this._gas, this._spec.gasCapacity);
    this._hitsRemaining = Math.min(this._hitsRemaining, this._spec.hitCapacity);
    this._pausedMidRun = false;
    this._screen = nextScreen(this._screen, 'resume');
    this.emit();
  }

  /**
   * Builder start-button dispatcher (ADR 0009 §6): routes to `resumeDriving`
   * when the current BUILDER visit is a pause, else `confirmBuild` for a
   * fresh build/post-game-over visit. Keeps `builder.ts` a dumb view (ADR
   * 0001 §3) that doesn't itself know which case it's in.
   */
  beginDrive(): void {
    if (this._pausedMidRun) {
      this.resumeDriving();
    } else {
      this.confirmBuild();
    }
  }

  reset(): void {
    this._coins = 0;
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
