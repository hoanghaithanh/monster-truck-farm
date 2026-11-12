// Orchestrates everything: garage <-> run <-> summary, and turns simulation
// events into juice (particles, shake, hit-stop, sound, popups).
import * as THREE from 'three';
import { GameAudio } from './audio/audio';
import { SPECIES } from './core/animals';
import { clamp, damp } from './core/math';
import { medalFor } from './core/missions';
import { STOCK, type Axis } from './core/parts';
import { buy, farmerEaseFor, loadSave, persist, type Save } from './core/save';
import { Sim, type GameEvent } from './core/sim';
import { forwardSpeed, truckSpeed, type DriveInput } from './core/truck';
import { groundHeight, inMud, isWater, distToPath, SPAWN, surfaceHeight, WATER_Y } from './core/world';
import { Input } from './input/input';
import { ChaseCam } from './render/chase-cam';
import { Critters } from './render/critters';
import { Engine, SHARED, type QualityLevel } from './render/engine';
import { Farm, propColor } from './render/farm';
import { C, MAT, cyl, merged, mesh, torus } from './render/kit';
import { Particles } from './render/particles';
import { TruckModel } from './render/truck-model';
import { Garage } from './ui/garage';
import { Hud, type MapDot } from './ui/hud';
import { Loading, PauseMenu, Summary } from './ui/overlays';

type State = 'garage' | 'run' | 'ending' | 'summary';
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const CONFETTI = [C.red, C.sun, C.blue, C.purple, C.orange, C.blossom, 0x7dff9a];
const _v = new THREE.Vector3();

export class Game {
  private engine!: Engine;
  private farm!: Farm;
  private critters!: Critters;
  private particles!: Particles;
  private cam!: ChaseCam;
  private hud!: Hud;
  private garage!: Garage;
  private summary!: Summary;
  private pause!: PauseMenu;
  private audio = new GameAudio();
  private input: Input;
  private save: Save;
  private sim!: Sim;
  private truck!: TruckModel;
  private podium!: THREE.Object3D;
  private state: State = 'garage';
  private paused = false;
  private last = 0;
  private freeze = 0;
  private timeScale = 1;
  private endTimer = 0;
  private hintTimer = 0;
  private dustAcc = 0; private markAcc = 0; private ambientAcc = 0; private smokeAcc = 0;
  private orbit = 0.7; private orbitR = 9.5; private orbitH = 3.2; private hover: Axis | null = null;
  private focus = new THREE.Vector3();
  private probe: number[] | null = [];
  private autoLevel: QualityLevel = 'high';
  private lost = false;
  private flipVis = 0;
  private squeakCooldown = 0;

  constructor(private root: HTMLElement) {
    this.save = loadSave(window.localStorage);
    if (this.save.runs === 0 && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) this.save.settings.shake = false;
    this.input = new Input(root);
  }

