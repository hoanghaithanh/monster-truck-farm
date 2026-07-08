// Farmer steering (ADR 0003: "the FSM owns state, not the kinematics").
// Simple constant-speed movement toward the player's current position (farmer AC2).
import type { Vec2 } from '../types';

export function stepTowards(current: Vec2, target: Vec2, speed: number, dt: number): Vec2 {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-4) return current;
  const step = Math.min(distance, speed * dt);
  return { x: current.x + (dx / distance) * step, z: current.z + (dz / distance) * step };
}
