import { describe, expect, it } from 'vitest';
import {
  ANIMAL_ASSET_KEYS,
  ASSET_MANIFEST,
  bodyAssetKey,
  CHICKEN_ASSET_KEY,
  engineCueAssetKey,
  FARMER_ASSET_KEY,
  FENCE_ASSET_KEY,
  gasCueAssetKey,
  STRUCTURE_ASSET_KEYS,
  TREE_ASSET_KEY,
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

describe('pig/cow asset entries (issue #48, ADR 0016 §1)', () => {
  it('pig and cow are each registered in the manifest with a real URL and a positive measured gzip size', () => {
    for (const key of ['pig', 'cow'] as const) {
      const entry = ASSET_MANIFEST[key];
      expect(entry).toBeDefined();
      expect(entry.url).toBeInstanceOf(URL);
      expect(entry.approxGzipBytes).toBeGreaterThan(0);
    }
  });

  it('are never included in truckAssetKeysForBuild -- pig/cow are not one of the player\'s own truck parts (ADR 0010 §4.4)', () => {
    const keys = truckAssetKeysForBuild({ body: 1, wheels: 1, engine: 1, gasTank: 1 });
    expect(keys).not.toContain(ANIMAL_ASSET_KEYS.pig);
    expect(keys).not.toContain(ANIMAL_ASSET_KEYS.cow);
  });

  it('ANIMAL_ASSET_KEYS maps every AnimalSpecies to its manifest key, chicken included', () => {
    expect(ANIMAL_ASSET_KEYS.chicken).toBe(CHICKEN_ASSET_KEY);
    expect(ANIMAL_ASSET_KEYS.pig).toBe('pig');
    expect(ANIMAL_ASSET_KEYS.cow).toBe('cow');
  });
});

describe('farmer asset entry (issue #29, ADR 0015)', () => {
  it('is registered in the manifest with a real URL and a positive measured gzip size', () => {
    const entry = ASSET_MANIFEST[FARMER_ASSET_KEY];
    expect(entry).toBeDefined();
    expect(entry.url).toBeInstanceOf(URL);
    expect(entry.approxGzipBytes).toBeGreaterThan(0);
  });

  it('is never included in truckAssetKeysForBuild -- the farmer is not one of the player\'s own truck parts (ADR 0010 §4.4), so it must never gate the DRIVING-start wait', () => {
    const keys = truckAssetKeysForBuild({ body: 1, wheels: 1, engine: 1, gasTank: 1 });
    expect(keys).not.toContain(FARMER_ASSET_KEY);
  });
});

describe('structure asset entries (issue #46; mountain added issue #47 redesign, ADR 0012 addendum/AC3a)', () => {
  it('windmill/barn/farmhouse/mountain are each registered in the manifest with a real URL and a positive measured gzip size', () => {
    for (const kind of ['windmill', 'barn', 'farmhouse', 'mountain'] as const) {
      const entry = ASSET_MANIFEST[STRUCTURE_ASSET_KEYS[kind]];
      expect(entry).toBeDefined();
      expect(entry.url).toBeInstanceOf(URL);
      expect(entry.approxGzipBytes).toBeGreaterThan(0);
    }
  });

  it('the mountain landmark resolves to the mountain-a manifest key (the taller/sharper of the two sourced models)', () => {
    expect(STRUCTURE_ASSET_KEYS.mountain).toBe('mountain-a');
  });

  it('are never included in truckAssetKeysForBuild -- structures are not one of the player\'s own truck parts (ADR 0010 §4.4), so they must never gate the DRIVING-start wait', () => {
    const keys = truckAssetKeysForBuild({ body: 1, wheels: 1, engine: 1, gasTank: 1 });
    expect(keys).not.toContain(STRUCTURE_ASSET_KEYS.windmill);
    expect(keys).not.toContain(STRUCTURE_ASSET_KEYS.barn);
    expect(keys).not.toContain(STRUCTURE_ASSET_KEYS.farmhouse);
    expect(keys).not.toContain(STRUCTURE_ASSET_KEYS.mountain);
  });
});

describe('silo/chickenCoop/fence asset entries (issue #54, ADR 0019 §4/§6, AC7/AC8/AC11)', () => {
  it('silo and chickenCoop are each registered in the manifest with a real URL and a positive measured gzip size', () => {
    for (const kind of ['silo', 'chickenCoop'] as const) {
      const entry = ASSET_MANIFEST[STRUCTURE_ASSET_KEYS[kind]];
      expect(entry).toBeDefined();
      expect(entry.url).toBeInstanceOf(URL);
      expect(entry.approxGzipBytes).toBeGreaterThan(0);
    }
  });

  it('the fence asset entry is registered with a real URL and a positive measured gzip size', () => {
    const entry = ASSET_MANIFEST[FENCE_ASSET_KEY];
    expect(entry).toBeDefined();
    expect(entry.url).toBeInstanceOf(URL);
    expect(entry.approxGzipBytes).toBeGreaterThan(0);
  });

  it('are never included in truckAssetKeysForBuild -- none of the three are player truck parts (ADR 0010 §4.4)', () => {
    const keys = truckAssetKeysForBuild({ body: 1, wheels: 1, engine: 1, gasTank: 1 });
    expect(keys).not.toContain(STRUCTURE_ASSET_KEYS.silo);
    expect(keys).not.toContain(STRUCTURE_ASSET_KEYS.chickenCoop);
    expect(keys).not.toContain(FENCE_ASSET_KEY);
  });
});

describe('tree asset entry (issue #54 amendment, ADR 0019 §A4)', () => {
  it('is registered in the manifest with a real URL and a positive measured gzip size', () => {
    const entry = ASSET_MANIFEST[TREE_ASSET_KEY];
    expect(entry).toBeDefined();
    expect(entry.url).toBeInstanceOf(URL);
    expect(entry.approxGzipBytes).toBeGreaterThan(0);
  });

  it('is never included in truckAssetKeysForBuild -- trees are not a player truck part (ADR 0010 §4.4)', () => {
    const keys = truckAssetKeysForBuild({ body: 1, wheels: 1, engine: 1, gasTank: 1 });
    expect(keys).not.toContain(TREE_ASSET_KEY);
  });
});
