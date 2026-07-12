import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildTruckRig } from './truck-rig';
import {
  applyFenceCollapsePose,
  buildAnimatedAnimalDisplayModel,
  buildFarmerDisplayModel,
  buildFenceDisplayModel,
  buildRiverMesh,
  buildStaticAnimalDisplayModel,
  buildStructureDisplayModel,
  buildTreeDisplayModel,
  carryOverWheelRotations,
  computeFarmerHeading,
} from './scene';
import { AssetRegistry, type GltfLoaderLike } from './assets/asset-registry';
import type { TerrainBounds } from '../core/terrain';
import type { TruckBuild, TruckCosmetics } from '../core/types';

// `createGameScene` itself needs a real `THREE.WebGLRenderer` (browser
// canvas/GL context) -- every other describe in this file sidesteps that by
// testing extracted pure helpers (see the comment above
// `carryOverWheelRotations`'s describe block). The one describe below
// ("Scene animal lifecycle...") is the exception: the material-dispose
// (ADR 0016 §8) and scatter-orientation (ADR 0016 §7) wiring live entirely
// inside the closure with no pure-function escape hatch, so this reuses
// `builder.test.ts`'s already-established `vi.mock('three', ...)`
// FakeWebGLRenderer technique (swap out only the one non-Node-safe export,
// keep every other THREE class real) rather than leaving that wiring
// completely uncovered. `vi.mock` is file-scoped/hoisted, but since it only
// replaces `WebGLRenderer` (never constructed by any of the pure-function
// tests above), it has no effect on them.
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeWebGLRenderer {
    domElement = { tagName: 'canvas' };
    setSize(): void {}
    setPixelRatio(): void {}
    render(): void {}
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

// carryOverWheelRotations (issue #44) is exercised directly here rather than
// through `createGameScene`/`tickEffects`'s full rig-rebuild path: this
// project's test environment is plain Node (vitest.config.ts, no
// jsdom/canvas), and `createGameScene` constructs a real
// `THREE.WebGLRenderer`, which needs a browser canvas/WebGL context to
// initialize -- not available here. `carryOverWheelRotations` was pulled out
// of `tickEffects` specifically because it has no such dependency (see its
// own doc comment in scene.ts) and is the exact function `tickEffects` calls
// during the asset-upgrade in-place rig rebuild, so this test covers the
// real production code path, not a reimplementation of it.

const BUILD: TruckBuild = { body: 1, wheels: 1, engine: 0, gasTank: 0 };
const COSMETICS: TruckCosmetics = { wheelLook: 'standard' };

describe('carryOverWheelRotations (issue #44, wheel-roll continuity across the in-place rig rebuild)', () => {
  it('copies every wheel\'s roll.rotation.x and steer.rotation.y from the outgoing rig onto the rebuilt rig\'s matching pivot', () => {
    const outgoing = buildTruckRig(BUILD, COSMETICS); // primitive-fallback rig (no registry) -- simulates the pre-upgrade rig
    const rebuilt = buildTruckRig(BUILD, COSMETICS); // a fresh rig -- simulates the post-asset-load rebuild, pivots start at rotation 0

    outgoing.wheels.frontLeft.roll.rotation.x = 1.23;
    outgoing.wheels.frontLeft.steer.rotation.y = 0.4;
    outgoing.wheels.frontRight.roll.rotation.x = 2.5;
    outgoing.wheels.frontRight.steer.rotation.y = -0.4;
    outgoing.wheels.rearLeft.roll.rotation.x = -3.1;
    outgoing.wheels.rearRight.roll.rotation.x = 7.77;

    // Sanity check: the rebuilt rig actually starts at rotation 0, same as a
    // freshly-created rig would in production -- otherwise this test
    // wouldn't actually be exercising the "snap back" bug it guards against.
    expect(rebuilt.wheels.frontLeft.roll.rotation.x).toBe(0);

    carryOverWheelRotations(outgoing.wheels, rebuilt.wheels);

    expect(rebuilt.wheels.frontLeft.roll.rotation.x).toBeCloseTo(1.23);
    expect(rebuilt.wheels.frontLeft.steer.rotation.y).toBeCloseTo(0.4);
    expect(rebuilt.wheels.frontRight.roll.rotation.x).toBeCloseTo(2.5);
    expect(rebuilt.wheels.frontRight.steer.rotation.y).toBeCloseTo(-0.4);
    expect(rebuilt.wheels.rearLeft.roll.rotation.x).toBeCloseTo(-3.1);
    expect(rebuilt.wheels.rearRight.roll.rotation.x).toBeCloseTo(7.77);
  });

  it('also copies every wheel\'s travel.position.y (issue #63, ADR 0018 §4 -- suspension continuity across the in-place rig rebuild)', () => {
    const outgoing = buildTruckRig(BUILD, COSMETICS);
    const rebuilt = buildTruckRig(BUILD, COSMETICS);

    outgoing.wheels.frontLeft.travel.position.y = 0.18;
    outgoing.wheels.frontRight.travel.position.y = -0.05;
    outgoing.wheels.rearLeft.travel.position.y = 0.02;
    outgoing.wheels.rearRight.travel.position.y = 0;

    // Sanity check: the rebuilt rig actually starts with zero travel offset,
    // same "snap back" precedent as the roll/steer test above.
    expect(rebuilt.wheels.frontLeft.travel.position.y).toBe(0);

    carryOverWheelRotations(outgoing.wheels, rebuilt.wheels);

    expect(rebuilt.wheels.frontLeft.travel.position.y).toBeCloseTo(0.18);
    expect(rebuilt.wheels.frontRight.travel.position.y).toBeCloseTo(-0.05);
    expect(rebuilt.wheels.rearLeft.travel.position.y).toBeCloseTo(0.02);
    expect(rebuilt.wheels.rearRight.travel.position.y).toBeCloseTo(0);
  });

  it('never touches a pivot\'s position -- only rotation is carried over, so the wheel stays on its socket', () => {
    const outgoing = buildTruckRig(BUILD, COSMETICS);
    const rebuilt = buildTruckRig(BUILD, COSMETICS);
    const beforePositions = {
      frontLeft: rebuilt.wheels.frontLeft.steer.position.clone(),
      frontRight: rebuilt.wheels.frontRight.steer.position.clone(),
      rearLeft: rebuilt.wheels.rearLeft.steer.position.clone(),
      rearRight: rebuilt.wheels.rearRight.steer.position.clone(),
    };

    outgoing.wheels.frontLeft.roll.rotation.x = 5;
    outgoing.wheels.frontLeft.steer.rotation.y = 1;
    carryOverWheelRotations(outgoing.wheels, rebuilt.wheels);

    expect(rebuilt.wheels.frontLeft.steer.position.toArray()).toEqual(beforePositions.frontLeft.toArray());
    expect(rebuilt.wheels.frontRight.steer.position.toArray()).toEqual(beforePositions.frontRight.toArray());
    expect(rebuilt.wheels.rearLeft.steer.position.toArray()).toEqual(beforePositions.rearLeft.toArray());
    expect(rebuilt.wheels.rearRight.steer.position.toArray()).toEqual(beforePositions.rearRight.toArray());
  });
});

describe('buildStaticAnimalDisplayModel (issue #28, chicken sourced-art scale/centering; generalized issue #48/ADR 0016 §3 -- chicken remains its only caller)', () => {
  // A stand-in for AssetRegistry.get('chicken')'s clone: an arbitrarily
  // large, off-center box, mimicking the real sourced "Hen" glTF's own
  // unusually-scaled, off-origin raw geometry (measured raw bounding height
  // ~77 units, not meters) closely enough to exercise the same
  // measure-then-correct logic without needing the real .glb in a Node test
  // environment.
  function offCenterRawModel(): THREE.Object3D {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 80, 60), new THREE.MeshStandardMaterial());
    mesh.position.set(5, 10, -3); // off-origin, like the real model's measured min/max not being symmetric about 0
    return mesh;
  }

  it('derives the corrective scale from the source\'s own measured bounding-box height, not a hardcoded number', () => {
    const model = buildStaticAnimalDisplayModel(offCenterRawModel(), 0.5);

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Raw height was 80 -- the rendered height after correction must match
    // the requested targetHeight exactly.
    expect(size.y).toBeCloseTo(0.5, 5);
  });

  it('re-centers the model so its bounding-box center lands at the returned object\'s local origin', () => {
    const model = buildStaticAnimalDisplayModel(offCenterRawModel(), 0.5);

    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);

    expect(center.x).toBeCloseTo(0, 5);
    expect(center.y).toBeCloseTo(0, 5);
    expect(center.z).toBeCloseTo(0, 5);
  });

  it('respects a different targetHeight than chicken\'s (parameterized, not chicken-hardcoded)', () => {
    const model = buildStaticAnimalDisplayModel(offCenterRawModel(), 2);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    expect(size.y).toBeCloseTo(2, 5);
  });

  it('keeps the corrective scale/centering on an inner group, not the returned outer object -- so UpgradableObject.upgrade() overwriting the outer object\'s transform can never clobber it', () => {
    const model = buildStaticAnimalDisplayModel(offCenterRawModel(), 0.5);

    // The outer object itself must start with an identity transform: it's
    // the one UpgradableObject.upgrade() will overwrite with the outgoing
    // primitive's position/rotation/scale (scene.ts's own doc comment on
    // buildStaticAnimalDisplayModel explains why).
    expect(model.position.toArray()).toEqual([0, 0, 0]);
    expect(model.scale.toArray()).toEqual([1, 1, 1]);

    // Simulate upgrade()'s overwrite (copies the primitive's transform onto
    // the outer object) and confirm the correction still holds afterward.
    model.position.set(3, 0.3, -7);
    model.scale.set(1, 1, 1);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    expect(size.y).toBeCloseTo(0.5, 5);
  });
});

