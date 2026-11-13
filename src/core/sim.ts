// The whole game simulation for one run ("one farm day"), headless and
// deterministic given a seed. The render/audio/UI layers only read state and
// consume `drainEvents()`.
import { GOLDEN_COIN_MULT, isBoopable, launchAnimal, makeAnimal, SPECIES, stepAnimal, type Animal, type Species } from './animals';
import { createFarmer, farmerBumped, farmerDangerous, farmerHonked, FARMER_RADIUS, stepFarmer, type Farmer } from './farmer';
import { angleDelta, clamp, mulberry32, pick, range, TAU, type Rng } from './math';
import { COMBO_WINDOW, comboMult, dealMission, MISSIONS, updateMission, zeroCounters, type Counters, type Mission } from './missions';
import { statsFor, type Loadout, type TruckId, type TruckStats } from './parts';
import { createTruck, stepTruck, truckSpeed, TRUCK_RADIUS, type Circle, type DriveInput, type Truck } from './truck';
import { BIG_HILL, LAKE, NORTH_HILL, groundHeight, isOpenGround, MUD, PROP_DEFS, RAMPS, SPAWN, STUNT_PARK, surfaceHeight, WATER_Y, WORLD, type PropKind } from './world';

export const DAY_SECONDS = 180;
export const MISSION_BONUS_SECONDS = 10;
const INVULN_SECONDS = 2.5;
const STYLE_PER_COIN = 25;

export type PickupKind = 'fuel' | 'coin' | 'corn';
export interface Pickup { id: number; kind: PickupKind; x: number; y: number; z: number; value: number; life: number; cool: number; respawn: number }

export type HappeningKind = 'golden' | 'stampede' | 'fuelRain' | 'chickenParty';
export type FarmerNews = 'warn' | 'chase' | 'stuck' | 'gaveUp' | 'gone' | 'stun' | 'bump';

export type GameEvent =
  | { type: 'boop'; id: number; species: Species; golden: boolean; x: number; y: number; z: number; coins: number; mult: number; count: number; strike: boolean }
  | { type: 'comboEnd'; count: number; bonus: number }
  | { type: 'style'; label: string; points: number }
  | { type: 'jump' } | { type: 'land'; impact: number; airTime: number } | { type: 'bonk'; speed: number } | { type: 'splash' }
  | { type: 'smash'; id: number; kind: PropKind; x: number; z: number; coins: number }
  | { type: 'blocked'; kind: PropKind }
  | { type: 'pickup'; kind: PickupKind; x: number; y: number; z: number; value: number }
  | { type: 'animalLand'; x: number; y: number; z: number } | { type: 'poof'; x: number; y: number; z: number }
  | { type: 'horn'; scared: number }
  | { type: 'farmer'; what: FarmerNews; coinsLost: number }
  | { type: 'mission'; index: number; reward: number }
  | { type: 'happening'; kind: HappeningKind }
  | { type: 'end'; reason: 'sunset' | 'busted' };

export interface SimOptions { seed?: number; assists?: boolean; farmerEase?: number; firstRun?: boolean; truck?: TruckId }

export class Sim {
  readonly stats: TruckStats;
  readonly truck: Truck;
  readonly animals: Animal[] = [];
  readonly smashed = new Set<number>();
  readonly pickups: Pickup[] = [];
  readonly farmer: Farmer;
  readonly counters: Counters = zeroCounters();
  readonly missions: Mission[] = [];
  missionsDone = 0;
  coins = 0;
  style = 0;
  combo = { count: 0, timer: 0 };
  time = 0;
  timeLeft = DAY_SECONDS;
  hearts: number;
  invuln = 0;
  over: 'sunset' | 'busted' | null = null;
  /** Where the current golden animal is, for the HUD compass. */
  goldenId = -1;

  private events: GameEvent[] = [];
  private rng: Rng;
  private nextId = 1;
  private hornCooldown = 0;
  private hornHeld = false;
  private happeningTimer = 22;
  private happeningCount = 0;
  private blockedCooldown = 0;
  private prevDrift = 0;
  /** Aim-assist + generous boop radius; can be toggled mid-run. */
  assists: boolean;

