// Persistent garage: coins, owned parts, look, bests, settings (localStorage).
import { AXES, DECALS, MAX_TIER, PARTS, STOCK, type Axis, type Decal, type Loadout } from './parts';

export type Quality = 'auto' | 'low' | 'med' | 'high';
export interface Settings { volume: number; music: boolean; quality: Quality; shake: boolean; assists: boolean }
export interface Save {
  coins: number;
  /** Highest tier owned per axis (tiers unlock in order). */
  owned: Loadout;
  equipped: Loadout;
  paint: number;
  decal: Decal;
  best: number;
  bestMedal: number;
  runs: number;
  lastBusted: boolean;
  settings: Settings;
}

const KEY = 'monster-truck-farm-v2';

export const defaultSave = (): Save => ({
  coins: 0, owned: { ...STOCK }, equipped: { ...STOCK }, paint: 0, decal: 'flames', best: 0, bestMedal: -1, runs: 0, lastBusted: false,
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

/** Farmer goes easier after a run that ended in a bust. */
export const farmerEaseFor = (save: Save) => (save.lastBusted ? 0.8 : save.runs < 2 ? 0.85 : 1);