describe('buildAnimatedAnimalDisplayModel (issue #48, ADR 0016 §3 -- pig/cow animated sourced-art scale/centering/material isolation)', () => {
  // A stand-in for AssetRegistry.getAnimated('pig'|'cow')'s clone: reuses
  // the exact same SkinnedMesh + tiny-raw-height/skin-matrix-scale repro
  // shape scene.test.ts's buildFarmerDisplayModel fixture (below) already
  // established for issue #57 -- this function shares that function's
  // skinned-safe measurement code, so the same fixture shape exercises it.
  function rawAnimatedAnimalModel(): THREE.Object3D {
    const root = new THREE.Group();

    const rawHeight = 0.002;
    const skinScale = 1000; // posed height = rawHeight * skinScale = 2.
    const bodyGeometry = new THREE.CylinderGeometry(rawHeight / 4, rawHeight / 4, rawHeight, 6);
    const vertexCount = bodyGeometry.attributes.position.count;
    const skinIndices: number[] = [];
    const skinWeights: number[] = [];
    for (let i = 0; i < vertexCount; i++) {
      skinIndices.push(0, 0, 0, 0);
      skinWeights.push(1, 0, 0, 0);
    }
    bodyGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    bodyGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    const body = new THREE.SkinnedMesh(
      bodyGeometry,
      new THREE.MeshStandardMaterial({ name: 'Body', color: 0xd2a679, metalness: 0.4, roughness: 0.5 }),
    );
    const bone = new THREE.Bone();
    const boneInverses = [new THREE.Matrix4().makeScale(skinScale, skinScale, skinScale)];
    const skeleton = new THREE.Skeleton([bone], boneInverses);
    body.add(bone);
    body.bind(skeleton, new THREE.Matrix4());

    root.add(body);
    root.position.set(4, 12.5, -2); // off-origin, base not at y=0
    return root;
  }

  it('derives the corrective scale from the source\'s own measured POSED (skinned) height, landing on the requested targetHeight (issue #57 regression guard, applied from the start per ADR 0016 §3)', () => {
    const { model } = buildAnimatedAnimalDisplayModel(rawAnimatedAnimalModel(), 1.4);

    const box = new THREE.Box3().setFromObject(model, true);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Posed body height was 2 (rawHeight * skinScale) -- the rendered height
    // after correction must match the requested targetHeight, not the tiny
    // 0.002 a non-precise Box3.setFromObject would read.
    expect(size.y).toBeCloseTo(1.4, 5);
  });

  it('re-centers the model horizontally (x/z) but keeps its base at the wrapper\'s local origin (y=0), like the farmer/structures -- not vertically centered like the chicken', () => {
    const { model } = buildAnimatedAnimalDisplayModel(rawAnimatedAnimalModel(), 1.4);

    const box = new THREE.Box3().setFromObject(model, true);
    const center = new THREE.Vector3();
    box.getCenter(center);

    expect(center.x).toBeCloseTo(0, 5);
    expect(center.z).toBeCloseTo(0, 5);
    expect(box.min.y).toBeCloseTo(0, 5);
  });

  it('clones every material rather than mutating the source in place -- required so this instance\'s materials never bleed into the app-lifetime cached source', () => {
    const source = rawAnimatedAnimalModel();
    const sourceMaterial = (source.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const { model } = buildAnimatedAnimalDisplayModel(source, 1.4);

    const cloneMaterial = (model.children[0].children[0].children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(cloneMaterial).not.toBe(sourceMaterial);

    cloneMaterial.color.setHex(0xff0000);
    expect(sourceMaterial.color.getHex()).not.toBe(0xff0000);
  });

  it('forces metalness to 0 on every cloned MeshStandardMaterial, leaving roughness/color untouched (same near-black-under-no-envMap fix as buildStructureDisplayModel/buildFarmerDisplayModel)', () => {
    const { ownedMaterials } = buildAnimatedAnimalDisplayModel(rawAnimatedAnimalModel(), 1.4);
    expect(ownedMaterials).toHaveLength(1);
    const material = ownedMaterials[0] as THREE.MeshStandardMaterial;
    expect(material.metalness).toBe(0);
    expect(material.roughness).toBeCloseTo(0.5, 5);
  });

  it('keeps the corrective scale/centering on an inner group, not the returned outer object', () => {
    const { model } = buildAnimatedAnimalDisplayModel(rawAnimatedAnimalModel(), 1.4);
    expect(model.position.toArray()).toEqual([0, 0, 0]);
    expect(model.scale.toArray()).toEqual([1, 1, 1]);
  });
});

describe('buildStructureDisplayModel (issue #46, structure sourced-art scale/ground-alignment; metalness override added issue #47 mountain-landmark follow-up)', () => {
  // A stand-in for AssetRegistry.get(<structure key>)'s clone: an
  // arbitrarily large, off-center, non-cubic box, mimicking the three real
  // sourced windmill/barn/farmhouse .glb's each being authored at their own
  // unrelated raw scale (see the orchestrator's sourcing notes, issue #46)
  // closely enough to exercise the measure-then-correct logic without
  // needing the real .glb files in a Node test environment.
  function offCenterRawModel(): THREE.Object3D {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 25, 16), new THREE.MeshStandardMaterial());
    mesh.position.set(4, 12.5, -2); // off-origin, base not at y=0
    return mesh;
  }

  // A stand-in for the mountain model's own sourced material, which (unlike
  // every other structure's diffuse-only material) ships a nonzero
  // metallicFactor -- see buildStructureDisplayModel's own doc comment for
  // the near-black-under-no-envMap rationale this override fixes.
  function offCenterRawModelWithMetalness(): THREE.Object3D {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(10, 25, 16),
      new THREE.MeshStandardMaterial({ metalness: 0.4, roughness: 0.27 }),
    );
    mesh.position.set(4, 12.5, -2);
    return mesh;
  }

  it('forces metalness to 0 on every MeshStandardMaterial in the source, leaving roughness/color untouched (2026-07-10 near-black-mountain fix, generalized to every structure)', () => {
    const source = offCenterRawModelWithMetalness();
    buildStructureDisplayModel(source, 6);

    const mesh = source as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.metalness).toBe(0);
    expect(material.roughness).toBeCloseTo(0.27, 5);
  });

  it('derives the corrective scale from the source\'s own measured horizontal (max of x/z) extent, not a hardcoded number', () => {
    const model = buildStructureDisplayModel(offCenterRawModel(), 6);

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Raw horizontal extent was max(10, 16) = 16 -> scaleFactor = 6/16 = 0.375.
    expect(size.x).toBeCloseTo(10 * 0.375, 5);
    expect(size.z).toBeCloseTo(16 * 0.375, 5);
  });

  it('re-centers the model horizontally (x/z) but keeps its base at the wrapper\'s local origin (y=0), not its vertical center', () => {
    const model = buildStructureDisplayModel(offCenterRawModel(), 6);

    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);

    expect(center.x).toBeCloseTo(0, 5);
    expect(center.z).toBeCloseTo(0, 5);
    // Base at 0: a multi-unit-tall building must sit on the ground, not
    // float/sink by half its height the way the chicken's full-centering does.
    expect(box.min.y).toBeCloseTo(0, 5);
  });

  it('keeps the corrective scale/centering on an inner group, not the returned outer object -- so UpgradableObject.upgrade() overwriting the outer object\'s transform can never clobber it', () => {
    const model = buildStructureDisplayModel(offCenterRawModel(), 6);

    expect(model.position.toArray()).toEqual([0, 0, 0]);
    expect(model.scale.toArray()).toEqual([1, 1, 1]);

    // Simulate upgrade()'s overwrite (copies the primitive's transform --
    // {x, 0, z}, matching buildStructurePrimitive's ground-anchored
    // position.set convention -- onto the outer object).
    model.position.set(12, 0, -10);
    model.scale.set(1, 1, 1);
    const box = new THREE.Box3().setFromObject(model);
    expect(box.min.y).toBeCloseTo(0, 5);
  });
});

