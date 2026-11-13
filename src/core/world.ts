// The farm map: terrain height function + deterministic layout of everything
// placed on it. Pure data; both the simulation and the renderer read this.
import { clamp, lerp, mulberry32, range, smoothstep, TAU, type Rng } from './math';

export const WORLD_R = 185; // soft wall radius
export const WATER_Y = -0.9;
export const SPAWN = { x: 0, z: 6, heading: 0 };

export const BIG_HILL = { x: 118, z: -96, h: 16, r: 30 };
/** Second, gentler hill north of the river. */
export const NORTH_HILL = { x: -70, z: 142, h: 10, r: 24 };
export const POND = { x: -104, z: -94, r: 17 };
/** Big shallow lake in the east: splash straight through it. */
export const LAKE = { x: 132, z: 22, r: 26 };
export const MUD = { x: 62, z: 30, r: 11 };
export const STUNT_PARK = { x: -112, z: 30 };
export const BRIDGE = { x: 12, halfW: 3.6, halfL: 11 };

export function riverCenterZ(x: number): number {
  return 86 + 14 * Math.sin(x * 0.022) + 5 * Math.sin(x * 0.06 + 1);
}
const RIVER_HALF = 6;

/** Bare terrain (no ramps/bridge). */
export function groundHeight(x: number, z: number): number {
  let h =
    2.3 * Math.sin(x * 0.031 + 0.5) * Math.cos(z * 0.028 - 0.8) +
    1.2 * Math.sin((x + z) * 0.052) +
    0.45 * Math.sin(x * 0.11 - z * 0.09);
  // Keep valleys shallow: only the river, pond and lake should hold water.
  if (h < 0.2) h = 0.2 - (0.2 - h) * 0.2;
  // Flat farmstead and stunt park.
  h *= smoothstep(26, 50, Math.hypot(x, z + 8));
  h *= smoothstep(24, 40, Math.hypot(x - STUNT_PARK.x, z - STUNT_PARK.z));
  // Hills + a few friendly bumps.
  const bump = (cx: number, cz: number, height: number, r: number) => {
    const d2 = (x - cx) ** 2 + (z - cz) ** 2;
    return height * Math.exp(-d2 / (2 * r * r));
  };
  h += bump(BIG_HILL.x, BIG_HILL.z, BIG_HILL.h, BIG_HILL.r) + bump(NORTH_HILL.x, NORTH_HILL.z, NORTH_HILL.h, NORTH_HILL.r);
  h += bump(84, 148, 5, 15) + bump(-140, -14, 5, 15) + bump(30, -128, 4.5, 13) + bump(-40, -66, 3, 10) + bump(150, -30, 4, 14) + bump(-150, 96, 4.5, 14);
  // River channel.
  const dRiver = Math.abs(z - riverCenterZ(x));
  h = lerp(h, -2.3, 1 - smoothstep(RIVER_HALF * 0.45, RIVER_HALF + 5, dRiver));
  // Pond with a little island; shallow lake.
  const dPond = Math.hypot(x - POND.x, z - POND.z);
  h = lerp(h, -2.5, 1 - smoothstep(POND.r * 0.55, POND.r + 4, dPond));
  h = lerp(h, 0.7, 1 - smoothstep(2.2, 5, dPond));
  h = lerp(h, -1.9, 1 - smoothstep(LAKE.r * 0.6, LAKE.r + 6, Math.hypot(x - LAKE.x, z - LAKE.z)));
  // Rim of hills hides the world edge.
  const r = Math.hypot(x, z);
  if (r > WORLD_R - 10) h += 26 * (1 - Math.exp(-(((r - WORLD_R + 10) / 22) ** 2)));
  return h;
}

export interface Ramp { x: number; z: number; heading: number; len: number; width: number; height: number; base: number }

function ramp(x: number, z: number, heading: number, len = 9, width = 6, height = 3.4): Ramp {
  return { x, z, heading, len, width, height, base: groundHeight(x, z) };
}

