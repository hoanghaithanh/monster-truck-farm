// In-run HUD: icon-first for a pre-reader, with numbers for the grown-up.
import { MISSIONS, type Mission } from '../core/missions';
import { BRIDGE, POND, RAMPS, riverCenterZ, WORLD_R } from '../core/world';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export interface HudState {
  coins: number; score: number; hearts: number; maxHearts: number;
  timeLeft: number; dayFrac: number; nitro: number; boosting: boolean;
  combo: number; mult: number; comboFrac: number; chased: boolean;
  missions: readonly Mission[];
}
export interface MapDot { x: number; z: number; kind: 'animal' | 'golden' | 'fuel' | 'farmer' }

export class Hud {
  readonly root = h('div', 'layer hidden');
  private coins = h('span', '', '0');
  private coinPill = h('div', 'pill');
  private hearts = h('div', 'hearts');
  private score = h('div', 'pill score');
  private sun = h('div', 'day-sun');
  private secs = h('div', 'day-secs');
  private day = h('div', 'day');
  private missions = h('div', 'missions');
  private missionEls: { root: HTMLElement; ico: HTMLElement; txt: HTMLElement; bar: HTMLElement; num: HTMLElement; tpl: number }[] = [];
  private nitro = h('div', 'nitro');
  private nitroFill = h('i');
  private combo = h('div', 'combo hidden');
  private comboMult = h('div', 'mult');
  private comboLbl = h('div', 'lbl');
  private comboFill = h('i');
  private chase = h('div', 'chase');
  private chaseTag = h('div', 'chase-tag hidden', '😠 Farmer! Coins x2');
  private toasts = h('div', 'toasts');
  private popups = h('div', 'layer');
  private arrows = { farmer: h('div', 'arrow farmer hidden', '😠'), golden: h('div', 'arrow golden hidden', '⭐') };
  private map = h('canvas');
  private hint = h('div', 'hint');
  readonly pauseBtn = h('button', 'btn small', '⏸');
  private shown = { coins: -1, hearts: -1, max: -1, score: -1, secs: -1 };
  private coinAnim = 0;
  private mapTick = 0;

  constructor(parent: HTMLElement) {
    const tl = h('div', 'hud-tl');
    this.coinPill.append(h('span', 'coin-ico'), this.coins);
    tl.append(this.coinPill, this.hearts);
    const tr = h('div', 'hud-tr');
    tr.append(this.score, this.pauseBtn);
    const track = h('div', 'day-track');
    track.append(this.sun);
    this.day.append(track, this.secs);
    for (let i = 0; i < 3; i++) {
      const root = h('div', 'mission'), ico = h('div', 'ico'), body = h('div'), txt = h('div', 'txt'), bar = h('div', 'bar'), fill = h('i'), num = h('div', 'num');
      bar.append(fill); body.append(txt, bar); body.style.flex = '1';
      root.append(ico, body, num);
      this.missions.append(root);
      this.missionEls.push({ root, ico, txt, bar: fill, num, tpl: -1 });
    }
    const nbar = h('div', 'nitro-bar');
    nbar.append(this.nitroFill);
    this.nitro.append(h('span', 'nitro-ico', '🔥'), nbar);
    const ring = h('div', 'ring');
    ring.append(this.comboFill);
    this.combo.append(this.comboMult, this.comboLbl, ring);
    const mm = h('div', 'minimap');
    this.map.width = this.map.height = 220;
    mm.append(this.map);
    for (const [k, label] of [['W A S D', 'Drive'], ['SPACE', 'Jump'], ['SHIFT', 'Nitro'], ['H', 'Honk']]) {
      const d = h('div');
      d.append(h('span', 'key', k), document.createTextNode(label));
      this.hint.append(d);
    }
    this.root.append(this.chase, this.popups, tl, tr, this.day, this.chaseTag, this.missions, this.nitro, this.combo, mm, this.hint, this.toasts, this.arrows.farmer, this.arrows.golden);
    parent.append(this.root);
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
    if (v) { this.shown = { coins: -1, hearts: -1, max: -1, score: -1, secs: -1 }; this.coinAnim = 0; this.toasts.replaceChildren(); this.popups.replaceChildren(); }
  }
  showHint(v: boolean): void { this.hint.classList.toggle('off', !v); }