describe('buildFenceDisplayModel (issue #54, ADR 0019 §5 -- fence sourced-art scale/ground-alignment)', () => {
  // A stand-in for AssetRegistry.get(FENCE_ASSET_KEY)'s clone: a long, thin,
  // off-center box mimicking fence.glb's own raw proportions (CREDITS.md:
  // ~5.89 wide x 1.164 tall x 0.166 deep) closely enough to exercise the
  // measure-then-correct logic without needing the real .glb in a Node test.
  function offCenterRawFenceModel(): THREE.Object3D {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(5.89, 1.164, 0.166), new THREE.MeshStandardMaterial());
    mesh.position.set(1.2, 0.6, -0.3); // off-origin, base not at y=0
    return mesh;
  }

  it('derives the corrective scale from the source\'s own measured horizontal (max of x/z) extent, not a hardcoded number', () => {
    const model = buildFenceDisplayModel(offCenterRawFenceModel(), 5);

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Raw horizontal extent was max(5.89, 0.166) = 5.89 -> scaleFactor = 5/5.89.
    const scaleFactor = 5 / 5.89;
    expect(size.x).toBeCloseTo(5.89 * scaleFactor, 5);
    expect(size.z).toBeCloseTo(0.166 * scaleFactor, 5);
  });

  it('re-centers the model horizontally (x/z) but keeps its base at the wrapper\'s local origin (y=0), not its vertical center', () => {
    const model = buildFenceDisplayModel(offCenterRawFenceModel(), 5);

    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);

    expect(center.x).toBeCloseTo(0, 5);
    expect(center.z).toBeCloseTo(0, 5);
    expect(box.min.y).toBeCloseTo(0, 5);
  });

  it('keeps the corrective scale/centering on an inner group, not the returned outer object -- so UpgradableObject.upgrade() overwriting the outer object\'s transform can never clobber it', () => {
    const model = buildFenceDisplayModel(offCenterRawFenceModel(), 5);

    expect(model.position.toArray()).toEqual([0, 0, 0]);
    expect(model.scale.toArray()).toEqual([1, 1, 1]);
  });
});