  constructor(loadout: Loadout, opts: SimOptions = {}) {
    this.rng = mulberry32(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.assists = opts.assists ?? true;
    this.stats = statsFor(loadout, opts.truck);
    this.hearts = this.stats.hearts;
    this.truck = createTruck(SPAWN.x, SPAWN.z, SPAWN.heading, this.stats);
    this.farmer = createFarmer(this.rng, opts.farmerEase ?? 1);
    if (opts.firstRun) this.farmer.timer += 15; // calmer first minute
    this.populate();
    for (let i = 0; i < 3; i++) this.missions.push(dealMission(this.missions, i, this.counters, this.rng));
  }

  get score(): number { return this.coins * 10 + this.style; }
  get styleCoins(): number { return Math.floor(this.style / STYLE_PER_COIN); }
  get chased(): boolean { return farmerDangerous(this.farmer); }
  get coinMult(): number { return comboMult(this.combo.count + 1) * (this.chased ? 2 : 1); }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ------------------------------------------------------------ set-up

  private populate(): void {
    const herd = (species: Species, n: number, cx: number, cz: number, r: number) => {
      for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
        const a = this.rng() * TAU, d = Math.sqrt(this.rng()) * r;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (!isOpenGround(x, z, -3) || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 8) continue;
        this.animals.push(makeAnimal(this.nextId++, species, x, z, this.rng));
        i++;
      }
    };
    herd('chicken', 5, 0, 26, 7); // right in front of the spawn: instant first boops
    herd('chicken', 9, -6, -38, 14);
    herd('chicken', 10, 50, 60, 70);
    herd('chicken', 7, -40, -140, 22);
    herd('chicken', 6, 110, 110, 24);
    herd('pig', 8, MUD.x, MUD.z, 15);
    herd('pig', 5, -48, 10, 12);
    herd('pig', 5, LAKE.x - LAKE.r - 14, LAKE.z + 26, 14);
    herd('sheep', 9, -140, -14, 20);
    herd('sheep', 7, NORTH_HILL.x, NORTH_HILL.z, 26);
    herd('sheep', 5, BIG_HILL.x - 30, BIG_HILL.z + 34, 14);
    herd('sheep', 4, 30, -128, 16);
    herd('cow', 9, 60, 140, 26);
    herd('cow', 6, 96, -52, 16);
    herd('cow', 4, -24, 44, 12);
    herd('cow', 5, -150, 96, 18);
    herd('cow', 4, 150, -30, 16);

    for (let i = 0; i < 12; i++) this.spawnFuel();
    // Coin arcs teach the ramps.
    for (const r of RAMPS) {
      for (let i = 0; i < 5; i++) {
        const d = r.len + 2 + i * 3.2;
        const x = r.x + Math.sin(r.heading) * d, z = r.z + Math.cos(r.heading) * d;
        const y = r.base + r.height + 1.6 + Math.sin(((i + 0.5) / 5) * Math.PI) * 2.2;
        this.pickups.push({ id: this.nextId++, kind: 'coin', x, y: Math.max(y, surfaceHeight(x, z) + 1.5), z, value: 2, life: Infinity, cool: 0, respawn: 25 });
      }
    }
    // Coin trail leading out of the yard, and a ring in the stunt park.
    for (let i = 0; i < 6; i++) this.addCoin(0, 12 + i * 3.5, 1);
    for (let i = 0; i < 10; i++) this.addCoin(STUNT_PARK.x + Math.cos(i * 0.628) * 22, STUNT_PARK.z + Math.sin(i * 0.628) * 22, 1);
    for (let i = 0; i < 8; i++) this.addCoin(BIG_HILL.x + Math.cos(i * 0.785) * 12, BIG_HILL.z + Math.sin(i * 0.785) * 12, 2);
    for (let i = 0; i < 8; i++) this.addCoin(NORTH_HILL.x + Math.cos(i * 0.785) * 10, NORTH_HILL.z + Math.sin(i * 0.785) * 10, 2);
    for (let i = 0; i < 12; i++) this.addCoin(LAKE.x + Math.cos(i * 0.524) * (LAKE.r - 6), LAKE.z + Math.sin(i * 0.524) * (LAKE.r - 6), 1);
    // Five hidden golden corn out of ten possible spots.
    const spots = [...WORLD.secrets];
    for (let i = 0; i < 5; i++) {
      const [x, z, up] = spots.splice(Math.floor(this.rng() * spots.length), 1)[0];
      this.pickups.push({ id: this.nextId++, kind: 'corn', x, y: Math.max(surfaceHeight(x, z), WATER_Y) + up, z, value: 20, life: Infinity, cool: 0, respawn: 0 });
    }
  }

