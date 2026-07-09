import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BODY_DESIGN_OPTIONS, WHEEL_LOOK_OPTIONS, buildDesignDecal, getWheelLookMaterial, getWheelRimTintMaterial } from './cosmetic-manifest';

describe('cosmetic manifest id -> material caching (ADR 0011 §2/Consequences, material-mutation-bleed risk)', () => {
  it('getWheelLookMaterial returns the same cached instance per id, and a sane default for an unknown id', () => {
    const a = getWheelLookMaterial('chrome');
    const b = getWheelLookMaterial('chrome');
    expect(a).toBe(b);
    const unknown = getWheelLookMaterial('bogus');
    expect(unknown.color.getHex()).toBe(getWheelLookMaterial('standard').color.getHex());
  });

  it('BODY_DESIGN_OPTIONS/WHEEL_LOOK_OPTIONS each expose more than one choice (cosmetics AC5/AC6: a real palette, not a single option)', () => {
    expect(BODY_DESIGN_OPTIONS.length).toBeGreaterThan(1);
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
