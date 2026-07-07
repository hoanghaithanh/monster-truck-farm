// Coin award formula (animal AC7-AC8): data-driven multiplier tables, not a
// hardcoded per-species value, so it stays tunable without touching this
// logic. Exact numbers are placeholders pending playtest (animal Open Q2).
import type { SizeTier, SpeedTier } from '../types';

const BASE_COIN_VALUE = 5;

const SIZE_MULTIPLIER: Record<SizeTier, number> = {
  small: 1,
  medium: 2,
  large: 3,
};

const SPEED_MULTIPLIER: Record<SpeedTier, number> = {
  slow: 1,
  medium: 2,
  fast: 3,
};

/** Strictly increasing in both size and speed tier (animal AC7). */
export function computeCoins(sizeTier: SizeTier, speedTier: SpeedTier): number {
  return BASE_COIN_VALUE * SIZE_MULTIPLIER[sizeTier] * SPEED_MULTIPLIER[speedTier];
}
