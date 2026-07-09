import * as THREE from 'three';

// Generic "primitive is the permanent baseline, upgrade in place" slot
// (ADR 0010 §4/§7's FALL/SCENE relationship). The existing primitive
// builders in render/scene.ts stay exactly as they are today -- this module
// doesn't replace them, it wraps whichever primitive a caller already
// created so it can be swapped for a real loaded model later, with no
// pop/glitch and no "loading" gap (there's never a moment with nothing
// rendered: it's primitive, then primitive, then real model). Reused by
// every future consumer (truck body/wheels, farmer, animals, environment
// structures) rather than each one reinventing the swap.

export interface UpgradableObject {
  /** The object3D currently in the scene -- the original primitive until (if ever) upgraded. */
  readonly current: THREE.Object3D;
  /** True once `upgrade()` has been applied. */
  readonly upgraded: boolean;
  /**
   * Swaps the current object for `model`, copying position/rotation/scale
   * from the current object first so there is no visual jump, adding the
   * new object before removing the old one (no single frame with neither
   * present), then disposing the replaced object's geometries/materials.
   * A no-op if already upgraded -- an UpgradableObject upgrades at most
   * once, matching ADR 0010's "never crash / never double-swap" safety
   * guarantee; there is nothing to revert to once the real model is in.
   */
  upgrade(model: THREE.Object3D): void;
}

export function createUpgradableObject(scene: THREE.Scene, primitive: THREE.Object3D): UpgradableObject {
  let current = primitive;
  let upgraded = false;

  return {
    get current() {
      return current;
    },
    get upgraded() {
      return upgraded;
    },
    upgrade(model: THREE.Object3D) {
      if (upgraded) return;

      model.position.copy(current.position);
      model.rotation.copy(current.rotation);
      model.scale.copy(current.scale);

      scene.add(model);
      scene.remove(current);
      disposeObject3D(current);

      current = model;
      upgraded = true;
    },
  };
}

/** Frees GPU-side geometry/material resources for a mesh (and any mesh children) being retired -- called on the outgoing primitive after an upgrade, and reusable by callers disposing a model clone at session end (ADR 0010 §6). */
export function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
    const material = child.material;
    if (Array.isArray(material)) {
      material.forEach((m) => m.dispose());
    } else {
      material?.dispose();
    }
  });
}
