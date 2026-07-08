// Random spawn delay selection (farmer AC1), matching spawn/spawn-position.ts's
// injected-Rng pattern so it stays deterministically testable without mocking Math.random.
import type { Rng } from '../spawn/spawn-position';

export function pickSpawnDelay(minSeconds: number, maxSeconds: number, rng: Rng): number {
  return minSeconds + rng() * (maxSeconds - minSeconds);
}
