// Short icon-first goals shown in the HUD strip. Three active at a time;
// finishing one pays coins + bonus daylight and deals a fresh one.
import type { Rng } from './math';

export interface Counters {
  boops: number; chicken: number; pig: number; sheep: number; cow: number; golden: number;
  air: number; bigAir: number; smash: number; drift: number; splash: number; combo: number;
  flips: number; spins: number; fuel: number; secrets: number; honks: number; escapes: number; strikes: number; coinsPicked: number;
}
export const zeroCounters = (): Counters => ({
  boops: 0, chicken: 0, pig: 0, sheep: 0, cow: 0, golden: 0, air: 0, bigAir: 0, smash: 0, drift: 0, splash: 0, combo: 0,
  flips: 0, spins: 0, fuel: 0, secrets: 0, honks: 0, escapes: 0, strikes: 0, coinsPicked: 0,
});

export interface MissionTemplate {
  key: keyof Counters;
  /** 'sum' counts progress since the mission was dealt; 'max' needs one big moment. */
  mode: 'sum' | 'max';
  icon: string; label: string;
  targets: [number, number, number];
  reward: number;
}

export const MISSIONS: MissionTemplate[] = [
  { key: 'chicken', mode: 'sum', icon: '🐔', label: 'Boop chickens', targets: [3, 6, 10], reward: 15 },
  { key: 'pig', mode: 'sum', icon: '🐷', label: 'Boop pigs', targets: [2, 4, 7], reward: 15 },
  { key: 'sheep', mode: 'sum', icon: '🐑', label: 'Boop sheep', targets: [2, 4, 7], reward: 15 },
  { key: 'cow', mode: 'sum', icon: '🐮', label: 'Boop cows', targets: [2, 4, 6], reward: 20 },
  { key: 'smash', mode: 'sum', icon: '💥', label: 'Smash stuff', targets: [5, 10, 18], reward: 15 },
  { key: 'bigAir', mode: 'max', icon: '🚀', label: 'Big air (seconds)', targets: [1, 1.6, 2.2], reward: 20 },
  { key: 'combo', mode: 'max', icon: '🔥', label: 'Boop chain', targets: [3, 6, 10], reward: 20 },
  { key: 'splash', mode: 'sum', icon: '💦', label: 'Splash in water', targets: [1, 3, 5], reward: 10 },
  { key: 'fuel', mode: 'sum', icon: '⛽', label: 'Grab nitro cans', targets: [2, 4, 6], reward: 10 },
  { key: 'honks', mode: 'sum', icon: '📯', label: 'Honk at animals', targets: [3, 8, 15], reward: 10 },
  { key: 'drift', mode: 'sum', icon: '🌀', label: 'Drift (seconds)', targets: [2, 5, 9], reward: 20 },
  { key: 'spins', mode: 'sum', icon: '🤸', label: 'Air spins', targets: [1, 2, 4], reward: 25 },
  { key: 'flips', mode: 'sum', icon: '🙃', label: 'Flips', targets: [1, 2, 3], reward: 30 },
  { key: 'golden', mode: 'sum', icon: '⭐', label: 'Boop a golden animal', targets: [1, 1, 2], reward: 30 },
  { key: 'secrets', mode: 'sum', icon: '🌽', label: 'Find golden corn', targets: [1, 2, 3], reward: 25 },
  { key: 'coinsPicked', mode: 'sum', icon: '🪙', label: 'Grab floating coins', targets: [5, 10, 15], reward: 15 },
];

/** Missions a mashing 6-year-old will complete by accident; dealt first. */
const EASY = [0, 4, 9, 1];

export interface Mission { tpl: number; target: number; start: number; progress: number; done: boolean; doneTimer: number }

export function dealMission(active: readonly Mission[], completed: number, counters: Counters, rng: Rng): Mission {
  const taken = new Set(active.map((m) => m.tpl));
  let tpl: number;
  if (completed < EASY.length && !taken.has(EASY[completed])) tpl = EASY[completed];
  else do tpl = Math.floor(rng() * MISSIONS.length); while (taken.has(tpl));
  const level = Math.min(2, Math.floor(completed / 4));
  const t = MISSIONS[tpl];
  return { tpl, target: t.targets[level], start: t.mode === 'sum' ? counters[t.key] : 0, progress: 0, done: false, doneTimer: 0 };
}

/** Returns true the moment the mission completes. */
export function updateMission(m: Mission, counters: Counters): boolean {
  if (m.done) return false;
  const t = MISSIONS[m.tpl];
  m.progress = Math.min(m.target, counters[t.key] - m.start);
  if (m.progress < m.target) return false;
  m.done = true;
  m.doneTimer = 2.2;
  return true;
}

export const comboMult = (count: number) => Math.min(8, 1 + Math.floor(Math.max(0, count - 1) / 2));
export const COMBO_WINDOW = 4;

export const MEDALS = [
  { name: 'Bronze', icon: '🥉', score: 2000 },
  { name: 'Silver', icon: '🥈', score: 6000 },
  { name: 'Gold', icon: '🥇', score: 12000 },
  { name: 'Rainbow', icon: '🌈', score: 25000 },
] as const;
export const medalFor = (score: number) => MEDALS.reduce((best, m, i) => (score >= m.score ? i : best), -1);
