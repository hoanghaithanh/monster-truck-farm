import { describe, expect, it } from 'vitest';
import { initialSpawnTimerState, updateSpawnTimer } from './spawn-timer';

const INTERVAL = 4;
const MAX_CONCURRENT = 1;

describe('updateSpawnTimer — spawn cadence (animal AC1-AC2)', () => {
  it('does not spawn before the interval elapses', () => {
    const result = updateSpawnTimer(initialSpawnTimerState, 3, 0, MAX_CONCURRENT, INTERVAL);
    expect(result.shouldSpawn).toBe(false);
    expect(result.state.elapsed).toBe(3);
  });

  it('spawns exactly when elapsed time reaches the interval', () => {
    const result = updateSpawnTimer(initialSpawnTimerState, 4, 0, MAX_CONCURRENT, INTERVAL);
    expect(result.shouldSpawn).toBe(true);
    expect(result.state.elapsed).toBe(0);
  });

  it('spawns once elapsed time exceeds the interval and resets the accumulator', () => {
    const result = updateSpawnTimer(initialSpawnTimerState, 5, 0, MAX_CONCURRENT, INTERVAL);
    expect(result.shouldSpawn).toBe(true);
    expect(result.state.elapsed).toBe(0);
  });

  it('accumulates elapsed time across multiple ticks before triggering', () => {
    let state = initialSpawnTimerState;
    let result = updateSpawnTimer(state, 1.5, 0, MAX_CONCURRENT, INTERVAL);
    expect(result.shouldSpawn).toBe(false);
    state = result.state;
    result = updateSpawnTimer(state, 1.5, 0, MAX_CONCURRENT, INTERVAL);
    expect(result.shouldSpawn).toBe(false);
    expect(result.state.elapsed).toBeCloseTo(3);
    state = result.state;
    result = updateSpawnTimer(state, 1.5, 0, MAX_CONCURRENT, INTERVAL);
    expect(result.shouldSpawn).toBe(true);
  });

  it('holds the timer (no spawn) once the concurrent cap is reached — AC2', () => {
    const result = updateSpawnTimer({ elapsed: 3.9 }, 1, MAX_CONCURRENT, MAX_CONCURRENT, INTERVAL);
    expect(result.shouldSpawn).toBe(false);
    // State is held unchanged (not accumulated) while capped, so a slot freeing up spawns promptly.
    expect(result.state.elapsed).toBe(3.9);
  });

  it('does not spawn repeatedly while held at the cap across multiple ticks', () => {
    let state = { elapsed: 3.9 };
    for (let i = 0; i < 5; i++) {
      const result = updateSpawnTimer(state, 10, MAX_CONCURRENT, MAX_CONCURRENT, INTERVAL);
      expect(result.shouldSpawn).toBe(false);
      state = result.state;
    }
  });

  it('resumes counting and spawns promptly once a slot frees up below the cap', () => {
    const heldState = { elapsed: 3.9 };
    const result = updateSpawnTimer(heldState, 0.2, 0, MAX_CONCURRENT, INTERVAL);
    expect(result.shouldSpawn).toBe(true);
  });
});
