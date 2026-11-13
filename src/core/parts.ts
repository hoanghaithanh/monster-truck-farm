// The garage: a collection of truck types (each with its own look and perk)
// plus four upgrade axes that apply to whichever truck you drive.
export type Axis = 'body' | 'wheels' | 'engine' | 'tank';
export const AXES: Axis[] = ['body', 'wheels', 'engine', 'tank'];
export const MAX_TIER = 3;

export interface PartTier { name: string; cost: number; blurb: string }

// `body` is the armour kit: hearts plus bolt-on bars, lights, wing and neon.
export const PARTS: Record<Axis, PartTier[]> = {
  body: [
    { name: 'Stock', cost: 0, blurb: '3 hearts' },
    { name: 'Roll Bar', cost: 45, blurb: '4 hearts + bull bar' },
    { name: 'Light Bar', cost: 450, blurb: '5 hearts + roof lights' },
    { name: 'Titan Kit', cost: 1700, blurb: '6 hearts + wing + neon' },
  ],
  wheels: [
    { name: 'Street', cost: 0, blurb: 'Smash hay & fences' },
    { name: 'Mudders', cost: 30, blurb: 'Smash rocks' },
    { name: 'Monsters', cost: 400, blurb: 'Smash boulders' },
    { name: 'Mega Crushers', cost: 1500, blurb: 'Crush old cars!' },
  ],
  engine: [
    { name: 'Putt-Putt', cost: 0, blurb: 'Zoom' },
    { name: 'V8', cost: 40, blurb: 'Zoom zoom' },
    { name: 'Blower', cost: 450, blurb: 'ZOOM' },
    { name: 'Rocket', cost: 1700, blurb: 'ZOOOOOM!!' },
  ],
  tank: [
    { name: 'Lil Can', cost: 0, blurb: 'A puff of nitro' },
    { name: 'Twin Cans', cost: 30, blurb: 'More nitro' },
    { name: 'Big Bottles', cost: 350, blurb: 'Lots of nitro' },
    { name: 'Mega Nitro', cost: 1300, blurb: 'Nitro for days' },
  ],
};

export type Loadout = Record<Axis, number>;
export const STOCK: Loadout = { body: 0, wheels: 0, engine: 0, tank: 0 };

export type TruckId = 'pickup' | 'buggy' | 'bus' | 'shark' | 'dino' | 'bull';
export interface TruckDef {
  id: TruckId; name: string; icon: string; cost: number;
  /** One-line perk, shown in the garage. */
  perk: string;
  speed: number; accel: number; hearts: number; nitro: number;
  /** Smashes props one size bigger than the wheels alone allow. */
  stomp?: boolean;
  /** Water barely slows it. */
  swims?: boolean;
  /** Multiplier on coins from boops. */
  coins?: number;
}

export const TRUCKS: TruckDef[] = [
  { id: 'pickup', name: 'Pickup', icon: '🛻', cost: 0, perk: 'Good at everything', speed: 1, accel: 1, hearts: 0, nitro: 1 },
  { id: 'buggy', name: 'Dune Buggy', icon: '🏎️', cost: 150, perk: 'Zippy: super quick off the line', speed: 1.06, accel: 1.35, hearts: 0, nitro: 1 },
  { id: 'bus', name: 'School Bus', icon: '🚌', cost: 350, perk: 'Tough: +2 hearts, a bit slower', speed: 0.92, accel: 0.95, hearts: 2, nitro: 1 },
  { id: 'shark', name: 'Shark Bite', icon: '🦈', cost: 700, perk: 'Swims: water does not slow it', speed: 1.08, accel: 1.05, hearts: 0, nitro: 1.1, swims: true },
  { id: 'dino', name: 'Dino Crush', icon: '🦖', cost: 1100, perk: 'Stomp: smashes bigger stuff', speed: 1, accel: 1, hearts: 1, nitro: 1, stomp: true },
  { id: 'bull', name: 'Raging Bull', icon: '🐂', cost: 1500, perk: 'Charge: +50% nitro, +25% boop coins', speed: 1.04, accel: 1.15, hearts: 1, nitro: 1.5, coins: 1.25 },
];
export const TRUCK_IDS = TRUCKS.map((t) => t.id);
export const truckDef = (id: TruckId): TruckDef => TRUCKS.find((t) => t.id === id) ?? TRUCKS[0];

export interface TruckStats {
  hearts: number;
  topSpeed: number;
  accel: number;
  /** What the truck can smash (0..3), including any stomp perk. */
  wheelTier: number;
  wheelRadius: number;
  /** Seconds of continuous boost. */
  nitro: number;
  swims: boolean;
  coinMult: number;
}

const TOP_SPEED = [16, 20, 24.5, 30];
const ACCEL = [15, 19, 24, 30];
const WHEEL_RADIUS = [0.85, 1.05, 1.3, 1.6];
const NITRO = [2, 3.2, 4.6, 6.5];

export function statsFor(l: Loadout, truck: TruckId = 'pickup'): TruckStats {
  const t = truckDef(truck);
  return {
    hearts: 3 + l.body + t.hearts,
    topSpeed: TOP_SPEED[l.engine] * t.speed,
    accel: ACCEL[l.engine] * t.accel,
    wheelTier: Math.min(MAX_TIER, l.wheels + (t.stomp ? 1 : 0)),
    wheelRadius: WHEEL_RADIUS[l.wheels],
    nitro: NITRO[l.tank] * t.nitro,
    swims: !!t.swims,
    coinMult: t.coins ?? 1,
  };
}

/** 0..1 bars for the garage comparison panel. */
export function statBars(l: Loadout, truck: TruckId = 'pickup'): { toughness: number; smash: number; speed: number; nitro: number } {
  const s = statsFor(l, truck);
  return { toughness: s.hearts / 8, smash: (s.wheelTier + 1) / 4, speed: s.topSpeed / (TOP_SPEED[3] * 1.08), nitro: s.nitro / (NITRO[3] * 1.5) };
}

export const PAINTS = [
  { name: 'Cherry', color: 0xff3b3b },
  { name: 'Tangerine', color: 0xff8a1f },
  { name: 'Banana', color: 0xffd21f },
  { name: 'Lime', color: 0x5fd83a },
  { name: 'Mint', color: 0x3fe0b0 },
  { name: 'Sky', color: 0x2fa8ff },
  { name: 'Grape', color: 0x8f5bff },
  { name: 'Bubblegum', color: 0xff6fbf },
  { name: 'Snow', color: 0xf4f6fb },
  { name: 'Gold', color: 0xe9b520 },
  { name: 'Midnight', color: 0x2b2f55 },
  { name: 'Coal', color: 0x3a3d47 },
] as const;

export const DECALS = ['none', 'flames', 'bolt', 'stars', 'stripes', 'tiger', 'rainbow', 'checker'] as const;
export type Decal = (typeof DECALS)[number];

export const FINISHES = ['gloss', 'metal', 'matte'] as const;
export type Finish = (typeof FINISHES)[number];
