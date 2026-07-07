import RAPIER from '@dimforge/rapier3d-compat';

// Physics adapter seam per ADR 0001 §2/§4: Rapier lives entirely behind this
// module. core/ never imports it directly. Only the async WASM init and a
// bare world are stood up here for Phase 2 — the KinematicCharacterController
// wiring for the truck is the developer's job next sprint.
let initialized = false;

export async function initPhysics(): Promise<RAPIER.World> {
  if (!initialized) {
    await RAPIER.init();
    initialized = true;
  }
  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  return new RAPIER.World(gravity);
}