export const RAMPS: Ramp[] = [
  ramp(STUNT_PARK.x - 14, STUNT_PARK.z - 16, 0, 10, 7, 3.8),
  ramp(STUNT_PARK.x + 14, STUNT_PARK.z + 16, Math.PI, 10, 7, 3.8),
  ramp(STUNT_PARK.x + 20, STUNT_PARK.z - 10, -Math.PI / 2, 8, 6, 2.6),
  ramp(-50, riverCenterZ(-50) - 24, 0, 11, 7, 4.4), // river jump
  ramp(BIG_HILL.x - 4, BIG_HILL.z + 3, Math.PI * 0.75, 8, 7, 3), // hilltop launcher
  ramp(40, -40, Math.PI / 2, 8, 6, 2.8),
  ramp(-24, 34, -Math.PI / 2, 8, 6, 2.6),
  ramp(STUNT_PARK.x - 2, STUNT_PARK.z + 2, 0, 12, 8, 5), // the big one
  ramp(LAKE.x - LAKE.r - 14, LAKE.z, Math.PI / 2, 10, 7, 4), // lake jump
  ramp(NORTH_HILL.x + 4, NORTH_HILL.z - 3, Math.PI * 0.9, 8, 7, 3),
  ramp(70, 150, -Math.PI / 2, 9, 6, 3),
  ramp(-30, -120, 0.4, 9, 6, 3),
];

function rampHeightAt(r: Ramp, x: number, z: number): number {
  const dx = x - r.x, dz = z - r.z;
  const along = dx * Math.sin(r.heading) + dz * Math.cos(r.heading);
  const across = -dx * Math.cos(r.heading) + dz * Math.sin(r.heading);
  if (along < 0 || along > r.len || Math.abs(across) > r.width / 2) return -Infinity;
  const t = along / r.len;
  return r.base - 0.1 + r.height * (0.35 * t + 0.65 * t * t); // curved kicker
}

/**
 * Bridge deck height at u in [-1, 1] along its length. The arch starts and
 * ends exactly at ground level so the truck can roll on without a lip.
 */
export function bridgeDeckY(u: number): number {
  const zc = riverCenterZ(BRIDGE.x);
  const end = groundHeight(BRIDGE.x, zc + Math.sign(u || 1) * BRIDGE.halfL);
  return end + (2.1 - end) * (1 - u * u);
}

function bridgeHeightAt(x: number, z: number): number {
  if (Math.abs(x - BRIDGE.x) > BRIDGE.halfW) return -Infinity;
  const u = (z - riverCenterZ(BRIDGE.x)) / BRIDGE.halfL;
  if (Math.abs(u) > 1) return -Infinity;
  return bridgeDeckY(u);
}

/** What wheels actually touch: terrain, ramps, bridge deck. */
export function surfaceHeight(x: number, z: number): number {
  let h = Math.max(groundHeight(x, z), bridgeHeightAt(x, z));
  for (const r of RAMPS) h = Math.max(h, rampHeightAt(r, x, z));
  return h;
}

export const isWater = (x: number, z: number) => groundHeight(x, z) < WATER_Y - 0.15 && bridgeHeightAt(x, z) === -Infinity;
export const inMud = (x: number, z: number) => Math.hypot(x - MUD.x, z - MUD.z) < MUD.r;

// ---------------------------------------------------------------- layout

export type Solid =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'box'; x: number; z: number; hw: number; hd: number; rot: number };

export type BuildingKind = 'barn' | 'house' | 'silo' | 'windmill' | 'coop' | 'well';
export interface Building { kind: BuildingKind; x: number; z: number; rot: number }

