import { describe, expect, it } from 'vitest';
import { DEFAULT_DRIVING_CONFIG } from './config';

// Sanity checks on the tunable driving constants: braking should feel firmer
// than plain coasting friction, and every rate must be positive (a zero or
// negative rate here would silently break AC2's "smooth accel/decel" feel).
describe('DEFAULT_DRIVING_CONFIG', () => {
  it('all rates are positive', () => {
    expect(DEFAULT_DRIVING_CONFIG.acceleration).toBeGreaterThan(0);
    expect(DEFAULT_DRIVING_CONFIG.braking).toBeGreaterThan(0);
    expect(DEFAULT_DRIVING_CONFIG.friction).toBeGreaterThan(0);
    expect(DEFAULT_DRIVING_CONFIG.turnRate).toBeGreaterThan(0);
  });

  it('braking decelerates at least as fast as coasting friction', () => {
    expect(DEFAULT_DRIVING_CONFIG.braking).toBeGreaterThanOrEqual(DEFAULT_DRIVING_CONFIG.friction);
  });

  it('reverseSpeedFactor is a fraction between 0 (exclusive) and 1 (inclusive)', () => {
    expect(DEFAULT_DRIVING_CONFIG.reverseSpeedFactor).toBeGreaterThan(0);
    expect(DEFAULT_DRIVING_CONFIG.reverseSpeedFactor).toBeLessThanOrEqual(1);
  });
});