describe('buildTreeDisplayModel (issue #54 amendment, ADR 0019 §A4 -- tree sourced-art scale/ground-alignment, height-driven)', () => {
  // A stand-in for AssetRegistry.get(TREE_ASSET_KEY)'s clone: an off-center,
  // tall-and-thin box mimicking tree.glb's own raw proportions (measured
  // bbox ~4.31 wide x 7.27 tall x 4.58 deep, CREDITS.md) closely enough to
  // exercise the measure-then-correct logic without the real .glb.
  function offCenterRawTreeModel(): THREE.Object3D {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4.31, 7.27, 4.58), new THREE.MeshStandardMaterial());
    mesh.position.set(1, 3.5, -0.5); // off-origin, base not at y=0
    return mesh;
  }

  it('derives the corrective scale from the source\'s own measured height (y extent), not a hardcoded number -- unlike buildStructureDisplayModel/buildFenceDisplayModel, which are width-driven', () => {
    const model = buildTreeDisplayModel(offCenterRawTreeModel(), 3.4);

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    const scaleFactor = 3.4 / 7.27;
    expect(size.y).toBeCloseTo(7.27 * scaleFactor, 5);
    expect(size.x).toBeCloseTo(4.31 * scaleFactor, 5);
  });

  it('re-centers the model horizontally (x/z) but keeps its base at the wrapper\'s local origin (y=0), not its vertical center', () => {
    const model = buildTreeDisplayModel(offCenterRawTreeModel(), 3.4);

    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);

    expect(center.x).toBeCloseTo(0, 5);
    expect(center.z).toBeCloseTo(0, 5);
    expect(box.min.y).toBeCloseTo(0, 5);
  });

  it('forces metalness to 0 on every MeshStandardMaterial in the source (same near-black-under-no-envMap fix as buildStructureDisplayModel)', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(4.31, 7.27, 4.58),
      new THREE.MeshStandardMaterial({ metalness: 0.3, roughness: 0.5 }),
    );
    buildTreeDisplayModel(mesh, 3.4);
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.metalness).toBe(0);
    expect(material.roughness).toBeCloseTo(0.5, 5);
  });

  it('keeps the corrective scale/centering on an inner group, not the returned outer object', () => {
    const model = buildTreeDisplayModel(offCenterRawTreeModel(), 3.4);
    expect(model.position.toArray()).toEqual([0, 0, 0]);
    expect(model.scale.toArray()).toEqual([1, 1, 1]);
  });
});