  private addCoin(x: number, z: number, value: number, life = Infinity, respawn = 30): void {
    this.pickups.push({ id: this.nextId++, kind: 'coin', x, y: surfaceHeight(x, z) + 1.2, z, value, life, cool: 0, respawn });
  }

  private randomOpenSpot(minDist: number, maxDist: number, cx = this.truck.x, cz = this.truck.z): [number, number] | null {
    for (let i = 0; i < 40; i++) {
      const a = this.rng() * TAU, d = range(this.rng, minDist, maxDist);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (isOpenGround(x, z, 1)) return [x, z];
    }
    return null;
  }

  private spawnFuel(life = Infinity, near?: [number, number]): void {
    const spot = near ? this.randomOpenSpot(10, 26) : this.randomOpenSpot(0, 165, 0, 10);
    if (!spot) return;
    this.pickups.push({ id: this.nextId++, kind: 'fuel', x: spot[0], y: surfaceHeight(spot[0], spot[1]) + 1.1, z: spot[1], value: 0, life, cool: 0, respawn: life === Infinity ? 12 : 0 });
  }

  // ------------------------------------------------------------ step

  /** Garage ambience: animals mill about, nothing else happens. */
  idle(dt: number): void {
    for (const a of this.animals) stepAnimal(a, dt, 1e4, 1e4, 0, this.rng);
  }

  step(rawInput: DriveInput, dt: number): void {
    if (this.over) return;
    const t = this.truck;
    this.time += dt;
    this.timeLeft -= dt;
    this.invuln -= dt;
    this.hornCooldown -= dt;
    this.blockedCooldown -= dt;
    if (this.timeLeft <= 0) return this.end('sunset');

    const input = this.assists ? this.assistSteer(rawInput) : rawInput;

    if (input.horn && !this.hornHeld && this.hornCooldown <= 0) this.honk();
    this.hornHeld = input.horn;

    // Props the wheels can't smash yet act as solid.
    const blockers: (Circle & { kind: PropKind })[] = [];
    for (const p of WORLD.props) {
      if (this.smashed.has(p.id) || PROP_DEFS[p.kind].wheelTier <= this.stats.wheelTier) continue;
      if (Math.abs(p.x - t.x) < 8 && Math.abs(p.z - t.z) < 8) blockers.push({ x: p.x, z: p.z, r: PROP_DEFS[p.kind].r * 0.85, kind: p.kind });
    }
    for (const e of stepTruck(t, input, this.stats, dt, WORLD.solids, blockers)) {
      if (e.type === 'land') this.landed(e.airTime, e.spins, e.flips, e.impact);
      else if (e.type === 'splash') { this.counters.splash++; this.events.push(e); } else if (e.type === 'bonk') {
        this.events.push(e);
        if (this.blockedCooldown <= 0) {
          const b = blockers.find((c) => Math.hypot(c.x - t.x, c.z - t.z) < c.r + TRUCK_RADIUS + 0.4);
          if (b) { this.events.push({ type: 'blocked', kind: b.kind }); this.blockedCooldown = 2; }
        }
      } else this.events.push(e);
    }
    if (!t.grounded) this.counters.air += dt;
    // Drift pays out when it ends.
    if (t.driftTime === 0 && this.prevDrift > 0.9) {
      this.counters.drift += this.prevDrift;
      this.addStyle(this.prevDrift > 2.5 ? 'Mega Drift!' : 'Drift!', Math.round(this.prevDrift * 40));
    }
    this.prevDrift = t.driftTime;

    this.stepProps();
    this.stepAnimals(dt);
    this.stepPickups(dt);
    this.stepFarmer(dt);

    if (this.combo.count > 0 && (this.combo.timer -= dt) <= 0) {
      if (this.combo.count >= 3) {
        const bonus = this.combo.count * 20;
        this.style += bonus;
        this.events.push({ type: 'comboEnd', count: this.combo.count, bonus });
      }
      this.combo.count = 0;
    }

    for (let i = 0; i < this.missions.length; i++) {
      const m = this.missions[i];
      if (updateMission(m, this.counters)) {
        const reward = MISSIONS[m.tpl].reward;
        this.coins += reward;
        this.timeLeft += MISSION_BONUS_SECONDS;
        this.missionsDone++;
        this.events.push({ type: 'mission', index: i, reward });
      } else if (m.done && (m.doneTimer -= dt) <= 0) {
        this.missions[i] = dealMission(this.missions, this.missionsDone + 2, this.counters, this.rng);
      }
    }

    if ((this.happeningTimer -= dt) <= 0) this.happening();
  }

