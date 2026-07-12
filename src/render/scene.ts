import * as THREE from 'three';
import type { AnimalSpecies, ObstacleInstance, TruckBuild, TruckCosmetics, Vec2 } from '../core/types';
import {
  DECORATIVE_TREES,
  RIVER_ROUTE,
  RIVER_WIDTH,
  type FenceInstance,
  type StructureInstance,
  type TerrainBounds,
  type TreeInstance,
} from '../core/terrain';
import { clampCameraToBounds } from '../core/driving/boundary';
import { terrainHeightAt } from '../core/terrain-height';
import type { AssetRegistry } from './assets/asset-registry';
import { ANIMAL_ASSET_KEYS, FARMER_ASSET_KEY, FENCE_ASSET_KEY, STRUCTURE_ASSET_KEYS, TREE_ASSET_KEY, truckAssetKeysForBuild } from './assets/manifest';
import { createUpgradableObject, type UpgradableObject } from './assets/upgradable-object';
import { buildTruckRig, type TruckWheelPivots } from './truck-rig';
import { TRUCK_SCALE, WHEEL_RADIUS_BY_TIER } from './truck-sockets';

/**
 * Copies each wheel's current roll/steer angle from `from` onto the matching
 * pivot in `to` (issue #44) -- extracted to a small, DOM/WebGL-free pure
 * function specifically so it's unit-testable on its own (scene.test.ts):
 * `createGameScene`'s returned closure needs a real `THREE.WebGLRenderer`
 * (this project's test env is plain Node, no jsdom/canvas), but this one
 * step of `tickEffects`'s rig-rebuild path has no such dependency. The cast
 * inside is safe by construction: both `from` and `to` are `TruckWheelPivots`
 * literals assembled by the same `buildTruckRig` (truck-rig.ts), so they
 * always share the exact same four keys (frontLeft/frontRight/rearLeft/rearRight).
 */
export function carryOverWheelRotations(from: TruckWheelPivots, to: TruckWheelPivots): void {
  for (const key of Object.keys(from) as (keyof TruckWheelPivots)[]) {
    to[key].roll.rotation.x = from[key].roll.rotation.x;
    to[key].steer.rotation.y = from[key].steer.rotation.y;
    // Suspension travel continuity (issue #63/ADR 0018 §4's "carryOverWheelRotations
    // also carries travel.position.y on rebuild"): without this, an in-place
    // asset-upgrade rebuild mid-obstacle-crossing would snap every wheel's
    // vertical offset back to 0 for one frame, the same visible "snap back"
    // this function already exists to prevent for roll/steer (issue #44).
    to[key].travel.position.y = from[key].travel.position.y;
  }
}

// Chase camera stays this far inset from the ground plane's edge so a
// corner position never lets the camera see past the ground into the
// scene background/"void" (issue #17, drive AC4 intent).
const CAMERA_GROUND_MARGIN = 3;

// Chase camera distance/height (issue #60, human playtest report on the
// #49 100x100 map): previously 6 units behind / 5 units up, which put the
// look-down angle at ~37 degrees off the horizon -- fine on the old 40x40
// map but too steep to see far across the new, much bigger terrain (mostly
// looking at nearby ground rather than the horizon). Pulled back to 8/4.2,
// a shallower ~22-degree angle that reads noticeably more of the map while
// driving, without losing the truck (still well within the 260 far plane)
// and without flattening the obstacle-climb lift/pitch/roll readability
// (ADR 0013/0014) -- verified live, see issue #60 hand-off screenshots.
const CAMERA_CHASE_DISTANCE = 8;
const CAMERA_CHASE_HEIGHT = 4.2;

// Wheel roll/steer (issue #40, truck-wheel-motion AC1-AC7): purely visual,
// render-only motion layered on top of the truck rig's wheel pivots
// (truck-rig.ts's WheelPivots) -- zero effect on the kinematic controller,
// obstacle resolution, or any driving math (AC8). Front-wheel max steer-yaw
// (truck-wheel-motion doc's Open Question 2, non-blocking, tuning value
// left to the developer): 30 degrees reads as "clearly turning" without
// looking cartoonish at the truck's actual turn rate.
const MAX_FRONT_WHEEL_STEER_YAW = THREE.MathUtils.degToRad(30);

// Farmer bump feedback (farmer AC5): a brief flash on the truck, distinct
// from the animal-boop reward feel and never scary/violent -- just "something
// happened to me". Decays back to fully transparent over this duration.
// ADR 0011: the truck body's own material is now one of the shared,
// never-mutated cosmetic paint materials (render/cosmetics/cosmetic-manifest.ts)
// -- mutating its .color per-bump would bleed into every other truck sharing
// that colour (including the builder preview). So this flash is a separate
// translucent overlay mesh, following the same disposable-burst-effect
// pattern already used for the fuel-collect glow below, rather than a
// mutation of the truck's own paint.
const BUMP_FLASH_SECONDS = 0.3;
const TRUCK_FLASH_COLOR = 0xff3b3b;
const FARMER_COLOR = 0xd1495b;
// TIRED give-up beat (ADR 0007 §1, farmer AC7 tone): a friendly amber tint,
// distinct from the truck's bump-flash red -- "phew, giving up", not scary.
const FARMER_TIRED_COLOR = 0xf4c542;

// Farmer skeletal model (issue #29, ADR 0015). Clip names are the ONLY three
// ever referenced out of the sourced .glb's 24-clip library (ADR 0015 §4) --
// deliberately, since several of the others are combat/tool clips that would
// break the kid-safe tone constraint (vehicle-art AC9) if accidentally shown.
const FARMER_CLIP_RUN = 'CharacterArmature|Run';
const FARMER_CLIP_IDLE = 'CharacterArmature|Idle';
const FARMER_CLIP_WALK = 'CharacterArmature|Walk';
// Short enough that the TIRED pose still reads as its own beat within
// FARMER_TIRED_DURATION (ADR 0015 §4/Risks -- cross-ADR coupling with
// ADR 0007's FARMER_TIRED_DURATION, currently ~1.5s).
const FARMER_CROSSFADE_SECONDS = 0.25;
// Roughly matches the previous CapsuleGeometry(0.35, 0.8, 4, 8) placeholder's
// total height (~1.5) plus a bit, so the real model doesn't look shrunken or
// oversized next to the truck/terrain it replaces -- same "derive scale from
// the model's own measured bounding box, tune only the target constant"
// convention as CHICKEN_TARGET_HEIGHT (buildChickenDisplayModel).
const FARMER_TARGET_HEIGHT = 1.7;
// Amber eyes would read as sickly/unwell against the friendly/comedic TIRED
// tone (vehicle-art AC9, ADR 0015 §2) -- these two materials are excluded
// from the tint-target list so the face stays untinted.
const FARMER_TINT_EXCLUDED_MATERIAL_NAMES = new Set(['Eye', 'Eyebrows']);

// Pig/cow skeletal models (issue #48, ADR 0016 §3/§6). Clip names are the
// ONLY two ever referenced per species out of each sourced .glb's clip
// library -- deliberately: cow's unused `Walk`/`WalkSlow`/`Death` and pig's
// unused clips beyond `Idle`/`Jump` are never wired up, matching the
// kid-safe clip-exclusion discipline the farmer's unused combat clips
// already established (CREDITS.md's "Pig and cow models" section).
const PIG_CLIP_IDLE = 'Armature|Idle';
const PIG_CLIP_JUMP = 'Armature|Jump';
const COW_CLIP_IDLE = 'Armature|Idle';
const COW_CLIP_RUN = 'Armature|Run';
// Short crossfade so the Idle->scatter-clip switch reads promptly within the
// brief SCATTER_DURATION_SECONDS (0.4s) flee window (ADR 0016 Risks) --
// shorter than the farmer's 0.25s since the whole scatter is itself shorter
// than a farmer FSM beat.
const ANIMAL_CROSSFADE_SECONDS = 0.15;
// Target standing heights (meters), tuned proportionate to the confirmed
// medium/large size tiers and CHICKEN_TARGET_HEIGHT (0.5)/FARMER_TARGET_HEIGHT
// (1.7) above -- a pig reads as roughly waist-high, a cow roughly
// shoulder-to-chest-high next to the farmer, confirmed by a live screenshot
// in the driving scene per ADR 0016 §7's mandate.
const PIG_TARGET_HEIGHT = 0.9;
const COW_TARGET_HEIGHT = 1.4;

// Fuel pickup (ADR 0008 §3): a recognizable jerry-can-ish color, and a brief
// positive glow burst on collection -- no scatter (fuel AC13), just a
// friendly sparkle then gone.
const FUEL_COLOR = 0xffd23f;
const FUEL_GLOW_COLOR = 0xffffff;
const FUEL_GLOW_SECONDS = 0.35;

// Thin rendering adapter (ADR 0001 §4/§7): three.js meshes only, no
// gameplay rules live here. systems/ tells this module where things are;
// this module just draws them.

const OBSTACLE_COLORS: Record<ObstacleInstance['kind'], number> = {
  bush: 0x3fa34d,
  rock: 0x8a8a8a,
  derelictCar: 0x6b4a2f,
};

function buildObstacleGeometry(obstacle: ObstacleInstance): { geometry: THREE.BufferGeometry; height: number } {
  if (obstacle.kind === 'bush') {
    return { geometry: new THREE.SphereGeometry(obstacle.radius, 12, 10), height: obstacle.radius };
  }
  if (obstacle.kind === 'rock') {
    return { geometry: new THREE.IcosahedronGeometry(obstacle.radius, 0), height: obstacle.radius };
  }
  return { geometry: new THREE.BoxGeometry(obstacle.radius * 2, 1.2, obstacle.radius), height: 0.6 };
}

function createObstacleMesh(obstacle: ObstacleInstance): THREE.Object3D {
  const { geometry, height } = buildObstacleGeometry(obstacle);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: OBSTACLE_COLORS[obstacle.kind] }));
  mesh.position.set(obstacle.position.x, height, obstacle.position.z);
  return mesh;
}

// Chicken sourced-art (issue #28): the sourced "Hen" glTF's raw geometry is
// baked at an unusual scale with no corrective node transform (measured raw
// bounding-box height ~77 units -- not meters, and not any tidy round
// number), so the corrective scale is *derived from the model's own
// measured bounding box* at load time (buildStaticAnimalDisplayModel below)
// rather than hand-picked as a magic constant -- robust if the asset is
// ever swapped for a different sourced model with different raw units.
// CHICKEN_TARGET_HEIGHT is the one tuned number: chosen to roughly match
// the previous BoxGeometry(0.5,0.5,0.5) primitive's footprint next to the
// truck/terrain -- confirmed by a live screenshot in the driving scene
// (small, farm-appropriately-sized, not clipping/floating/oversized).
const CHICKEN_TARGET_HEIGHT = 0.5;

