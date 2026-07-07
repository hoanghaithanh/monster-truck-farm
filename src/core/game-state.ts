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
