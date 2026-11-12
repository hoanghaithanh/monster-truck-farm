// Garage: the truck spins on a turntable in the farmyard while you shop.
// Big icon cards for a pre-reader; names, blurbs and stat bars for adults.
import { MEDALS } from '../core/missions';
import { AXES, DECALS, MAX_TIER, PAINTS, PARTS, statBars, type Axis, type Decal } from '../core/parts';
import { canBuy, nextTier, type Save } from '../core/save';
import { h } from './hud';

const AXIS_ICON: Record<Axis, string> = { body: '🛡️', wheels: '🛞', engine: '🔥', tank: '⚡' };
const AXIS_LABEL: Record<Axis, string> = { body: 'Body', wheels: 'Wheels', engine: 'Engine', tank: 'Nitro' };
const DECAL_ICON: Record<Decal, string> = { none: '🚫', flames: '🔥', bolt: '⚡', stars: '⭐', stripes: '🏁' };

export interface GarageHandlers {
  onBuy(axis: Axis): void;
  onPaint(index: number): void;
  onDecal(decal: Decal): void;
  onGo(): void;
  onSettings(): void;
  onHover(axis: Axis | null): void;
}

export class Garage {
  readonly root = h('div', 'layer garage hidden');
  private coins = h('span');
  private parts = h('div', 'g-parts');
  private swatches = h('div', 'swatches');
  private decals = h('div', 'decals');
  private stats = h('div');
  private best = h('div', 'best');
  private statFills: HTMLElement[] = [];

  constructor(parent: HTMLElement, private on: GarageHandlers) {
    const top = h('div', 'g-top');
    const logo = h('div', 'logo');
    logo.innerHTML = 'MONSTER <b>TRUCK</b> FARM';
    const right = h('div');
    right.style.cssText = 'display:flex;gap:0.6rem;align-items:center';
    const pill = h('div', 'pill');
    pill.append(h('span', 'coin-ico'), this.coins);
    const gear = h('button', 'btn small', '⚙️');
    gear.title = 'Settings';
    gear.addEventListener('click', () => on.onSettings());
    right.append(pill, gear);
    top.append(logo, right);

    const side = h('div', 'g-side');
    const look = h('div', 'panel');
    look.append(h('h3', '', '🎨 Paint'), this.swatches, this.decals);
    const statPanel = h('div', 'panel');
    statPanel.append(this.stats, this.best);
    for (const ico of ['❤️', '💥', '🚀', '🔥']) {
      const row = h('div', 'stat'), bar = h('div', 'bar'), fill = h('i');
      bar.append(fill);
      row.append(h('span', '', ico), bar);
      this.stats.append(row);
      this.statFills.push(fill);
    }
    side.append(look, statPanel);

    const bottom = h('div', 'g-bottom');
    const go = h('button', 'btn green go', 'GO! ▶');
    go.addEventListener('click', () => on.onGo());
    bottom.append(go);
    this.root.append(top, this.parts, h('div'), side, bottom);
    parent.append(this.root);
  }

  show(v: boolean): void { this.root.classList.toggle('hidden', !v); }
  get visible(): boolean { return !this.root.classList.contains('hidden'); }

  render(save: Save): void {
    this.coins.textContent = save.coins.toLocaleString();
    this.parts.replaceChildren(...AXES.map((axis) => {
      const tier = save.owned[axis], next = nextTier(save, axis), cur = PARTS[axis][tier];
      const card = h('div', `part${canBuy(save, axis) ? ' can' : ''}`);
      const info = h('div');
      const pips = h('div', 'pips');
      for (let i = 0; i <= MAX_TIER; i++) pips.append(h('i', i <= tier ? 'on' : i === next && canBuy(save, axis) ? 'next' : ''));
      info.append(h('div', 'name', `${AXIS_LABEL[axis]}: ${cur.name}`), h('div', 'blurb', cur.blurb), pips);
      const btn = h('button', 'btn buy green');
      if (next === null) { btn.textContent = '⭐ MAX'; btn.disabled = true; } else {
        const cost = h('span', 'cost');
        cost.append(h('span', 'coin-ico'), document.createTextNode(String(PARTS[axis][next].cost)));
        btn.append(cost, h('span', 'up', `▲ ${PARTS[axis][next].name}`));
        btn.disabled = !canBuy(save, axis);
        btn.addEventListener('click', () => this.on.onBuy(axis));
      }
      card.addEventListener('pointerenter', () => this.on.onHover(axis));
      card.addEventListener('pointerleave', () => this.on.onHover(null));
      card.append(h('div', 'ico', AXIS_ICON[axis]), info, btn);
      return card;
    }));

    this.swatches.replaceChildren(...PAINTS.map((p, i) => {
      const s = h('button', `swatch${i === save.paint ? ' on' : ''}`);
      s.style.backgroundColor = `#${p.color.toString(16).padStart(6, '0')}`;
      s.title = p.name;
      s.addEventListener('click', () => this.on.onPaint(i));
      return s;
    }));
    this.decals.replaceChildren(...DECALS.map((d) => {
      const b = h('button', `btn small${d === save.decal ? ' on' : ''}`, DECAL_ICON[d]);
      b.title = d;
      b.addEventListener('click', () => this.on.onDecal(d));
      return b;
    }));
    const bars = statBars(save.equipped);
    [bars.toughness, bars.smash, bars.speed, bars.nitro].forEach((v, i) => { this.statFills[i].style.width = `${v * 100}%`; });
    this.best.replaceChildren(h('span', '', `🏆 Best ${save.best.toLocaleString()}`), h('span', '', save.bestMedal >= 0 ? MEDALS[save.bestMedal].icon : ''));
  }

  /** "NEW! Mega Crushers" banner after a purchase. */
  reveal(axis: Axis, tier: number): void {
    const r = h('div', 'reveal');
    r.append(h('div', 'a', `${AXIS_ICON[axis]} NEW ${AXIS_LABEL[axis].toUpperCase()}!`), h('div', 'b', PARTS[axis][tier].name));
    r.addEventListener('animationend', () => r.remove());
    this.root.append(r);
  }
}