/**
 * Wraps a freshly-cloned static-mesh animal source model (from
 * `AssetRegistry.get`) in a corrective group: re-centered and scaled (from
 * the model's own measured bounding box) so it renders at `targetHeight`
 * with its bounding center at the wrapper's local origin -- matching how the
 * primitive `BoxGeometry(0.5,0.5,0.5)` it replaces is itself centered at its
 * own local origin. That means `upsertAnimal`'s existing
 * `mesh.position.set(x, 0.3, z)` call (made on the primitive, which
 * `UpgradableObject.upgrade()` then copies onto the object returned here)
 * needs no change to keep the animal resting on the ground the same way the
 * box did.
 *
 * Generalized from the issue #28-era `buildChickenDisplayModel` (issue #48,
 * ADR 0016 §3) so it's parameterized on target height rather than
 * chicken-hardcoded -- chicken remains its only caller (pig/cow are rigged
 * `SkinnedMesh` models with animation clips and go through
 * `buildAnimatedAnimalDisplayModel` below instead, per ADR 0016 §3's
 * "neither species is bent through the other's code" split).
 *
 * The correction lives on an *inner* group, not the returned outer one,
 * deliberately: `UpgradableObject.upgrade()` overwrites the position/
 * rotation/scale of whatever object it's given with the outgoing
 * primitive's own transform (see upgradable-object.ts), so a correction
 * applied directly to the returned object would be clobbered the instant
 * `upgrade()` runs.
 */
export function buildStaticAnimalDisplayModel(source: THREE.Object3D, targetHeight: number): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(source);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  source.position.sub(center);

  const scaleFactor = size.y > 0 ? targetHeight / size.y : 1;
  const inner = new THREE.Group();
  inner.name = 'AnimalDisplayScale';
  inner.scale.setScalar(scaleFactor);
  inner.add(source);

  const outer = new THREE.Group();
  outer.name = 'AnimalModel';
  outer.add(inner);
  return outer;
}

// Structures (issue #46, ADR 0012 §2): always-solid scenery (windmill/barn/
// farmhouse/mountain), rendered via the same primitive-fallback ->
// AssetRegistry -> UpgradableObject pattern the chicken (issue #28)
// established. Unlike animals, structures are static (create-once, no
// per-frame position tracking) -- see createGameScene's structuresGroup
// below. 'mountain' added in the issue #47 redesign (ADR 0012 addendum,
// AC3a): the landmark mountain is just a fourth `StructureKind`, so it
// needs a fallback color/primitive shape here like the other three, but no
// new rendering machinery.
const STRUCTURE_PRIMITIVE_COLORS: Record<StructureInstance['kind'], number> = {
  windmill: 0xd8c9a3,
  barn: 0xb23a2f,
  farmhouse: 0xe8dcb8,
  mountain: 0x8a8a80,
  // issue #54, ADR 0019 §4: silo/chickenCoop widen the same fixed color-per-kind
  // fallback map -- silvery-grey for the silo (real grain silos are typically
  // galvanized metal), warm brown/white for the small coop, distinct from the
  // barn's darker red so the two read as different buildings even as flat
  // fallback primitives.
  silo: 0xc7cdd1,
  chickenCoop: 0xd9a066,
};

/**
 * A simple, recognizable primitive stand-in for each structure kind (AC7's
 * "falls back to a simple placeholder"), sized off the structure's own
 * `footprintRadius` -- the same simplified-footprint sizing philosophy ADR
 * 0012 §2 uses for the physics collider, reused here for visual consistency.
 * Geometry is translated so the mesh's local origin sits at its *base*
 * (y=0), not its center -- unlike the small obstacle primitives above, a
 * multi-unit-tall building floating/sinking by half its height would be an
 * obvious defect, so both the primitive and (`buildStructureDisplayModel`
 * below) the corrected real model share this "local origin = ground contact
 * point" convention, letting `UpgradableObject.upgrade()`'s position-copy
 * behave correctly with no special-casing.
 */
function buildStructurePrimitive(structure: StructureInstance): THREE.Object3D {
  const r = structure.footprintRadius;
  let geometry: THREE.BufferGeometry;
  let height: number;
  if (structure.kind === 'windmill') {
    height = r * 3;
    geometry = new THREE.CylinderGeometry(r * 0.4, r * 0.7, height, 10);
  } else if (structure.kind === 'mountain') {
    // A cone reads as "mountain" at a glance far better than the generic
    // box fallback the other buildings use -- cheap and worth it since this
    // fallback is what a slow/failed asset load leaves on screen (AC7).
    // Height target matches the real model's derivation (terrain.ts's own
    // footprintRadius comment): ~3.46x the footprint radius gets close to
    // the ~16.3-unit target height for this structure's actual r=4.71.
    height = r * 3.46;
    geometry = new THREE.ConeGeometry(r, height, 12);
  } else if (structure.kind === 'silo') {
    // issue #54: a tall, uniform (untapered) cylinder reads as "grain silo"
    // at a glance and is visually distinct from the windmill's tapered
    // tower shape above -- ~4.9x the footprint radius matches this
    // structure's own targetHeight/footprintRadius derivation (terrain.ts's
    // placement comment: targetHeight 8 / footprintRadius 1.62 ~= 4.94).
    height = r * 4.94;
    geometry = new THREE.CylinderGeometry(r * 0.85, r * 0.85, height, 12);
  } else {
    height = r * 1.6;
    geometry = new THREE.BoxGeometry(r * 2, height, r * 1.6);
  }
  geometry.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: STRUCTURE_PRIMITIVE_COLORS[structure.kind] }));
  mesh.position.set(structure.position.x, 0, structure.position.z);
  return mesh;
}

/**
 * Wraps a freshly-cloned structure source model (from `AssetRegistry.get`)
 * in a corrective group, following the same "derive the scale from the
 * model's own measured bounding box, don't hand-pick a magic constant"
 * pattern `buildChickenDisplayModel` established (issue #28) -- the three
 * sourced windmill/barn/farmhouse `.glb`s were each authored/exported at
 * their own unrelated raw scale (see the orchestrator's sourcing notes,
 * issue #46), so a single hardcoded scale constant would be wrong for at
 * least two of the three.
 *
 * Unlike the chicken (which centers on all three axes -- acceptable for a
 * small animal), this keeps the model's *base* at the wrapper's local
 * origin (only x/z are re-centered, not y) so a multi-unit-tall building
 * sits on the ground rather than floating/sinking by half its height --
 * matching `buildStructurePrimitive`'s "local origin = ground contact
 * point" convention above, so `UpgradableObject.upgrade()`'s position-copy
 * (primitive -> real model) requires no special-casing.
 *
 * `targetWidth` is the structure's own `footprintRadius * 2` (passed by the
 * caller) -- scaling anchored to the model's horizontal (max of X/Z) extent
 * so the visual footprint tracks the same authored constant the physics
 * collider uses, keeping the two from silently drifting apart.
 *
 * The correction lives on an *inner* group, not the returned outer one, for
 * the same reason `buildChickenDisplayModel` does: `UpgradableObject.upgrade()`
 * overwrites the outer object's position/rotation/scale with the outgoing
 * primitive's own transform, which would clobber a correction applied
 * directly to the returned object.
 *
 * Metalness override (2026-07-10, issue #47 mountain landmark follow-up):
 * the mountain model's sourced "Stone"/"Snow"/"Dirt" materials ship
 * `metallicFactor: 0.4` (vs. `0` on every other structure/asset in this
 * project -- barn/windmill/farmhouse/chicken/truck are all fully diffuse),
 * which under `MeshStandardMaterial`'s PBR model means that fraction of the
 * surface's appearance is expected to come from reflecting a scene
 * `envMap`. This project's lighting setup has no `envMap` (nothing else
 * needs one), so a nonzero metalness with no environment to reflect renders
 * visibly darker than it should -- confirmed via live before/after pixel
 * sampling (average brightness across the rendered silhouette rose ~36%
 * with this override applied). Forcing `metalness` to 0 on every material
 * of the loaded clone is a physically-motivated consistency fix matching
 * this project's diffuse-only material convention, not a recolor --
 * `color`/`roughness`/textures are untouched, and the source `.glb` on disk
 * is never modified (this only mutates the per-clone material instance
 * `AssetRegistry.get()` already hands the caller to own). Applied here
 * (generically, to every structure) rather than as a mountain-only special
 * case: it's a no-op for barn/windmill/farmhouse, which already ship
 * `metallicFactor: 0`.
 */
export function buildStructureDisplayModel(source: THREE.Object3D, targetWidth: number): THREE.Object3D {
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = child.material;
    if (Array.isArray(material)) {
      for (const m of material) {
        if (m instanceof THREE.MeshStandardMaterial) m.metalness = 0;
      }
    } else if (material instanceof THREE.MeshStandardMaterial) {
      material.metalness = 0;
    }
  });

  const box = new THREE.Box3().setFromObject(source);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  source.position.x -= center.x;
  source.position.z -= center.z;
  source.position.y -= box.min.y;

  const horizontalExtent = Math.max(size.x, size.z);
  const scaleFactor = horizontalExtent > 0 ? targetWidth / horizontalExtent : 1;
  const inner = new THREE.Group();
  inner.name = 'StructureDisplayScale';
  inner.scale.setScalar(scaleFactor);
  inner.add(source);

  const outer = new THREE.Group();
  outer.name = 'StructureModel';
  outer.add(inner);
  return outer;
}

// Fences (issue #54, ADR 0019 §5, AC8): a `FenceInstance` is NOT a
// `StructureInstance` (core/terrain.ts's own doc comment), so it gets its
// own small primitive/display-model pair rather than reusing
// buildStructurePrimitive/buildStructureDisplayModel -- structurally
// distinct from every other structure since it also needs a standing-vs-
// collapsed *pose* swap at runtime (collapseFence below), on top of the
// primitive-vs-real-model swap every other structure already has.
const FENCE_PRIMITIVE_COLOR = 0xc8a97e;

/**
 * A simple picket-fence-colored plank as the AC10 fallback -- long/thin,
 * sized off the fence's own `footprintRadius` the same way
 * `buildStructurePrimitive` sizes off a structure's, yawed by
 * `fence.rotationY` (ADR 0019 §5: orientation is authored data, not
 * defaulted to 0). Local origin sits at the segment's ground-contact base
 * (translated the same way every other structure primitive is), so
 * `collapseFence`'s tip-over rotation below hinges around the ground line
 * rather than the segment's vertical center.
 */
function buildFencePrimitive(fence: FenceInstance): THREE.Object3D {
  const width = fence.footprintRadius * 2;
  const height = 1.1;
  const depth = 0.2;
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: FENCE_PRIMITIVE_COLOR }));
  mesh.position.set(fence.position.x, 0, fence.position.z);
  mesh.rotation.y = fence.rotationY;
  return mesh;
}