describe('applyFenceCollapsePose (issue #54, ADR 0019 §5/§8, AC8 collapse visual)', () => {
  // Regression test for a bug found via human live playtest 2026-07-12: the
  // previous implementation set `object.rotation.x` directly, which reads
  // fine as raw Euler component values (x=pi/2, y unchanged) but does NOT
  // reproduce the intended *world-space* orientation once a nonzero yaw is
  // already present -- THREE.Euler's default 'XYZ' composition order means
  // the final x/y/z triple doesn't decompose into "yaw, then an independent
  // local tip" the way a naive component-by-component check would suggest.
  // Pin against the actual transformed geometry (an external, physically
  // meaningful ground truth -- "does the plank end up lying flat, near the
  // ground, after collapsing" -- the exact thing a player looking at the
  // screen judges) rather than the module's own stored Euler numbers, per
  // this project's established convention for orientation/heading bugs
  // (CLAUDE.md's QA-gotchas note, same class as the #63 sign-inversion fix).
  function longAxisWorldPoint(object: THREE.Object3D): THREE.Vector3 {
    // A point at the far tip of the plank's long axis (local +X, matching
    // buildFencePrimitive/buildFenceDisplayModel's width-along-X convention),
    // at the plank's standing height -- exactly the picket-tip geometry a
    // human would see sticking up in the air if collapse failed.
    const tip = new THREE.Vector3(2.9, 1.1, 0);
    object.updateMatrixWorld(true);
    return tip.applyMatrix4(object.matrixWorld);
  }

  it('flattens a zero-yaw (straight-run) segment: the plank tip ends up near ground level, not standing tall', () => {
    const object = new THREE.Group();
    object.rotation.set(0, 0, 0);
    const beforeTip = longAxisWorldPoint(object.clone());
    expect(beforeTip.y).toBeCloseTo(1.1, 5); // standing: tip is up at plank height

    applyFenceCollapsePose(object);
    const afterTip = longAxisWorldPoint(object);
    expect(Math.abs(afterTip.y)).toBeLessThan(0.3); // collapsed: tip is down near the ground
  });

  it('flattens a yawed (perpendicular-closing) segment the same way -- the exact case that regressed: rotationY=Math.PI/2 previously made the plank stand on end (tip height ~2.9) instead of lying flat', () => {
    const object = new THREE.Group();
    object.rotation.set(0, Math.PI / 2, 0); // authored boundary yaw, e.g. STUB_FENCES' west-closing segment
    applyFenceCollapsePose(object);
    const afterTip = longAxisWorldPoint(object);
    expect(Math.abs(afterTip.y)).toBeLessThan(0.3);
  });

  it('preserves the authored yaw direction (Y-axis orientation) once flattened, so the collapsed plank still lies along its own boundary line rather than an arbitrary direction', () => {
    const straight = new THREE.Group();
    straight.rotation.set(0, 0, 0);
    applyFenceCollapsePose(straight);
    const straightTip = longAxisWorldPoint(straight);

    const yawed = new THREE.Group();
    yawed.rotation.set(0, Math.PI / 2, 0);
    applyFenceCollapsePose(yawed);
    const yawedTip = longAxisWorldPoint(yawed);

    // Both lie flat (checked above), but the yawed segment's tip should have
    // swung into the perpendicular (X/Z swapped) horizontal direction, not
    // landed on the same horizontal footprint as the straight segment.
    expect(Math.abs(straightTip.x)).toBeGreaterThan(2);
    expect(Math.abs(yawedTip.z)).toBeGreaterThan(2);
  });
});

// Issue #57's exact repro shape (found in issue #29 acceptance validation):
// the real farmer.glb's SkinnedMesh nodes have tiny raw local geometry
// (~0.001-0.02 units) plus similarly tiny bone-to-bone local offsets, with
// the model's true real-world size instead baked into the skeleton's
// accessor-supplied inverse bind matrices (independent of the node
// hierarchy's own tiny local transforms) -- a real glTF-skinning quirk. A
// naive `Box3.setFromObject(source)` [no `precise` flag] reads only the
// raw, un-posed `geometry.boundingBox` and never sees that real scale,
// which is exactly how `buildFarmerDisplayModel` under-measured the model
// and derived a ~200x-too-small corrective scale. RAW_BODY_HEIGHT and
// BODY_SKIN_SCALE below reproduce that split explicitly and deliberately
// far apart, so any regression back to the un-posed measurement is
// unmissable in the scale test just below.
const RAW_BODY_HEIGHT = 0.002;
const BODY_SKIN_SCALE = 1000; // posed body height = RAW_BODY_HEIGHT * BODY_SKIN_SCALE = 2.

