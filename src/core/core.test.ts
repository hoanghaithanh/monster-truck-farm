import { describe, expect, it } from 'vitest';
import { SPECIES, launchAnimal, makeAnimal, stepAnimal } from './animals';
import { createFarmer, farmerBumped, farmerHonked, stepFarmer } from './farmer';
import { angleDelta, mulberry32 } from './math';
import { MISSIONS, comboMult, dealMission, medalFor, updateMission, zeroCounters } from './missions';
import { AXES, PARTS, STOCK, statsFor } from './parts';
import { buy, canBuy, defaultSave, farmerEaseFor, loadSave, persist } from './save';
import { DAY_SECONDS, Sim } from './sim';
import { NO_INPUT, createTruck, forwardSpeed, stepTruck, truckSpeed, type DriveInput } from './truck';
import { BRIDGE, RAMPS, SPAWN, WATER_Y, WORLD, WORLD_R, groundHeight, isOpenGround, isWater, riverCenterZ, surfaceHeight } from './world';

const DT = 1 / 60;
const stats = statsFor(STOCK);
const drive = (over: Partial<DriveInput>): DriveInput => ({ ...NO_INPUT, ...over });

describe('world', () => {
  it('has a dry flat spawn, a wet river and a bridge over it', () => {
    expect(Math.abs(groundHeight(SPAWN.x, SPAWN.z))).toBeLessThan(0.3);
    const rz = riverCenterZ(-40);
    expect(groundHeight(-40, rz)).toBeLessThan(WATER_Y);
    expect(isWater(-40, rz)).toBe(true);
    expect(isWater(BRIDGE.x, riverCenterZ(BRIDGE.x))).toBe(false);
    expect(surfaceHeight(BRIDGE.x, riverCenterZ(BRIDGE.x))).toBeGreaterThan(1);
  });
  it('ramps rise along their heading', () => {
    const r = RAMPS[0];
    const at = (d: number) => surfaceHeight(r.x + Math.sin(r.heading) * d, r.z + Math.cos(r.heading) * d);
    expect(at(r.len - 0.1)).toBeGreaterThan(at(1) + 2);
  });
  it('rim hills hide the edge and props sit on open ground', () => {
    expect(groundHeight(WORLD_R + 12, 0)).toBeGreaterThan(8);
    for (const p of WORLD.props) expect(groundHeight(p.x, p.z), `${p.kind} at ${p.x.toFixed(0)},${p.z.toFixed(0)}`).toBeGreaterThan(WATER_Y);
    expect(WORLD.props.length).toBeGreaterThan(100);
    expect(isOpenGround(0, 40)).toBe(true);
  });
});