/**
 * Wraps a freshly-cloned fence source model, following the exact same
 * "measure the model's own raw bounding box, scale to the authored
 * footprint's width, re-anchor to ground contact" recipe
 * `buildStructureDisplayModel` uses -- fence.glb is a single-mesh/no-
 * texture/no-animation asset (CREDITS.md, issue #54) with no metalness
 * quirk to correct, so this is a smaller function than its structure
 * counterpart, not a divergent one. `targetWidth` is `fence.footprintRadius
 * * 2`, same convention as every structure caller.
 */
export function buildFenceDisplayModel(source: THREE.Object3D, targetWidth: number): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(source);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  source.position.x -= center.x;
  source.position.z -= center.z;
  source.position.y -= box.min.y;

  const horizontalExtent = Math.max(size.x, size.z);
  const scaleFactor = horizontalExtent > 0 ? targetWidth / horizontalExtent : 1;
  const inner = new THREE.Group();
  inner.name = 'FenceDisplayScale';
  inner.scale.setScalar(scaleFactor);
  inner.add(source);

  const outer = new THREE.Group();
  outer.name = 'FenceModel';
  outer.add(inner);
  return outer;
}

/**
 * Collapse pose swap (issue #54, ADR 0019 §5/§8, AC8): a symmetric
 * tip-forward flatten, satisfying the AC8/Risk note's "asset-dependent, a
 * broken-fence pose if one ships, else a simple tip-over" -- fence.glb ships
 * no dedicated broken-pose node (CREDITS.md), so this is the tip-over
 * fallback. Rotating the object's own local X axis by 90 degrees hinges the
 * standing plank down flat around its already-ground-anchored local origin
 * (both `buildFencePrimitive` and `buildFenceDisplayModel` place local
 * origin at the base), independent of whatever yaw (`rotation.y`) the
 * segment was already authored with -- so a fence collapses "flat along its
 * own boundary line" regardless of which way that line runs.
 *
 * Bug fixed 2026-07-12 (human live-playtest report): this previously wrote
 * `object.rotation.x = ...` directly, which does NOT compose the way the
 * comment above claims. THREE.Euler's default 'XYZ' order builds the final
 * matrix as Rx * Ry * Rz applied to local-space vectors -- so a nonzero
 * pre-existing `rotation.y` (the west-closing segment's authored
 * `Math.PI / 2` yaw) gets twisted by the *subsequent* X assignment instead
 * of being preserved, and the plank's long axis actually swings up to
 * point straight along world +Y (stands on end) rather than flattening.
 * `Object3D.rotateX` instead composes the rotation onto the object's own
 * *current* local X axis via quaternion multiplication -- true intrinsic
 * composition, correct regardless of any prior yaw already applied. For the
 * four zero-yaw segments this produces the exact same result as before
 * (nothing to regress); only the yawed segment's pose actually changes.
 */
export const FENCE_COLLAPSE_TIP_RADIANS = Math.PI / 2;
export function applyFenceCollapsePose(object: THREE.Object3D): void {
  object.rotateX(FENCE_COLLAPSE_TIP_RADIANS);
}

// Decorative trees (issue #54 amendment, ADR 0019 §A4): solid/unbreakable
// per the human's collidability override, but otherwise a pure scenery prop
// -- primitive-then-upgrade like every other structure/fence, but height-
// driven (like the chicken/farmer/pig/cow builders) rather than width-driven
// (like buildStructureDisplayModel), since a tree's canopy height matters
// far more to its silhouette than its exact footprint width.
const TREE_TRUNK_COLOR = 0x6b4a2f;
const TREE_CANOPY_COLOR = 0x3f8f4d;
/** Target rendered height (world units) for the real sourced model and the primitive fallback alike -- roughly farmhouse-scale, clearly shorter than the windmill/mountain landmarks so it reads as ordinary scenery, not another landmark. */
const TREE_TARGET_HEIGHT = 3.4;

/**
 * A classic cone-on-cylinder low-poly tree as the AC10 fallback (ADR 0019
 * §A4) -- cheap, recognizable at a glance, and degrades gracefully if the
 * sourced tree.glb fails to load. Sized off `TREE_TARGET_HEIGHT` and the
 * tree's own authored `scale` (default 1), local origin at the trunk's
 * ground-contact base, matching every other primitive builder's convention.
 */
function buildTreePrimitive(tree: TreeInstance): THREE.Object3D {
  const scale = tree.scale ?? 1;
  const totalHeight = TREE_TARGET_HEIGHT * scale;
  const trunkHeight = totalHeight * 0.35;
  const canopyHeight = totalHeight - trunkHeight;
  const trunkRadius = 0.18 * scale;
  const canopyRadius = 0.9 * scale;

  const group = new THREE.Group();
  const trunkGeometry = new THREE.CylinderGeometry(trunkRadius, trunkRadius * 1.2, trunkHeight, 8);
  trunkGeometry.translate(0, trunkHeight / 2, 0);
  const trunk = new THREE.Mesh(trunkGeometry, new THREE.MeshStandardMaterial({ color: TREE_TRUNK_COLOR }));
  group.add(trunk);

  const canopyGeometry = new THREE.ConeGeometry(canopyRadius, canopyHeight, 10);
  canopyGeometry.translate(0, trunkHeight + canopyHeight / 2, 0);
  const canopy = new THREE.Mesh(canopyGeometry, new THREE.MeshStandardMaterial({ color: TREE_CANOPY_COLOR }));
  group.add(canopy);

  group.position.set(tree.position.x, terrainHeightAt(tree.position), tree.position.z);
  group.rotation.y = tree.rotationY ?? 0;
  return group;
}

/**
 * Wraps a freshly-cloned tree source model, following the same measured-
 * bounding-box-derived scale/ground-anchor recipe `buildStructureDisplayModel`
 * uses, but height-driven (`targetHeight`) rather than width-driven -- a
 * tree's canopy height governs its visual scale far more than its exact
 * horizontal spread, unlike a building's footprint. `metalness` is force-
 * zeroed for the same physically-motivated reason `buildStructureDisplayModel`
 * already documents (this project's diffuse-only material convention, no
 * scene `envMap`).
 */
export function buildTreeDisplayModel(source: THREE.Object3D, targetHeight: number): THREE.Object3D {
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = child.material;
    if (Array.isArray(material)) {
      for (const m of material) {
        if (m instanceof THREE.MeshStandardMaterial) m.metalness = 0;
      }
    } else if (material instanceof THREE.MeshStandardMaterial) {
      material.metalness = 0;
    }
  });

  const box = new THREE.Box3().setFromObject(source);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  source.position.x -= center.x;
  source.position.z -= center.z;
  source.position.y -= box.min.y;

  const scaleFactor = size.y > 0 ? targetHeight / size.y : 1;
  const inner = new THREE.Group();
  inner.name = 'TreeDisplayScale';
  inner.scale.setScalar(scaleFactor);
  inner.add(source);

  const outer = new THREE.Group();
  outer.name = 'TreeModel';
  outer.add(inner);
  return outer;
}


// Farmer facing direction (issue #57 follow-up, human live-driving report
// 2026-07-10): the farmer's model previously never rotated to face his
// direction of travel -- he'd visibly slide sideways/backwards while
// PURSUING/LEAVING. Movement deltas below this distance are treated as "not
// actually moving" and don't update heading, so a near-stationary farmer
// (e.g. floating point jitter, or the one-frame gap around a TIRED entry)
// never snaps to an arbitrary heading or hits atan2(0, 0)'s NaN.
const FARMER_HEADING_EPSILON = 1e-4;

/**
 * Derives the farmer's facing heading (radians, same `0 = facing +Z`/
 * `(sin(heading), cos(heading))` convention `truck-motion.ts`'s
 * `TruckMotionState.heading` doc comment and `setTruckTransform` already use)
 * from how his position actually changed this call -- a pure, standalone
 * function (like `carryOverWheelRotations` above) specifically so it's
 * unit-testable without a `THREE.WebGLRenderer` (this project's test env has
 * no jsdom/canvas; `createGameScene` isn't constructible in vitest).
 *
 * `previous` is the farmer's position as of the *last* call (undefined only
 * on the very first placement -- `onAppear`, or a resumed non-ABSENT farmer,
 * per `FarmerRecord.previousPosition`'s doc comment). With no prior position
 * to diff against, this falls back to facing `referencePosition` (the
 * truck's current position, threaded through from `main.ts`) instead of
 * leaving the farmer facing an arbitrary/stale direction for even one frame
 * -- reasonable because PURSUING (the near-universal creation trigger, ADR
 * 0015 §4) always starts moving toward the truck anyway. If neither a real
 * movement delta nor `referencePosition` is available/nonzero, returns
 * `undefined` and the caller leaves the farmer's current rotation untouched
 * (this is what keeps him facing his last real heading through the
 * stationary TIRED beat, since `setFarmerTransform` isn't even called during
 * TIRED).
 */
export function computeFarmerHeading(previous: Vec2 | undefined, next: Vec2, referencePosition?: Vec2): number | undefined {
  if (previous) {
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    if (Math.hypot(dx, dz) > FARMER_HEADING_EPSILON) return Math.atan2(dx, dz);
    return undefined;
  }
  if (referencePosition) {
    const dx = referencePosition.x - next.x;
    const dz = referencePosition.z - next.z;
    if (Math.hypot(dx, dz) > FARMER_HEADING_EPSILON) return Math.atan2(dx, dz);
  }
  return undefined;
}

/** What `buildFarmerDisplayModel` hands back for a fresh per-appearance farmer clone (ADR 0015 §2). */
export interface FarmerDisplayModel {
  /** The corrected, ready-to-add-to-scene model -- base at its local origin (y=0), matching `buildStructureDisplayModel`'s ground-contact convention since the farmer is a standing figure. */
  model: THREE.Object3D;
  /** Every `MeshStandardMaterial` eligible for the TIRED amber tint -- every cloned material except those named `Eye`/`Eyebrows` (ADR 0015 §2's "amber eyes read as sickly" call). Each has `userData.baseColor` stashed (its post-clone, pre-tint color) so `farmerTired()` can compute `base.multiply(tint)` idempotently even on a farmer re-tinted across more than one TIRED entry. */
  tintTargets: THREE.MeshStandardMaterial[];
  /** Every material this function cloned (tintable or not, e.g. `Eye`/`Eyebrows` too) -- the full per-instance-owned set `farmerDespawn` must dispose. Deliberately NOT the model's geometry (see `farmerDespawn`'s own doc comment for why). */
  ownedMaterials: THREE.Material[];
}

