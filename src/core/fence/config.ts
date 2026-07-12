// Tunable fence constants (issue #54, ADR 0019 §2/§3).
//
// FENCE_CONTACT_MARGIN -- found via live playtest during this issue's
// implementation, not anticipated by the ADR: a standing fence is BOTH a
// solid Rapier collider (physics/world.ts's createFenceColliders, sized to
// `footprintRadius`) AND the thing `isFenceContact` checks against using
// that exact same `footprintRadius`. Every other contact check in this
// project (boop/farmer/fuel) checks against an entity with NO solid
// collider of its own, so the truck can freely close the distance to well
// inside the strict `<` threshold. A fence is the first entity that is
// both -- and Rapier's kinematic character controller (physics/world.ts's
// `TruckController`, built with a 0.02 skin offset) stops the truck AT or
// just outside the collider boundary, never inside it. Since
// `isFenceContact`'s threshold is `distance < truckRadius + fenceRadius`
// (strict), and the physics collision resolution structurally prevents
// `distance` from ever going below `truckRadius + fenceRadius`, contact
// would never fire and a "breakable" fence would just be a permanent wall
// -- confirmed live: the truck parked flush against a still-standing
// segment indefinitely, hearts/coins untouched, no collapse. Adding this
// margin to the *contact* radius only (never to the physics collider
// itself, which stays exactly `footprintRadius`) makes the contact zone
// strictly larger than the block zone, so contact fires for a few frames
// while the truck is still freely approaching, before the collider would
// ever clip its movement. 0.5 gives ~2-3 frames of margin even at the
// fastest engine tier's top speed (12 units/s / 60fps ~= 0.2 units per
// frame), comfortably more than the controller's 0.02 skin offset alone
// would provide.
export const FENCE_CONTACT_MARGIN = 0.5;
