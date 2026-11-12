// All sound is synthesized with WebAudio: zero audio files to download.
// Starts on the first user gesture (browser autoplay rules).
import type { Species } from '../core/animals';
import { clamp } from '../core/math';
import type { PropKind } from '../core/world';

type Wave = OscillatorType;
interface ToneOpts { type?: Wave; gain?: number; to?: number; delay?: number; attack?: number; vibrato?: number; filter?: number; bus?: AudioNode }
interface NoiseOpts { gain?: number; delay?: number; freq?: number; to?: number; type?: BiquadFilterType; q?: number }

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const note = (semi: number, base = 261.63) => base * 2 ** (semi / 12);

// Music: four bars, one chord each (C G Am F), bouncy boom-chick.
const CHORDS = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]];
const MELODY = [
  [12, -1, 16, 19, -1, 16, 12, -1, 14, -1, 16, -1, 12, -1, -1, -1],
  [14, -1, 19, 23, -1, 19, 14, -1, 16, -1, 14, -1, 11, -1, -1, -1],
  [16, -1, 21, 24, -1, 21, 16, -1, 19, -1, 16, -1, 12, -1, 14, -1],
  [17, -1, 21, 24, -1, 21, 17, 16, 14, -1, 12, -1, 14, -1, 11, -1],
];

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noiseBuf!: AudioBuffer;
  private engine: { osc1: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode; tyre: GainNode; tyreFilter: BiquadFilterNode; boost: GainNode } | null = null;
  private volume = 0.7;
  private musicOn = true;
  private step = 0;
  private nextTime = 0;
  private timer = 0;
  /** 0 = garage/calm, 1 = driving, 2 = chase/boost. */
  intensity = 0;
  private engineTier = 0;

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = this.musicOn ? 0.32 : 0; this.music.connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 80);
  }

  setVolume(v: number): void { this.volume = clamp(v, 0, 1); if (this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05); }
  setMusic(on: boolean): void { this.musicOn = on; if (this.ctx) this.music.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.2); }
  suspend(): void { void this.ctx?.suspend(); }
  resume(): void { void this.ctx?.resume(); }

  // ------------------------------------------------------------ primitives

  private tone(freq: number, dur: number, o: ToneOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    if (o.vibrato) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = o.vibrato; lg.gain.value = freq * 0.06;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t); lfo.stop(t + dur);
    }
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (o.filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.filter; node.connect(f); node = f; }
    node.connect(g).connect(o.bus ?? this.sfx);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, o: NoiseOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noiseBuf; src.loop = true;
    f.type = o.type ?? 'lowpass'; f.Q.value = o.q ?? 0.7;
    f.frequency.setValueAtTime(o.freq ?? 1200, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(o.gain ?? 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random()); src.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------ engine loop

  startEngine(tier: number): void {
    const ctx = this.ctx;
    this.engineTier = tier;
    if (!ctx || this.engine) return;
    const osc1 = ctx.createOscillator(), osc2 = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    osc1.type = 'sawtooth'; osc2.type = 'square';
    filter.type = 'lowpass'; filter.frequency.value = 400; filter.Q.value = 2;
    gain.gain.value = 0;
    osc1.connect(filter); osc2.connect(filter); filter.connect(gain).connect(this.sfx);
    const mk = (type: BiquadFilterType, freq: number) => {
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.noiseBuf; src.loop = true; f.type = type; f.frequency.value = freq; g.gain.value = 0;
      src.connect(f).connect(g).connect(this.sfx); src.start();
      return { f, g };
    };
    const tyre = mk('bandpass', 500), boost = mk('highpass', 1800);
    osc1.start(); osc2.start();
    this.engine = { osc1, osc2, filter, gain, tyre: tyre.g, tyreFilter: tyre.f, boost: boost.g };
  }

  stopEngine(): void {
    const e = this.engine, ctx = this.ctx;
    if (!e || !ctx) return;
    for (const g of [e.gain, e.tyre, e.boost]) g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  }

  updateEngine(speedFrac: number, throttle: number, boosting: boolean, grounded: boolean, slip: number): void {
    const e = this.engine, ctx = this.ctx;
    if (!e || !ctx) return;
    const t = ctx.currentTime;
    // Fake gearbox: pitch climbs within each "gear", then drops.
    const sf = clamp(speedFrac, 0, 1.6), gear = Math.min(3, Math.floor(sf * 3.2)), within = sf * 3.2 - gear;
    const base = (58 - this.engineTier * 6) + gear * 14 + within * 46 + (grounded ? 0 : 30) + (boosting ? 25 : 0);
    e.osc1.frequency.setTargetAtTime(base, t, 0.05);
    e.osc2.frequency.setTargetAtTime(base * 0.5 * (1 + this.engineTier * 0.004), t, 0.05);
    e.filter.frequency.setTargetAtTime(260 + sf * 900 + Math.abs(throttle) * 500 + this.engineTier * 120, t, 0.08);
    e.gain.gain.setTargetAtTime(0.035 + Math.abs(throttle) * 0.035 + this.engineTier * 0.008 + (boosting ? 0.03 : 0), t, 0.08);
    e.tyre.gain.setTargetAtTime(grounded ? Math.min(0.09, sf * 0.03 + Math.abs(slip) * 0.012) : 0, t, 0.08);
    e.tyreFilter.frequency.setTargetAtTime(350 + Math.abs(slip) * 160, t, 0.1);
    e.boost.gain.setTargetAtTime(boosting ? 0.07 : 0, t, 0.06);
  }

  // ------------------------------------------------------------ sound effects

  boop(species: Species, combo: number, golden: boolean): void {
    this.tone(260, 0.16, { to: 620, gain: 0.22 }); // boing
    this.noise(0.08, { gain: 0.12, freq: 2000 });
    const d = 0.03;
    if (species === 'chicken') { this.tone(760, 0.09, { type: 'square', to: 1150, gain: 0.07, delay: d, filter: 2400 }); this.tone(980, 0.14, { type: 'square', to: 620, gain: 0.07, delay: d + 0.1, filter: 2400 }); }
    else if (species === 'pig') { this.tone(230, 0.12, { type: 'sawtooth', to: 150, gain: 0.12, delay: d, vibrato: 38, filter: 1100 }); this.tone(250, 0.16, { type: 'sawtooth', to: 140, gain: 0.12, delay: d + 0.14, vibrato: 38, filter: 1100 }); }
    else if (species === 'sheep') this.tone(430, 0.4, { type: 'sawtooth', to: 380, gain: 0.1, delay: d, vibrato: 9, filter: 1500 });
    else { this.tone(170, 0.6, { type: 'sawtooth', to: 118, gain: 0.14, delay: d, filter: 620, attack: 0.06 }); }
    this.coin(combo);
    if (golden) this.sparkle();
  }

  /** Coin ping that climbs a pentatonic ladder with the combo. */
  coin(step = 0): void {
    const s = PENTA[Math.min(PENTA.length - 1, Math.max(0, step - 1))];
    this.tone(note(s + 12, 523.25), 0.09, { type: 'triangle', gain: 0.13, delay: 0.05 });
    this.tone(note(s + 17, 523.25), 0.22, { type: 'triangle', gain: 0.13, delay: 0.11 });
  }

  sparkle(): void { for (let i = 0; i < 6; i++) this.tone(note(PENTA[i + 3], 523.25), 0.18, { type: 'triangle', gain: 0.09, delay: i * 0.055 }); }
  style(): void { for (let i = 0; i < 3; i++) this.tone(note([0, 7, 12][i], 659.25), 0.14, { type: 'square', gain: 0.05, delay: i * 0.06, filter: 3000 }); }
  comboEnd(): void { this.tone(880, 0.3, { to: 440, type: 'triangle', gain: 0.1 }); }

  smash(kind: PropKind): void {
    const heavy = kind === 'boulder' || kind === 'car' || kind === 'rock';
    this.noise(heavy ? 0.45 : 0.22, { gain: heavy ? 0.3 : 0.2, freq: heavy ? 900 : 2600, to: 200 });
    this.tone(heavy ? 90 : 180, heavy ? 0.35 : 0.14, { to: 45, gain: heavy ? 0.3 : 0.16 });
    if (kind === 'car') for (const f of [523, 811, 1307]) this.tone(f, 0.3, { type: 'square', gain: 0.04, filter: 3000 });
    if (kind === 'crate' || kind === 'fence') this.tone(700, 0.05, { type: 'square', gain: 0.08, to: 300 });
    if (kind === 'pumpkin') this.tone(300, 0.12, { to: 90, gain: 0.14 });
  }

  land(impact: number): void {
    const g = clamp(impact / 22, 0.15, 1);
    this.tone(120, 0.22, { to: 38, gain: 0.34 * g });
    this.noise(0.18, { gain: 0.16 * g, freq: 700, to: 150 });
  }
  jump(): void { this.tone(210, 0.2, { to: 520, gain: 0.14, type: 'triangle' }); }
  bonk(): void { this.tone(150, 0.14, { to: 70, type: 'square', gain: 0.12, filter: 700 }); this.noise(0.08, { gain: 0.12, freq: 900 }); }
  splash(): void { this.noise(0.55, { gain: 0.26, freq: 2200, to: 300, type: 'bandpass', q: 0.8 }); }
  poof(): void { this.noise(0.14, { gain: 0.05, freq: 1500, to: 500 }); }
  blocked(): void { this.tone(140, 0.2, { type: 'square', gain: 0.08, filter: 500 }); this.tone(105, 0.3, { type: 'square', gain: 0.08, delay: 0.14, filter: 500 }); }

  horn(tier: number): void {
    // Bigger engine, bigger horn.
    const base = [392, 330, 262, 196][tier] ?? 392;
    for (const f of [base, base * 1.26]) this.tone(f, 0.34, { type: 'sawtooth', gain: 0.1, filter: 1400, attack: 0.02 });
    if (tier >= 2) this.tone(base * 0.5, 0.36, { type: 'square', gain: 0.08, filter: 700 });
  }

  pickup(kind: 'fuel' | 'coin' | 'corn'): void {
    if (kind === 'coin') this.coin(3);
    else if (kind === 'fuel') { this.tone(300, 0.3, { to: 1200, type: 'sawtooth', gain: 0.09, filter: 2600 }); this.noise(0.3, { gain: 0.08, freq: 800, to: 4000, type: 'bandpass' }); }
    else { this.sparkle(); this.tone(523, 0.5, { type: 'triangle', gain: 0.1, delay: 0.3 }); }
  }

  farmerWarn(): void { [392, 370, 311].forEach((f, i) => this.tone(f, i === 2 ? 0.5 : 0.18, { type: 'sawtooth', gain: 0.12, delay: i * 0.2, filter: 1200 })); }
  farmerBump(): void { this.tone(300, 0.5, { to: 60, type: 'sawtooth', gain: 0.2, filter: 900 }); this.noise(0.4, { gain: 0.2, freq: 3000, to: 500 }); }
  farmerEscape(): void { [0, 4, 7, 12].forEach((s, i) => this.tone(note(s, 392), 0.16, { type: 'square', gain: 0.07, delay: i * 0.08, filter: 2500 })); }
  farmerStun(): void { for (let i = 0; i < 5; i++) this.tone(900 - i * 90, 0.1, { type: 'triangle', gain: 0.08, delay: i * 0.07 }); }
  mission(): void { [0, 4, 7, 12, 16].forEach((s, i) => this.tone(note(s, 523.25), 0.2, { type: 'triangle', gain: 0.12, delay: i * 0.07 })); }
  fanfare(): void { [0, 0, 0, 4, 7, 4, 7, 12].forEach((s, i) => this.tone(note(s, 392), i === 7 ? 0.7 : 0.16, { type: 'square', gain: 0.08, delay: i * 0.13, filter: 2600 })); }
  womp(): void { [0, -1, -2, -3].forEach((s, i) => this.tone(note(s, 233), i === 3 ? 0.7 : 0.25, { type: 'sawtooth', gain: 0.1, delay: i * 0.26, filter: 900, vibrato: i === 3 ? 6 : 0 })); }
  click(): void { this.tone(880, 0.05, { type: 'triangle', gain: 0.08 }); }
  tick(): void { this.tone(1400, 0.03, { type: 'square', gain: 0.03 }); }
  buy(): void { this.tone(1318, 0.1, { type: 'triangle', gain: 0.14 }); this.tone(1760, 0.4, { type: 'triangle', gain: 0.14, delay: 0.09 }); this.noise(0.3, { gain: 0.07, freq: 6000, type: 'highpass' }); this.tone(110, 0.3, { to: 55, gain: 0.25 }); }
  deny(): void { this.tone(200, 0.12, { type: 'square', gain: 0.07, filter: 600 }); this.tone(160, 0.18, { type: 'square', gain: 0.07, delay: 0.1, filter: 600 }); }
  event(): void { [0, 7, 4, 12].forEach((s, i) => this.tone(note(s, 659.25), 0.12, { type: 'triangle', gain: 0.09, delay: i * 0.09 })); }

  // ------------------------------------------------------------ music

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05; // tab was asleep
    const bpm = [96, 122, 150][this.intensity];
    const sixteenth = 60 / bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.2) {
      this.playStep(this.step, this.nextTime - ctx.currentTime, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, delay: number, dur: number): void {
    const bar = Math.floor(step / 16), s = step % 16, chord = CHORDS[bar], bus = this.music, hot = this.intensity;
    const root = chord[0] - 24;
    if (s % 4 === 0) this.tone(note(root + (s === 8 ? 7 : 0)), dur * 2.2, { type: 'triangle', gain: 0.3, delay, bus });
    if (hot === 2 && s % 4 === 2) this.tone(note(root + 12), dur * 1.2, { type: 'triangle', gain: 0.2, delay, bus });
    if (s % 4 === 2) for (const n of chord) this.tone(note(n), dur * 1.3, { type: 'square', gain: 0.035, delay, bus, filter: 1800 });
    const m = MELODY[bar][s];
    if (m >= 0 && hot > 0) this.tone(note(m), dur * 1.8, { type: 'triangle', gain: 0.1, delay, bus });
    if (m >= 0 && hot === 0 && s % 8 === 0) this.tone(note(m), dur * 3, { type: 'sine', gain: 0.09, delay, bus });
    if (hot > 0) {
      if (s % 8 === 0) this.tone(130, 0.14, { to: 45, gain: 0.3, delay, bus });
      if (s % 2 === 0) this.hat(delay, s % 4 === 2 ? 0.05 : 0.025);
      if (hot === 2) { if (s % 8 === 4) this.snare(delay); if (s % 2 === 1) this.hat(delay, 0.02); }
    }
  }

  private hat(delay: number, gain: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noiseBuf; f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(g).connect(this.music);
    src.start(t, Math.random() * 0.5); src.stop(t + 0.06);
  }
  private snare(delay: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noiseBuf; f.type = 'bandpass'; f.frequency.value = 1800;
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    src.connect(f).connect(g).connect(this.music);
    src.start(t, Math.random() * 0.5); src.stop(t + 0.15);
  }

  dispose(): void {
    window.clearInterval(this.timer);
    void this.ctx?.close();
  }
}
