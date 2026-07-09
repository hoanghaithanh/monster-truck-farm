import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BODY_COLOR_OPTIONS,
  BODY_DESIGN_OPTIONS,
  WHEEL_LOOK_OPTIONS,
  buildDesignDecal,
  getBodyColorMaterial,
  getWheelLookMaterial,
} from './cosmetic-manifest';

describe('cosmetic manifest id -> material caching (ADR 0011 §2/Consequences, material-mutation-bleed risk)', () => {
  it('getBodyColorMaterial returns the SAME instance for the same id across repeated calls (safe to share, per the ADR)', () => {
    const a = getBodyColorMaterial('blue');
    const b = getBodyColorMaterial('blue');
    expect(a).toBe(b);
  });

  it('getBodyColorMaterial returns distinct instances for distinct ids', () => {
    const orange = getBodyColorMaterial('orange');
    const blue = getBodyColorMaterial('blue');
    expect(orange).not.toBe(blue);
    expect(orange.color.getHex()).not.toBe(blue.color.getHex());
  });

  it('falls back to the default body color for an unknown id rather than crashing (cosmetics AC4-adjacent: forgiving on bad ids)', () => {
    const unknown = getBodyColorMaterial('not-a-real-color');
    const fallback = getBodyColorMaterial('orange');
    expect(unknown.color.getHex()).toBe(fallback.color.getHex());
  });

  it('getWheelLookMaterial returns the same cached instance per id, and a sane default for an unknown id', () => {
    const a = getWheelLookMaterial('chrome');
    const b = getWheelLookMaterial('chrome');
    expect(a).toBe(b);
    const unknown = getWheelLookMaterial('bogus');
    expect(unknown.color.getHex()).toBe(getWheelLookMaterial('standard').color.getHex());
  });

  it('BODY_COLOR_OPTIONS/BODY_DESIGN_OPTIONS/WHEEL_LOOK_OPTIONS each expose more than one choice (cosmetics AC5/AC6: a real palette, not a single option)', () => {
    expect(BODY_COLOR_OPTIONS.length).toBeGreaterThan(1);
    expect(BODY_DESIGN_OPTIONS.length).toBeGreaterThan(1);
    expect(WHEEL_LOOK_OPTIONS.length).toBeGreaterThan(1);
  });

  it('every option id round-trips through its getter without throwing', () => {
    for (const option of BODY_COLOR_OPTIONS) {
      expect(() => getBodyColorMaterial(option.id)).not.toThrow();
    }
    for (const option of WHEEL_LOOK_OPTIONS) {
      expect(() => getWheelLookMaterial(option.id)).not.toThrow();
    }
  });
});

describe('buildDesignDecal (cosmetics AC5/AC7 -- body design independent of body tier)', () => {
  it('returns undefined for "plain" -- no decal mesh rendered', () => {
    expect(buildDesignDecal('plain')).toBeUndefined();
  });

  it('returns undefined for an unknown design id (forgiving fallback, not a crash)', () => {
    expect(buildDesignDecal('not-a-real-design')).toBeUndefined();
  });

  it('returns a fresh mesh instance per call for a real design id (each rig owns its own decal geometry)', () => {
    const a = buildDesignDecal('stripe');
    const b = buildDesignDecal('stripe');
    expect(a).toBeInstanceOf(THREE.Mesh);
    expect(a).not.toBe(b);
    expect((a as THREE.Mesh).geometry).not.toBe((b as THREE.Mesh).geometry);
  });

  it('shares the same cached material across calls for the same design id (safe to share, never mutated)', () => {
    const a = buildDesignDecal('flames') as THREE.Mesh;
    const b = buildDesignDecal('flames') as THREE.Mesh;
    expect(a.material).toBe(b.material);
  });
});
