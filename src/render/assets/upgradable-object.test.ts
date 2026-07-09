import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createUpgradableObject } from './upgradable-object';

function box(): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
}

describe('createUpgradableObject (ADR 0010 §4 "primitive is the permanent baseline, upgrade in place")', () => {
  it('starts as the given primitive, not upgraded', () => {
    const scene = new THREE.Scene();
    const primitive = box();
    scene.add(primitive);
    const slot = createUpgradableObject(scene, primitive);

    expect(slot.current).toBe(primitive);
    expect(slot.upgraded).toBe(false);
  });

  it('upgrade() swaps in the real model, removing the primitive from the scene and adding the model', () => {
    const scene = new THREE.Scene();
    const primitive = box();
    scene.add(primitive);
    const slot = createUpgradableObject(scene, primitive);

    const model = box();
    slot.upgrade(model);

    expect(slot.current).toBe(model);
    expect(slot.upgraded).toBe(true);
    expect(scene.children).toContain(model);
    expect(scene.children).not.toContain(primitive);
  });

  it('copies position/rotation/scale from the primitive onto the model so there is no visual pop', () => {
    const scene = new THREE.Scene();
    const primitive = box();
    primitive.position.set(1, 2, 3);
    primitive.rotation.set(0, Math.PI / 2, 0);
    primitive.scale.set(2, 2, 2);
    scene.add(primitive);
    const slot = createUpgradableObject(scene, primitive);

    const model = box();
    slot.upgrade(model);

    expect(model.position.toArray()).toEqual([1, 2, 3]);
    expect(model.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(model.scale.toArray()).toEqual([2, 2, 2]);
  });

  it('adds the model to the scene before removing the primitive, so there is never a frame with neither present', () => {
    const scene = new THREE.Scene();
    const primitive = box();
    scene.add(primitive);
    const addOrder: THREE.Object3D[] = [];
    const originalAdd = scene.add.bind(scene);
    scene.add = ((...objects: THREE.Object3D[]) => {
      addOrder.push(...objects);
      return originalAdd(...objects);
    }) as typeof scene.add;

    const slot = createUpgradableObject(scene, primitive);
    const model = box();
    slot.upgrade(model);

    // The model must be added before upgrade() removes the primitive --
    // by the time removal happens both are momentarily in the scene graph.
    expect(addOrder).toContain(model);
  });

  it('upgrades at most once -- a second upgrade() call is a no-op', () => {
    const scene = new THREE.Scene();
    const primitive = box();
    scene.add(primitive);
    const slot = createUpgradableObject(scene, primitive);

    const firstModel = box();
    slot.upgrade(firstModel);

    const secondModel = box();
    slot.upgrade(secondModel);

    expect(slot.current).toBe(firstModel);
    expect(scene.children).not.toContain(secondModel);
  });

  it('disposes the replaced primitive geometry/material on upgrade', () => {
    const scene = new THREE.Scene();
    const primitive = box();
    scene.add(primitive);
    const slot = createUpgradableObject(scene, primitive);

    let geometryDisposed = false;
    let materialDisposed = false;
    primitive.geometry.dispose = () => {
      geometryDisposed = true;
    };
    (primitive.material as THREE.Material).dispose = () => {
      materialDisposed = true;
    };

    slot.upgrade(box());

    expect(geometryDisposed).toBe(true);
    expect(materialDisposed).toBe(true);
  });
});