export const BUILDINGS: Building[] = [
  { kind: 'barn', x: -20, z: -18, rot: 0.25 },
  { kind: 'house', x: 20, z: -20, rot: -0.3 },
  { kind: 'silo', x: -32, z: -10, rot: 0 },
  { kind: 'windmill', x: 32, z: 4, rot: -0.9 },
  { kind: 'coop', x: -6, z: -30, rot: 0 },
  { kind: 'well', x: 8, z: -8, rot: 0 },
];

const BUILDING_SOLIDS: Record<BuildingKind, (b: Building) => Solid> = {
  barn: (b) => ({ kind: 'box', x: b.x, z: b.z, hw: 6.2, hd: 4.6, rot: b.rot }),
  house: (b) => ({ kind: 'box', x: b.x, z: b.z, hw: 5, hd: 4.2, rot: b.rot }),
  silo: (b) => ({ kind: 'circle', x: b.x, z: b.z, r: 2.7 }),
  windmill: (b) => ({ kind: 'circle', x: b.x, z: b.z, r: 2.6 }),
  coop: (b) => ({ kind: 'box', x: b.x, z: b.z, hw: 2.4, hd: 1.9, rot: b.rot }),
  well: (b) => ({ kind: 'circle', x: b.x, z: b.z, r: 1.3 }),
};

export interface Field { kind: 'corn' | 'wheat' | 'sunflower'; x: number; z: number; hw: number; hd: number }
export const FIELDS: Field[] = [
  { kind: 'corn', x: 88, z: -14, hw: 18, hd: 15 },
  { kind: 'wheat', x: -82, z: -24, hw: 17, hd: 14 },
  { kind: 'sunflower', x: 30, z: 146, hw: 20, hd: 11 },
  { kind: 'corn', x: -36, z: -150, hw: 16, hd: 11 },
  { kind: 'wheat', x: 120, z: 120, hw: 15, hd: 12 },
];

/** Dirt tracks, for ground colouring only. */
export const PATHS: [number, number][][] = [
  [[0, -12], [0, 24], [BRIDGE.x, 56], [BRIDGE.x, riverCenterZ(BRIDGE.x) + 16], [6, 128], [-40, 150], [NORTH_HILL.x, NORTH_HILL.z]],
  [[0, 24], [-44, 32], [STUNT_PARK.x + 26, STUNT_PARK.z]],
  [[0, 0], [36, -8], [60, -40], [BIG_HILL.x - 22, BIG_HILL.z + 10], [BIG_HILL.x, BIG_HILL.z]],
  [[-20, -8], [20, -10]],
  [[0, -12], [-14, -52], [-60, -80], [POND.x + POND.r + 6, POND.z + 4]],
  [[36, -8], [70, 4], [LAKE.x - LAKE.r - 30, LAKE.z]],
  [[-14, -52], [-30, -110], [-36, -132]],
  [[6, 128], [70, 140], [112, 104]],
];

export function distToPath(x: number, z: number): number {
  let best = Infinity;
  for (const p of PATHS) {
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      const abx = bx - ax, abz = bz - az;
      const t = clamp(((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz), 0, 1);
      best = Math.min(best, Math.hypot(x - ax - abx * t, z - az - abz * t));
    }
  }
  return best;
}

export type PropKind = 'hay' | 'crate' | 'pumpkin' | 'scarecrow' | 'fence' | 'rock' | 'boulder' | 'car';
export interface PropDef { r: number; wheelTier: number; coins: number; style: number }
export const PROP_DEFS: Record<PropKind, PropDef> = {
  hay: { r: 1.2, wheelTier: 0, coins: 1, style: 10 },
  crate: { r: 0.9, wheelTier: 0, coins: 2, style: 10 },
  pumpkin: { r: 0.7, wheelTier: 0, coins: 1, style: 5 },
  scarecrow: { r: 0.7, wheelTier: 0, coins: 3, style: 25 },
  fence: { r: 1.5, wheelTier: 0, coins: 0, style: 5 },
  rock: { r: 1.3, wheelTier: 1, coins: 5, style: 30 },
  boulder: { r: 2.1, wheelTier: 2, coins: 12, style: 60 },
  car: { r: 2.4, wheelTier: 3, coins: 30, style: 150 },
};
export interface Prop { id: number; kind: PropKind; x: number; z: number; rot: number }

