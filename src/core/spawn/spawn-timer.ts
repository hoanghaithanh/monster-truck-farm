// Spawn-interval accumulator (animal AC1-AC2). Fixed-dt friendly: feed a
// known dt, assert the result, per ADR 0001 §8 testing approach.
export interface SpawnTimerState {
  elapsed: number;
}

export const initialSpawnTimerState: SpawnTimerState = { elapsed: 0 };

export interface SpawnTimerResult {
  state: SpawnTimerState;
  shouldSpawn: boolean;
}

export function updateSpawnTimer(
  state: SpawnTimerState,
  dt: number,
  activeAnimalCount: number,
  maxConcurrent: number,
  intervalSeconds: number,
): SpawnTimerResult {
  if (activeAnimalCount >= maxConcurrent) {
    // At cap: hold the timer so a spawn fires promptly once a slot frees up,
    // rather than firing repeatedly while capped (animal AC2).
    return { state, shouldSpawn: false };
  }

  const elapsed = state.elapsed + dt;
  if (elapsed >= intervalSeconds) {
    return { state: { elapsed: 0 }, shouldSpawn: true };
  }
  return { state: { elapsed }, shouldSpawn: false };
}