  private end(reason: 'sunset' | 'busted'): void {
    this.over = reason;
    this.events.push({ type: 'end', reason });
  }

  private addStyle(label: string, points: number): void {
    this.style += points;
    this.events.push({ type: 'style', label, points });
  }

  /** Gentle aim-assist: nudge the wheel toward an animal that's nearly lined up. */
  private assistSteer(input: DriveInput): DriveInput {
    const t = this.truck;
    if (!t.grounded || truckSpeed(t) < 4 || Math.abs(input.steer) > 0.5) return input;
    let best = 0, bestScore = Infinity;
    for (const a of this.animals) {
      if (!isBoopable(a)) continue;
      const dx = a.x - t.x, dz = a.z - t.z, d = Math.hypot(dx, dz);
      if (d > 16 || d < 1) continue;
      const off = angleDelta(t.heading, Math.atan2(dx, dz));
      if (Math.abs(off) > 0.6) continue;
      const score = d + Math.abs(off) * 20;
      if (score < bestScore) { bestScore = score; best = off; }
    }
    if (bestScore === Infinity) return input;
    // Positive `off` = target is toward +heading = steer left (negative steer).
    return { ...input, steer: clamp(input.steer - best * 2.2, -1, 1) };
  }

  private honk(): void {
    const t = this.truck;
    this.hornCooldown = 0.35;
    let scared = 0;
    for (const a of this.animals) {
      if (!isBoopable(a) || a.mode === 'stampede') continue;
      if (Math.hypot(a.x - t.x, a.z - t.z) < 17) { a.mode = 'flee'; a.timer = 2; scared++; }
    }
    this.counters.honks += scared;
    this.events.push({ type: 'horn', scared });
    if (farmerHonked(this.farmer, Math.hypot(this.farmer.x - t.x, this.farmer.z - t.z))) {
      this.events.push({ type: 'farmer', what: 'stun', coinsLost: 0 });
      this.addStyle('Honk Stun!', 60);
    }
  }

  private landed(airTime: number, spins: number, flips: number, impact: number): void {
    this.events.push({ type: 'land', impact, airTime });
    this.counters.bigAir = Math.max(this.counters.bigAir, airTime);
    this.counters.spins += spins;
    this.counters.flips += flips;
    if (airTime < 0.95 && !spins && !flips) return; // a plain hop is not a stunt
    const parts: string[] = [];
    if (flips) parts.push(flips > 1 ? `${flips}x Flip` : 'Flip');
    if (spins) parts.push(spins > 1 ? `${spins * 360} Spin` : '360 Spin');
    const label = parts.length ? parts.join(' + ') + '!' : airTime > 2 ? 'MEGA AIR!' : airTime > 1.3 ? 'Big Air!' : 'Air!';
    this.addStyle(label, Math.round(airTime * 60) + spins * 150 + flips * 250);
    // Stunts top up the nitro: tricks feed speed, speed feeds tricks.
    this.truck.nitro = Math.min(this.stats.nitro, this.truck.nitro + airTime * 0.5 + (spins + flips) * 0.5);
  }

  private stepProps(): void {
    const t = this.truck;
    const speed = truckSpeed(t);
    if (speed < 2.5 || t.y - surfaceHeight(t.x, t.z) > 1.8) return;
    for (const p of WORLD.props) {
      if (Math.abs(p.x - t.x) > 5 || Math.abs(p.z - t.z) > 5 || this.smashed.has(p.id)) continue;
      const def = PROP_DEFS[p.kind];
      if (def.wheelTier > this.stats.wheelTier || Math.hypot(p.x - t.x, p.z - t.z) > TRUCK_RADIUS + def.r * 0.8) continue;
      this.smashed.add(p.id);
      this.counters.smash++;
      this.coins += def.coins;
      this.style += def.style;
      const drag = p.kind === 'car' ? 0.75 : p.kind === 'boulder' ? 0.85 : p.kind === 'rock' ? 0.92 : 1;
      t.vx *= drag; t.vz *= drag;
      this.events.push({ type: 'smash', id: p.id, kind: p.kind, x: p.x, z: p.z, coins: def.coins });
    }
  }