describe('buildFarmerDisplayModel (issue #29, ADR 0015 §2 -- farmer sourced-art scale/centering/material isolation)', () => {
  // A stand-in for AssetRegistry.getAnimated('farmer')'s clone: an
  // arbitrarily large, off-center, non-cubic group with a few named
  // materials mimicking the real sourced "Farmer" glTF's 8-material split
  // (Skin/Eye/Eyebrows/etc, see repo-root CREDITS.md). The body is a real
  // `THREE.SkinnedMesh`, not a plain `Mesh` -- issue #57 found that
  // `buildFarmerDisplayModel`'s scale-derivation step is NOT
  // skinning-agnostic (a previous version of this fixture's comment
  // claimed otherwise, which is exactly how the scale bug shipped fully
  // unit-tested: the fixture used here couldn't have caught it). See the
  // RAW_BODY_HEIGHT/BODY_SKIN_SCALE comment above for what this
  // specifically reproduces.
  function rawFarmerModel(): THREE.Object3D {
    const root = new THREE.Group();

    const bodyGeometry = new THREE.CylinderGeometry(RAW_BODY_HEIGHT / 4, RAW_BODY_HEIGHT / 4, RAW_BODY_HEIGHT, 6);
    const vertexCount = bodyGeometry.attributes.position.count;
    const skinIndices: number[] = [];
    const skinWeights: number[] = [];
    for (let i = 0; i < vertexCount; i++) {
      skinIndices.push(0, 0, 0, 0);
      skinWeights.push(1, 0, 0, 0);
    }
    bodyGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    bodyGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    const body = new THREE.SkinnedMesh(
      bodyGeometry,
      new THREE.MeshStandardMaterial({ name: 'Skin', color: 0x8899aa, metalness: 0.4 }),
    );
    // Left at the local origin -- the real rig's bone-to-bone offsets are
    // similarly tiny (issue #57), so this repro's scale correction has to
    // come entirely from the skin matrix below, not the bone's own position.
    const bone = new THREE.Bone();
    // Baked directly as the skeleton's boneInverses, bypassing
    // `Skeleton.calculateInverses()` (which would derive inverses FROM the
    // bone's own -- also tiny -- current transform and collapse this
    // repro back into a no-op skin transform). This mimics a real glTF
    // skin's accessor-supplied inverse bind matrices carrying the "real"
    // scale independently of the node hierarchy's own local offsets.
    const boneInverses = [new THREE.Matrix4().makeScale(BODY_SKIN_SCALE, BODY_SKIN_SCALE, BODY_SKIN_SCALE)];
    const skeleton = new THREE.Skeleton([bone], boneInverses);
    body.add(bone);
    // Explicit identity bindMatrix skips bind()'s default
    // calculateInverses() call, which would otherwise overwrite the
    // deliberately-mismatched boneInverses set above.
    body.bind(skeleton, new THREE.Matrix4());

    const eyes = new THREE.Mesh(
      new THREE.BoxGeometry(0.001, 0.001, 0.001),
      new THREE.MeshStandardMaterial({ name: 'Eye', color: 0x111111, metalness: 0.4 }),
    );
    const eyebrows = new THREE.Mesh(
      new THREE.BoxGeometry(0.001, 0.001, 0.001),
      new THREE.MeshStandardMaterial({ name: 'Eyebrows', color: 0x3a2a1a, metalness: 0.4 }),
    );
    root.add(body, eyes, eyebrows);
    root.position.set(4, 12.5, -2); // off-origin, base not at y=0
    return root;
  }

  it('derives the corrective scale from the source\'s own measured POSED (skinned) height, landing on FARMER_TARGET_HEIGHT (issue #57 regression guard)', () => {
    const { model } = buildFarmerDisplayModel(rawFarmerModel());

    // precise=true measures via the real skin transform -- the same thing
    // the GPU actually renders (issue #57) -- not the raw/un-posed
    // measurement the pre-fix bug used, which this fixture's
    // RAW_BODY_HEIGHT/BODY_SKIN_SCALE split is specifically built to
    // distinguish from the posed height.
    const box = new THREE.Box3().setFromObject(model, true);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Posed body height was 2 (RAW_BODY_HEIGHT * BODY_SKIN_SCALE), not the
    // tiny 0.002 a non-precise Box3.setFromObject would read (issue #57's
    // exact defect) -- whatever FARMER_TARGET_HEIGHT is tuned to today,
    // the rendered height after correction must match it.
    expect(size.y).toBeCloseTo(1.7, 5);
  });

  it('re-centers the model horizontally (x/z) but keeps its base at the wrapper\'s local origin (y=0), like the structures -- not vertically centered like the chicken', () => {
    const { model } = buildFarmerDisplayModel(rawFarmerModel());

    const box = new THREE.Box3().setFromObject(model, true);
    const center = new THREE.Vector3();
    box.getCenter(center);

    expect(center.x).toBeCloseTo(0, 5);
    expect(center.z).toBeCloseTo(0, 5);
    expect(box.min.y).toBeCloseTo(0, 5);
  });

  it('clones every material rather than mutating the source in place -- required so a later TIRED tint never bleeds into the app-lifetime cached source', () => {
    const source = rawFarmerModel();
    const sourceMaterial = (source.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const { model } = buildFarmerDisplayModel(source);

    const cloneMaterial = (model.children[0].children[0].children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(cloneMaterial).not.toBe(sourceMaterial);

    cloneMaterial.color.setHex(0xff0000);
    expect(sourceMaterial.color.getHex()).not.toBe(0xff0000);
  });

  it('forces metalness to 0 on every cloned MeshStandardMaterial (same near-black-under-no-envMap fix as buildStructureDisplayModel)', () => {
    const { ownedMaterials } = buildFarmerDisplayModel(rawFarmerModel());
    for (const material of ownedMaterials) {
      expect((material as THREE.MeshStandardMaterial).metalness).toBe(0);
    }
  });

  it('excludes materials named Eye/Eyebrows from tintTargets (amber eyes would read as sickly, ADR 0015 §2)', () => {
    const { tintTargets } = buildFarmerDisplayModel(rawFarmerModel());
    const names = tintTargets.map((m) => m.name);
    expect(names).toContain('Skin');
    expect(names).not.toContain('Eye');
    expect(names).not.toContain('Eyebrows');
  });

  it('stashes each tint target\'s post-clone color as userData.baseColor, so a later multiply-tint is idempotent from a fresh instance', () => {
    const { tintTargets } = buildFarmerDisplayModel(rawFarmerModel());
    const skin = tintTargets.find((m) => m.name === 'Skin')!;
    expect((skin.userData.baseColor as THREE.Color).getHex()).toBe(new THREE.Color(0x8899aa).getHex());
  });

  it('ownedMaterials includes every cloned material, tintable or not (Eye/Eyebrows are cloned/metalness-fixed but just excluded from tinting)', () => {
    const { ownedMaterials } = buildFarmerDisplayModel(rawFarmerModel());
    const names = ownedMaterials.map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(['Skin', 'Eye', 'Eyebrows']));
    expect(ownedMaterials).toHaveLength(3);
  });

  it('keeps the corrective scale/centering on an inner group, not the returned outer object', () => {
    const { model } = buildFarmerDisplayModel(rawFarmerModel());
    expect(model.position.toArray()).toEqual([0, 0, 0]);
    expect(model.scale.toArray()).toEqual([1, 1, 1]);
  });
});

describe('buildRiverMesh (issue #47, procedural river ribbon)', () => {
  it('builds a triangle-strip mesh with two vertices per route point and no crash for a normal route', () => {
    const route = [
      { x: -10, z: 0 },
      { x: 0, z: 1 },
      { x: 10, z: 0 },
    ];
    const mesh = buildRiverMesh(route, 3) as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    const position = mesh.geometry.getAttribute('position');
    expect(position.count).toBe(route.length * 2);
    expect(mesh.geometry.getIndex()?.count).toBe((route.length - 1) * 6);
  });

  it('degrades gracefully (AC7) to an empty, childless group for a degenerate route (fewer than 2 points), never crashing', () => {
    expect(() => buildRiverMesh([], 3)).not.toThrow();
    const empty = buildRiverMesh([], 3);
    expect(empty.children.length).toBe(0);
    expect(empty).not.toBeInstanceOf(THREE.Mesh);

    expect(() => buildRiverMesh([{ x: 0, z: 0 }], 3)).not.toThrow();
    const single = buildRiverMesh([{ x: 0, z: 0 }], 3);
    expect(single.children.length).toBe(0);
  });

  it('every ribbon vertex sits at the configured surface height, just above ground level', () => {
    const route = [
      { x: -5, z: 5 },
      { x: 5, z: 5 },
    ];
    const mesh = buildRiverMesh(route, 2) as THREE.Mesh;
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(0.5);
    }
  });
});