/**
 * Wraps a freshly-cloned farmer source model (from `AssetRegistry.getAnimated`)
 * in a corrective group, following the same measured-bounding-box-derived
 * scale/centering convention as `buildChickenDisplayModel`/
 * `buildStructureDisplayModel` -- the sourced "Farmer" glTF's raw geometry
 * has no tidy round-number scale either, so the corrective factor is derived
 * from the model's own measured height rather than hand-picked. Base-on-
 * ground (only x/z re-centered, `y -= box.min.y`) like the structures, since
 * the farmer is a standing figure, not a small centered animal like the
 * chicken.
 *
 * Per ADR 0015 §2, this is also where the farmer's materials become safe to
 * mutate per-instance: `SkeletonUtils.clone` (what `getAnimated` uses) shares
 * materials by reference with the app-lifetime cached source, exactly like
 * `Object3D.clone(true)` does for the static-mesh consumers (see
 * `truck-rig.ts`'s `TruckRigResult.dispose` doc comment for the same
 * sharing hazard on the geometry side). Cloning every material here isolates
 * the TIRED tint's `.color` mutation to this one disposable farmer instance
 * -- without it, tinting would bleed amber into the shared source and thus
 * into every future respawned farmer. `metalness` is force-zeroed for the
 * same physically-motivated reason `buildStructureDisplayModel` already
 * documents (the source ships `metallicFactor: 0.4` with no scene `envMap`).
 *
 * The correction lives on an *inner* group for the same clobber-avoidance
 * reason as the chicken/structure builders: nothing in this codebase calls
 * `UpgradableObject.upgrade()` on the farmer today (it doesn't use that
 * slot type -- see scene.ts's farmer record), but keeping the same
 * defensive shape costs nothing and matches the established pattern.
 *
 * Issue #57 (scale bug, found in issue #29 acceptance): unlike the chicken/
 * structure sources, the farmer's meshes are `SkinnedMesh`es, so a plain
 * `Box3.setFromObject(source)` is wrong here -- it reads each mesh's raw,
 * un-posed `geometry.boundingBox` (this asset's rig is authored at
 * ~1/500-1/600 scale, with the real-world size meant to come from the
 * skinning pipeline, not the raw vertex data), which measured a farmer
 * height of a few millimeters and produced a ~2.666x scale factor instead
 * of the ~500-600x actually needed -- the farmer rendered, just too small
 * to ever see. Passing `precise = true` keeps the same measured-bounding-
 * box *pattern* but fixes the defect: three.js's `Box3.expandByObject`
 * walks per-vertex via `object.getVertexPosition()` when `precise` is set,
 * and `SkinnedMesh` overrides that method to apply the live bone skin
 * transform (`applyBoneTransform`) before returning each vertex -- i.e. it
 * measures the actually-posed geometry instead of the raw local one. (For
 * a plain `Mesh`, `getVertexPosition` is just the raw vertex, so this is a
 * no-op change in precision, not behavior, for the chicken/structures --
 * deliberately left as `false` there since they have no skinning to
 * correct for and per-vertex measurement is needlessly slower.) The
 * `updateMatrixWorld(true)` forces every bone's `matrixWorld` to be
 * current first: `expandByObject` updates world matrices as it walks the
 * hierarchy top-down, but a glTF armature's bones are typically siblings
 * of the `SkinnedMesh` node rather than its children, so relying on
 * `expandByObject`'s own walk order to have visited the bones before the
 * mesh would be fragile.
 */
export function buildFarmerDisplayModel(source: THREE.Object3D): FarmerDisplayModel {
  const tintTargets: THREE.MeshStandardMaterial[] = [];
  const ownedMaterials: THREE.Material[] = [];

  const cloneAndPrepare = (material: THREE.Material): THREE.Material => {
    const clone = material.clone();
    ownedMaterials.push(clone);
    if (clone instanceof THREE.MeshStandardMaterial) {
      clone.metalness = 0;
      if (!FARMER_TINT_EXCLUDED_MATERIAL_NAMES.has(clone.name)) {
        clone.userData.baseColor = clone.color.clone();
        tintTargets.push(clone);
      }
    }
    return clone;
  };

  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = child.material;
    if (Array.isArray(material)) {
      child.material = material.map(cloneAndPrepare);
    } else {
      child.material = cloneAndPrepare(material);
    }
  });

  source.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(source, true);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  source.position.x -= center.x;
  source.position.z -= center.z;
  source.position.y -= box.min.y;

  const scaleFactor = size.y > 0 ? FARMER_TARGET_HEIGHT / size.y : 1;
  const inner = new THREE.Group();
  inner.name = 'FarmerDisplayScale';
  inner.scale.setScalar(scaleFactor);
  inner.add(source);

  const outer = new THREE.Group();
  outer.name = 'FarmerModel';
  outer.add(inner);

  return { model: outer, tintTargets, ownedMaterials };
}

/** What `buildAnimatedAnimalDisplayModel` hands back for a fresh per-instance pig/cow clone (ADR 0016 §3). */
export interface AnimatedAnimalDisplayModel {
  /** The corrected, ready-to-add-to-scene model -- base at its local origin (y=0), same ground-contact convention as `buildFarmerDisplayModel`/`buildStructureDisplayModel` since pig/cow are standing figures. */
  model: THREE.Object3D;
  /** Every material this function cloned, for `removeAnimal` to dispose on despawn (ADR 0016 §8) -- deliberately NOT the model's geometry (shared by reference with the app-lifetime cached source via `SkeletonUtils.clone`, same hazard `farmerDespawn`'s doc comment documents). */
  ownedMaterials: THREE.Material[];
}

/**
 * The animated sibling of `buildStaticAnimalDisplayModel` (ADR 0016 §3) --
 * `buildFarmerDisplayModel` minus the tint-target/amber-tint machinery,
 * since pig/cow have no state-tint requirement (they're either standing
 * still or fleeing, never a farmer-style FSM pose). Clones every material
 * (so this instance owns them, required because `SkeletonUtils.clone`
 * shares materials by reference with the app-lifetime cached source), forces
 * `metalness = 0` (Quaternius ships `metallicFactor` with no scene `envMap`,
 * the same near-black fix already applied to structures/farmer), and
 * measures with the skinned-safe `Box3.setFromObject(source, true)` after
 * `updateMatrixWorld(true)` -- the exact issue #57 fix (see
 * `buildFarmerDisplayModel`'s doc comment for the full rationale), applied
 * here from the start rather than repeating that bug on a second animated
 * asset. Base-on-ground (only x/z re-centered, `y -= box.min.y`) like the
 * farmer/structures, since pig/cow are standing figures, not small centered
 * animals like the chicken.
 */
export function buildAnimatedAnimalDisplayModel(source: THREE.Object3D, targetHeight: number): AnimatedAnimalDisplayModel {
  const ownedMaterials: THREE.Material[] = [];

  const cloneAndPrepare = (material: THREE.Material): THREE.Material => {
    const clone = material.clone();
    ownedMaterials.push(clone);
    if (clone instanceof THREE.MeshStandardMaterial) clone.metalness = 0;
    return clone;
  };

  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = child.material;
    if (Array.isArray(material)) {
      child.material = material.map(cloneAndPrepare);
    } else {
      child.material = cloneAndPrepare(material);
    }
  });

  source.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(source, true);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  source.position.x -= center.x;
  source.position.z -= center.z;
  source.position.y -= box.min.y;

  const scaleFactor = size.y > 0 ? targetHeight / size.y : 1;
  const inner = new THREE.Group();
  inner.name = 'AnimatedAnimalDisplayScale';
  inner.scale.setScalar(scaleFactor);
  inner.add(source);

  const outer = new THREE.Group();
  outer.name = 'AnimatedAnimalModel';
  outer.add(inner);

  return { model: outer, ownedMaterials };
}

// River (issue #47, ADR 0012 §3): a procedural flat ribbon following a
// simple polyline -- built entirely here, no external asset, no collider,
// no AssetRegistry involvement. RIVER_ROUTE/RIVER_WIDTH themselves now live
// in core/terrain.ts (issue #49/ADR 0017 §Decision-4) so core/terrain-
// height.ts's flatten mask reads the exact same route data this module
// renders from -- one source of truth for where the river actually is.
const RIVER_COLOR = 0x2f7fb8;
const RIVER_SURFACE_Y = 0.03; // just above the ground plane (y=0) to avoid z-fighting.

/**
 * Builds a flat triangle-strip ribbon following `route`, `width` units wide,
 * laid at `RIVER_SURFACE_Y`. Each vertex's left/right offset is the local
 * segment normal (averaged from the adjacent segments at interior points),
 * so the ribbon follows gentle bends in the route without gapping.
 *
 * Defensive per AC7 ("degrade gracefully if e.g. terrain data is
 * malformed"): a route with fewer than 2 points can't form a ribbon, so this
 * returns an empty (childless) group instead of building degenerate/empty
 * geometry -- caller just adds it to the scene like any other object3D, no
 * special-casing needed, and nothing crashes.
 */
export function buildRiverMesh(route: Vec2[], width: number): THREE.Object3D {
  if (route.length < 2) return new THREE.Group();

  const positions: number[] = [];
  for (let i = 0; i < route.length; i++) {
    const prev = route[i - 1] ?? route[i];
    const next = route[i + 1] ?? route[i];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const segLength = Math.hypot(dx, dz) || 1;
    // Left-hand normal of the local direction, in the XZ plane.
    const nx = -dz / segLength;
    const nz = dx / segLength;
    const halfWidth = width / 2;
    positions.push(route[i].x + nx * halfWidth, RIVER_SURFACE_Y, route[i].z + nz * halfWidth);
    positions.push(route[i].x - nx * halfWidth, RIVER_SURFACE_Y, route[i].z - nz * halfWidth);
  }

  const indices: number[] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    indices.push(a, b, c, b, d, c);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: RIVER_COLOR,
    transparent: true,
    opacity: 0.85,
    // DoubleSide (not the default FrontSide): the ribbon's triangle winding
    // depends on the route's direction/curvature, and a flat horizontal
    // strip built from an arbitrary polyline can easily end up with a
    // downward-facing normal for a given segment (confirmed empirically --
    // the initial FrontSide version rendered invisible from the chase
    // camera, which always looks down at the ground, even though the mesh
    // was correctly present in the scene graph). Double-siding is the
    // robust fix rather than hand-deriving a winding-order rule that would
    // only hold for this specific RIVER_ROUTE and break if it's edited.
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geometry, material);
}

