import { describe, expect, it } from 'vitest';
import { computeCoins } from './coin-formula';
import type { SizeTier, SpeedTier } from '../types';

// Coin award formula (animal AC7-AC8): pure, data-driven, exhaustively
// verifiable — base=5, size multiplier {small:1,medium:2,large:3}, speed
// multiplier {slow:1,medium:2,fast:3}.
const EXPECTED: Record<SizeTier, Record<SpeedTier, number>> = {
  small: { slow: 5, medium: 10, fast: 15 },
  medium: { slow: 10, medium: 20, fast: 30 },
  large: { slow: 15, medium: 30, fast: 45 },
};

describe('computeCoins', () => {
  const sizeTiers: SizeTier[] = ['small', 'medium', 'large'];
  const speedTiers: SpeedTier[] = ['slow', 'medium', 'fast'];

  for (const size of sizeTiers) {
    for (const speed of speedTiers) {
      it(`awards ${EXPECTED[size][speed]} coins for size=${size}, speed=${speed}`, () => {
        expect(computeCoins(size, speed)).toBe(EXPECTED[size][speed]);
      });
    }
  }

  it('is strictly increasing with size tier, all else equal (AC7)', () => {
    expect(computeCoins('medium', 'slow')).toBeGreaterThan(computeCoins('small', 'slow'));
    expect(computeCoins('large', 'slow')).toBeGreaterThan(computeCoins('medium', 'slow'));
  });

  it('is strictly increasing with speed tier, all else equal (AC7)', () => {
    expect(computeCoins('small', 'medium')).toBeGreaterThan(computeCoins('small', 'slow'));
    expect(computeCoins('small', 'fast')).toBeGreaterThan(computeCoins('small', 'medium'));
  });
});