  private boop(a: Animal, dirX: number, dirZ: number, speed: number, strike: boolean): void {
    launchAnimal(a, dirX, dirZ, speed, this.rng);
    this.combo.count++;
    this.combo.timer = COMBO_WINDOW;
    const mult = comboMult(this.combo.count) * (this.chased ? 2 : 1);
    const coins = Math.round(SPECIES[a.species].coins * (a.golden ? GOLDEN_COIN_MULT : 1) * mult * this.stats.coinMult);
    this.coins += coins;
    const c = this.counters;
    c.boops++; c[a.species]++;
    c.combo = Math.max(c.combo, this.combo.count);
    if (a.golden) { c.golden++; this.addStyle('GOLDEN!', 300); if (a.id === this.goldenId) this.goldenId = -1; }
    if (strike) { c.strikes++; this.addStyle('Strike!', 80); }
    this.events.push({ type: 'boop', id: a.id, species: a.species, golden: a.golden, x: a.x, y: a.y, z: a.z, coins, mult, count: this.combo.count, strike });
  }

  private stepAnimals(dt: number): void {
    const t = this.truck;
    const speed = truckSpeed(t);
    const reach = TRUCK_RADIUS + (this.assists ? 0.7 : 0.2);
    const low = t.y - surfaceHeight(t.x, t.z) < 2.2;
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      const ev = stepAnimal(a, dt, t.x, t.z, speed, this.rng);
      if (ev === 'landed') this.events.push({ type: 'animalLand', x: a.x, y: a.y, z: a.z });
      else if (ev === 'poof') {
        this.events.push({ type: 'poof', x: a.x, y: a.y, z: a.z });
        if (a.temp) { if (a.id === this.goldenId) this.goldenId = -1; this.animals.splice(i, 1); continue; }
      }
      if (!isBoopable(a)) {
        // A flying animal bowls over anyone it lands on.
        if (a.mode === 'fly' && a.y - groundHeight(a.x, a.z) < 2) {
          for (const b of this.animals) {
            if (b === a || !isBoopable(b)) continue;
            if (Math.hypot(a.x - b.x, a.z - b.z) < SPECIES[a.species].r + SPECIES[b.species].r + 0.3) {
              const v = Math.hypot(a.vx, a.vz) || 1;
              this.boop(b, a.vx / v, a.vz / v, v * 0.6, true);
            }
          }
        }
        continue;
      }
      if (!low || speed < 3) continue;
      const dx = a.x - t.x, dz = a.z - t.z, d = Math.hypot(dx, dz);
      if (d < reach + SPECIES[a.species].r) {
        // Launch mostly along the truck's travel, a bit outward.
        const vx = t.vx / speed + (dx / (d || 1)) * 0.4, vz = t.vz / speed + (dz / (d || 1)) * 0.4, n = Math.hypot(vx, vz) || 1;
        this.boop(a, vx / n, vz / n, speed, false);
      }
    }
  }

  private stepPickups(dt: number): void {
    const t = this.truck;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (p.cool > 0) { p.cool -= dt; continue; }
      if ((p.life -= dt) <= 0) { this.pickups.splice(i, 1); continue; }
      if (Math.hypot(p.x - t.x, p.z - t.z) > 3.2 || Math.abs(p.y - (t.y + 1.2)) > 3.2) continue;
      if (p.kind === 'fuel') { t.nitro = this.stats.nitro; this.counters.fuel++; } else if (p.kind === 'coin') { this.coins += p.value; this.counters.coinsPicked++; } else {
        this.coins += p.value; this.counters.secrets++;
        this.addStyle(this.counters.secrets === 5 ? 'ALL GOLDEN CORN!' : 'Golden Corn!', this.counters.secrets === 5 ? 1500 : 300);
      }
      this.events.push({ type: 'pickup', kind: p.kind, x: p.x, y: p.y, z: p.z, value: p.value });
      if (p.respawn > 0 && p.kind === 'fuel') { this.pickups.splice(i, 1); this.spawnFuel(); } else if (p.respawn > 0) p.cool = p.respawn; else this.pickups.splice(i, 1);
    }
  }

  private stepFarmer(dt: number): void {
    const t = this.truck, f = this.farmer;
    const news = stepFarmer(f, dt, { x: t.x, z: t.z, heading: t.heading, topSpeed: this.stats.topSpeed }, this.rng);
    if (news) {
      this.events.push({ type: 'farmer', what: news, coinsLost: 0 });
      if (news === 'gaveUp' || news === 'stuck') { this.counters.escapes++; this.addStyle(news === 'stuck' ? 'River Escape!' : 'Escaped!', 200); }
    }
    if (f.mode !== 'chase' || this.invuln > 0) return;
    if (Math.hypot(f.x - t.x, f.z - t.z) > TRUCK_RADIUS + FARMER_RADIUS || t.y - surfaceHeight(t.x, t.z) > 2) return;
    farmerBumped(f);
    this.hearts--;
    this.invuln = INVULN_SECONDS;
    const lost = Math.min(this.coins, Math.max(5, Math.round(this.coins * 0.15)));
    this.coins -= lost;
    for (let i = 0; i < 5 && lost > 0; i++) { // dropped coins can be scooped back up
      const a = (i / 5) * TAU + this.rng();
      const x = t.x + Math.cos(a) * 6, z = t.z + Math.sin(a) * 6;
      this.addCoin(x, z, Math.ceil(lost / 5), 9, 0);
    }
    // Comedy shove.
    const dx = t.x - f.x, dz = t.z - f.z, d = Math.hypot(dx, dz) || 1;
    t.vx = (dx / d) * 14; t.vz = (dz / d) * 14; t.vy = 7; t.grounded = false; t.y += 0.1;
    this.combo.count = 0;
    this.events.push({ type: 'farmer', what: 'bump', coinsLost: lost });
    if (this.hearts <= 0) this.end('busted');
  }

  private happening(): void {
    this.happeningTimer = range(this.rng, 26, 38);
    const kinds: HappeningKind[] = ['golden', 'stampede', 'fuelRain', 'chickenParty'];
    let kind = this.happeningCount === 0 ? 'golden' : pick(this.rng, kinds);
    if (kind === 'golden' && this.goldenId !== -1) kind = 'chickenParty';
    this.happeningCount++;
    const t = this.truck;
    const temp = (species: Species, x: number, z: number, life: number, golden = false) => {
      const a = makeAnimal(this.nextId++, species, x, z, this.rng, golden);
      a.temp = true; a.life = life;
      this.animals.push(a);
      return a;
    };
    if (kind === 'golden') {
      const spot = this.randomOpenSpot(40, 65);
      if (!spot) return;
      this.goldenId = temp(pick(this.rng, ['chicken', 'pig', 'sheep', 'cow'] as const), spot[0], spot[1], 50, true).id;
    } else if (kind === 'stampede') {
      // A line of cows thunders across just ahead of the truck.
      const side = this.rng() < 0.5 ? 1 : -1;
      const fx = Math.sin(t.heading), fz = Math.cos(t.heading);
      const cx = t.x + fx * 26 + fz * side * 34, cz = t.z + fz * 26 - fx * side * 34;
      const heading = Math.atan2(-fz * side, fx * side);
      for (let i = 0; i < 9; i++) {
        const x = cx + fx * (i - 4) * 3.4 + range(this.rng, -1, 1), z = cz + fz * (i - 4) * 3.4 + range(this.rng, -1, 1);
        if (!isOpenGround(x, z, -3)) continue;
        const a = temp('cow', x, z, 9);
        a.mode = 'stampede'; a.heading = heading;
      }
    } else if (kind === 'fuelRain') {
      for (let i = 0; i < 6; i++) this.spawnFuel(22, [t.x, t.z]);
    } else {
      for (let i = 0; i < 14; i++) {
        const spot = this.randomOpenSpot(12, 26);
        if (spot) temp('chicken', spot[0], spot[1], 30);
      }
    }
    this.events.push({ type: 'happening', kind });
  }
}