export interface Tree { x: number; z: number; s: number; kind: 0 | 1 | 2 }

export interface World {
  solids: Solid[];
  trees: Tree[];
  props: Prop[];
  /** Candidate spots for hidden golden corn: [x, z, heightAboveSurface]. */
  secrets: [number, number, number][];
}

const inField = (x: number, z: number, pad = 0) =>
  FIELDS.some((f) => Math.abs(x - f.x) < f.hw + pad && Math.abs(z - f.z) < f.hd + pad);

/** Open, dry, unobstructed-by-design ground: good for spawning things. */
export function isOpenGround(x: number, z: number, pad = 2): boolean {
  if (Math.hypot(x, z) > WORLD_R - 8) return false;
  if (groundHeight(x, z) < WATER_Y + 0.5) return false;
  if (Math.abs(z - riverCenterZ(x)) < 12 && Math.abs(x - BRIDGE.x) < 8) return false;
  for (const b of BUILDINGS) if (Math.hypot(x - b.x, z - b.z) < 9 + pad) return false;
  for (const r of RAMPS) {
    if (Math.hypot(x - (r.x + Math.sin(r.heading) * r.len * 0.5), z - (r.z + Math.cos(r.heading) * r.len * 0.5)) < r.len * 0.7 + pad) return false;
  }
  return true;
}

