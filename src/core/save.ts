// Persistent garage: coins, owned parts, look, bests, settings (localStorage).
import { AXES, DECALS, FINISHES, MAX_TIER, PAINTS, PARTS, STOCK, TRUCK_IDS, truckDef, type Axis, type Decal, type Finish, type Loadout, type TruckId } from './parts';

export type Quality = 'auto' | 'low' | 'med' | 'high';
export interface Settings { volume: number; music: boolean; quality: Quality; shake: boolean; assists: boolean }
export interface Save {
  coins: number;
  /** Highest tier owned per axis (tiers unlock in order). */
  owned: Loadout;
  equipped: Loadout;
  /** Truck types owned, and the one being driven. */
  trucks: TruckId[];
  truck: TruckId;
  paint: number;
  decal: Decal;
  finish: Finish;
  best: number;
  bestMedal: number;
  runs: number;
  lastBusted: boolean;
  settings: Settings;
}

const KEY = 'monster-truck-farm-v2';

export const defaultSave = (): Save => ({
  coins: 0, owned: { ...STOCK }, equipped: { ...STOCK }, trucks: ['pickup'], truck: 'pickup', paint: 0, decal: 'flames', finish: 'gloss', best: 0, bestMedal: -1, runs: 0, lastBusted: false,
  settings: { volume: 0.7, music: true, quality: 'auto', shake: true, assists: true },
});

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function loadSave(store: Store | undefined): Save {
  const base = defaultSave();
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return base;
    const data = JSON.parse(raw) as Partial<Save>;
    const save: Save = { ...base, ...data, owned: { ...base.owned, ...data.owned }, equipped: { ...base.equipped, ...data.equipped }, settings: { ...base.settings, ...data.settings } };
    // Never trust stored numbers.
    save.coins = Math.max(0, Math.floor(Number(save.coins) || 0));
    for (const a of AXES) {
      save.owned[a] = Math.min(MAX_TIER, Math.max(0, Math.floor(Number(save.owned[a]) || 0)));
      save.equipped[a] = Math.min(save.owned[a], Math.max(0, Math.floor(Number(save.equipped[a]) || 0)));
    }
    if (!DECALS.includes(save.decal)) save.decal = 'none';
    if (!FINISHES.includes(save.finish)) save.finish = 'gloss';
    // Saves from before the truck collection: paint indices moved when colours were added.
    if (!Array.isArray(data.trucks)) save.paint = [0, 1, 2, 3, 5, 6, 7, 10][save.paint] ?? 0;
    save.paint = Math.min(PAINTS.length - 1, Math.max(0, Math.floor(Number(save.paint) || 0)));
    save.trucks = [...new Set(['pickup' as TruckId, ...(Array.isArray(data.trucks) ? data.trucks : [])])].filter((t) => TRUCK_IDS.includes(t));
    if (!save.trucks.includes(save.truck)) save.truck = 'pickup';
    return save;
  } catch {
    return base;
  }
}

export function persist(store: Store | undefined, save: Save): void {
  try { store?.setItem(KEY, JSON.stringify(save)); } catch { /* private mode / quota: play on without saving */ }
}

export const nextTier = (save: Save, axis: Axis) => (save.owned[axis] < MAX_TIER ? save.owned[axis] + 1 : null);
export function canBuy(save: Save, axis: Axis): boolean {
  const n = nextTier(save, axis);
  return n !== null && save.coins >= PARTS[axis][n].cost;
}
/** Buys and equips the next tier. Returns the new tier, or null if not affordable/maxed. */
export function buy(save: Save, axis: Axis): number | null {
  const n = nextTier(save, axis);
  if (n === null || save.coins < PARTS[axis][n].cost) return null;
  save.coins -= PARTS[axis][n].cost;
  save.owned[axis] = n;
  save.equipped[axis] = n;
  return n;
}

/** Buys (if needed and affordable) and selects a truck type. Returns 'bought', 'selected' or null. */
export function chooseTruck(save: Save, id: TruckId): 'bought' | 'selected' | null {
  if (!save.trucks.includes(id)) {
    const cost = truckDef(id).cost;
    if (save.coins < cost) return null;
    save.coins -= cost;
    save.trucks.push(id);
    save.truck = id;
    return 'bought';
  }
  save.truck = id;
  return 'selected';
}

/** Farmer goes easier after a run that ended in a bust. */
export const farmerEaseFor = (save: Save) => (save.lastBusted ? 0.8 : save.runs < 2 ? 0.85 : 1);
