import { describe, expect, it } from 'vitest';
import { nextScreen } from './game-state';

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