function buildWorld(): World {
  const rng = mulberry32(20261111);
  const solids: Solid[] = BUILDINGS.map((b) => BUILDING_SOLIDS[b.kind](b));
  const trees: Tree[] = [];
  const props: Prop[] = [];
  let id = 0;
  const addProp = (kind: PropKind, x: number, z: number, rot = rng() * TAU) => props.push({ id: id++, kind, x, z, rot });
  const free = (x: number, z: number, pad: number) =>
    isOpenGround(x, z, pad) && !inField(x, z, 1) && distToPath(x, z) > 3 + pad * 0.5 &&
    Math.hypot(x - SPAWN.x, z - SPAWN.z) > 10 && Math.hypot(x - STUNT_PARK.x, z - STUNT_PARK.z) > 34 &&
    !props.some((p) => Math.hypot(p.x - x, p.z - z) < PROP_DEFS[p.kind].r + pad + 1) &&
    !trees.some((t) => Math.hypot(t.x - x, t.z - z) < pad + 2);
  const scatter = (n: number, pad: number, place: (x: number, z: number) => void, where?: (rng: Rng) => [number, number]) => {
    for (let i = 0, tries = 0; i < n && tries < n * 40; tries++) {
      const [x, z] = where ? where(rng) : [range(rng, -WORLD_R, WORLD_R), range(rng, -WORLD_R, WORLD_R)];
      if (!free(x, z, pad)) continue;
      place(x, z);
      i++;
    }
  };
  const around = (cx: number, cz: number, r: number) => (g: Rng): [number, number] => {
    const a = g() * TAU, d = Math.sqrt(g()) * r;
    return [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
  };

  // Fences: a pen by the barn and edging along fields (all smashable).
  const fenceLine = (x0: number, z0: number, x1: number, z1: number) => {
    const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 3);
    const rot = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i < n; i++) {
      const x = lerp(x0, x1, (i + 0.5) / n), z = lerp(z0, z1, (i + 0.5) / n);
      if (isOpenGround(x, z, -6)) addProp('fence', x, z, rot);
    }
  };
  fenceLine(-44, -2, -26, -2); fenceLine(-44, -2, -44, 16); fenceLine(-44, 16, -26, 16);
  for (const f of FIELDS) {
    fenceLine(f.x - f.hw - 1.5, f.z - f.hd - 1.5, f.x + f.hw + 1.5, f.z - f.hd - 1.5);
    fenceLine(f.x - f.hw - 1.5, f.z - f.hd - 1.5, f.x - f.hw - 1.5, f.z + f.hd * 0.4);
  }
  fenceLine(-12, 18, -3, 18); fenceLine(3, 18, 12, 18);

  // Pumpkin patch.
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    if (rng() < 0.2) continue;
    addProp('pumpkin', 26 + i * 2.6 + range(rng, -0.5, 0.5), 22 + j * 2.6 + range(rng, -0.5, 0.5));
  }
  // Hay: stacks by the barn + scattered bales in the wheat stubble and meadows.
  scatter(8, 0.5, (x, z) => addProp('hay', x, z), around(-8, -8, 9));
  scatter(56, 1.5, (x, z) => addProp('hay', x, z));
  scatter(22, 1, (x, z) => addProp('crate', x, z), around(STUNT_PARK.x, STUNT_PARK.z, 58));
  scatter(16, 1, (x, z) => addProp('crate', x, z));
  scatter(8, 1, (x, z) => addProp('crate', x, z), around(18, -4, 14));
  for (const f of FIELDS) addProp('scarecrow', f.x, f.z);
  scatter(10, 2, (x, z) => addProp('scarecrow', x, z));
  scatter(34, 2, (x, z) => addProp('rock', x, z));
  scatter(16, 3, (x, z) => addProp('boulder', x, z));
  scatter(12, 3, (x, z) => addProp('car', x, z));
  // A second pumpkin patch out by the far corn.
  for (let p = 0; p < 16; p++) addProp('pumpkin', -62 + (p % 4) * 2.8 + range(rng, -0.5, 0.5), -150 + Math.floor(p / 4) * 2.8 + range(rng, -0.5, 0.5));

  // Trees: an orchard, scattered clumps, and a thick rim forest outside the wall.
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const x = -134 + i * 7 + range(rng, -1, 1), z = 126 + j * 7 + range(rng, -1, 1);
    if (free(x, z, 1.5)) trees.push({ x, z, s: range(rng, 0.9, 1.15), kind: 1 });
  }
  scatter(170, 2.5, (x, z) => trees.push({ x, z, s: range(rng, 0.85, 1.5), kind: rng() < 0.7 ? 0 : 2 }));
  for (const t of trees) solids.push({ kind: 'circle', x: t.x, z: t.z, r: 0.7 * t.s });
  for (let i = 0; i < 240; i++) {
    const a = rng() * TAU, d = range(rng, WORLD_R + 4, WORLD_R + 28);
    trees.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, s: range(rng, 1.3, 2.4), kind: rng() < 0.5 ? 0 : 2 });
  }

  const riverRamp = RAMPS[3], bigRamp = RAMPS[7], lakeRamp = RAMPS[8];
  const secrets: [number, number, number][] = [
    [BIG_HILL.x + 8, BIG_HILL.z - 8, 0.6],
    [POND.x, POND.z, 0.6],
    [BRIDGE.x, riverCenterZ(BRIDGE.x), 0.8],
    [riverRamp.x, riverRamp.z + riverRamp.len + 12, 5.5], // mid-air over the river
    [-27, -22, 0.6], // tucked behind the barn
    [88, -14, 0.6], // middle of the corn
    [-150, 96, 0.6],
    [150, -30, 0.6],
    [bigRamp.x, bigRamp.z + bigRamp.len + 12, 7], // off the big ramp
    [NORTH_HILL.x - 6, NORTH_HILL.z + 6, 0.6],
    [lakeRamp.x + lakeRamp.len + 14, lakeRamp.z, 5.5], // mid-air over the lake
    [-36, -150, 0.6],
    [120, 120, 0.6],
    [30, -128, 0.6],
  ];
  return { solids, trees, props, secrets };
}

export const WORLD: World = buildWorld();
