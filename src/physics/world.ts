import RAPIER from '@dimforge/rapier3d-compat';
import type { ObstacleInstance, Vec2 } from '../core/types';

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

  /** Attempts to move by `desired` (XZ, world space); returns the actual movement applied after obstacle sliding. */
  moveBy(desired: Vec2): Vec2 {
    this.controller.computeColliderMovement(this.collider, { x: desired.x, y: 0, z: desired.z });
    const movement = this.controller.computedMovement();
    const current = this.body.translation();
    const next = { x: current.x + movement.x, y: current.y, z: current.z + movement.z };
    this.body.setNextKinematicTranslation(next);
    this.world.step();
    return { x: movement.x, z: movement.z };
  }

  /** Forces the truck to an absolute position (used to apply the soft-boundary clamp — drive AC4). */
  setPosition(position: Vec2, height: number): void {
    this.body.setNextKinematicTranslation({ x: position.x, y: height, z: position.z });
    this.world.step();
  }

  position(): Vec2 {
    const t = this.body.translation();
    return { x: t.x, z: t.z };
  }
}

/** Creates fixed colliders for obstacles that block the truck (post-clearance partition, drive AC6-AC8). */
export function createObstacleColliders(world: RAPIER.World, obstacles: ObstacleInstance[]): void {
  for (const obstacle of obstacles) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(obstacle.position.x, 0.5, obstacle.position.z),
    );
    world.createCollider(RAPIER.ColliderDesc.cylinder(0.5, obstacle.radius), body);
  }
}

export function createGroundCollider(world: RAPIER.World): void {
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.1, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(100, 0.1, 100), ground);
}