describe('truck', () => {
  it('accelerates to top speed and no further', () => {
    const t = createTruck(0, -8, 0, stats);
    for (let i = 0; i < 180; i++) stepTruck(t, drive({ throttle: 1 }), stats, DT, []);
    expect(forwardSpeed(t)).toBeGreaterThan(stats.topSpeed * 0.9);
    expect(truckSpeed(t)).toBeLessThan(stats.topSpeed * 1.25); // downhill slack
  });
  it('steering right turns toward screen-right (decreasing heading)', () => {
    const t = createTruck(0, 40, 0, stats);
    for (let i = 0; i < 90; i++) stepTruck(t, drive({ throttle: 1, steer: 1 }), stats, DT, []);
    expect(t.heading).toBeLessThan(-0.3);
    expect(t.vx).toBeLessThan(0); // -X is screen-right when facing +Z
  });
  it('boost is faster and drains nitro', () => {
    const t = createTruck(0, -8, 0, stats);
    for (let i = 0; i < 90; i++) stepTruck(t, drive({ throttle: 1, boost: true }), stats, DT, []);
    expect(truckSpeed(t)).toBeGreaterThan(stats.topSpeed * 1.1);
    expect(t.nitro).toBeLessThan(stats.nitro);
  });
  it('jumps, leaves the ground and lands with an event', () => {
    const t = createTruck(0, 40, 0, stats);
    const first = stepTruck(t, drive({ jump: true }), stats, DT, []);
    expect(first.some((e) => e.type === 'jump')).toBe(true);
    let landed = false, peak = 0;
    for (let i = 0; i < 120 && !landed; i++) {
      landed = stepTruck(t, drive({ jump: true }), stats, DT, []).some((e) => e.type === 'land');
      peak = Math.max(peak, t.y - surfaceHeight(t.x, t.z));
    }
    expect(peak).toBeGreaterThan(1);
    expect(landed).toBe(true);
    expect(t.grounded).toBe(true); // holding jump does not pogo
  });
  it('gets real air off a ramp and counts a spin', () => {
    const r = RAMPS[0];
    const t = createTruck(r.x, r.z - 30, r.heading, stats);
    let air = 0, spins = 0;
    for (let i = 0; i < 600; i++) {
      for (const e of stepTruck(t, drive({ throttle: 1, steer: t.grounded ? 0 : 1 }), stats, DT, [])) {
        if (e.type === 'land') { air = Math.max(air, e.airTime); spins = Math.max(spins, e.spins); }
      }
    }
    expect(air).toBeGreaterThan(0.8);
    expect(spins).toBeGreaterThanOrEqual(1);
  });
  it('ramp sides, ramp backs and bridge flanks are walls, not launchers', () => {
    const r = RAMPS[0];
    const fx = Math.sin(r.heading), fz = Math.cos(r.heading), rx = -fz, rz = fx;
    const run = (x: number, z: number, heading: number, steps = 240) => {
      const t = createTruck(x, z, heading, stats);
      let peak = 0, air = 0;
      for (let i = 0; i < steps; i++) {
        for (const e of stepTruck(t, drive({ throttle: 1 }), stats, DT, [])) if (e.type === 'land') air = Math.max(air, e.airTime);
        peak = Math.max(peak, t.y - r.base);
      }
      return { peak, air, t };
    };
    // Into the tall back wall, head on.
    const back = run(r.x + fx * (r.len + 14), r.z + fz * (r.len + 14), r.heading + Math.PI);
    expect(back.peak).toBeLessThan(1);
    expect(back.air).toBe(0);
    // Into the side, near the tall end.
    const side = run(r.x + fx * r.len * 0.8 + rx * 14, r.z + fz * r.len * 0.8 + rz * 14, Math.atan2(-rx, -rz));
    expect(side.air).toBe(0);
    expect(side.peak).toBeLessThan(2);
    // Into the bridge from the riverbed.
    const bz = riverCenterZ(BRIDGE.x);
    const flank = createTruck(BRIDGE.x - 14, bz, Math.PI / 2, stats);
    let top = -99;
    for (let i = 0; i < 240; i++) { stepTruck(flank, drive({ throttle: 1 }), stats, DT, []); top = Math.max(top, flank.y); }
    expect(top).toBeLessThan(0);
    expect(flank.x).toBeLessThan(BRIDGE.x - BRIDGE.halfW + 0.5);
  });
  it('driving onto the bridge does not launch the truck', () => {
    const bz = riverCenterZ(BRIDGE.x);
    const t = createTruck(BRIDGE.x, bz - BRIDGE.halfL - 12, 0, stats);
    let maxGap = 0;
    for (let i = 0; i < 200; i++) { stepTruck(t, drive({ throttle: 1 }), stats, DT, []); if (Math.abs(t.z - bz) < BRIDGE.halfL * 0.6) maxGap = Math.max(maxGap, t.y - surfaceHeight(t.x, t.z)); }
    expect(t.z).toBeGreaterThan(bz);
    expect(maxGap).toBeLessThan(0.8);
  });
  it('backflips only when braking in the air', () => {
    const fly = (throttle: number) => {
      const t = createTruck(0, -8, 0, stats);
      t.y += 12; t.grounded = false;
      let flips = -1;
      for (let i = 0; i < 240 && flips < 0; i++) for (const e of stepTruck(t, drive({ throttle }), stats, DT, [])) if (e.type === 'land') flips = e.flips;
      return flips;
    };
    expect(fly(1)).toBe(0);
    expect(fly(-1)).toBeGreaterThanOrEqual(1);
  });
  it('cannot drive through a building or out of the world', () => {
    const barn = WORLD.solids[0];
    const t = createTruck(barn.x, barn.z + 20, Math.PI, stats);
    for (let i = 0; i < 300; i++) stepTruck(t, drive({ throttle: 1 }), stats, DT, WORLD.solids);
    expect(Math.hypot(t.x - barn.x, t.z - barn.z)).toBeGreaterThan(4);
    const u = createTruck(0, -90, Math.PI, stats);
    for (let i = 0; i < 900; i++) stepTruck(u, drive({ throttle: 1 }), stats, DT, []);
    expect(Math.hypot(u.x, u.z)).toBeLessThanOrEqual(WORLD_R + 0.5);
  });
});

