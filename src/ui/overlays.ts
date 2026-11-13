// Full-screen overlays: loading, end-of-run summary, pause/settings.
import { MEDALS, medalFor } from '../core/missions';
import type { Quality, Settings } from '../core/save';
import { h } from './hud';

export class Loading {
  readonly root = h('div', 'layer overlay loading');
  private fill = h('i');
  private label = h('div', 'pill', 'Building the farm…');
  constructor(parent: HTMLElement) {
    const bar = h('div', 'loadbar');
    bar.append(this.fill);
    this.root.append(h('div', 'truck', '🚜'), h('div', 'logo', 'MONSTER TRUCK FARM'), bar, this.label);
    parent.append(this.root);
  }
  progress(frac: number, text?: string): void { this.fill.style.width = `${frac * 100}%`; if (text) this.label.textContent = text; }
  done(): void { this.root.remove(); }
}

export interface RunResult {
  reason: 'sunset' | 'busted';
  boops: number; bestCombo: number; missions: number; secrets: number;
  coins: number; style: number; styleCoins: number; score: number; best: number; newBest: boolean;
}

export class Summary {
  readonly root = h('div', 'layer overlay hidden');
  private panel = h('div', 'panel');
  private timers: number[] = [];
  constructor(parent: HTMLElement, private onGarage: () => void, private onAgain: () => void, private tick: () => void, private fanfare: (medal: number) => void) {
    this.root.append(this.panel);
    parent.append(this.root);
  }
  get visible(): boolean { return !this.root.classList.contains('hidden'); }
  hide(): void { this.root.classList.add('hidden'); for (const t of this.timers) window.clearTimeout(t); this.timers = []; }

  show(r: RunResult): void {
    this.hide();
    this.root.classList.remove('hidden');
    const title = h('h1', '', r.reason === 'sunset' ? '🌇 What a day!' : '😤 Busted!');
    title.append(h('small', '', r.reason === 'sunset' ? 'The sun went down on a great farm day' : 'The farmer shooed you home (you keep your coins)'));
    const tally = h('div', 'tally');
    const total = r.coins + r.styleCoins;
    const rows: [string, string, number, string][] = [
      ['🐾', 'Boops', r.boops, ''], ['🔥', 'Best chain', r.bestCombo, ''], ['🎯', 'Missions', r.missions, ''],
      ['🌽', 'Golden corn', r.secrets, '/5'], ['🪙', 'Coins', r.coins, ''], ['✨', `Style ${r.style.toLocaleString()}`, r.styleCoins, ' 🪙'],
    ];
    const values: { el: HTMLElement; to: number; suffix: string }[] = [];
    for (const [ico, label, v, suffix] of rows) {
      const el = h('div', 'v', '0');
      tally.append(h('div', '', ico), h('div', '', label), el);
      values.push({ el, to: v, suffix });
    }
    const totalEl = h('div', 'v total', '0');
    tally.append(h('div', 'total', '💰'), h('div', 'total', 'Total coins'), totalEl);
    values.push({ el: totalEl, to: total, suffix: '' });
    const medalBox = h('div');
    const buttons = h('div', 'row');
    const garage = h('button', 'btn', '🔧 Garage'), again = h('button', 'btn green', 'Again! ▶');
    garage.addEventListener('click', this.onGarage);
    again.addEventListener('click', this.onAgain);
    buttons.append(garage, again);
    this.panel.replaceChildren(title, tally, medalBox, buttons);

    // Count each line up in turn, then reveal the medal.
    values.forEach((v, i) => {
      this.timers.push(window.setTimeout(() => {
        const start = performance.now(), dur = Math.min(700, 150 + v.to * 8);
        const step = () => {
          const k = Math.min(1, (performance.now() - start) / dur);
          v.el.textContent = Math.round(v.to * k).toLocaleString() + v.suffix;
          if (k < 1 && this.visible) { if (Math.random() < 0.5) this.tick(); requestAnimationFrame(step); }
        };
        step();
      }, 350 + i * 330));
    });
    this.timers.push(window.setTimeout(() => {
      const m = medalFor(r.score);
      const medal = h('div', 'medal', m >= 0 ? MEDALS[m].icon : '🚜');
      medal.append(h('small', '', `Score ${r.score.toLocaleString()}${m >= 0 ? ` · ${MEDALS[m].name}!` : ''}`));
      const ladder = h('div', 'medals-row');
      for (const md of MEDALS) ladder.append(h('span', '', `${md.icon} ${md.score.toLocaleString()}`));
      medalBox.append(medal, ladder);
      if (r.newBest) medalBox.append(h('div', 'newbest', '🎉 NEW BEST! 🎉'));
      this.fanfare(m);
      again.focus();
    }, 350 + values.length * 330 + 300));
  }
}

