// Fence-vs-truck contact detection (issue #54, ADR 0019 §2, AC8): the same
// circle-overlap geometry as boop.ts's isBoopContact / farmer/contact.ts's
// isFarmerContact / fuel/collect.ts's isFuelContact, kept as its own
// function since a fence collapse is a wholly different effect (a one-way
// standing->collapsed state flip, never coins, never a hit). Deliberately a
// pure 2D-distance check, not a Rapier collision event, so `core/` stays
// physics-engine-agnostic (ADR 0001 §4) and this is fully unit-testable with
// no Rapier in the loop.
import type { Vec2 } from '../types';

export function isFenceContact(truckPosition: Vec2, truckRadius: number, fencePosition: Vec2, fenceRadius: number): boolean {
  return Math.hypot(truckPosition.x - fencePosition.x, truckPosition.z - fencePosition.z) < truckRadius + fenceRadius;
}