export function createGameScene(
  container: HTMLElement,
  bounds: TerrainBounds,
  obstacles: ObstacleInstance[],
  structures: StructureInstance[],
  fences: FenceInstance[],
  build: TruckBuild,
  cosmetics: TruckCosmetics,
  assetRegistry?: AssetRegistry,
) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3ff);

  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;

  // Far plane widened (issue #49/ADR 0017 §Decision-4 "Camera far plane"):
  // the expanded 100x100 map's diagonal is ~141 units; 260 keeps the far
  // corners (and the mountain landmark sitting on one of them) comfortably
  // inside the frustum with margin, verified live (see the issue #49
  // hand-off screenshots).
  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 260);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(10, 15, 8);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x404040, 1.6));

  // Rolling hills (issue #49, ADR 0017 §Decision-2): the ground plane is now
  // subdivided (GROUND_SEGMENTS x GROUND_SEGMENTS -- ~16k verts/33k tris, a
  // one-time static build with no per-frame or bandwidth cost) and each
  // vertex is displaced in Y by `terrainHeightAt`, the exact same pure
  // function core/driving/obstacle-climb.ts samples for the truck's climb
  // response -- guaranteeing the rendered surface and the truck's lift/tilt
  // can never disagree (ADR 0017 §Decision-1). `computeVertexNormals()` is
  // required, not optional: without it a displaced plane still shades flat
  // under the scene's directional sun, and the hills become invisible
  // despite being geometrically present (AC10's visibility mechanism is lit
  // contour shading from correct normals).
  //
  // PlaneGeometry's local (x, y) maps to world (x, z) after the -90deg X
  // rotation below as worldX = localX, worldZ = -localY (derived from the
  // rotation matrix at theta = -PI/2) -- the ground mesh is unrotated/
  // unoffset at scene-graph time, so local x/y already equal world x/z up to
  // that sign flip on z.
  const GROUND_SEGMENTS = 128;
  const groundGeometry = new THREE.PlaneGeometry(width, depth, GROUND_SEGMENTS, GROUND_SEGMENTS);
  const groundPositions = groundGeometry.attributes.position;
  for (let i = 0; i < groundPositions.count; i++) {
    const worldX = groundPositions.getX(i);
    const worldZ = -groundPositions.getY(i);
    groundPositions.setZ(i, terrainHeightAt({ x: worldX, z: worldZ }));
  }
  groundGeometry.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({ color: 0x6fbf5e }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  for (const obstacle of obstacles) {
    scene.add(createObstacleMesh(obstacle));
  }

  // Structures (issue #46, ADR 0012 §2): created once at scene setup (static
  // scenery, no per-frame position tracking needed unlike animals) -- each
  // gets its own UpgradableObject starting as the primitive placeholder
  // (AC7), upgraded in place the moment its manifest key reports 'ready'
  // (checked in tickEffects below, mirroring upsertAnimal's chicken check).
  const structureSlots: { structure: StructureInstance; slot: UpgradableObject }[] = [];
  for (const structure of structures) {
    const primitive = buildStructurePrimitive(structure);
    scene.add(primitive);
    structureSlots.push({ structure, slot: createUpgradableObject(scene, primitive) });
  }

  // Fences (issue #54, ADR 0019 §5/component design): same create-once-at-
  // setup, primitive-then-upgrade shape as structures above, but tracked in
  // a `Map` keyed by fence id (not an array) since `collapseFence` below
  // needs to look up a single segment by id when `main.ts`'s FenceSystem
  // fires `onCollapse` -- mirrors `createFenceColliders`'s own keyed-map
  // shape in physics/world.ts for the same "address one segment individually"
  // reason.
  const fenceSlots = new Map<string, { fence: FenceInstance; slot: UpgradableObject; collapsed: boolean }>();
  for (const fence of fences) {
    const primitive = buildFencePrimitive(fence);
    scene.add(primitive);
    fenceSlots.set(fence.id, { fence, slot: createUpgradableObject(scene, primitive), collapsed: false });
  }

  // River (issue #47, ADR 0012 §3): pure procedural geometry, created once
  // here -- no loading, no fallback concern (buildRiverMesh's own empty-
  // group guard covers a malformed/degenerate route per AC7).
  scene.add(buildRiverMesh(RIVER_ROUTE, RIVER_WIDTH));

  // Decorative trees (issue #54 amendment, ADR 0019 §A4): same create-once-
  // at-setup, primitive-then-upgrade shape as structures/fences above, but
  // an array (not a Map) since trees are never individually addressed again
  // after creation -- unlike fences, they never collapse/change mid-session.
  // DECORATIVE_TREES is imported directly (not a createGameScene parameter),
  // since trees carry no per-session mutable state either, unlike the
  // obstacles/structures/fences arrays that ARE threaded through (those are
  // threaded so main.ts's physics-collider creation and this render setup
  // are guaranteed to agree on which exact instances got a body -- trees'
  // collider creation reads the same DECORATIVE_TREES constant directly in
  // main.ts, so there's no drift risk to guard against with an explicit
  // parameter here).
  const treeSlots: { tree: TreeInstance; slot: UpgradableObject }[] = [];
  for (const tree of DECORATIVE_TREES) {
    const primitive = buildTreePrimitive(tree);
    scene.add(primitive);
    treeSlots.push({ tree, slot: createUpgradableObject(scene, primitive) });
  }

  // Truck rig (ADR 0011 §4/§5): the single buildTruckRig assembly path also
  // used by the builder's live 3D preview (ui/builder.ts) -- so a mismatch
  // between what the player picked and what they drive (AC4, cosmetics AC8)
  // is structurally impossible, not just tested for. Starts from whatever
  // the AssetRegistry has ready right now (primitive fallback per part if
  // not, per ADR 0010 §7/vehicle-art AC13); `currentBuild`/`currentCosmetics`
  // let tickEffects retry the assembly if any part was still loading when
  // driving started (e.g. the bounded gate in main.ts timed out first).
  const currentBuild = build;
  const currentCosmetics = cosmetics;
  let truckRig = buildTruckRig(currentBuild, currentCosmetics, assetRegistry);
  scene.add(truckRig.group);
  const bumpFlashes: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; remaining: number }[] = [];

  // Each animal instance gets its own UpgradableObject (issue #28): starts
  // as the permanent-baseline primitive box (AC13's "never crash, falls
  // back to existing primitive" -- unchanged even after the chicken model
  // ships), upgraded in place to its own clone of the sourced species model
  // the moment AssetRegistry reports it ready (AssetRegistry.get()/
  // getAnimated() return a fresh clone per call, per their own doc
  // comments -- required here since multiple animals can be on screen at
  // once).
  //
  // Issue #48 (ADR 0016 §2): `animalSlots` widens from a raw
  // `Map<string, UpgradableObject>` to `Map<string, AnimalRecord>` -- the
  // mixer/actions/ownedMaterials live *beside* the slot as sibling fields,
  // not inside it (UpgradableObject stays the same generic single-mesh-swap
  // abstraction the truck/structures also use). For a chicken (or any
  // not-yet-upgraded primitive), the animation fields simply stay
  // `undefined` -- chicken is never forced through the animated machinery.
  interface AnimalRecord {
    slot: UpgradableObject;
    species: AnimalSpecies;
    mixer?: THREE.AnimationMixer;
    idleAction?: THREE.AnimationAction;
    scatterAction?: THREE.AnimationAction;
    currentAction?: THREE.AnimationAction;
    /** Per-instance cloned materials to dispose on despawn (pig/cow only, ADR 0016 §8) -- undefined for chicken/primitives, which share materials by reference with the cached source and must NOT be disposed per-instance. */
    ownedMaterials?: THREE.Material[];
    /** The position passed to the last `upsertAnimal`/`scatterAnimal` call for this animal (facing-direction fix, ADR 0016 §7, same idiom as `FarmerRecord.previousPosition`). */
    previousPosition?: Vec2;
  }
  const animalSlots = new Map<string, AnimalRecord>();

  /** Fallback primitive color per species (ADR 0016 §1 "per-species placeholder primitive color") -- differentiates species even before their real model loads, rather than every animal starting as the same chicken-yellow box. */
  const ANIMAL_PRIMITIVE_COLORS: Record<AnimalSpecies, number> = {
    chicken: 0xfff2a8,
    pig: 0xf4a6c1,
    cow: 0x4a4640,
  };

  /**
   * Looks up `key`/`clip` clips by exact name via `THREE.AnimationClip.findByName`
   * -- a missing clip degrades to no action rather than throwing, mirroring
   * `buildFarmerActions`'s discipline (ADR 0015 §3/ADR 0016 §6). Each found
   * action loops.
   */
  function findAnimalAction(mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[], clipName: string): THREE.AnimationAction | undefined {
    const clip = THREE.AnimationClip.findByName(clips, clipName);
    return clip ? mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity) : undefined;
  }

  /** Crossfades `record`'s currently-playing action to `next` -- idempotent (a no-op once `next` is already playing, ADR 0016 §5) so calling it every scatter tick is safe. A no-op if `next` is missing (its clip wasn't found) too. */
  function crossfadeAnimalAction(record: AnimalRecord, next: THREE.AnimationAction | undefined): void {
    if (!next || record.currentAction === next) return;
    const current = record.currentAction;
    next.reset().play();
    if (current) {
      current.crossFadeTo(next, ANIMAL_CROSSFADE_SECONDS, false);
    } else {
      next.fadeIn(ANIMAL_CROSSFADE_SECONDS);
    }
    record.currentAction = next;
  }

  // Farmer (issue #29, ADR 0015 §3): a farmer exists for one
  // PURSUING->TIRED->LEAVING cycle and is fully torn down on despawn
  // (`farmerDespawn`), matching the old placeholder's "recreate fresh on
  // respawn" contract -- so a single nullable record, not a permanent
  // UpgradableObject slot, is the right shape here (see ADR 0015's
  // "Alternatives considered": UpgradableObject was rejected for exactly
  // this reason). `mixer`/`actions`/`tintTargets`/`ownedMaterials` are only
  // set for the real animated model; the primitive capsule fallback
  // (asset not ready / no registry, vehicle-art AC13) uses `capsuleMaterial`
  // instead and leaves the others undefined.
  interface FarmerActions {
    idle?: THREE.AnimationAction;
    run?: THREE.AnimationAction;
    walk?: THREE.AnimationAction;
  }
  interface FarmerRecord {
    root: THREE.Object3D;
    mixer?: THREE.AnimationMixer;
    actions?: FarmerActions;
    currentAction?: THREE.AnimationAction;
    tintTargets?: THREE.MeshStandardMaterial[];
    ownedMaterials?: THREE.Material[];
    capsuleMaterial?: THREE.MeshStandardMaterial;
    /** The position passed to the last `setFarmerTransform` call for this farmer instance (facing-direction fix, issue #57 follow-up) -- undefined until the first call, which is exactly the signal `computeFarmerHeading` uses to fall back to facing the truck instead of diffing against nothing. */
    previousPosition?: Vec2;
  }
  let farmer: FarmerRecord | undefined;

  const fuelMeshes = new Map<string, THREE.Object3D>();
  const fuelGlows: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; remaining: number }[] = [];

  function setTruckTransform(
    position: Vec2,
    heading: number,
    climb?: {
      lift: number;
      pitch: number;
      roll: number;
      /** Per-wheel suspension travel (issue #63, ADR 0018 §3) -- optional so pre-#63 callers/fixtures that only pass {lift,pitch,roll} still work, defaulting every wheel to 0. */
      wheelSuspension?: { fl: number; fr: number; rl: number; rr: number };
    },
  ): void {
    // Obstacle climb (issue #42, ADR 0013): a dumb adapter over numbers
    // computed in core/driving/obstacle-climb.ts -- this function never
    // computes the climb itself or reads obstacle data. When `climb` is
    // omitted, behavior is pixel-identical to before this feature (lift 0,
    // no pitch/roll), so the builder preview and any other caller of this
    // function are unaffected.
    const lift = climb?.lift ?? 0;
    const pitch = climb?.pitch ?? 0;
    const roll = climb?.roll ?? 0;
    truckRig.group.position.set(position.x, lift, position.z);
    // 'YXZ' Euler order: heading (Y) applies first, then pitch about the
    // rig's already-yawed local X axis, then roll -- so the tilt reads
    // correctly in the truck's own body frame at any heading.
    truckRig.group.rotation.set(pitch, heading, roll, 'YXZ');

    // Per-wheel suspension travel (issue #63, ADR 0018 §3/§4): a pure Y
    // translation on each wheel's dedicated `travel` pivot, layered
    // underneath the whole-body lift/pitch/roll just applied above -- never
    // touches `steer`/`roll`, so it can't corrupt steering yaw or wheel spin
    // (AC9). Omitted/undefined (builder preview, any other caller that
    // doesn't pass `climb`) -> every wheel's offset stays 0, same "single-rig,
    // preview shows no suspension motion" precedent as the whole-body lift.
    const suspension = climb?.wheelSuspension;
    truckRig.wheels.frontLeft.travel.position.y = suspension?.fl ?? 0;
    truckRig.wheels.frontRight.travel.position.y = suspension?.fr ?? 0;
    truckRig.wheels.rearLeft.travel.position.y = suspension?.rl ?? 0;
    truckRig.wheels.rearRight.travel.position.y = suspension?.rr ?? 0;

    // Simple chase camera, offset behind the truck's heading. At terrain
    // corners this offset can extend past the finite ground plane, so the
    // camera's own (x,z) is pulled back in to stay over the ground — the
    // camera still looks at the truck, so it stays framed either way.
    const behind = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading)).multiplyScalar(CAMERA_CHASE_DISTANCE);
    const desiredCameraPos = { x: truckRig.group.position.x + behind.x, z: truckRig.group.position.z + behind.z };
    const cameraPos = clampCameraToBounds(desiredCameraPos, bounds, CAMERA_GROUND_MARGIN);
    // Camera tracks the truck's terrain lift in Y (issue #54 amendment, ADR
    // 0019 §A2 point 4, human-confirmed, no threshold gating): with the
    // dramatic cliff/canyon relief this amendment adds, a fixed-height
    // camera would let the truck climb out of the top of the frame while the
    // camera stayed at ground level. `truckRig.group.position.y` is exactly
    // `lift` (set just above in this same function), so this always keeps
    // the same relative framing regardless of terrain height -- and also
    // very slightly improves ordinary-hill framing (a gentle ~1-unit bob
    // instead of holding dead-flat), per the ADR's own note.
    camera.position.set(cameraPos.x, CAMERA_CHASE_HEIGHT + truckRig.group.position.y, cameraPos.z);
    camera.lookAt(truckRig.group.position.x, truckRig.group.position.y + 0.5, truckRig.group.position.z);
  }

  /**
   * Per-frame wheel roll + front-wheel steer-yaw (issue #40, truck-wheel-
   * motion AC1/AC3-AC6): a purely visual sibling to setTruckTransform,
   * called from the same call site (main.ts) once both `drivingSystem.speed`
   * and `input.getIntent().steer` are known for the frame -- reads that
   * existing per-frame data rather than introducing a second, independent
   * source of truth for speed/steer (the requirements doc's Constraints).
   *
   * Roll (AC1/AC3, Open Question 1 resolved -- physically accurate): angle
   * delta = distance traveled this frame (`speed * dt`, signed so reverse
   * spins the wheels the other way, AC1) / this build's actual wheel-tier
   * circumference (`2 * PI * WHEEL_RADIUS_BY_TIER[build.wheels]`) * 2*PI
   * radians per full turn -- applied to every wheel's `roll` pivot (AC1),
   * regardless of cosmetic wheel-look (AC7, this never touches materials).
   * Zero speed -> zero delta -> AC2's "reads as parked" falls out for free,
   * no special-casing needed.
   *
   * Steer (AC4-AC6): front-left/front-right wheels' `steer` pivot yaws
   * toward `steerIntent` (-1..1), capped at MAX_FRONT_WHEEL_STEER_YAW;
   * rear wheels' `steer` pivot is never touched here, so they never yaw
   * (AC6) even though the rig gives them a pivot too (structural symmetry
   * only, see truck-rig.ts's WheelPivots doc comment). An instant "snap" to
   * the target angle each frame, not a smoothed return -- AC5 explicitly
   * allows either, and instant is simplest / needs no extra per-frame state.
   *
   * Roll direction while blocked against an obstacle (Open Question 3,
   * non-blocking): this reads `drivingSystem.speed` (the truck's internal
   * motion state), not actual displacement applied, so a truck stalled
   * against an obstacle with the throttle still held keeps its wheels
   * spinning -- a real stuck vehicle's wheels can spin too, and the doc
   * explicitly leaves this either way.
   */
  function setTruckWheelMotion(speed: number, steerIntent: number, dt: number): void {
    const wheelRadius = WHEEL_RADIUS_BY_TIER[currentBuild.wheels] ?? WHEEL_RADIUS_BY_TIER[0];
    const circumference = 2 * Math.PI * wheelRadius;
    const rollDelta = (speed * dt) / circumference * (2 * Math.PI);

    const { frontLeft, frontRight, rearLeft, rearRight } = truckRig.wheels;
    frontLeft.roll.rotation.x += rollDelta;
    frontRight.roll.rotation.x += rollDelta;
    rearLeft.roll.rotation.x += rollDelta;
    rearRight.roll.rotation.x += rollDelta;

    // Sign fix (2026-07-09, issue #40 human report -- wheels steered
    // opposite the truck's actual turn direction). `steer.rotation.y` is a
    // plain Three.js Y-axis rotation on a pivot nested directly under the
    // truck body group, so it obeys the exact same right-hand-rule
    // convention `truck-motion.ts`'s TruckMotionState.heading doc comment
    // establishes: increasing Y-rotation swings a +Z-forward vector toward
    // +X, which is the truck's LEFT, not right. That's why
    // integrateTruckMotion() computes `heading -= intent.steer * ...` (steer
    // right => heading must *decrease*) -- the wheel-visual angle needs that
    // same negation, which this code originally omitted, so it was
    // literally the mirror image of the correct steer direction.
    const steerAngle = -THREE.MathUtils.clamp(steerIntent, -1, 1) * MAX_FRONT_WHEEL_STEER_YAW;
    frontLeft.steer.rotation.y = steerAngle;
    frontRight.steer.rotation.y = steerAngle;
  }

  /**
   * Creates (on first call) or repositions an animal's record (animal
   * AC1-AC3; issue #48, ADR 0016 §4). `species` is fixed at creation --
   * a re-`upsert` of an existing id (e.g. the boop contact loop repositioning
   * before a scatter starts) never changes it. Asset upgrade-in-place and
   * mixer construction are NOT done here (moved to `tickEffects`, ADR 0016
   * §4) -- this closes the latent gap where an animal that's only
   * `upsertAnimal`-ed at spawn (then not again until it scatters) would never
   * upgrade during its stationary pre-boop window if the asset was still
   * loading at spawn time.
   */
  function upsertAnimal(id: string, position: Vec2, species: AnimalSpecies): void {
    let record = animalSlots.get(id);
    if (!record) {
      const primitive = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.MeshStandardMaterial({ color: ANIMAL_PRIMITIVE_COLORS[species] }),
      );
      scene.add(primitive);
      record = { slot: createUpgradableObject(scene, primitive), species };
      animalSlots.set(id, record);
    }
    // Grounded on the hill field (issue #49/ADR 0017 §Decision-4): the
    // per-species base offset (0 riding a real skeletal mesh's own baked
    // origin, 0.3 for the primitive box) is added on top of the terrain
    // surface at this XZ, so an animal spawned on a hillside sits on it
    // instead of floating/sinking -- Y translation only, no facing/yaw
    // change (that stays owned by the existing flee-direction logic below).
    const y = terrainHeightAt(position) + (record.mixer ? 0 : 0.3);
    record.slot.current.position.set(position.x, y, position.z);
    record.previousPosition = { x: position.x, z: position.z };
  }

  /**
   * Repositions a fleeing animal (animal AC4a), faces it toward its flee
   * direction, and crossfades to its species' scatter clip (pig -> Jump, cow
   * -> Run) -- a purely cosmetic overlay on top of `core/scatter.ts`'s
   * unchanged position/velocity physics (ADR 0016 §5). Chicken (no
   * `scatterAction`, since it was never upgraded through the animated path)
   * just repositions -- its behavior is byte-for-byte unchanged from before
   * this feature.
   */
  function scatterAnimal(id: string, position: Vec2): void {
    const record = animalSlots.get(id);
    if (!record) return;
    // Grounded on the hill field, same as upsertAnimal above (issue #49).
    const y = terrainHeightAt(position) + (record.mixer ? 0 : 0.3);
    record.slot.current.position.set(position.x, y, position.z);

    // Facing direction (ADR 0016 §7, issue #57-class fix designed in from
    // the start): reuses computeFarmerHeading's (sin, cos)/atan2 convention
    // -- a scatter always has a prior position to diff against (this animal
    // was just standing still or already fleeing), so no truck-reference
    // fallback is needed the way the farmer's onAppear case needs one.
    const heading = computeFarmerHeading(record.previousPosition, position);
    if (heading !== undefined) record.slot.current.rotation.y = heading;
    record.previousPosition = { x: position.x, z: position.z };

    crossfadeAnimalAction(record, record.scatterAction);
  }

  /**
   * Removes an animal (animal AC4c). Animated pig/cow instances own
   * per-instance cloned materials (`buildAnimatedAnimalDisplayModel`) that
   * must be disposed here -- with up to `MAX_CONCURRENT_ANIMALS` concurrent
   * and continuous spawn/despawn, an undisposed-material leak accumulates
   * fast (ADR 0016 §8, the churn-amplified version of the exact missed-
   * dispose bug code review caught on the farmer). Chicken/primitive
   * instances are unchanged from before this feature: no dispose, because an
   * upgraded chicken slot's `current` is a clone whose geometry/material are
   * shared by reference with every other clone of the same loaded source
   * (see truck-rig.ts's TruckRigResult.dispose doc comment for the same
   * hazard) -- disposing them here would free GPU resources still in use by
   * any other animal's own chicken clone.
   */
  function removeAnimal(id: string): void {
    const record = animalSlots.get(id);
    if (!record) return;
    record.mixer?.stopAllAction();
    scene.remove(record.slot.current);
    if (record.ownedMaterials) {
      // Deliberately NOT the model's geometry -- SkeletonUtils.clone shares
      // it by reference with the app-lifetime cached source (same narrower-
      // than-ADR-0015-§3-wording deviation farmerDespawn already documents).
      for (const material of record.ownedMaterials) material.dispose();
    }
    animalSlots.delete(id);
  }

  /**
   * Builds a fresh `AnimationAction` per found clip (ADR 0015 §3/§4): looks
   * clips up by exact name via `THREE.AnimationClip.findByName` -- a missing
   * clip degrades to no action for that state rather than throwing, and no
   * clip name outside the three constants above is ever referenced (AC9 --
   * the combat/gun/melee clips in this library's 24-clip set are
   * unreachable by construction). Each found action loops.
   */
  function buildFarmerActions(mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[]): FarmerActions {
    const actions: FarmerActions = {};
    const runClip = THREE.AnimationClip.findByName(clips, FARMER_CLIP_RUN);
    const idleClip = THREE.AnimationClip.findByName(clips, FARMER_CLIP_IDLE);
    const walkClip = THREE.AnimationClip.findByName(clips, FARMER_CLIP_WALK);
    if (runClip) actions.run = mixer.clipAction(runClip).setLoop(THREE.LoopRepeat, Infinity);
    if (idleClip) actions.idle = mixer.clipAction(idleClip).setLoop(THREE.LoopRepeat, Infinity);
    if (walkClip) actions.walk = mixer.clipAction(walkClip).setLoop(THREE.LoopRepeat, Infinity);
    return actions;
  }

  /** Crossfades `farmer`'s currently-playing action to `next` (ADR 0015 §4 -- smooth, not a hard cut). A no-op if `next` is missing (its clip wasn't found) or there's no live animated farmer. */
  function crossfadeFarmerAction(next: THREE.AnimationAction | undefined): void {
    if (!farmer || !next) return;
    const current = farmer.currentAction;
    next.reset().play();
    if (current && current !== next) {
      current.crossFadeTo(next, FARMER_CROSSFADE_SECONDS, false);
    } else {
      next.fadeIn(FARMER_CROSSFADE_SECONDS);
    }
    farmer.currentAction = next;
  }

  /**
   * Builds a fresh farmer -- the real animated model (ADR 0015 §1/§3) if
   * `assetRegistry` reports `farmer` ready, else the primitive capsule
   * fallback (vehicle-art AC13). `Run` starts playing immediately (no
   * crossfade in) since PURSUING is the near-universal creation trigger
   * (ADR 0015 §4).
   */
  function createFarmerRecord(): FarmerRecord {
    if (assetRegistry?.status(FARMER_ASSET_KEY) === 'ready') {
      const animated = assetRegistry.getAnimated(FARMER_ASSET_KEY);
      if (animated) {
        const { model, tintTargets, ownedMaterials } = buildFarmerDisplayModel(animated.scene);
        scene.add(model);
        const mixer = new THREE.AnimationMixer(model);
        const actions = buildFarmerActions(mixer, animated.animations);
        const record: FarmerRecord = { root: model, mixer, actions, tintTargets, ownedMaterials };
        if (actions.run) {
          actions.run.reset().play();
          record.currentAction = actions.run;
        }
        return record;
      }
    }

    // Fallback (ADR 0015 §3 / vehicle-art AC13): asset not ready yet (genuine
    // load failure, or the narrow window before prefetch settles) or no
    // registry at all (unit-test scene). Deliberately not upgraded
    // mid-appearance -- a farmer appearance is short-lived and self-replacing,
    // so the *next* appearance picks up the real model instead (ADR 0015 §3).
    const capsuleMaterial = new THREE.MeshStandardMaterial({ color: FARMER_COLOR });
    const root = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.8, 4, 8), capsuleMaterial);
    scene.add(root);
    return { root, capsuleMaterial };
  }

  /**
   * Places (creating on first call) the farmer at its current position
   * (farmer AC1/AC2). The animated model's corrected base sits at its own
   * local origin (y=0, `buildFarmerDisplayModel`'s ground-contact
   * convention); the capsule fallback is centered on itself, so it keeps its
   * own y=0.75 offset.
   *
   * `referencePosition` (the truck's current position, threaded through from
   * `main.ts`) is only ever used as a fallback for the very first call on a
   * fresh farmer instance -- see `computeFarmerHeading`'s doc comment.
   * Heading is applied to `root.rotation.y` for both the real animated model
   * and the capsule fallback (issue #57 follow-up): the model's raw source
   * orientation already faces +Z at `rotation.y = 0` (confirmed via live
   * screenshot, matching the `heading`/`(sin, cos)` convention
   * `setTruckTransform` uses), so no additional corrective offset is needed
   * here the way `buildTruckRig`'s wheel pivots needed one.
   */
  function setFarmerTransform(position: Vec2, referencePosition?: Vec2): void {
    if (!farmer) {
      farmer = createFarmerRecord();
    }
    // Grounded on the hill field, same as animals (issue #49/ADR 0017 §Decision-4).
    const y = terrainHeightAt(position) + (farmer.mixer ? 0 : 0.75);
    farmer.root.position.set(position.x, y, position.z);

    const heading = computeFarmerHeading(farmer.previousPosition, position, referencePosition);
    if (heading !== undefined) farmer.root.rotation.y = heading;
    farmer.previousPosition = { x: position.x, z: position.z };
  }

  /** TIRED give-up beat (ADR 0007 §1, vehicle-art AC8): crossfades to the Idle pose (if a real model) and applies the friendly amber tint -- computed from each material's stored base color (ADR 0015 §2), so re-entering TIRED on a later cycle (a fresh farmer instance, fresh base colors) is correct without an explicit reset. */
  function farmerTired(): void {
    if (!farmer) return;
    crossfadeFarmerAction(farmer.actions?.idle);

    if (farmer.tintTargets) {
      const tint = new THREE.Color(FARMER_TIRED_COLOR);
      for (const material of farmer.tintTargets) {
        const base = material.userData.baseColor as THREE.Color | undefined;
        if (base) material.color.copy(base).multiply(tint);
      }
    } else {
      farmer.capsuleMaterial?.color.setHex(FARMER_TIRED_COLOR);
    }
  }

  /** TIRED -> LEAVING (ADR 0015 §4, NEW): crossfades to the Walk pose. The amber tint persists from TIRED (ADR 0015 §4) -- no explicit change here. */
  function farmerLeaving(): void {
    if (!farmer) return;
    crossfadeFarmerAction(farmer.actions?.walk);
  }

  /** LEAVING -> ABSENT (ADR 0007 §1): the farmer has walked off; tear down the mixer + model so a later re-appear recreates it fresh (base color, Run pose). */
  function farmerDespawn(): void {
    if (!farmer) return;
    farmer.mixer?.stopAllAction();
    scene.remove(farmer.root);

    if (farmer.ownedMaterials) {
      // Dispose only the per-instance CLONED materials `buildFarmerDisplayModel`
      // made (ADR 0015 §2) -- deliberately NOT the model's geometry. Unlike
      // ADR 0015 §3's literal "disposeObject3D" wording, `SkeletonUtils.clone`
      // shares `BufferGeometry` by reference with the app-lifetime cached
      // source (the same sharing hazard `truck-rig.ts`'s
      // `TruckRigResult.dispose` doc comment already documents for loaded
      // truck parts) -- disposing it here would free GPU resources the next
      // respawned farmer (and the cached source itself) still needs. This is
      // a deliberate, narrower deviation from the ADR's dispose description.
      for (const material of farmer.ownedMaterials) material.dispose();
    } else if (farmer.capsuleMaterial) {
      // Fallback capsule: geometry/material are created fresh per appearance
      // (never shared with anything else), so disposing both here is safe.
      farmer.capsuleMaterial.dispose();
      (farmer.root as THREE.Mesh).geometry.dispose();
    }

    farmer = undefined;
  }

  /** Triggers the bump feedback flash (farmer AC5) as a translucent overlay burst at the truck's current position, decayed in tickEffects -- see the module header note on why this can't mutate the shared paint material. */
  function flashTruck(): void {
    const flashMaterial = new THREE.MeshBasicMaterial({ color: TRUCK_FLASH_COLOR, transparent: true, opacity: 0.85 });
    const flashMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.6 * TRUCK_SCALE, 1.2 * TRUCK_SCALE, 2.6 * TRUCK_SCALE),
      flashMaterial,
    );
    flashMesh.position.copy(truckRig.group.position);
    flashMesh.position.y += 0.5;
    scene.add(flashMesh);
    bumpFlashes.push({ mesh: flashMesh, material: flashMaterial, remaining: BUMP_FLASH_SECONDS });
  }

  /**
   * Applies the one-way standing->collapsed pose swap for the fence segment
   * `id` (issue #54, ADR 0019 §5/§8, AC8) -- called from main.ts's frame
   * loop the frame `FenceSystem` fires `onCollapse`. A no-op for an unknown
   * id or one already marked collapsed here (defensive; `FenceSystem` itself
   * already only fires once per segment, but this keeps the render side
   * safe against being called twice independently). Applies to whichever
   * object is currently in the slot -- primitive or, if it already
   * upgraded, the real model -- since `applyFenceCollapsePose` only assumes
   * the shared "local origin = ground contact" convention both share.
   */
  function collapseFence(id: string): void {
    const record = fenceSlots.get(id);
    if (!record || record.collapsed) return;
    applyFenceCollapsePose(record.slot.current);
    record.collapsed = true;
  }

  /** Places (creating on first call) a fuel pickup mesh (ADR 0008 §3, fuel AC1-AC4). */
  function upsertFuelPickup(id: string, position: Vec2): void {
    let mesh = fuelMeshes.get(id);
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.35, 0.6, 10),
        new THREE.MeshStandardMaterial({ color: FUEL_COLOR }),
      );
      scene.add(mesh);
      fuelMeshes.set(id, mesh);
    }
    // Grounded on the hill field, same as animals/farmer (issue #49/ADR 0017 §Decision-4).
    mesh.position.set(position.x, terrainHeightAt(position) + 0.3, position.z);
  }

  /** Instant collect (fuel AC13): removes the pickup mesh immediately and starts a brief glow-burst effect at its last position, decayed in tickEffects. */
  function collectFuelPickup(id: string): void {
    const mesh = fuelMeshes.get(id);
    if (!mesh) return;
    const glowMaterial = new THREE.MeshBasicMaterial({ color: FUEL_GLOW_COLOR, transparent: true, opacity: 0.9 });
    const glowMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10), glowMaterial);
    glowMesh.position.copy(mesh.position);
    scene.add(glowMesh);
    fuelGlows.push({ mesh: glowMesh, material: glowMaterial, remaining: FUEL_GLOW_SECONDS });

    scene.remove(mesh);
    fuelMeshes.delete(id);
  }

  // Truck-rig upgrade-in-place (ADR 0010 §4/§7): if any part fell back to a
  // primitive when the rig was (re)built -- e.g. the bounded gate in
  // main.ts timed out before this build's assets settled -- keep checking
  // cheaply (status() only, no clone) each frame and rebuild the whole rig
  // in place the moment everything needed is ready. Stops checking once
  // true, since a rig never needs a *second* rebuild within one session
  // (build/cosmetics are fixed for the session; see truck-rig.ts).
  let rigNeedsRecheck = !truckRig.allAssetsReady;

  /** Per-frame visual-effect decay (bump flash + fuel glow bursts) plus the farmer's `AnimationMixer.update` (ADR 0015 §3) -- called once per render frame from main.ts. */
  function tickEffects(dt: number): void {
    farmer?.mixer?.update(dt);

    // Animal sourced-art upgrade-in-place + mixer update (issue #48, ADR
    // 0016 §4): moved out of upsertAnimal so a slow-loading pig/cow asset
    // still upgrades during the stationary pre-boop window (upsertAnimal
    // isn't called again until a scatter starts). Same cheap
    // status()-check-then-upgrade-once pattern as the structure loop below --
    // stops checking a given animal the moment its slot is upgraded. For
    // chicken, `buildStaticAnimalDisplayModel` is used and no mixer/actions
    // are created (chicken never goes through the animated path). For
    // pig/cow, upgrading also constructs the AnimationMixer + Idle/scatter
    // actions and starts Idle playing (ADR 0016 §4/§6).
    if (assetRegistry) {
      for (const record of animalSlots.values()) {
        if (!record.slot.upgraded) {
          const assetKey = ANIMAL_ASSET_KEYS[record.species];
          if (assetRegistry.status(assetKey) === 'ready') {
            if (record.species === 'chicken') {
              const source = assetRegistry.get(assetKey);
              if (source) record.slot.upgrade(buildStaticAnimalDisplayModel(source, CHICKEN_TARGET_HEIGHT));
            } else {
              const animated = assetRegistry.getAnimated(assetKey);
              if (animated) {
                const targetHeight = record.species === 'pig' ? PIG_TARGET_HEIGHT : COW_TARGET_HEIGHT;
                const { model, ownedMaterials } = buildAnimatedAnimalDisplayModel(animated.scene, targetHeight);
                record.slot.upgrade(model);
                record.ownedMaterials = ownedMaterials;
                const mixer = new THREE.AnimationMixer(model);
                record.mixer = mixer;
                const idleClipName = record.species === 'pig' ? PIG_CLIP_IDLE : COW_CLIP_IDLE;
                const scatterClipName = record.species === 'pig' ? PIG_CLIP_JUMP : COW_CLIP_RUN;
                record.idleAction = findAnimalAction(mixer, animated.animations, idleClipName);
                record.scatterAction = findAnimalAction(mixer, animated.animations, scatterClipName);
                // Just-upgraded model's base sits at its own local origin
                // (ground-contact convention) -- the primitive it replaces
                // was centered at terrainHeightAt(position) + 0.3 (issue #49),
                // so re-apply the animated model's y offset (terrain height
                // + 0, no primitive-only 0.3 bump) now rather than waiting
                // for the next upsertAnimal/scatterAnimal call.
                //
                // Bug fix (issue #58): this previously hardcoded
                // `model.position.y = 0`, which is only correct on flat
                // ground -- `UpgradableObject.upgrade()` had just copied the
                // outgoing primitive's *world* position (including its
                // correct terrain-height offset) onto `model`, and this line
                // clobbered that back down to a flat y=0 regardless of the
                // terrain height under the animal. Any pig/cow whose asset
                // finished loading while stationary on a hillside (the
                // common case -- animals don't move again until they're
                // booped/scattered) would visibly snap down into the hill
                // by the local terrain height, reproducing the "only the
                // top is visible" report. Re-sampling terrainHeightAt at the
                // model's own (already-correct) x/z fixes it without
                // depending on the stale primitive-offset math above.
                model.position.y = terrainHeightAt({ x: model.position.x, z: model.position.z });
                if (record.idleAction) {
                  record.idleAction.reset().play();
                  record.currentAction = record.idleAction;
                }
              }
            }
          }
        }
        record.mixer?.update(dt);
      }
    } else {
      for (const record of animalSlots.values()) {
        record.mixer?.update(dt);
      }
    }

    // Structure sourced-art upgrade-in-place (issue #46, ADR 0010 §4/§7):
    // same cheap status()-check-then-upgrade-once pattern as upsertAnimal's
    // chicken check -- stops checking a given structure the moment its slot
    // is upgraded.
    if (assetRegistry) {
      for (const { structure, slot } of structureSlots) {
        if (slot.upgraded) continue;
        const assetKey = STRUCTURE_ASSET_KEYS[structure.kind];
        if (assetRegistry.status(assetKey) !== 'ready') continue;
        const source = assetRegistry.get(assetKey);
        if (source) slot.upgrade(buildStructureDisplayModel(source, structure.footprintRadius * 2));
      }
    }

    // Fence sourced-art upgrade-in-place (issue #54, ADR 0019 §4/component
    // design): same pattern as the structure loop just above. `upgrade()`
    // copies the outgoing primitive's *current* rotation onto the incoming
    // real model (upgradable-object.ts), so an already-collapsed fence's
    // tip-over pose (applied by `collapseFence` above, possibly before this
    // asset finished loading) carries over automatically -- no special-
    // casing needed here for "upgrade after collapse" vs. "upgrade before
    // collapse".
    if (assetRegistry) {
      for (const { fence, slot } of fenceSlots.values()) {
        if (slot.upgraded) continue;
        if (assetRegistry.status(FENCE_ASSET_KEY) !== 'ready') continue;
        const source = assetRegistry.get(FENCE_ASSET_KEY);
        if (source) slot.upgrade(buildFenceDisplayModel(source, fence.footprintRadius * 2));
      }
    }

    // Tree sourced-art upgrade-in-place (issue #54 amendment, ADR 0019 §A4):
    // same cheap status()-check-then-upgrade-once pattern as the structure/
    // fence loops above. `targetHeight` re-applies each tree's own authored
    // `scale` so the upgraded real model matches the primitive it replaces,
    // not just TREE_TARGET_HEIGHT flat.
    if (assetRegistry) {
      for (const { tree, slot } of treeSlots) {
        if (slot.upgraded) continue;
        if (assetRegistry.status(TREE_ASSET_KEY) !== 'ready') continue;
        const source = assetRegistry.get(TREE_ASSET_KEY);
        if (source) slot.upgrade(buildTreeDisplayModel(source, TREE_TARGET_HEIGHT * (tree.scale ?? 1)));
      }
    }

    if (rigNeedsRecheck && assetRegistry) {
      const keys = truckAssetKeysForBuild(currentBuild);
      const nowReady = keys.every((key) => assetRegistry.status(key) === 'ready' || assetRegistry.status(key) === 'failed');
      if (nowReady) {
        const rebuilt = buildTruckRig(currentBuild, currentCosmetics, assetRegistry);
        rebuilt.group.position.copy(truckRig.group.position);
        rebuilt.group.rotation.copy(truckRig.group.rotation);
        // Carry over each wheel's current roll/steer angle (issue #44) --
        // the rebuilt rig's pivots are freshly created at rotation 0, so
        // without this the wheels visibly snap back to un-rolled for one
        // frame before setTruckWheelMotion's next call resumes accumulating.
        // See carryOverWheelRotations's own doc comment for why this is a
        // separate top-level function (scene.test.ts coverage).
        carryOverWheelRotations(truckRig.wheels, rebuilt.wheels);
        scene.add(rebuilt.group);
        scene.remove(truckRig.group);
        truckRig.dispose();
        truckRig = rebuilt;
        rigNeedsRecheck = false;
      }
    }

    for (let i = bumpFlashes.length - 1; i >= 0; i--) {
      const flash = bumpFlashes[i];
      flash.remaining -= dt;
      if (flash.remaining <= 0) {
        scene.remove(flash.mesh);
        flash.material.dispose();
        flash.mesh.geometry.dispose();
        bumpFlashes.splice(i, 1);
        continue;
      }
      flash.material.opacity = 0.85 * (flash.remaining / BUMP_FLASH_SECONDS);
    }

    for (let i = fuelGlows.length - 1; i >= 0; i--) {
      const glow = fuelGlows[i];
      glow.remaining -= dt;
      if (glow.remaining <= 0) {
        scene.remove(glow.mesh);
        fuelGlows.splice(i, 1);
        continue;
      }
      const t = glow.remaining / FUEL_GLOW_SECONDS;
      glow.material.opacity = t;
      const scale = 1 + (1 - t) * 0.6;
      glow.mesh.scale.setScalar(scale);
    }
  }

  function onResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener('resize', onResize);

  function render() {
    renderer.render(scene, camera);
  }

  function dispose() {
    window.removeEventListener('resize', onResize);
    // A farmer can be alive (PURSUING/TIRED/LEAVING) at teardown time --
    // notably on the hard game-over restart path (CLAUDE.md's core loop
    // step 8), which is a frequently-hit path, not a rare corner case.
    // Reuse farmerDespawn's existing mixer-stop/scene-remove/material-dispose
    // teardown rather than duplicating it here; re-nulling `farmer` is
    // harmless even though the whole scene is going away right after.
    farmerDespawn();
    // Animals (pig/cow/chicken) are the highest-churn owner of per-instance
    // cloned materials in the app (ADR 0016 §8/Risks) -- up to
    // MAX_CONCURRENT_ANIMALS concurrently, continuously spawning/despawning
    // -- so a live slot at teardown time is the common case, not a corner
    // case. Reuse removeAnimal's existing mixer-stop/scene-remove/material-
    // dispose teardown per id rather than duplicating it here. Snapshot the
    // keys first since removeAnimal mutates animalSlots as it goes.
    for (const id of [...animalSlots.keys()]) removeAnimal(id);
    // Per-session rig clones are disposed with the scene (ADR 0010 §6 /
    // 0011 Consequences) -- only the resources truckRig.dispose() actually
    // owns (fallback primitives + decal geometry); the shared cached source
    // geometry/materials in AssetRegistry and the cosmetic-manifest paint
    // materials are left untouched, exactly as intended (see truck-rig.ts's
    // TruckRigResult.dispose doc comment). Other primitive meshes elsewhere
    // in this module aren't individually disposed (a pre-existing gap, not
    // introduced here).
    truckRig.dispose();
    renderer.dispose();
    container.removeChild(renderer.domElement);
  }

  return {
    setTruckTransform,
    setTruckWheelMotion,
    upsertAnimal,
    scatterAnimal,
    removeAnimal,
    setFarmerTransform,
    farmerTired,
    farmerLeaving,
    farmerDespawn,
    flashTruck,
    upsertFuelPickup,
    collectFuelPickup,
    collapseFence,
    tickEffects,
    render,
    dispose,
  };
}