describe('animals', () => {
  it('flee from a moving truck and never enter water', () => {
    const rng = mulberry32(1);
    const a = makeAnimal(1, 'pig', 0, 30, rng);
    const d0 = Math.hypot(a.x - 0, a.z - 24);
    for (let i = 0; i < 120; i++) stepAnimal(a, DT, 0, 24, 10, rng);
    expect(Math.hypot(a.x, a.z - 24)).toBeGreaterThan(d0 + 3);
    for (let i = 0; i < 2000; i++) { stepAnimal(a, DT, a.x, a.z - 4, 10, rng); expect(isWater(a.x, a.z)).toBe(false); }
  });
  it('a booped animal flies, lands, shakes it off and comes back', () => {
    const rng = mulberry32(2);
    const a = makeAnimal(1, 'cow', 0, 30, rng);
    launchAnimal(a, 0, 1, 15, rng);
    const seen = new Set<string>();
    let peak = 0;
    for (let i = 0; i < 60 * 20; i++) { seen.add(a.mode); stepAnimal(a, DT, 200, 200, 0, rng); peak = Math.max(peak, a.y); }
    expect(peak).toBeGreaterThan(2);
    for (const m of ['fly', 'dizzy', 'gone', 'graze']) expect(seen.has(m)).toBe(true);
  });
  it('pays more for bigger animals', () => {
    expect(SPECIES.cow.coins).toBeGreaterThan(SPECIES.pig.coins);
    expect(SPECIES.pig.coins).toBeGreaterThan(SPECIES.chicken.coins);
  });
});

describe('farmer', () => {
  const target = { x: 0, z: 30, heading: 0, topSpeed: 16 };
  it('warns before chasing, then closes in on a parked truck', () => {
    const rng = mulberry32(3);
    const f = createFarmer(rng);
    const news: string[] = [];
    for (let i = 0; i < 60 * 50; i++) { const n = stepFarmer(f, DT, target, rng); if (n) news.push(n); if (f.mode === 'chase' && Math.hypot(f.x, f.z - 30) < 3) break; }
    expect(news.slice(0, 2)).toEqual(['warn', 'chase']);
    expect(Math.hypot(f.x, f.z - 30)).toBeLessThan(3);
  });
  it('is slower than the truck, eases off after a bump, and can be honk-stunned once per cooldown', () => {
    const rng = mulberry32(4);
    const f = createFarmer(rng);
    f.mode = 'chase'; f.chaseLeft = 20; f.x = 0; f.z = 0;
    for (let i = 0; i < 150; i++) stepFarmer(f, DT, { ...target, z: 60 }, rng);
    expect(f.speed).toBeLessThan(16);
    expect(f.speed).toBeGreaterThan(9);
    farmerBumped(f);
    expect(f.ease).toBeLessThan(1);
    f.mode = 'chase';
    expect(farmerHonked(f, 10)).toBe(true);
    f.mode = 'chase';
    expect(farmerHonked(f, 10)).toBe(false);
  });
  it('gets stuck at the river instead of crossing', () => {
    const rng = mulberry32(5);
    const f = createFarmer(rng);
    const rz = riverCenterZ(-40);
    Object.assign(f, { mode: 'chase', chaseLeft: 30, x: -40, z: rz - 20, heading: 0 });
    let stuck = false;
    for (let i = 0; i < 600 && !stuck; i++) stuck = stepFarmer(f, DT, { x: -40, z: rz + 20, heading: 0, topSpeed: 16 }, rng) === 'stuck';
    expect(stuck).toBe(true);
    expect(f.z).toBeLessThan(rz);
  });
});

describe('missions and scoring', () => {
  it('combo multiplier ramps and caps', () => {
    expect([1, 2, 3, 5, 9, 30].map(comboMult)).toEqual([1, 1, 2, 3, 5, 8]);
  });
  it('deals three distinct missions and completes on progress', () => {
    const rng = mulberry32(6);
    const c = zeroCounters();
    const active = [] as ReturnType<typeof dealMission>[];
    for (let i = 0; i < 3; i++) active.push(dealMission(active, i, c, rng));
    expect(new Set(active.map((m) => m.tpl)).size).toBe(3);
    const m = active[0];
    c[MISSIONS[m.tpl].key] += m.target;
    expect(updateMission(m, c)).toBe(true);
    expect(updateMission(m, c)).toBe(false);
  });
  it('sum missions only count progress made after being dealt', () => {
    const c = zeroCounters();
    c.chicken = 50;
    const m = dealMission([], 0, c, mulberry32(1));
    expect(MISSIONS[m.tpl].key).toBe('chicken');
    expect(updateMission(m, c)).toBe(false);
  });
  it('medals', () => {
    expect(medalFor(0)).toBe(-1);
    expect(medalFor(8000)).toBe(1);
    expect(medalFor(1e6)).toBe(3);
  });
});

