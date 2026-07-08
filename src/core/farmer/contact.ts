// Farmer-vs-truck contact detection (farmer AC3): the same circle-overlap
// approach as boop.ts's isBoopContact, kept as a separate function since a
// farmer bump is a wholly different effect (drains a hit, not a coin reward).
import type { Vec2 } from '../types';

export function isFarmerContact(truckPosition: Vec2, truckRadius: number, farmerPosition: Vec2, farmerRadius: number): boolean {
  return Math.hypot(truckPosition.x - farmerPosition.x, truckPosition.z - farmerPosition.z) < truckRadius + farmerRadius;
}