export interface PauseHandlers {
  onResume(): void; onQuit(): void; onChange(s: Settings): void;
}

export class PauseMenu {
  readonly root = h('div', 'layer overlay hidden');
  private quit = h('button', 'btn', '🔧 Garage');
  private resume = h('button', 'btn green', 'Play ▶');
  private body = h('div');
  constructor(parent: HTMLElement, private settings: Settings, private on: PauseHandlers) {
    const panel = h('div', 'panel');
    const row = h('div', 'row');
    this.quit.addEventListener('click', () => on.onQuit());
    this.resume.addEventListener('click', () => on.onResume());
    row.append(this.quit, this.resume);
    const help = h('div', 'help');
    for (const [k, v] of [['W A S D / ⬅⬆⬇➡', 'Drive'], ['SPACE', 'Jump (in the air: steer to spin, ⬇ to backflip)'], ['SHIFT', 'Nitro boost'], ['H', 'Honk (scares animals, stuns the farmer)'], ['S + turn', 'Drift'], ['ESC', 'Pause'], ['🎮', 'Gamepad: stick, RT/LT, A jump, X nitro, Y honk']]) {
      help.append(h('span', 'key', k), h('span', '', v));
    }
    panel.append(h('h1', '', '⏸ Paused'), this.body, help, row);
    this.root.append(panel);
    parent.append(this.root);
    this.render();
  }
  get visible(): boolean { return !this.root.classList.contains('hidden'); }
  /** `inRun` false = opened from the garage as a settings panel. */
  show(v: boolean, inRun = true): void {
    this.root.classList.toggle('hidden', !v);
    this.quit.classList.toggle('hidden', !inRun);
    this.resume.textContent = inRun ? 'Play ▶' : 'OK';
    if (v) this.resume.focus();
  }

  private render(): void {
    const s = this.settings, change = () => { this.on.onChange(s); this.render(); };
    const row = (label: string, control: HTMLElement) => { const r = h('div', 'setting'); r.append(h('span', '', label), control); return r; };
    const toggle = (value: boolean, set: (v: boolean) => void) => {
      const seg = h('div', 'seg');
      for (const [label, v] of [['On', true], ['Off', false]] as const) {
        const b = h('button', `btn small${value === v ? ' on' : ''}`, label);
        b.addEventListener('click', () => { set(v); change(); });
        seg.append(b);
      }
      return seg;
    };
    const vol = h('input');
    vol.type = 'range'; vol.min = '0'; vol.max = '1'; vol.step = '0.05'; vol.value = String(s.volume);
    vol.addEventListener('input', () => { s.volume = Number(vol.value); this.on.onChange(s); });
    const quality = h('div', 'seg');
    for (const [label, q] of [['Auto', 'auto'], ['Low', 'low'], ['Med', 'med'], ['High', 'high']] as [string, Quality][]) {
      const b = h('button', `btn small${s.quality === q ? ' on' : ''}`, label);
      b.addEventListener('click', () => { s.quality = q; change(); });
      quality.append(b);
    }
    this.body.replaceChildren(
      row('🔊 Volume', vol),
      row('🎵 Music', toggle(s.music, (v) => (s.music = v))),
      row('✨ Graphics', quality),
      row('📳 Screen shake & flashes', toggle(s.shake, (v) => (s.shake = v))),
      row('🧲 Helpers (aim assist, last ❤️ is safe)', toggle(s.assists, (v) => (s.assists = v))),
    );
  }
}
