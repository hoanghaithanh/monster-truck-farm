import RAPIER from '@dimforge/rapier3d-compat';
import type { ObstacleInstance, Vec2 } from '../core/types';
import type { FenceInstance, StructureInstance, TreeInstance } from '../core/terrain';
import { TREE_COLLIDER_RADIUS } from '../core/terrain';

// Physics adapter seam per ADR 0001 §2/§4: Rapier lives entirely behind this
// module. core/ never imports it directly.
let initialized = false;

export async function initPhysics(): Promise<RAPIER.World> {
  if (!initialized) {
    await RAPIER.init();
    initialized = true;
  }
  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  return new RAPIER.World(gravity);
}

/**
 * Wraps a Rapier kinematic character controller for the truck (ADR 0001 §2):
 * the truck is moved by handing it a *desired* displacement each frame (from
 * core's arcade driving math); Rapier resolves that against solid obstacle
 * colliders — slide along, never pass through, never crash (drive AC6-AC9) —
 * and returns the actual movement applied.
 */
export class TruckController {
  private world: RAPIER.World;
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private controller: RAPIER.KinematicCharacterController;

  constructor(world: RAPIER.World, startPosition: Vec2, truckRadius: number, truckHalfHeight: number) {
    this.world = world;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        startPosition.x,
        truckHalfHeight,
        startPosition.z,
      ),
    );
    this.collider = world.createCollider(RAPIER.ColliderDesc.cylinder(truckHalfHeight, truckRadius), this.body);
    this.controller = world.createCharacterController(0.02);
    this.controller.setSlideEnabled(true);
  }

  /**
   * Attempts to move by `desired` (XZ, world space); returns the actual movement applied after obstacle
   * sliding. Only *queues* the resulting translation via `setNextKinematicTranslation` — it does **not**
   * step the world. Per Rapier's kinematic-character-controller contract, `world.step()` must run exactly
   * once per simulation tick (ADR 0001 §5's single `physics(move)` stage); callers must call `step()`
   * (below) themselves, exactly once, after this tick's `moveBy`/`setPosition` calls are done queuing
   * their targets. Fixes issues #16/#21: a second, independent `step()` call within the same tick (as the
   * previous implementation did whenever the boundary clamp fired) corrupts Rapier's internal
   * wasm-bindgen object graph — the confirmed root cause of the "recursive use of an object" crash
   * observed during sustained driving.
   */
  moveBy(desired: Vec2): Vec2 {
    this.controller.computeColliderMovement(this.collider, { x: desired.x, y: 0, z: desired.z });
    const movement = this.controller.computedMovement();
    const current = this.body.translation();
    const next = { x: current.x + movement.x, y: current.y, z: current.z + movement.z };
    this.body.setNextKinematicTranslation(next);
    return { x: movement.x, z: movement.z };
  }

  /**
   * Forces the truck to an absolute position (used to apply the soft-boundary clamp — drive AC4). Only
   * queues the translation, same "does not step" contract as `moveBy` above.
   */
  setPosition(position: Vec2, height: number): void {
    this.body.setNextKinematicTranslation({ x: position.x, y: height, z: position.z });
  }

  /**
   * Advances the physics world by exactly one simulation tick. Must be called exactly once per rendered
   * frame, after all of that frame's `moveBy`/`setPosition` calls have queued their kinematic targets
   * (issues #16/#21). Owning "step" as its own explicit method — rather than embedding it inside
   * `moveBy`/`setPosition` as the previous implementation did — makes double-stepping structurally
   * impossible for any future caller, instead of merely a convention callers have to remember.
   */
  step(): void {
    this.world.step();
  }

  position(): Vec2 {
    const t = this.body.translation();
    return { x: t.x, z: t.z };
  }

  /** Removes the truck's body (and its collider) from the world, e.g. when a driving session ends. */
  dispose(): void {
    this.world.removeRigidBody(this.body);
  }
}

/**
 * Creates fixed colliders for obstacles that block the truck (post-clearance partition, drive AC6-AC8).
 * Returns the created bodies so a caller can remove them again (e.g. on a GAME_OVER -> restart round
 * trip, where a fresh driving session re-partitions and re-creates obstacle colliders for the new
 * TruckSpec's clearance — the old ones would otherwise leak in the shared Rapier world forever).
 */