  async start(): Promise<void> {
    const loading = new Loading(this.root);
    await nextFrame();
    this.engine = new Engine(this.root);
    loading.progress(0.2, 'Planting grass…');
    await nextFrame();
    this.farm = new Farm();
    this.engine.scene.add(this.farm.group);
    loading.progress(0.7, 'Waking the chickens…');
    await nextFrame();
    this.critters = new Critters();
    this.critters.onStartle = (species, x, z) => {
      if (this.state !== 'run' || this.squeakCooldown > 0 || Math.hypot(x - this.sim.truck.x, z - this.sim.truck.z) > 30) return;
      this.squeakCooldown = 0.18;
      this.audio.squeak(species);
    };
    this.particles = new Particles();
    this.engine.scene.add(this.critters.group, this.particles.group);
    this.cam = new ChaseCam(this.engine.camera);
    this.podium = this.buildPodium();
    this.engine.scene.add(this.podium);
    loading.progress(0.9, 'Polishing the truck…');
    await nextFrame();

    this.hud = new Hud(this.root);
    this.garage = new Garage(this.root, {
      onBuy: (axis) => this.buyPart(axis),
      onPaint: (i) => { this.save.paint = i; this.audio.click(); this.refreshTruck(false); },
      onDecal: (d) => { this.save.decal = d; this.audio.click(); this.refreshTruck(false); },
      onGo: () => this.startRun(),
      onSettings: () => { this.audio.click(); this.pause.show(true, false); },
      onHover: (axis) => (this.hover = axis),
    });
    this.summary = new Summary(this.root, () => this.enterGarage(), () => this.startRun(), () => this.audio.tick(), (m) => (m >= 0 ? this.audio.fanfare() : this.audio.mission()));
    this.pause = new PauseMenu(this.root, this.save.settings, {
      onResume: () => this.setPaused(false),
      onQuit: () => { this.setPaused(false); this.enterGarage(); },
      onChange: () => this.applySettings(),
    });
    this.hud.pauseBtn.addEventListener('click', () => this.setPaused(true));
    this.input.onPause = () => { if (this.state === 'run') this.setPaused(!this.paused); else if (this.pause.visible) this.setPaused(false); };
    this.input.onAny = () => this.audio.unlock();
    window.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'run') this.setPaused(true); });
    const canvas = this.engine.renderer.domElement;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => window.location.reload());

    this.applySettings();
    this.enterGarage();
    loading.progress(1);
    await nextFrame();
    loading.done();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.repeat || this.pause.visible) return;
    const go = e.code === 'Enter' || e.code === 'Space';
    if (this.state === 'garage' && go) { e.preventDefault(); this.startRun(); } else if (this.state === 'summary' && e.code === 'Enter') { e.preventDefault(); this.startRun(); }
  };

  private buildPodium(): THREE.Object3D {
    const g = new THREE.Group();
    const y = groundHeight(SPAWN.x, SPAWN.z);
    g.add(mesh(merged([
      { geo: cyl(5.2, 5.6, 0.5, 40), color: C.cream, pos: [0, 0.2, 0] },
      { geo: cyl(4.6, 4.6, 0.52, 40), color: C.barn, pos: [0, 0.22, 0] },
      { geo: cyl(3.9, 3.9, 0.54, 40), color: C.cream, pos: [0, 0.24, 0] },
    ]), MAT.clay));
    const ring = new THREE.Mesh(torus(5.4, 0.12, 48), new THREE.MeshBasicMaterial({ color: 0xfff36a, toneMapped: false }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.5;
    g.add(ring);
    g.position.set(SPAWN.x, y - 0.05, SPAWN.z);
    return g;
  }

  // ------------------------------------------------------------ settings

  private applySettings(): void {
    const s = this.save.settings;
    this.audio.setVolume(s.volume);
    this.audio.setMusic(s.music);
    this.cam.shakeEnabled = s.shake;
    if (this.sim) this.sim.assists = s.assists;
    if (s.quality !== 'auto') this.probe = null;
    this.setQuality(s.quality === 'auto' ? this.autoLevel : s.quality);
    persist(window.localStorage, this.save);
  }

  private setQuality(level: QualityLevel): void {
    this.engine.setQuality(level);
    this.farm.setGrassDensity(this.engine.quality.grass);
    this.particles.budget = this.engine.quality.particles;
  }

  /** Auto quality: watch real frame times for a moment and step down if slow. */
  private probeQuality(rawDt: number): void {
    if (!this.probe || this.save.settings.quality !== 'auto') return;
    this.probe.push(rawDt);
    if (this.probe.length < 100) return;
    const sorted = this.probe.slice(20).sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
    if (median > 0.024 && this.autoLevel !== 'low') {
      this.autoLevel = this.autoLevel === 'high' ? 'med' : 'low';
      this.setQuality(this.autoLevel);
      this.probe = [];
    } else this.probe = null;
  }

  // ------------------------------------------------------------ garage

  private refreshTruck(celebrate: boolean): void {
    this.truck?.dispose();
    this.truck = new TruckModel({ loadout: this.save.equipped, paint: this.save.paint, decal: this.save.decal });
    this.engine.scene.add(this.truck.group);
    this.placeGarageTruck();
    if (celebrate) this.truck.kick(9);
    this.garage.render(this.save);
    persist(window.localStorage, this.save);
  }

  private placeGarageTruck(): void {
    this.truck.group.position.set(SPAWN.x, groundHeight(SPAWN.x, SPAWN.z) + 0.45, SPAWN.z);
    this.truck.group.rotation.set(0, 0.5, 0);
  }

  private buyPart(axis: Axis): void {
    const tier = buy(this.save, axis);
    if (tier === null) { this.audio.deny(); return; }
    this.refreshTruck(true);
    this.garage.reveal(axis, tier);
    this.audio.buy();
    window.setTimeout(() => this.audio.horn(this.save.equipped.engine), 350);
    if (this.save.settings.shake) this.engine.flash = 0.8;
    this.orbitR *= 0.86; // punch in, then drift back out
    const p = this.truck.group.position;
    this.particles.emit({ kind: 'flake', count: 70, x: p.x, y: p.y + 2.5, z: p.z, color: CONFETTI, speed: 9, up: 9, gravity: 9, drag: 1.2, size: 0.4, life: 2.2, spread: 2 });
    this.particles.emit({ kind: 'flake', count: 30, x: p.x, y: p.y + 2, z: p.z, color: 0xfff36a, glow: 2.5, speed: 6, up: 5, gravity: 2, size: 0.3, life: 1.2, spread: 3 });
    this.particles.emit({ kind: 'puff', count: 14, x: p.x, y: p.y + 0.3, z: p.z, color: 0xffffff, speed: 5, up: 0.5, size: 0.6, life: 0.6, spread: 4, grow: 0.6 });
  }

  private enterGarage(): void {
    this.state = 'garage';
    this.paused = false;
    this.summary.hide();
    this.hud.show(false);
    this.input.setTouchVisible(false);
    this.garage.show(true);
    this.podium.visible = true;
    this.audio.stopEngine();
    this.audio.intensity = 0;
    this.farm.reset();
    this.critters.clear();
    this.particles.clear();
    this.sim = new Sim(STOCK, { assists: false });
    this.engine.setTimeOfDay(0.12);
    this.farm.setSunColor(this.engine.sun.color);
    this.engine.speedFx = 0;
    SHARED.uTruck.value.set(0, -100, 0);
    this.refreshTruck(false);
  }

  private frameGarage(dt: number): void {
    this.sim.idle(dt);
    this.critters.sync(this.sim.animals, [], this.sim.farmer, dt);
    // Bigger trucks need a longer lens: frame by the equipped size.
    const e = this.save.equipped, baseR = 9.5 + e.body * 1.2 + e.wheels * 1.1, baseH = 3.2 + e.wheels * 0.55;
    const targets: Record<Axis, [number, number, number]> = { body: [1.1, baseR * 0.9, baseH], wheels: [2.0, baseR * 0.82, baseH * 0.55], engine: [0.6, baseR * 0.78, baseH * 1.1], tank: [3.6, baseR * 0.8, baseH * 1.3] };
    if (this.hover) {
      const [a, r, hgt] = targets[this.hover];
      this.orbit += Math.atan2(Math.sin(a - this.orbit), Math.cos(a - this.orbit)) * Math.min(1, dt * 3);
      this.orbitR = damp(this.orbitR, r, 4, dt); this.orbitH = damp(this.orbitH, hgt, 4, dt);
    } else {
      this.orbit += dt * 0.22;
      this.orbitR = damp(this.orbitR, baseR, 2.5, dt); this.orbitH = damp(this.orbitH, baseH, 3, dt);
    }
    const p = this.truck.group.position;
    this.truck.update(dt, { speed: 0, steer: Math.sin(performance.now() / 1300) * 0.5, throttle: 0, boosting: false, grounded: true, nitro: 1, slip: 0 });
    const cam = this.engine.camera;
    cam.position.set(p.x + Math.sin(this.orbit) * this.orbitR, p.y + this.orbitH, p.z + Math.cos(this.orbit) * this.orbitR);
    this.focus.set(p.x, p.y + 1.5 + e.wheels * 0.45, p.z);
    cam.lookAt(this.focus);
    if (cam.fov !== 46) { cam.fov = 46; cam.updateProjectionMatrix(); }
    if (Math.random() < dt * 6) { // showroom sparkle
      const a = Math.random() * 6.28;
      this.particles.emit({ kind: 'flake', x: p.x + Math.cos(a) * 5.4, y: p.y + 0.2, z: p.z + Math.sin(a) * 5.4, color: 0xfff36a, glow: 2.5, speed: 0.4, up: 2.5, size: 0.22, life: 1.2 });
    }
  }

  // ------------------------------------------------------------ run

  private startRun(): void {
    if (this.state === 'run' || this.state === 'ending') return;
    this.audio.unlock();
    this.summary.hide();
    this.garage.show(false);
    this.podium.visible = false;
    this.farm.reset();
    this.critters.clear();
    this.particles.clear();
    const s = this.save;
    this.sim = new Sim(s.equipped, { assists: s.settings.assists, farmerEase: farmerEaseFor(s), firstRun: s.runs === 0 });
    this.truck.group.rotation.order = 'YXZ';
    this.cam.snap(this.sim.truck);
    this.hud.show(true);
    this.hud.showHint(true);
    this.hintTimer = s.runs < 2 ? 9 : 4;
    this.input.setTouchVisible(true);
    this.audio.startEngine(s.equipped.engine);
    this.audio.intensity = 1;
    this.audio.horn(s.equipped.engine);
    this.state = 'run';
    this.timeScale = 1;
    this.freeze = 0;
    this.hud.toast('GO!', 'big');
  }

  private setPaused(v: boolean): void {
    if (v && this.state !== 'run') return;
    this.paused = v && this.state === 'run';
    this.pause.show(v, this.state === 'run');
    if (this.paused) this.audio.suspend(); else this.audio.resume();
  }

  private endRun(reason: 'sunset' | 'busted'): void {
    this.state = 'ending';
    this.endTimer = 1.8;
    this.audio.stopEngine();
    this.audio.intensity = 0;
    this.hud.arrow('farmer', null); this.hud.arrow('golden', null);
    if (reason === 'sunset') { this.hud.toast('🌇 SUNSET!', 'big'); this.confetti(80); } else { this.hud.toast('BUSTED!', 'big bad'); this.audio.womp(); }
  }

  private showSummary(): void {
    const sim = this.sim, s = this.save;
    const total = sim.coins + sim.styleCoins, score = sim.score, newBest = score > s.best;
    s.coins += total;
    s.runs++;
    s.lastBusted = sim.over === 'busted';
    if (newBest) s.best = score;
    s.bestMedal = Math.max(s.bestMedal, medalFor(score));
    persist(window.localStorage, s);
    this.state = 'summary';
    this.hud.show(false);
    this.input.setTouchVisible(false);
    this.summary.show({
      reason: sim.over ?? 'sunset', boops: sim.counters.boops, bestCombo: sim.counters.combo, missions: sim.missionsDone, secrets: sim.counters.secrets,
      coins: sim.coins, style: sim.style, styleCoins: sim.styleCoins, score, best: s.best, newBest,
    });
  }

  private confetti(count: number): void {
    const t = this.sim.truck;
    this.particles.emit({ kind: 'flake', count, x: t.x, y: t.y + 3, z: t.z, color: CONFETTI, speed: 10, up: 11, gravity: 9, drag: 1.2, size: 0.4, life: 2.4, spread: 2 });
  }

  /** World position -> HUD popup. */
  private popup(text: string, x: number, y: number, z: number, cls = ''): void {
    _v.set(x, y, z).project(this.engine.camera);
    if (_v.z > 1) return;
    const w = this.root.clientWidth, hgt = this.root.clientHeight;
    this.hud.popup(text, clamp((_v.x * 0.5 + 0.5) * w, 60, w - 60), clamp((-_v.y * 0.5 + 0.5) * hgt, 80, hgt - 80), cls);
  }

  private handle(e: GameEvent): void {
    const P = this.particles, A = this.audio, t = this.sim.truck, shake = (a: number) => this.cam.shake(a);
    switch (e.type) {
      case 'boop': {
        const big = SPECIES[e.species].r;
        this.freeze = Math.max(this.freeze, e.golden ? 0.12 : 0.05 + big * 0.02);
        shake(0.22 + big * 0.12);
        this.truck.kick(2 + big * 2);
        const y = e.y + 1;
        const burst = { chicken: [0xffffff, 0xfff6e0, 0xffe9c9], pig: [C.pink, C.pinkDark, 0xffd0dc], sheep: [0xffffff, 0xfffaf0], cow: [0xffffff, C.ink, 0xffffff] }[e.species];
        P.emit({ kind: e.species === 'chicken' ? 'flake' : 'puff', count: e.species === 'chicken' ? 22 : 12, x: e.x, y, z: e.z, color: burst, speed: 6, up: 6, gravity: e.species === 'chicken' ? 5 : 3, drag: 2.2, size: e.species === 'chicken' ? 0.34 : 0.6, life: 1.1, vx: t.vx * 0.3, vz: t.vz * 0.3 });
        P.emit({ kind: 'flake', count: 10, x: e.x, y, z: e.z, color: [0xfff36a, 0xffffff], glow: 2.2, speed: 9, up: 5, gravity: 6, size: 0.3, life: 0.6 });
        P.emit({ kind: 'flake', count: Math.min(12, 3 + Math.floor(e.coins / 4)), x: e.x, y: y + 0.5, z: e.z, color: C.gold, glow: 2, speed: 7, up: 9, size: 0.42, life: 0.75, home: this.truck.group.position });
        if (e.golden) P.emit({ kind: 'flake', count: 50, x: e.x, y, z: e.z, color: [0xfff36a, 0xffd23f, 0xffffff], glow: 3, speed: 12, up: 10, gravity: 8, size: 0.4, life: 1.4 });
        this.popup(`+${e.coins}`, e.x, e.y + 2.4, e.z, e.golden ? 'gold' : e.mult >= 3 ? 'big' : '');
        A.boop(e.species, e.count, e.golden);
        if (e.count === 5) this.hud.toast('Boop Chain x5!', 'good'); else if (e.count === 10) this.hud.toast('MEGA CHAIN!', 'big'); else if (e.count === 16) this.hud.toast('UNSTOPPABLE!!', 'big');
        break;
      }
      case 'comboEnd': this.hud.toast(`Chain x${e.count}`, '', `+${e.bonus}`); A.comboEnd(); break;
      case 'style':
        this.hud.toast(e.label, e.points >= 250 ? 'big' : '', `+${e.points}`);
        A.style();
        if (e.points >= 250) this.confetti(30);
        break;
      case 'jump':
        A.jump(); this.truck.kick(-5);
        P.emit({ kind: 'puff', count: 8, x: t.x, y: t.y + 0.2, z: t.z, color: 0xf4e3c0, speed: 4, up: 1, size: 0.6, life: 0.5, spread: 1 });
        break;
      case 'land': {
        const k = clamp(e.impact / 26, 0.15, 1);
        A.land(e.impact); shake(k * 0.8); this.truck.kick(e.impact * 0.3);
        P.emit({ kind: 'puff', count: Math.round(6 + k * 18), x: t.x, y: t.y + 0.2, z: t.z, color: [0xf4e3c0, 0xffffff, 0xd9c9a0], speed: 5 + k * 6, up: 1.5, size: 0.7 + k * 0.6, life: 0.7, spread: 1.5, grow: 0.6 });
        for (const w of this.wheelWorld()) P.mark(w.x, w.z, t.heading);
        break;
      }
      case 'bonk':
        A.bonk(); shake(0.3); this.truck.kick(3);
        P.emit({ kind: 'flake', count: 8, x: t.x + Math.sin(t.heading) * 2, y: t.y + 1.5, z: t.z + Math.cos(t.heading) * 2, color: [0xfff36a, 0xffffff], glow: 2, speed: 6, up: 4, gravity: 8, size: 0.3, life: 0.5 });
        break;
      case 'splash':
        A.splash(); shake(0.2);
        P.emit({ kind: 'puff', count: 26, x: t.x, y: WATER_Y + 0.2, z: t.z, color: [0xffffff, 0xbdf3ff, 0x8fe4ff], speed: 6, up: 9, gravity: 16, size: 0.6, life: 0.9, spread: 2, vx: t.vx * 0.3, vz: t.vz * 0.3 });
        break;
      case 'smash': {
        this.farm.smashProp(e.id);
        A.smash(e.kind);
        const heavy = e.kind === 'boulder' || e.kind === 'car' ? 1 : e.kind === 'rock' ? 0.6 : 0.25;
        shake(0.15 + heavy * 0.5);
        if (heavy >= 0.6) this.freeze = Math.max(this.freeze, 0.04 + heavy * 0.05);
        const y = groundHeight(e.x, e.z) + 0.8;
        P.emit({ kind: 'chunk', count: Math.round(8 + heavy * 14), x: e.x, y, z: e.z, color: propColor(e.kind), speed: 5 + heavy * 4, up: 8, gravity: 22, drag: 0.4, size: 0.35 + heavy * 0.25, life: 1.5, bounce: true, vx: t.vx * 0.5, vz: t.vz * 0.5, spread: 0.8 });
        if (e.kind === 'hay' || e.kind === 'scarecrow') P.emit({ kind: 'flake', count: 22, x: e.x, y, z: e.z, color: [C.hay, C.hayDark, 0xffe98a], speed: 5, up: 7, gravity: 5, drag: 2, size: 0.3, life: 1.3 });
        P.emit({ kind: 'puff', count: 6, x: e.x, y, z: e.z, color: 0xffffff, speed: 4, up: 2, size: 0.8, life: 0.5, grow: 0.8 });
        if (e.coins > 0) { this.popup(`+${e.coins}`, e.x, y + 1.5, e.z); A.coin(2); }
        if (e.kind === 'car') this.hud.toast('CRUSHED!', 'big');
        break;
      }
      case 'blocked': this.hud.toast('Need bigger wheels! 🛞', 'bad'); A.blocked(); break;
      case 'pickup':
        A.pickup(e.kind);
        if (e.kind === 'coin') {
          this.popup(`+${e.value}`, e.x, e.y + 0.8, e.z);
          P.emit({ kind: 'flake', count: 5, x: e.x, y: e.y, z: e.z, color: C.gold, glow: 2.2, speed: 4, up: 4, gravity: 6, size: 0.25, life: 0.5 });
        } else if (e.kind === 'fuel') {
          this.popup('NITRO!', e.x, e.y + 1, e.z, 'big');
          P.emit({ kind: 'flake', count: 22, x: e.x, y: e.y, z: e.z, color: [0x4dff9a, 0x36e0ff, 0xffffff], glow: 2.4, speed: 7, up: 6, gravity: 5, size: 0.3, life: 0.8 });
        } else {
          P.emit({ kind: 'flake', count: 70, x: e.x, y: e.y, z: e.z, color: [0xfff36a, 0xffd23f, 0xffffff], glow: 3, speed: 11, up: 11, gravity: 7, size: 0.4, life: 1.6 });
          this.popup(`+${e.value}`, e.x, e.y + 1, e.z, 'gold');
          if (this.save.settings.shake) this.engine.flash = 0.35;
        }
        break;
      case 'animalLand': P.emit({ kind: 'puff', count: 5, x: e.x, y: e.y + 0.2, z: e.z, color: 0xf4e3c0, speed: 3, up: 1, size: 0.5, life: 0.5 }); break;
      case 'poof':
        P.emit({ kind: 'puff', count: 9, x: e.x, y: e.y + 0.8, z: e.z, color: 0xffffff, speed: 3.5, up: 2.5, size: 0.7, life: 0.6, grow: 0.5 });
        if (Math.hypot(e.x - t.x, e.z - t.z) < 40) A.poof();
        break;
      case 'horn':
        A.horn(this.save.equipped.engine); this.truck.kick(-2);
        P.emit({ kind: 'flake', count: 14, x: t.x + Math.sin(t.heading) * 2.6, y: t.y + 1.6, z: t.z + Math.cos(t.heading) * 2.6, color: 0xffffff, speed: 12, up: 2, size: 0.3, life: 0.4, drag: 3 });
        break;
      case 'farmer': {
        const f = this.sim.farmer;
        if (e.what === 'warn') { this.hud.toast('😠 FARMER!', 'bad'); A.farmerWarn(); } else if (e.what === 'bump') {
          A.farmerBump(); shake(1); this.truck.kick(10);
          if (this.save.settings.shake) this.engine.flash = 0.5;
          this.hud.toast('BONK! 💔', 'bad', e.coinsLost ? `-${e.coinsLost} 🪙` : '');
          P.emit({ kind: 'flake', count: 24, x: t.x, y: t.y + 1.5, z: t.z, color: [0xfff36a, 0xffffff, C.red], glow: 2, speed: 10, up: 8, gravity: 10, size: 0.4, life: 0.9 });
        } else if (e.what === 'stun') {
          A.farmerStun();
          P.emit({ kind: 'flake', count: 14, x: f.x, y: groundHeight(f.x, f.z) + 4, z: f.z, color: 0xfff36a, glow: 2.5, speed: 3, up: 2, size: 0.35, life: 1.2 });
        } else if (e.what === 'stuck' || e.what === 'gaveUp') A.farmerEscape();
        break;
      }
      case 'mission':
        this.hud.bonusTime(10); A.mission(); this.confetti(36);
        this.hud.toast('Mission done!', 'good', `+${e.reward} 🪙`);
        break;
      case 'happening':
        this.hud.toast({ golden: '⭐ GOLDEN ANIMAL!', stampede: '🐮 STAMPEDE!', fuelRain: '⚡ NITRO DROP!', chickenParty: '🐔 CHICKEN PARTY!' }[e.kind], 'big');
        A.event();
        break;
      case 'end': this.endRun(e.reason); break;
    }
  }

  private wheelWorld(): THREE.Vector3[] {
    const t = this.sim.truck, c = Math.cos(t.heading), s = Math.sin(t.heading);
    return this.truck.wheelPoints.map((p) => new THREE.Vector3(t.x + p.x * c + p.z * s, 0, t.z - p.x * s + p.z * c));
  }

  private frameRun(rawDt: number, input: DriveInput): void {
    const sim = this.sim, t = sim.truck, P = this.particles;
    // Hit-stop on impacts, slow-mo on big air.
    const high = !t.grounded && t.airTime > 0.45 && t.y - surfaceHeight(t.x, t.z) > 2.6;
    this.timeScale = damp(this.timeScale, this.state === 'ending' ? 0.3 : high ? 0.6 : 1, 8, rawDt);
    const dt = rawDt * this.timeScale;
    if (this.freeze > 0) this.freeze -= rawDt;
    else if (this.state === 'run') {
      const steps = dt > 1 / 45 ? 2 : 1;
      for (let i = 0; i < steps; i++) sim.step(input, dt / steps);
      for (const e of sim.drainEvents()) this.handle(e);
    }

    // ---- truck visuals
    const speed = truckSpeed(t), fwd = forwardSpeed(t), wheels = this.wheelWorld();
    const lifts = wheels.map((w) => clamp(surfaceHeight(w.x, w.z) - t.y, -0.5, 0.7)) as [number, number, number, number];
    const g = this.truck.group;
    const c = 1.5; // flips pivot around the middle of the truck, not the ground
    // In the air show the real flip; on landing ease the leftover angle out instead of snapping.
    const fl = (this.flipVis = t.grounded ? damp(Math.atan2(Math.sin(this.flipVis), Math.cos(this.flipVis)), 0, 16, rawDt) : t.flip);
    g.position.set(t.x - Math.sin(t.heading) * c * Math.sin(fl), t.y + c * (1 - Math.cos(fl)), t.z - Math.cos(t.heading) * c * Math.sin(fl));
    g.rotation.set(fl, t.heading, 0);
    g.visible = sim.invuln <= 0 || Math.floor(sim.invuln * 16) % 4 !== 0; // quick flicker while invulnerable
    this.truck.update(dt, { speed: fwd, steer: t.steer, throttle: input.throttle, boosting: t.boosting, grounded: t.grounded, nitro: t.nitro / sim.stats.nitro, wheelLift: lifts, slip: t.slip });
    SHARED.uTruck.value.set(t.x, t.y, t.z);

    // ---- continuous particles
    if (t.grounded && speed > 4) {
      this.dustAcc += dt * speed * (t.boosting ? 1.6 : 0.8);
      const drifting = Math.abs(t.slip) > 3;
      while (this.dustAcc > 1) {
        this.dustAcc -= 1;
        const w = wheels[2 + Math.floor(Math.random() * 2)];
        if (t.inWater) P.emit({ kind: 'puff', count: 2, x: w.x, y: WATER_Y + 0.1, z: w.z, color: [0xffffff, 0xbdf3ff], speed: 3, up: 6, gravity: 14, size: 0.5, life: 0.6 });
        else if (t.inMud || inMud(w.x, w.z)) P.emit({ kind: 'chunk', count: 2, x: w.x, y: t.y + 0.3, z: w.z, color: [C.mud, 0x7a5236], speed: 3, up: 6, gravity: 18, size: 0.28, life: 0.9, bounce: true, vx: -t.vx * 0.2, vz: -t.vz * 0.2 });
        else {
          const dirt = distToPath(w.x, w.z) < 2.6;
          P.emit({ kind: 'puff', x: w.x, y: t.y + 0.3, z: w.z, color: drifting ? 0xffffff : dirt ? [0xf2d9a8, 0xe8c48a] : [0xd6f0a8, 0xf2e6c0], speed: 1.2, up: 1.6, size: drifting ? 1.0 : 0.6, life: drifting ? 0.9 : 0.6, grow: 1, vx: -t.vx * 0.08, vz: -t.vz * 0.08 });
          if (!dirt && Math.random() < 0.35) P.emit({ kind: 'flake', x: w.x, y: t.y + 0.3, z: w.z, color: [0x7ed957, 0x58bf4a], speed: 2.5, up: 4, gravity: 12, size: 0.2, life: 0.6 });
        }
      }
      if (drifting && (this.markAcc += dt) > 0.035) { this.markAcc = 0; P.mark(wheels[2].x, wheels[2].z, t.heading); P.mark(wheels[3].x, wheels[3].z, t.heading); }
    }
    if (t.boosting) {
      const bx = -Math.sin(t.heading), bz = -Math.cos(t.heading);
      P.emit({ kind: 'flake', count: 2, x: t.x + bx * 2.6, y: t.y + 1.3, z: t.z + bz * 2.6, color: [0x66e0ff, 0xffffff, 0xfff36a], glow: 2.6, speed: 2, up: 1, size: 0.4, life: 0.35, vx: bx * 8, vz: bz * 8 });
    }
    if ((this.smokeAcc += dt) > 0.22) {
      this.smokeAcc = 0;
      const ch = this.farm.chimney;
      P.emit({ kind: 'puff', x: ch.x, y: ch.y, z: ch.z, color: 0xf2f2f2, speed: 0.3, up: 1.6, size: 0.9, life: 3, grow: 1.6, drag: 0.2, vx: 0.6 });
      const f = sim.farmer;
      if (f.mode !== 'away') P.emit({ kind: 'puff', x: f.x + Math.sin(f.heading) * 1.2, y: groundHeight(f.x, f.z) + 3.5, z: f.z + Math.cos(f.heading) * 1.2, color: 0x6b6580, speed: 0.4, up: 2.5, size: 0.5, life: 0.9, grow: 1 });
      if (input.throttle > 0 && this.truck.exhausts.length) {
        const ex = this.truck.exhausts[Math.floor(Math.random() * this.truck.exhausts.length)];
        _v.copy(ex).applyEuler(g.rotation).add(g.position);
        P.emit({ kind: 'puff', x: _v.x, y: _v.y, z: _v.z, color: 0x8a8499, speed: 0.5, up: 1.8, size: 0.35, life: 0.6, grow: 1.2 });
      }
      const gold = sim.goldenId >= 0 ? sim.animals.find((a) => a.id === sim.goldenId) : undefined;
      if (gold && gold.mode !== 'gone') P.emit({ kind: 'flake', count: 3, x: gold.x, y: gold.y + 1.2, z: gold.z, color: 0xfff36a, glow: 3, speed: 1.5, up: 3, size: 0.3, life: 0.9, spread: 1 });
    }
    if ((this.ambientAcc += dt) > 0.16) { // drifting petals / butterflies near the camera
      this.ambientAcc = 0;
      const a = t.heading + (Math.random() - 0.5) * 2.4, d = 8 + Math.random() * 26;
      const x = t.x + Math.sin(a) * d, z = t.z + Math.cos(a) * d;
      if (!isWater(x, z)) P.emit({ kind: 'flake', x, y: surfaceHeight(x, z) + 0.6 + Math.random() * 2, z, color: [0xffffff, 0xff9fcf, 0xffe066, 0xc9a6ff], speed: 0.8, up: 0.5, size: 0.16, life: 4, drag: 0.1 });
    }

    // ---- world, camera, audio
    const dayFrac = sim.time / (sim.time + Math.max(0.001, sim.timeLeft));
    this.engine.setTimeOfDay(0.1 + 0.9 * dayFrac);
    this.farm.setSunColor(this.engine.sun.color);
    this.critters.sync(sim.animals, sim.pickups, sim.farmer, dt);
    this.cam.update(t, sim.stats.topSpeed, rawDt);
    this.focus.set(t.x, t.y, t.z);
    this.engine.speedFx = damp(this.engine.speedFx, this.save.settings.shake && this.state === 'run' ? clamp((speed / sim.stats.topSpeed - 0.8) * 1.6, 0, 0.6) + (t.boosting ? 0.5 : 0) : 0, 6, rawDt);
    if (this.state === 'run') {
      this.audio.updateEngine(speed / sim.stats.topSpeed, input.throttle, t.boosting, t.grounded, t.slip);
      this.audio.intensity = sim.chased || t.boosting || sim.timeLeft < 15 ? 2 : 1;
    }

    // ---- HUD
    if (this.hintTimer > 0 && (this.hintTimer -= rawDt) <= 0) this.hud.showHint(false);
    this.hud.update({
      coins: sim.coins, score: sim.score, hearts: sim.hearts, maxHearts: sim.stats.hearts, timeLeft: sim.timeLeft, dayFrac,
      nitro: t.nitro / sim.stats.nitro, boosting: t.boosting, combo: sim.combo.count, mult: sim.coinMult, comboFrac: sim.combo.timer / 4, chased: sim.chased, missions: sim.missions,
    }, rawDt);
    const camDir = this.engine.camera.getWorldDirection(_v), camHeading = Math.atan2(camDir.x, camDir.z);
    const bearing = (x: number, z: number): number | null => {
      const dx = x - t.x, dz = z - t.z, d = Math.hypot(dx, dz);
      const f = dx * Math.sin(camHeading) + dz * Math.cos(camHeading), r = -dx * Math.cos(camHeading) + dz * Math.sin(camHeading);
      const ang = Math.atan2(r, f);
      return d < 22 && Math.abs(ang) < 0.5 ? null : ang; // already on screen
    };
    const f = sim.farmer;
    this.hud.arrow('farmer', this.state === 'run' && (f.mode === 'warn' || f.mode === 'chase') ? bearing(f.x, f.z) : null);
    const gold = sim.goldenId >= 0 ? sim.animals.find((a) => a.id === sim.goldenId) : undefined;
    this.hud.arrow('golden', this.state === 'run' && gold && gold.mode !== 'gone' ? bearing(gold.x, gold.z) : null);
    const dots: MapDot[] = [];
    for (const a of sim.animals) if (a.mode !== 'gone') dots.push({ x: a.x, z: a.z, kind: a.golden ? 'golden' : 'animal' });
    for (const p of sim.pickups) if (p.kind === 'fuel' && p.cool <= 0) dots.push({ x: p.x, z: p.z, kind: 'fuel' });
    if (f.mode !== 'away') dots.push({ x: f.x, z: f.z, kind: 'farmer' });
    this.hud.drawMap(t.x, t.z, camHeading, dots, rawDt);

    if (this.state === 'ending' && (this.endTimer -= rawDt) <= 0) this.showSummary();
  }

  // ------------------------------------------------------------ loop

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const rawDt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.lost) return;
    const input = this.input.read();
    if (this.paused) { this.engine.render(0, this.focus); return; }
    this.probeQuality(rawDt);
    this.squeakCooldown -= rawDt;
    if (this.state === 'garage' || this.state === 'summary') {
      if (this.state === 'garage') this.frameGarage(rawDt); else this.frameRun(rawDt * 0.25, { throttle: 0, steer: 0, boost: false, jump: false, horn: false });
    } else this.frameRun(rawDt, input);
    this.farm.update(rawDt, now / 1000);
    this.particles.update(rawDt * (this.state === 'garage' ? 1 : this.timeScale));
    this.engine.flash = Math.max(0, this.engine.flash - rawDt * 3);
    this.engine.render(rawDt, this.focus);
  };
}
