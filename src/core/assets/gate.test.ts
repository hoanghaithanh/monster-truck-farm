import { describe, expect, it } from 'vitest';
import { shouldUsePrimitiveFallback, truckGateShouldProceed } from './gate';

describe('shouldUsePrimitiveFallback (ADR 0010 §4/§7)', () => {
  it('stays on the primitive while pending', () => {
    expect(shouldUsePrimitiveFallback('pending')).toBe(true);
  });

  it('stays on the primitive on failure', () => {
    expect(shouldUsePrimitiveFallback('failed')).toBe(true);
  });

  it('switches to the real model only once ready', () => {
    expect(shouldUsePrimitiveFallback('ready')).toBe(false);
  });
});

describe('truckGateShouldProceed (ADR 0010 §4.3, the bounded 3s gate)', () => {
  it('does not proceed before the timeout while assets are still pending', () => {
    expect(truckGateShouldProceed(500, 3000, false)).toBe(false);
  });

  it('proceeds immediately once every required asset has settled, well before the timeout', () => {
    expect(truckGateShouldProceed(100, 3000, true)).toBe(true);
  });

  it('proceeds once the timeout elapses even if assets are still pending', () => {
    expect(truckGateShouldProceed(3000, 3000, false)).toBe(true);
    expect(truckGateShouldProceed(5000, 3000, false)).toBe(true);
  });

  it('proceeds at the exact timeout boundary (inclusive)', () => {
    expect(truckGateShouldProceed(2999, 3000, false)).toBe(false);
    expect(truckGateShouldProceed(3000, 3000, false)).toBe(true);
  });
});