export function createObstacleColliders(world: RAPIER.World, obstacles: ObstacleInstance[]): RAPIER.RigidBody[] {
  return obstacles.map((obstacle) => {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(obstacle.position.x, 0.5, obstacle.position.z),
    );
    world.createCollider(RAPIER.ColliderDesc.cylinder(0.5, obstacle.radius), body);
    return body;
  });
}

/**
 * Creates fixed colliders for the collidable structures (windmill/barn/farmhouse, issue #46, ADR 0012
 * §1/§2): unconditionally solid regardless of wheel tier -- no clearance partitioning, so unlike
 * `createObstacleColliders` above this is called once per driving session with the full collidable set,
 * not a pre-filtered `blocking` subset. The collider is a simplified cylinder sized to `footprintRadius`,
 * not the visual mesh's exact geometry (ADR 0012 §2). Returns the created bodies so a caller can remove
 * them again on a driving-session dispose/restart round trip, same rationale as `createObstacleColliders`'s
 * own doc comment (otherwise they'd leak in the shared Rapier world forever across a GAME_OVER -> restart).
 */
export function createStructureColliders(world: RAPIER.World, structures: StructureInstance[]): RAPIER.RigidBody[] {
  return structures
    .filter((structure) => structure.collidable)
    .map((structure) => {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(structure.position.x, 0.5, structure.position.z),
      );
      world.createCollider(RAPIER.ColliderDesc.cylinder(0.5, structure.footprintRadius), body);
      return body;
    });
}

/**
 * Creates one fixed cylinder collider per *standing* fence (issue #54, ADR 0019 §3), keyed by fence id in a
 * `Map` rather than returned as a bulk array like `createObstacleColliders`/`createStructureColliders` above --
 * unlike every prior collider set, a single fence needs to be individually removed mid-session the moment its
 * segment collapses (AC8), and a keyed map is what lets the frame loop do `world.removeRigidBody(map.get(id))`
 * + `map.delete(id)` for exactly one body without touching any other fence's. Same simplified-cylinder-sized-
 * to-footprintRadius rationale as `createStructureColliders` (ADR 0012 §2) -- not the visual mesh's exact
 * (long/thin) geometry.
 */
export function createFenceColliders(world: RAPIER.World, fences: FenceInstance[]): Map<string, RAPIER.RigidBody> {
  const bodies = new Map<string, RAPIER.RigidBody>();
  for (const fence of fences) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(fence.position.x, 0.5, fence.position.z),
    );
    world.createCollider(RAPIER.ColliderDesc.cylinder(0.5, fence.footprintRadius), body);
    bodies.set(fence.id, body);
  }
  return bodies;
}

/**
 * Creates one fixed cylinder collider per decorative tree (issue #54
 * amendment, ADR 0019 §A4 -- the human's override of the ADR's own
 * non-collidable default: trees must be solid but never breakable). A
 * parallel sibling to `createStructureColliders` above, deliberately NOT a
 * widened `StructureKind`/`STUB_STRUCTURES` entry: `DECORATIVE_TREES` isn't
 * flattened by `terrainHeightAt` (a forested hillside is the point, unlike
 * every structure) and there can be dozens of them with per-instance
 * `scale` variance, neither of which fits the one-per-kind
 * asset-key/footprint-derivation shape `StructureInstance` and its
 * consumers assume -- a small parallel function is the better structural
 * fit here, mirroring the exact same simple-cylinder-collider pattern
 * rather than diverging from it. Unlike `createFenceColliders`, trees are
 * never removed mid-session (unbreakable), so this returns a bulk array
 * like `createObstacleColliders`/`createStructureColliders`, not a keyed
 * `Map`. `radius` scales with each tree's own `scale` (default 1), same as
 * the visual model, so a bigger-looking tree also blocks a proportionally
 * bigger area.
 */
export function createTreeColliders(world: RAPIER.World, trees: TreeInstance[]): RAPIER.RigidBody[] {
  return trees.map((tree) => {
    const radius = TREE_COLLIDER_RADIUS * (tree.scale ?? 1);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(tree.position.x, 0.5, tree.position.z));
    world.createCollider(RAPIER.ColliderDesc.cylinder(0.5, radius), body);
    return body;
  });
}

export function createGroundCollider(world: RAPIER.World): void {
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.1, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(100, 0.1, 100), ground);
}