describe('computeFarmerHeading (issue #57 follow-up -- farmer facing-direction fix)', () => {
  // Convention check: 0 = facing +Z, direction vector (sin(heading),
  // cos(heading)) -- the same one truck-motion.ts's TruckMotionState.heading
  // doc comment and setTruckTransform already use.
  it('derives heading from the movement delta when a previous position is known, matching the (sin, cos) convention', () => {
    // Moved purely in +Z: heading should be 0.
    expect(computeFarmerHeading({ x: 0, z: 0 }, { x: 0, z: 5 })).toBeCloseTo(0, 6);
    // Moved purely in +X: heading should be +PI/2.
    expect(computeFarmerHeading({ x: 0, z: 0 }, { x: 5, z: 0 })).toBeCloseTo(Math.PI / 2, 6);
    // Moved purely in -Z (e.g. LEAVING, walking straight back): heading should be PI.
    expect(computeFarmerHeading({ x: 0, z: 0 }, { x: 0, z: -5 })).toBeCloseTo(Math.PI, 6);
    // Moved purely in -X: heading should be -PI/2.
    expect(computeFarmerHeading({ x: 0, z: 0 }, { x: -5, z: 0 })).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('falls back to facing referencePosition (the truck) when there is no previous position -- the fresh-onAppear case', () => {
    // Truck due north (+Z) of where the farmer just spawned.
    const heading = computeFarmerHeading(undefined, { x: 0, z: 0 }, { x: 0, z: 10 });
    expect(heading).toBeCloseTo(0, 6);

    // Truck due east (+X).
    const heading2 = computeFarmerHeading(undefined, { x: 0, z: 0 }, { x: 10, z: 0 });
    expect(heading2).toBeCloseTo(Math.PI / 2, 6);
  });

  it('returns undefined (leave rotation untouched) when there is neither a previous position nor a reference position', () => {
    expect(computeFarmerHeading(undefined, { x: 3, z: 4 })).toBeUndefined();
  });

  it('returns undefined for a negligible movement delta, so the farmer never snaps to an arbitrary heading (or NaN from atan2(0,0)) while effectively stationary -- e.g. across the TIRED beat', () => {
    expect(computeFarmerHeading({ x: 5, z: 5 }, { x: 5, z: 5 })).toBeUndefined();
    expect(computeFarmerHeading({ x: 5, z: 5 }, { x: 5.0000001, z: 5 })).toBeUndefined();
  });

  it('ignores referencePosition once a previous position exists -- movement delta always wins over the fallback', () => {
    // Farmer moved toward +Z, but referencePosition (truck) is off to the
    // side -- the real movement delta must still win.
    const heading = computeFarmerHeading({ x: 0, z: 0 }, { x: 0, z: 5 }, { x: 100, z: 0 });
    expect(heading).toBeCloseTo(0, 6);
  });

  it('returns undefined, not a stale heading toward an unmoving referencePosition, when the farmer has no previous position and is already coincident with referencePosition', () => {
    expect(computeFarmerHeading(undefined, { x: 2, z: 2 }, { x: 2, z: 2 })).toBeUndefined();
  });
});

// Minimal fake DOM surface `createGameScene` actually touches: a container
// with numeric client dimensions + appendChild/removeChild, and a window
// with addEventListener/removeEventListener (the resize listener) plus
// devicePixelRatio. Same idiom as builder.test.ts's FakeElement/FakeWindow,
// trimmed to what scene.ts needs (no click/keydown dispatch required here).
class FakeContainer {
  clientWidth = 800;
  clientHeight = 600;
  appendChild(_child: unknown): void {}
  removeChild(_child: unknown): void {}
}

class FakeWindow {
  devicePixelRatio = 1;
  private listeners = new Map<string, Array<(e: unknown) => void>>();
  addEventListener(type: string, fn: (e: unknown) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }
  removeEventListener(type: string, fn: (e: unknown) => void): void {
    const arr = this.listeners.get(type);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  }
}

const LIFECYCLE_BOUNDS: TerrainBounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
const LIFECYCLE_BUILD: TruckBuild = { body: 0, wheels: 0, engine: 0, gasTank: 0 };
const LIFECYCLE_COSMETICS: TruckCosmetics = { wheelLook: 'standard' };

/** A rigged pig-shaped fixture (one SkinnedMesh + one bone), carrying real
 * `Idle`/`Jump` clips under the exact names scene.ts looks up by -- the
 * shape `AssetRegistry.getAnimated('pig')` would hand back for a real
 * pig.glb, per the fake-loader technique asset-registry.test.ts's
 * `fakeSkinnedScene` already established for the farmer's equivalent case. */
function fakePigGltf(): { scene: THREE.Object3D; animations: THREE.AnimationClip[] } {
  const bone = new THREE.Bone();
  const skeleton = new THREE.Skeleton([bone]);
  const geometry = new THREE.CylinderGeometry(0.2, 0.2, 1, 4);
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    skinIndices.push(0, 0, 0, 0);
    skinWeights.push(1, 0, 0, 0);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.add(bone);
  mesh.bind(skeleton);
  const root = new THREE.Group();
  root.add(mesh);
  return {
    scene: root,
    animations: [new THREE.AnimationClip('Armature|Idle', 1, []), new THREE.AnimationClip('Armature|Jump', 1, [])],
  };
}

describe('Scene animal lifecycle -- pig/cow animated dispose/orientation wiring (issue #48, ADR 0016 §7/§8)', () => {
  let fakeWindow: FakeWindow;
  let scene: ReturnType<typeof import('./scene').createGameScene>;
  let registry: AssetRegistry;

  beforeEach(async () => {
    fakeWindow = new FakeWindow();
    vi.stubGlobal('window', fakeWindow);

    const loader: GltfLoaderLike = { loadAsync: () => Promise.resolve(fakePigGltf()) };
    registry = new AssetRegistry(loader);
    registry.load('pig', 'fake://pig.glb');
    await registry.waitFor(['pig'], 1000); // settles synchronously-fast since the fake loader never actually waits

    const { createGameScene } = await import('./scene');
    scene = createGameScene(
      new FakeContainer() as unknown as HTMLElement,
      LIFECYCLE_BOUNDS,
      [],
      [],
      [],
      LIFECYCLE_BUILD,
      LIFECYCLE_COSMETICS,
      registry,
    );
  });

  afterEach(() => {
    scene.dispose();
    vi.unstubAllGlobals();
  });

  /** Spawns 'pig-1' at `spawnPos` and ticks once so `tickEffects`'s
   * upgrade-in-place check (ADR 0016 §4) swaps the primitive for the real
   * animated model, builds its mixer, and starts Idle -- mirroring exactly
   * what main.ts's onSpawn -> tickEffects sequence does each frame. Returns
   * the live `AnimatedAnimalModel` object3D via a `THREE.Group.prototype.add`
   * spy (record's internal state isn't otherwise reachable from outside the
   * closure), so assertions below check the real object the production code
   * manipulates, not a re-implementation of it. */
  function spawnAndUpgradePig(spawnPos: { x: number; z: number }): THREE.Object3D {
    const addSpy = vi.spyOn(THREE.Scene.prototype, 'add');
    scene.upsertAnimal('pig-1', spawnPos, 'pig');
    scene.tickEffects(0);
    const upgraded = addSpy.mock.calls.map((call) => call[0]).find((obj) => obj.name === 'AnimatedAnimalModel');
    addSpy.mockRestore();
    if (!upgraded) throw new Error('test setup failed: pig never upgraded to its animated model');
    return upgraded;
  }

  it('scatterAnimal rotates the real in-scene model to face the flee direction, not just leaving it at its spawn orientation (issue #57-class regression guard, ADR 0016 §7)', () => {
    const model = spawnAndUpgradePig({ x: 1, z: 1 });
    expect(model.rotation.y).toBe(0); // untouched pre-scatter, per §7 "faces default source orientation"

    // Flee purely in +X from the spawn point -- computeFarmerHeading's own
    // tested convention (scene.test.ts above) says that's +PI/2; this
    // asserts the *production wiring* actually applies that to the real
    // object, which is the part computeFarmerHeading's own unit tests can't
    // see.
    scene.scatterAnimal('pig-1', { x: 6, z: 1 });
    expect(model.rotation.y).toBeCloseTo(Math.PI / 2, 6);
  });

  it('removeAnimal disposes the upgraded pig\'s owned cloned materials and stops its mixer (ADR 0016 §8 material-leak guard)', () => {
    spawnAndUpgradePig({ x: 0, z: 0 });

    const materialDisposeSpy = vi.spyOn(THREE.MeshStandardMaterial.prototype, 'dispose');
    const mixerStopSpy = vi.spyOn(THREE.AnimationMixer.prototype, 'stopAllAction');

    scene.removeAnimal('pig-1');

    expect(materialDisposeSpy).toHaveBeenCalled();
    expect(mixerStopSpy).toHaveBeenCalledTimes(1);

    materialDisposeSpy.mockRestore();
    mixerStopSpy.mockRestore();
  });

  it('does not crash and builds a fresh mixer/materials for a respawned pig after a previous one was removed (no reference to disposed resources)', () => {
    spawnAndUpgradePig({ x: 0, z: 0 });
    scene.removeAnimal('pig-1');

    // A new id -- upsertAnimal/tickEffects never reuse a removed record, so
    // this exercises a brand-new AnimationMixer + cloned materials built
    // after the first instance's were disposed.
    expect(() => {
      scene.upsertAnimal('pig-2', { x: 3, z: 3 }, 'pig');
      scene.tickEffects(0.1); // upgrade + a real mixer.update tick on the fresh mixer
    }).not.toThrow();
  });

  it('places the upgraded animated model at the local terrain height under it, not a hardcoded flat y=0 (issue #58 regression guard)', async () => {
    const { terrainHeightAt } = await import('../core/terrain-height');
    // Far from every obstacle/structure/river/truck-start flatten zone
    // (well inside the small LIFECYCLE_BOUNDS used by this describe block),
    // so the hill field is at full, nonzero strength here -- a spawn point
    // that would previously expose the bug (model snapping down to y=0
    // instead of the hill's actual height).
    const spawnPos = { x: 19, z: 3 };
    const expectedY = terrainHeightAt(spawnPos);
    expect(Math.abs(expectedY)).toBeGreaterThan(0.05); // sanity: this point is actually on a hill

    const model = spawnAndUpgradePig(spawnPos);

    expect(model.position.y).toBeCloseTo(expectedY, 5);
  });

  it('dispose() tears down a still-live upgraded pig\'s owned cloned materials and mixer, not just the farmer (code review follow-up on issue #48, ADR 0016 §8)', () => {
    // Deliberately don't call scene.removeAnimal first -- this is exactly
    // the leak code review caught: dispose() used to call farmerDespawn()
    // but never walked animalSlots, so a live animal at teardown time (the
    // common case per ADR 0016 §8/Risks, not a corner case) leaked its
    // cloned materials and left its mixer running.
    spawnAndUpgradePig({ x: 0, z: 0 });

    const materialDisposeSpy = vi.spyOn(THREE.MeshStandardMaterial.prototype, 'dispose');
    const mixerStopSpy = vi.spyOn(THREE.AnimationMixer.prototype, 'stopAllAction');

    scene.dispose();

    expect(materialDisposeSpy).toHaveBeenCalled();
    expect(mixerStopSpy).toHaveBeenCalledTimes(1);

    materialDisposeSpy.mockRestore();
    mixerStopSpy.mockRestore();
    // afterEach also calls scene.dispose() -- verify a second call (mirroring
    // production teardown paths that might dispose defensively) doesn't
    // throw now that animalSlots has already been drained once.
    expect(() => scene.dispose()).not.toThrow();
  });
});