describe('save', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  it('buys tiers in order, charges coins and round-trips', () => {
    const store = mem();
    const s = defaultSave();
    expect(canBuy(s, 'wheels')).toBe(false);
    s.coins = PARTS.wheels[1].cost + 5;
    expect(buy(s, 'wheels')).toBe(1);
    expect(s.coins).toBe(5);
    expect(buy(s, 'wheels')).toBe(null);
    persist(store, s);
    const loaded = loadSave(store);
    expect(loaded.owned.wheels).toBe(1);
    expect(loaded.equipped.wheels).toBe(1);
  });
  it('survives garbage and clamps tampered values', () => {
    const store = mem();
    store.setItem('monster-truck-farm-v2', '{not json');
    expect(loadSave(store).coins).toBe(0);
    store.setItem('monster-truck-farm-v2', JSON.stringify({ coins: -5, owned: { body: 99 }, equipped: { body: 99, wheels: 3 } }));
    const s = loadSave(store);
    expect(s.coins).toBe(0);
    expect(s.owned.body).toBe(3);
    expect(s.equipped.wheels).toBe(0);
    expect(loadSave(undefined).coins).toBe(0);
  });
  it('first upgrade is cheap and the farmer eases after a bust', () => {
    expect(Math.min(...AXES.map((a) => PARTS[a][1].cost))).toBeLessThanOrEqual(30);
    const s = defaultSave(); s.runs = 5;
    expect(farmerEaseFor(s)).toBe(1);
    s.lastBusted = true;
    expect(farmerEaseFor(s)).toBeLessThan(1);
  });
});

// A simple bot plays whole runs: chase the nearest animal, honk sometimes.
function botRun(seed: number, loadout = STOCK, mash = false) {
  const sim = new Sim(loadout, { seed });
  const rng = mulberry32(seed + 99);
  const log: Record<string, number> = {};
  let steps = 0;
  while (!sim.over && steps++ < 60 * 400) {
    const t = sim.truck;
    let input: DriveInput;
    if (mash) {
      const phase = Math.floor(sim.time / 1.5);
      const r = mulberry32(seed * 1000 + phase);
      input = { throttle: r() < 0.85 ? 1 : -1, steer: Math.round(r() * 2 - 1), boost: r() < 0.3, jump: r() < 0.3, horn: r() < 0.3 && steps % 20 < 10 };
    } else {
      let best = Infinity, off = 0;
      for (const a of sim.animals) {
        if (a.mode === 'fly' || a.mode === 'dizzy' || a.mode === 'gone') continue;
        const d = Math.hypot(a.x - t.x, a.z - t.z);
        if (d < best) { best = d; off = angleDelta(t.heading, Math.atan2(a.x - t.x, a.z - t.z)); }
      }
      input = { throttle: 1, steer: Math.max(-1, Math.min(1, -off * 2)), boost: false, jump: false, horn: rng() < 0.002 };
    }
    sim.step(input, DT);
    for (const e of sim.drainEvents()) log[e.type] = (log[e.type] ?? 0) + 1;
    expect(Number.isFinite(t.x + t.y + t.z + sim.coins + sim.style)).toBe(true);
  }
  if (process.env.BOT) console.log(seed, mash, JSON.stringify({coins:sim.coins,style:sim.style,score:sim.score,time:Math.round(sim.time),over:sim.over,hearts:sim.hearts,md:sim.missionsDone}), JSON.stringify(log));
  return { sim, log };
}

describe('full runs', () => {
  it('a competent stock run ends at sunset and affords the first upgrade', () => {
    const { sim, log } = botRun(7);
    expect(sim.over).not.toBe(null);
    expect(sim.time).toBeGreaterThan(DAY_SECONDS * 0.5);
    expect(log.boop).toBeGreaterThan(15);
    expect(sim.coins + sim.styleCoins).toBeGreaterThanOrEqual(30);
    expect(log.mission).toBeGreaterThanOrEqual(1);
  });
  it('a key-mashing run never breaks and still earns something', () => {
    for (const seed of [11, 12, 13]) {
      const { sim } = botRun(seed, STOCK, true);
      expect(sim.over).not.toBe(null);
      expect(sim.coins + sim.styleCoins).toBeGreaterThan(5);
    }
  });
  it('is deterministic for a given seed', () => {
    const a = botRun(21).sim, b = botRun(21).sim;
    expect([a.coins, a.style, a.time, a.hearts]).toEqual([b.coins, b.style, b.time, b.hearts]);
  });
  it('a maxed truck out-earns a stock one', () => {
    const maxed = { body: 3, wheels: 3, engine: 3, tank: 3 };
    expect(botRun(31, maxed).sim.score).toBeGreaterThan(botRun(31).sim.score);
  });
});
