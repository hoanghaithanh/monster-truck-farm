// Fuel-pickup-vs-truck contact detection (ADR 0008 §1, AC5): the same
// circle-overlap geometry as boop.ts's isBoopContact/farmer/contact.ts's
// isFarmerContact, kept as its own function since a fuel pickup is a wholly
// different effect (a flat gas refill, never coins, never a hit).
import type { FuelPickupState, Vec2 } from '../types';

export function isFuelContact(truckPosition: Vec2, truckRadius: number, pickup: FuelPickupState, pickupRadius: number): boolean {
  return Math.hypot(truckPosition.x - pickup.position.x, truckPosition.z - pickup.position.z) < truckRadius + pickupRadius;
}
