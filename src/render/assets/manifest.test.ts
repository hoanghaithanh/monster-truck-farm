import { describe, expect, it } from 'vitest';
import {
  ASSET_MANIFEST,
  bodyAssetKey,
  CHICKEN_ASSET_KEY,
  engineCueAssetKey,
  gasCueAssetKey,
  truckAssetKeysForBuild,
  wheelAssetKey,
} from './manifest';

describe('truck asset key helpers (ADR 0011 §1/§4)', () => {
  it('bodyAssetKey/wheelAssetKey/engineCueAssetKey/gasCueAssetKey resolve every tier index 0-2 to a real manifest entry', () => {
    for (let tier = 0; tier <= 2; tier++) {
      expect(ASSET_MANIFEST[bodyAssetKey(tier)]).toBeDefined();
      expect(ASSET_MANIFEST[wheelAssetKey(tier)]).toBeDefined();
      expect(ASSET_MANIFEST[engineCueAssetKey(tier)]).toBeDefined();
      expect(ASSET_MANIFEST[gasCueAssetKey(tier)]).toBeDefined();
    }
  });
});

describe('truckAssetKeysForBuild (ADR 0010 §4.3 gate list, ADR 0011 pass replacing the PASS-1 static list)', () => {
  it('returns exactly the four geometry keys for a given build', () => {
    const keys = truckAssetKeysForBuild({ body: 1, wheels: 2, engine: 0, gasTank: 1 });
    expect(keys).toEqual(['body-tier-1', 'wheel-tier-2', 'engine-cue-tier-0', 'gas-cue-tier-1']);
  });

  it('is independent of cosmetics -- only reads the four functional tier axes', () => {
    const keys = truckAssetKeysForBuild({ body: 0, wheels: 0, engine: 0, gasTank: 0 });
    expect(keys).toHaveLength(4);
  });

  it('every key it returns exists in the manifest', () => {
    const keys = truckAssetKeysForBuild({ body: 2, wheels: 1, engine: 2, gasTank: 0 });
    for (const key of keys) {
      expect(ASSET_MANIFEST[key]).toBeDefined();
    }
  });

  it('never includes the chicken asset key -- the chicken is not one of the player\'s own truck parts (ADR 0010 §4.4), so it must never gate the DRIVING-start wait', () => {
    const keys = truckAssetKeysForBuild({ body: 1, wheels: 1, engine: 1, gasTank: 1 });
    expect(keys).not.toContain(CHICKEN_ASSET_KEY);
  });
});

describe('chicken asset entry (issue #28)', () => {
  it('is registered in the manifest with a real URL and a positive measured gzip size', () => {
    const entry = ASSET_MANIFEST[CHICKEN_ASSET_KEY];
    expect(entry).toBeDefined();
    expect(entry.url).toBeInstanceOf(URL);
    expect(entry.approxGzipBytes).toBeGreaterThan(0);
  });
});
