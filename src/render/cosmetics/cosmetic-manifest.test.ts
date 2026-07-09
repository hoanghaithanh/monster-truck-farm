import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BODY_COLOR_OPTIONS,
  BODY_DESIGN_OPTIONS,
  WHEEL_LOOK_OPTIONS,
  buildDesignDecal,
  getBodyColorMaterial,
  getBodyColorTintMaterial,
  getWheelLookMaterial,
  getWheelRimTintMaterial,
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

describe('getBodyColorTintMaterial (issue #33 follow-up: tint the loaded body\'s real "Atlas" material, preserving its texture)', () => {
  function sourceMaterial(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    material.name = 'Atlas';
    return material;
  }

  it('returns a clone, never the source instance -- the loaded asset\'s own material is never mutated', () => {
    const source = sourceMaterial();
    const tinted = getBodyColorTintMaterial(source, 'blue');
    expect(tinted).not.toBe(source);
  });

  it('preserves the source\'s .map (the baked window/grille/panel-line texture) on the tinted clone', () => {
    const source = sourceMaterial();
    const tinted = getBodyColorTintMaterial(source, 'blue') as THREE.MeshStandardMaterial;
    expect(tinted.map).toBe(source.map);
  });

  it('sets .color to the cosmetic hex, distinct per color id, without touching the source\'s .color', () => {
    const source = sourceMaterial();
    const originalHex = source.color.getHex();
    const blue = getBodyColorTintMaterial(source, 'blue') as THREE.MeshStandardMaterial;
    const red = getBodyColorTintMaterial(source, 'red') as THREE.MeshStandardMaterial;
    expect(blue.color.getHex()).not.toBe(originalHex);
    expect(blue.color.getHex()).not.toBe(red.color.getHex());
    expect(source.color.getHex()).toBe(originalHex);
  });

  it('caches the tinted clone per (source instance, color id) -- repeated calls reuse the same instance', () => {
    const source = sourceMaterial();
    const a = getBodyColorTintMaterial(source, 'green');
    const b = getBodyColorTintMaterial(source, 'green');
    expect(a).toBe(b);
  });

  it('never shares a tinted clone across two distinct source materials, even for the same color id (e.g. each body tier\'s own Atlas material)', () => {
    const sourceA = sourceMaterial();
    const sourceB = sourceMaterial();
    const tintedA = getBodyColorTintMaterial(sourceA, 'purple');
    const tintedB = getBodyColorTintMaterial(sourceB, 'purple');
    expect(tintedA).not.toBe(tintedB);
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
    const a = buildDesignDecal('stripe') as THREE.Mesh;
    const b = buildDesignDecal('stripe') as THREE.Mesh;
    expect(a.material).toBe(b.material);
  });

  it('"flames" returns a group of multiple tip meshes (a flame silhouette, not a single flat strip), all sharing one cached material', () => {
    const a = buildDesignDecal('flames');
    const b = buildDesignDecal('flames');
    expect(a).toBeInstanceOf(THREE.Group);
    expect(a).not.toBe(b);

    const group = a as THREE.Group;
    expect(group.children.length).toBeGreaterThan(1);
    const tipMeshes = group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    expect(tipMeshes.length).toBe(group.children.length);

    const materials = new Set(tipMeshes.map((mesh) => mesh.material));
    expect(materials.size).toBe(1); // every tip shares the one cached 'flames' material

    // Each call gets its own fresh geometries/group (each rig owns/disposes its own decal instance).
    const bGroup = b as THREE.Group;
    const bTipMeshes = bGroup.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    expect(tipMeshes[0].geometry).not.toBe(bTipMeshes[0].geometry);
    expect(tipMeshes[0].material).toBe(bTipMeshes[0].material);
  });
});
