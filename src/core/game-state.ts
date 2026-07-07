// Minimal pure-TS seam so the project has one thing in core/ to unit test
// from day one, per ADR 0001 §4/§6. Real GameStore/screen FSM content is
// filled in as Sprint 1 stories are implemented.

export type Screen = 'BUILDER' | 'DRIVING' | 'GAME_OVER';

export function nextScreen(current: Screen, event: 'confirm' | 'gameOver' | 'restart'): Screen {
  if (current === 'BUILDER' && event === 'confirm') return 'DRIVING';
  if (current === 'DRIVING' && event === 'gameOver') return 'GAME_OVER';
  if (current === 'GAME_OVER' && event === 'restart') return 'BUILDER';
  return current;
}

type Listener = () => void;

/**
 * Pub/sub run state (ADR 0001 §6). This pass only needs the coin total
 * (animal AC6: coins surfaced immediately in the DOM HUD); hits-remaining,
 * gas level, and the built TruckSpec are added by later passes as those
 * systems land.
 */
export class GameStore {
  private _coins = 0;
  private listeners = new Set<Listener>();

  get coins(): number {
    return this._coins;
  }

  addCoins(amount: number): void {
    this._coins += amount;
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
