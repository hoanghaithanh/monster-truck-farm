// Animal behaviour: graze, wander, flee from the truck, and fly through the
// air in a comedic arc when booped (they land, shake it off and trot away).
import { angleDelta, damp, range, TAU, type Rng } from './math';
import { groundHeight, isOpenGround, WATER_Y } from './world';

export type Species = 'chicken' | 'pig' | 'sheep' | 'cow';
export interface SpeciesDef { r: number; speed: number; coins: number; alert: number }
// Coins scale with size and speed, like the original design.
export const SPECIES: Record<Species, SpeciesDef> = {
  chicken: { r: 0.75, speed: 9, coins: 4, alert: 11 },
  pig: { r: 1.0, speed: 7.5, coins: 6, alert: 12 },
  sheep: { r: 1.1, speed: 6.5, coins: 8, alert: 13 },
  cow: { r: 1.5, speed: 5.5, coins: 12, alert: 14 },
};
export const GOLDEN_COIN_MULT = 5;

export type AnimalMode = 'graze' | 'walk' | 'flee' | 'fly' | 'dizzy' | 'gone' | 'stampede';
export interface Animal {
  id: number; species: Species; golden: boolean;
  x: number; z: number; y: number; vx: number; vz: number; vy: number;
  heading: number; mode: AnimalMode; timer: number;
  homeX: number; homeZ: number; tx: number; tz: number;
  /** Event animals vanish for good instead of respawning. */
  temp: boolean; life: number; age: number;
  bounced: boolean;
}

export function makeAnimal(id: number, species: Species, x: number, z: number, rng: Rng, golden = false): Animal {
  return {
    id, species, golden, x, z, y: groundHeight(x, z), vx: 0, vz: 0, vy: 0, heading: rng() * TAU, mode: 'graze', timer: range(rng, 0.5, 4),
    homeX: x, homeZ: z, tx: x, tz: z, temp: false, life: Infinity, age: 0, bounced: false,
  };
}

export const animalSpeed = (a: Animal) => SPECIES[a.species].speed * (a.golden ? 1.45 : 1);
export const isBoopable = (a: Animal) => a.mode === 'graze' || a.mode === 'walk' || a.mode === 'flee' || a.mode === 'stampede';

export function launchAnimal(a: Animal, dirX: number, dirZ: number, speed: number, rng: Rng): void {
  const side = range(rng, -0.35, 0.35);
  const power = 7 + speed * 0.75;
  a.vx = (dirX - dirZ * side) * power;
  a.vz = (dirZ + dirX * side) * power;
  a.vy = 9 + speed * 0.25;
  a.mode = 'fly';
  a.bounced = false;
}

const walkable = (x: number, z: number) => isOpenGround(x, z, -4) && groundHeight(x, z) > WATER_Y + 0.4;

export type AnimalEvent = 'landed' | 'poof' | 'respawn' | null;

export function stepAnimal(a: Animal, dt: number, truckX: number, truckZ: number, truckSpeed: number, rng: Rng): AnimalEvent {
  let event: AnimalEvent = null;
  a.life -= dt;
  a.age += dt;
  const def = SPECIES[a.species];
  const move = (dirX: number, dirZ: number, speed: number) => {
    let nx = a.x + dirX * speed * dt, nz = a.z + dirZ * speed * dt;
    if (!walkable(nx, nz)) { // slide around what we can't enter
      const sx = -dirZ, sz = dirX;
      const sgn = walkable(a.x + sx * 2, a.z + sz * 2) ? 1 : -1;
      nx = a.x + sx * sgn * speed * dt; nz = a.z + sz * sgn * speed * dt;
      if (!walkable(nx, nz)) return;
      dirX = sx * sgn; dirZ = sz * sgn;
    }
    a.x = nx; a.z = nz;
    a.heading += angleDelta(a.heading, Math.atan2(dirX, dirZ)) * Math.min(1, 10 * dt);
    a.y = groundHeight(a.x, a.z);
  };

  switch (a.mode) {
    case 'graze':
    case 'walk': {
      const dx = a.x - truckX, dz = a.z - truckZ;
      if (dx * dx + dz * dz < def.alert * def.alert && truckSpeed > 2.5) { a.mode = 'flee'; a.timer = 1.2; break; }
      a.timer -= dt;
      if (a.mode === 'graze') {
        if (a.timer <= 0) {
          const ang = rng() * TAU, d = range(rng, 3, 9);
          a.tx = a.homeX + Math.cos(ang) * d; a.tz = a.homeZ + Math.sin(ang) * d;
          a.mode = 'walk'; a.timer = 6;
        }
      } else {
        const tx = a.tx - a.x, tz = a.tz - a.z, d = Math.hypot(tx, tz);
        if (d < 0.5 || a.timer <= 0) { a.mode = 'graze'; a.timer = range(rng, 1.5, 5); } else move(tx / d, tz / d, def.speed * 0.22);
      }
      break;
    }
    case 'flee': {
      const dx = a.x - truckX, dz = a.z - truckZ, d = Math.hypot(dx, dz) || 1;
      a.timer -= dt;
      if (d > def.alert * 1.5 && a.timer <= 0) { a.mode = 'graze'; a.timer = range(rng, 1, 3); a.homeX = a.x; a.homeZ = a.z; break; }
      // Chickens zig-zag in a panic; bigger animals run straighter.
      const wob = a.species === 'chicken' ? Math.sin(a.age * 9 + a.id) * 0.9 : Math.sin(a.age * 3 + a.id) * 0.25;
      const c = Math.cos(wob), s = Math.sin(wob);
      move((dx / d) * c - (dz / d) * s, (dz / d) * c + (dx / d) * s, animalSpeed(a));
      break;
    }
    case 'stampede': {
      move(Math.sin(a.heading), Math.cos(a.heading), animalSpeed(a) * 1.5);
      break;
    }
    case 'fly': {
      a.vy -= 24 * dt;
      a.x += a.vx * dt; a.z += a.vz * dt; a.y += a.vy * dt;
      const g = Math.max(groundHeight(a.x, a.z), WATER_Y);
      if (a.y <= g) {
        a.y = g;
        if (!a.bounced && a.vy < -6) { a.bounced = true; a.vy *= -0.42; a.vx *= 0.55; a.vz *= 0.55; } else { a.mode = 'dizzy'; a.timer = 1.4; a.vx = a.vz = a.vy = 0; }
        event = 'landed';
      }
      break;
    }
    case 'dizzy': {
      a.timer -= dt;
      a.y = damp(a.y, Math.max(groundHeight(a.x, a.z), WATER_Y), 10, dt);
      if (a.timer <= 0) { a.mode = 'gone'; a.timer = a.temp ? Infinity : range(rng, 4, 8); event = 'poof'; }
      break;
    }
    case 'gone': {
      a.timer -= dt;
      if (a.timer <= 0) {
        for (let i = 0; i < 12; i++) {
          const ang = rng() * TAU, d = range(rng, 0, 12);
          const x = a.homeX + Math.cos(ang) * d, z = a.homeZ + Math.sin(ang) * d;
          if (walkable(x, z) && Math.hypot(x - truckX, z - truckZ) > 30) {
            a.x = x; a.z = z; a.y = groundHeight(x, z); a.mode = 'graze'; a.timer = range(rng, 1, 3);
            return 'respawn';
          }
        }
        a.timer = 2;
      }
      break;
    }
  }
  if (a.temp && a.life <= 0 && isBoopable(a)) { a.mode = 'gone'; a.timer = Infinity; event = 'poof'; }
  return event;
}
