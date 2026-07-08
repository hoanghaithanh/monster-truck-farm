// Post-bump invulnerability window (ADR 0003 "Contact cooldown", resolves
// farmer Open Q1): a bump starts a short cooldown on the truck's hit state
// during which further farmer contacts are ignored, so one unlucky
// stand-next-to-the-farmer moment can't drain several hits at once.
export interface InvulnState {
  remainingSeconds: number;
}

export const initialInvulnState: InvulnState = { remainingSeconds: 0 };

export function tickInvuln(state: InvulnState, dt: number): InvulnState {
  return { remainingSeconds: Math.max(0, state.remainingSeconds - dt) };
}

export function isInvulnerable(state: InvulnState): boolean {
  return state.remainingSeconds > 0;
}

export function startInvuln(durationSeconds: number): InvulnState {
  return { remainingSeconds: durationSeconds };
}
