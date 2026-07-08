// Pure-TS seam per ADR 0001 §4/§6. Screen FSM + run state (coins, the
// player's builder selection, and the TruckSpec resolved from it) all live
// here so main.ts (and later the farmer/game-over pass) drive the whole run
// through one store rather than inventing a parallel mechanism.
import type { TruckBuild, TruckSpec } from './types';
import { DEFAULT_TRUCK_BUILD } from './stats/default-truck';
import { resolveSpec } from './stats/resolve-spec';

export type Screen = 'BUILDER' | 'DRIVING' | 'GAME_OVER';

export function nextScreen(current: Screen, event: 'confirm' | 'gameOver' | 'restart'): Screen {
  if (current === 'BUILDER' && event === 'confirm') return 'DRIVING';
  if (current === 'DRIVING' && event === 'gameOver') return 'GAME_OVER';
  if (current === 'GAME_OVER' && event === 'restart') return 'BUILDER';
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
 * here on (ADR 0002). Coin-spend/tier-locking (Sprint 2) is not modeled yet
 * — every tier is freely selectable this sprint (builder AC6).
 */
export class GameStore {
  private _coins = 0;
  private _screen: Screen = 'BUILDER';
  private _build: TruckBuild = { ...DEFAULT_TRUCK_BUILD };
  private _spec: TruckSpec | undefined;
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

  /** The resolved TruckSpec for the current run — undefined until the builder is confirmed at least once. */
  get spec(): TruckSpec | undefined {
    return this._spec;
  }

  addCoins(amount: number): void {
    this._coins += amount;
    this.emit();
  }

  /** Sets one axis's selected tier index (builder AC1-AC6). All tiers are freely selectable this sprint. */
  selectTier(axis: keyof TruckBuild, tierIndex: number): void {
    this._build = { ...this._build, [axis]: tierIndex };
    this.emit();
  }

  /** Resolves the current selection into a TruckSpec and moves BUILDER -> DRIVING (builder AC1). */
  confirmBuild(): void {
    this._spec = resolveSpec(this._build);
    this._screen = nextScreen(this._screen, 'confirm');
    this.emit();
  }

  gameOver(): void {
    this._screen = nextScreen(this._screen, 'gameOver');
    this.emit();
  }

  /** Returns to the builder after a hard game over; coins reset, prior selection is kept (builder AC7). */
  restart(): void {
    this._screen = nextScreen(this._screen, 'restart');
    this._coins = 0;
    this.emit();
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