  update(s: HudState, dt: number): void {
    // Coins tick up rather than jumping.
    if (this.coinAnim !== s.coins) {
      const diff = s.coins - this.coinAnim;
      this.coinAnim = Math.abs(diff) < 1 ? s.coins : this.coinAnim + diff * Math.min(1, dt * 10);
      const shown = Math.round(this.coinAnim);
      if (shown !== this.shown.coins) {
        if (shown > this.shown.coins && this.shown.coins >= 0) { this.coinPill.classList.remove('bump'); void this.coinPill.offsetWidth; this.coinPill.classList.add('bump'); }
        this.shown.coins = shown;
        this.coins.textContent = String(shown);
      }
    }
    if (s.hearts !== this.shown.hearts || s.maxHearts !== this.shown.max) {
      if (s.hearts < this.shown.hearts) { this.hearts.classList.remove('hurt'); void this.hearts.offsetWidth; this.hearts.classList.add('hurt'); }
      this.shown.hearts = s.hearts; this.shown.max = s.maxHearts;
      this.hearts.replaceChildren(...Array.from({ length: s.maxHearts }, (_, i) => h('span', i < s.hearts ? '' : 'lost', '❤️')));
    }
    if (s.score !== this.shown.score) { this.shown.score = s.score; this.score.textContent = `⭐ ${s.score.toLocaleString()}`; }
    const secs = Math.ceil(s.timeLeft);
    if (secs !== this.shown.secs) { this.shown.secs = secs; this.secs.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`; this.sun.classList.toggle('late', secs <= 15); }
    this.sun.style.left = `${Math.min(100, s.dayFrac * 100)}%`;

    s.missions.forEach((m, i) => {
      const el = this.missionEls[i], t = MISSIONS[m.tpl];
      if (el.tpl !== m.tpl) { el.tpl = m.tpl; el.ico.textContent = t.icon; el.txt.textContent = t.label; el.root.style.animation = 'pop 0.4s'; }
      const prog = t.mode === 'max' ? Math.min(m.target, Math.max(0, m.progress)) : m.progress;
      el.bar.style.width = `${(prog / m.target) * 100}%`;
      el.num.textContent = m.done ? '✅' : `${Number.isInteger(m.target) ? Math.floor(prog) : prog.toFixed(1)}/${m.target}`;
      el.root.classList.toggle('done', m.done);
    });

    this.nitroFill.style.width = `${s.nitro * 100}%`;
    this.nitro.classList.toggle('on', s.boosting);
    this.combo.classList.toggle('hidden', s.combo < 2);
    if (s.combo >= 2) {
      this.comboMult.textContent = `x${s.mult}`;
      this.comboLbl.textContent = `${s.combo} boops!`;
      this.comboFill.style.width = `${s.comboFrac * 100}%`;
      this.combo.classList.toggle('hot', s.mult >= 4);
    }
    this.chase.classList.toggle('on', s.chased);
    this.chaseTag.classList.toggle('hidden', !s.chased);
  }

  /** Big centre-screen announcement. */
  toast(text: string, cls = '', sub = ''): void {
    while (this.toasts.childElementCount >= 3) this.toasts.firstElementChild!.remove();
    const t = h('div', `toast ${cls}`, text);
    if (sub) t.append(h('small', '', sub));
    t.addEventListener('animationend', () => t.remove());
    this.toasts.append(t);
  }

  /** Floating text at a screen position (px). */
  popup(text: string, x: number, y: number, cls = ''): void {
    if (this.popups.childElementCount > 24) this.popups.firstElementChild!.remove();
    const p = h('div', `popup ${cls}`, text);
    p.style.left = `${x}px`; p.style.top = `${y}px`;
    p.addEventListener('animationend', () => p.remove());
    this.popups.append(p);
  }

  bonusTime(seconds: number): void {
    const b = h('div', 'day-bonus', `+${seconds}s ☀️`);
    b.addEventListener('animationend', () => b.remove());
    this.day.append(b);
  }

  /** Edge-of-screen pointer. `angle` = bearing relative to the camera's forward (0 = ahead, + = right), null hides. */
  arrow(kind: 'farmer' | 'golden', angle: number | null): void {
    const el = this.arrows[kind];
    el.classList.toggle('hidden', angle === null);
    if (angle === null) return;
    const w = this.root.clientWidth, hgt = this.root.clientHeight;
    el.style.left = `${w / 2 + Math.sin(angle) * w * 0.36}px`;
    el.style.top = `${hgt * 0.46 - Math.cos(angle) * hgt * 0.3}px`;
    el.style.setProperty('--rot', `${angle}rad`);
  }

  /** Heading-up minimap: what's ahead of the truck is at the top. */
  drawMap(tx: number, tz: number, heading: number, dots: readonly MapDot[], dt: number): void {
    if ((this.mapTick -= dt) > 0) return;
    this.mapTick = 0.08;
    const g = this.map.getContext('2d')!;
    const S = 220, R = 75, k = S / 2 / R;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#3f9a4a';
    g.fillRect(0, 0, S, S);
    // World x -> screen right must flip: +heading turns left, and -X is screen-right when facing +Z.
    g.translate(S / 2, S / 2);
    g.rotate(heading);
    g.scale(-k, -k);
    g.translate(-tx, -tz);
    g.fillStyle = '#8fe07a';
    g.beginPath(); g.arc(0, 0, WORLD_R, 0, 7); g.fill();
    g.strokeStyle = '#4fd0e8'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath();
    for (let x = -WORLD_R - 20; x <= WORLD_R + 20; x += 8) g.lineTo(x, riverCenterZ(x));
    g.stroke();
    g.fillStyle = '#4fd0e8';
    g.beginPath(); g.arc(POND.x, POND.z, POND.r, 0, 7); g.fill();
    g.fillStyle = '#c98850';
    g.fillRect(BRIDGE.x - 4, riverCenterZ(BRIDGE.x) - 9, 8, 18);
    g.fillStyle = '#ff8a1f';
    for (const r of RAMPS) { g.beginPath(); g.arc(r.x + Math.sin(r.heading) * 4, r.z + Math.cos(r.heading) * 4, 3.2, 0, 7); g.fill(); }
    g.fillStyle = '#ff5a4f';
    g.fillRect(-26, -24, 12, 10); // barn
    for (const d of dots) {
      const r = d.kind === 'animal' ? 2 : d.kind === 'fuel' ? 2.8 : 5;
      g.fillStyle = d.kind === 'animal' ? '#ffffff' : d.kind === 'fuel' ? '#36e0ff' : d.kind === 'golden' ? '#ffe14a' : '#ff2d2d';
      g.beginPath(); g.arc(d.x, d.z, r, 0, 7); g.fill();
      if (d.kind !== 'animal') { g.strokeStyle = '#2b2440'; g.lineWidth = 1.2; g.stroke(); }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#2b2440'; g.lineWidth = 3; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(S / 2, S / 2 - 13); g.lineTo(S / 2 + 9, S / 2 + 9); g.lineTo(S / 2, S / 2 + 4); g.lineTo(S / 2 - 9, S / 2 + 9); g.closePath();
    g.stroke(); g.fill();
  }
}
