import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WHEEL_LOOK_OPTIONS, getWheelLookMaterial, getWheelRimTintMaterial } from './cosmetic-manifest';

describe('cosmetic manifest id -> material caching (ADR 0011 §2/Consequences, material-mutation-bleed risk)', () => {
  it('getWheelLookMaterial returns the same cached instance per id, and a sane default for an unknown id', () => {
    const a = getWheelLookMaterial('chrome');
    const b = getWheelLookMaterial('chrome');
    expect(a).toBe(b);
    const unknown = getWheelLookMaterial('bogus');
    expect(unknown.color.getHex()).toBe(getWheelLookMaterial('standard').color.getHex());
  });

  it('WHEEL_LOOK_OPTIONS exposes more than one choice (cosmetics AC5/AC6: a real palette, not a single option)', () => {
    expect(WHEEL_LOOK_OPTIONS.length).toBeGreaterThan(1);
  });

  it('every option id round-trips through its getter without throwing', () => {
    for (const option of WHEEL_LOOK_OPTIONS) {
      expect(() => getWheelLookMaterial(option.id)).not.toThrow();
    }
  });
});

describe('getWheelRimTintMaterial (issue #33 follow-up: tint only the loaded wheel\'s rim material, "mat22")', () => {
  function rimSourceMaterial(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color: 0x595959 });
    material.name = 'mat22';
    return material;
  }

  it('returns a clone, never the source instance', () => {
    const source = rimSourceMaterial();
    const tinted = getWheelRimTintMaterial(source, 'chrome');
    expect(tinted).not.toBe(source);
  });

  it('sets .color to the cosmetic hex without touching the source', () => {
    const source = rimSourceMaterial();
    const originalHex = source.color.getHex();
    const tinted = getWheelRimTintMaterial(source, 'redRim') as THREE.MeshStandardMaterial;
    expect(tinted.color.getHex()).not.toBe(originalHex);
    expect(source.color.getHex()).toBe(originalHex);
  });

  it('caches per (source instance, look id)', () => {
    const source = rimSourceMaterial();
    const a = getWheelRimTintMaterial(source, 'chrome');
    const b = getWheelRimTintMaterial(source, 'chrome');
    expect(a).toBe(b);
  });
});

// Body-design decal (buildDesignDecal/BODY_DESIGN_OPTIONS) was removed
// outright post-ship (issue #41, direct human decision -- see this module's
// header) -- no coverage retained for it, same as the earlier body-color
// removal.
