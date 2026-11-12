// Upgrade tables. Four axes, four tiers each; tier 0 is free.
export type Axis = 'body' | 'wheels' | 'engine' | 'tank';
export const AXES: Axis[] = ['body', 'wheels', 'engine', 'tank'];
export const MAX_TIER = 3;

export interface PartTier { name: string; cost: number; blurb: string }

export const PARTS: Record<Axis, PartTier[]> = {
  body: [
    { name: 'Pickup', cost: 0, blurb: '3 hearts' },
    { name: 'Bruiser', cost: 45, blurb: '4 hearts + roll bar' },
    { name: 'Crusher', cost: 240, blurb: '5 hearts + light bar' },
    { name: 'Titan', cost: 850, blurb: '6 hearts + neon glow' },
  ],
  wheels: [
    { name: 'Street', cost: 0, blurb: 'Smash hay & fences' },
    { name: 'Mudders', cost: 30, blurb: 'Smash rocks' },
    { name: 'Monsters', cost: 200, blurb: 'Smash boulders' },
    { name: 'Mega Crushers', cost: 750, blurb: 'Crush old cars!' },
  ],
  engine: [
    { name: 'Putt-Putt', cost: 0, blurb: 'Zoom' },
    { name: 'V8', cost: 40, blurb: 'Zoom zoom' },
    { name: 'Blower', cost: 240, blurb: 'ZOOM' },
    { name: 'Rocket', cost: 850, blurb: 'ZOOOOOM!!' },
  ],
  tank: [
    { name: 'Lil Can', cost: 0, blurb: 'A puff of nitro' },
    { name: 'Twin Cans', cost: 30, blurb: 'More nitro' },
    { name: 'Big Bottles', cost: 180, blurb: 'Lots of nitro' },
    { name: 'Mega Nitro', cost: 650, blurb: 'Nitro for days' },
  ],
};

export type Loadout = Record<Axis, number>;
export const STOCK: Loadout = { body: 0, wheels: 0, engine: 0, tank: 0 };

export interface TruckStats {
  hearts: number;
  topSpeed: number;
  accel: number;
  wheelTier: number;
  wheelRadius: number;
  /** Seconds of continuous boost. */
  nitro: number;
}

const TOP_SPEED = [16, 20, 24.5, 30];
const ACCEL = [15, 19, 24, 30];
const WHEEL_RADIUS = [0.85, 1.05, 1.3, 1.6];
const NITRO = [2, 3.2, 4.6, 6.5];

export function statsFor(l: Loadout): TruckStats {
  return {
    hearts: 3 + l.body,
    topSpeed: TOP_SPEED[l.engine],
    accel: ACCEL[l.engine],
    wheelTier: l.wheels,
    wheelRadius: WHEEL_RADIUS[l.wheels],
    nitro: NITRO[l.tank],
  };
}

/** 0..1 bars for the garage comparison panel. */
export function statBars(l: Loadout): { toughness: number; smash: number; speed: number; nitro: number } {
  return { toughness: (l.body + 1) / 4, smash: (l.wheels + 1) / 4, speed: (l.engine + 1) / 4, nitro: (l.tank + 1) / 4 };
}

export const PAINTS = [
  { name: 'Cherry', color: 0xff3b3b },
  { name: 'Tangerine', color: 0xff8a1f },
  { name: 'Banana', color: 0xffd21f },
  { name: 'Lime', color: 0x5fd83a },
  { name: 'Sky', color: 0x2fa8ff },
  { name: 'Grape', color: 0x8f5bff },
  { name: 'Bubblegum', color: 0xff6fbf },
  { name: 'Midnight', color: 0x2b2f55 },
] as const;

export const DECALS = ['none', 'flames', 'bolt', 'stars', 'stripes'] as const;
export type Decal = (typeof DECALS)[number];
