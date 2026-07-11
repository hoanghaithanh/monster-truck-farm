import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTruckRig } from './truck-rig';
import {
  buildChickenDisplayModel,
  buildFarmerDisplayModel,
  buildRiverMesh,
  buildStructureDisplayModel,
  carryOverWheelRotations,
  computeFarmerHeading,
} from './scene';
import type { TruckBuild, TruckCosmetics } from '../core/types';

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

describe('buildChickenDisplayModel (issue #28, chicken sourced-art scale/centering)', () => {
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
    const model = buildChickenDisplayModel(offCenterRawModel());

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Raw height was 80 -- whatever CHICKEN_TARGET_HEIGHT is tuned to today,
    // the *rendered* height after correction must match it exactly.
    expect(size.y).toBeCloseTo(0.5, 5);
  });

  it('re-centers the model so its bounding-box center lands at the returned object\'s local origin', () => {
    const model = buildChickenDisplayModel(offCenterRawModel());

    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);

    expect(center.x).toBeCloseTo(0, 5);
    expect(center.y).toBeCloseTo(0, 5);
    expect(center.z).toBeCloseTo(0, 5);
  });

  it('keeps the corrective scale/centering on an inner group, not the returned outer object -- so UpgradableObject.upgrade() overwriting the outer object\'s transform can never clobber it', () => {
    const model = buildChickenDisplayModel(offCenterRawModel());

    // The outer object itself must start with an identity transform: it's
    // the one UpgradableObject.upgrade() will overwrite with the outgoing
    // primitive's position/rotation/scale (scene.ts's own doc comment on
    // buildChickenDisplayModel explains why).
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
