import type { GameStore } from '../core/game-state';
import type { TruckBuild } from '../core/types';
import { BODY_TIERS, ENGINE_TIERS, GAS_TIERS, WHEEL_TIERS } from '../core/stats/tiers';
import { owned, purchasable } from '../core/stats/ownership';

// DOM truck builder screen (issues #1-4, builder AC1/AC6; purchase flow
// backlog #14 / ADR 0006). Plain DOM overlay over the canvas, matching
// hud.ts's approach (ADR 0001 §3). Selection/purchase logic itself lives in
// GameStore (core/); this module only renders it and forwards input.
//
// Each tier button renders one of three visual states (ADR 0006 §5):
//  - equipped: currently selected/equipped on the build.
//  - owned-not-equipped: unlocked, but a different tier is equipped.
//  - locked: not yet owned; shows a lock icon and its coin cost. The tier
//    that's the axis's *next* sequential unlock (the only one purchasable
//    right now) additionally gets a gold "buy" highlight -- brighter/green
//    cost text if affordable, dimmer/red cost text if not.

type Axis = keyof TruckBuild;

interface AxisOption {
  tier: number;
  text: string;
  cost: number;
}

interface AxisRow {
  axis: Axis;
  label: string;
  options: AxisOption[];
}

const ROWS: AxisRow[] = [
  {
    axis: 'body',
    label: 'Body',
    options: BODY_TIERS.map((t) => ({ tier: t.tier, text: `Tier ${t.tier} — ${t.hitCapacity} hits`, cost: t.cost })),
  },
  {
    axis: 'wheels',
    label: 'Wheels',
    options: WHEEL_TIERS.map((t) => ({ tier: t.tier, text: `${t.name} — clears ${t.clearance}`, cost: t.cost })),
  },
  {
    axis: 'engine',
    label: 'Engine',
    options: ENGINE_TIERS.map((t) => ({ tier: t.tier, text: `${t.name} — top speed ${t.topSpeed}`, cost: t.cost })),
  },
  {
    axis: 'gasTank',
    label: 'Gas tank',
    options: GAS_TIERS.map((t) => ({ tier: t.tier, text: `${t.name} — ${t.capacity}s of drive`, cost: t.cost })),
  },
];

export function createBuilderScreen(container: HTMLElement, store: GameStore): { dispose: () => void } {
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.background = 'rgba(20, 30, 20, 0.85)';
  overlay.style.font = '18px sans-serif';
  overlay.style.color = '#fff';

  const panel = document.createElement('div');
  panel.style.background = 'rgba(0, 0, 0, 0.6)';
  panel.style.borderRadius = '16px';
  panel.style.padding = '24px 32px';
  panel.style.minWidth = '360px';

  const title = document.createElement('h1');
  title.textContent = '\u{1F69C} Build your monster truck';
  title.style.font = 'bold 24px sans-serif';
  title.style.margin = '0 0 16px 0';
  panel.appendChild(title);

  let focusedRow = 0;
  // Keyboard highlight cursor per row (ADR 0006 §5): the option index the
  // player has navigated to with Left/Right, independent of which tier is
  // actually equipped -- Space then acts on whichever option is highlighted.
  const rowEls: { row: AxisRow; optionButtons: HTMLButtonElement[]; highlighted: number }[] = [];

  for (const row of ROWS) {
    const rowEl = document.createElement('div');
    rowEl.style.marginBottom = '14px';

    const labelEl = document.createElement('div');
    labelEl.textContent = row.label;
    labelEl.style.font = 'bold 16px sans-serif';
    labelEl.style.marginBottom = '6px';
    rowEl.appendChild(labelEl);

    const optionsEl = document.createElement('div');
    optionsEl.style.display = 'flex';
    optionsEl.style.gap = '8px';
    optionsEl.style.flexWrap = 'wrap';

    const optionButtons: HTMLButtonElement[] = [];
    for (const option of row.options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.padding = '8px 12px';
      btn.style.borderRadius = '8px';
      btn.style.border = '2px solid transparent';
      btn.style.cursor = 'pointer';
      btn.style.font = '14px sans-serif';
      btn.addEventListener('click', () => {
        const rowIndex = ROWS.indexOf(row);
        const optionIndex = row.options.indexOf(option);
        actOnTier(rowIndex, optionIndex);
      });
      optionsEl.appendChild(btn);
      optionButtons.push(btn);
    }
    rowEl.appendChild(optionsEl);
    panel.appendChild(rowEl);
    rowEls.push({ row, optionButtons, highlighted: 0 });
  }

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.textContent = 'Confirm — start driving!';
  confirmBtn.style.marginTop = '10px';
  confirmBtn.style.padding = '10px 18px';
  confirmBtn.style.borderRadius = '10px';
  confirmBtn.style.border = 'none';
  confirmBtn.style.background = '#ffe27a';
  confirmBtn.style.color = '#222';
  confirmBtn.style.font = 'bold 16px sans-serif';
  confirmBtn.style.cursor = 'pointer';
  confirmBtn.addEventListener('click', () => store.beginDrive());
  panel.appendChild(confirmBtn);

  overlay.appendChild(panel);
  container.appendChild(overlay);

  // Equip the highlighted tier if owned; buy it if locked and purchasable;
  // gentle no-op (no coins deducted, nothing crashes) otherwise -- e.g. not
  // enough coins yet, or the axis's next-in-line tier isn't this one.
  function actOnTier(rowIndex: number, optionIndex: number) {
    const entry = rowEls[rowIndex];
    focusedRow = rowIndex;
    entry.highlighted = optionIndex;
    const tier = entry.row.options[optionIndex].tier;
    if (owned(store.ownership, entry.row.axis, tier)) {
      store.selectTier(entry.row.axis, tier);
    } else {
      store.purchaseTier(entry.row.axis, tier);
    }
    render();
  }

  function render() {
    const build = store.build;
    const ownership = store.ownership;
    const coins = store.coins;

    for (const entry of rowEls) {
      const { row, optionButtons } = entry;
      // The one tier per axis that's actually purchasable right now (the
      // next rung of the sequential ladder) gets the buy-affordance styling.
      const nextTier = row.options.find((o) => !owned(ownership, row.axis, o.tier) && owned(ownership, row.axis, o.tier - 1));

      optionButtons.forEach((btn, index) => {
        const option = row.options[index];
        const isOwned = owned(ownership, row.axis, option.tier);
        const isEquipped = isOwned && build[row.axis] === option.tier;
        const isNextUnlockable = nextTier?.tier === option.tier;
        const canAfford = isNextUnlockable && purchasable(ownership, row.axis, option.tier, coins, option.cost);

        if (isEquipped) {
          btn.textContent = `✅ ${option.text}`;
          btn.style.background = '#4caf7d';
          btn.style.color = '#fff';
          btn.style.opacity = '1';
        } else if (isOwned) {
          btn.textContent = option.text;
          btn.style.background = 'rgba(255, 255, 255, 0.3)';
          btn.style.color = '#fff';
          btn.style.opacity = '1';
        } else {
          const costColor = !isNextUnlockable ? '#999' : canAfford ? '#8be08b' : '#ff8a8a';
          btn.innerHTML = `\u{1F512} ${option.text} <span style="color:${costColor}">— ${option.cost}\u{1FA99}</span>`;
          btn.style.background = isNextUnlockable ? 'rgba(255, 226, 122, 0.18)' : 'rgba(255, 255, 255, 0.08)';
          btn.style.color = '#bbb';
          btn.style.opacity = isNextUnlockable ? '1' : '0.6';
        }

        btn.style.borderColor = focusedRow === ROWS.indexOf(row) && entry.highlighted === index ? '#ffe27a' : 'transparent';
      });
    }
    overlay.style.display = store.screen === 'BUILDER' ? 'flex' : 'none';

    // Contextual label (ADR 0009 §6): a voluntary mid-run pause reads
    // "Resume driving!" instead of the fresh-build "Confirm — start
    // driving!" -- the same button, routed by beginDrive() above.
    confirmBtn.textContent = store.pausedMidRun ? 'Resume driving!' : 'Confirm — start driving!';
  }
  render();

  // Keyboard-only operability (builder constraint, ADR 0006 §5): Up/Down
  // move between categories; Left/Right move a highlight cursor across the
  // focused category's tiers (owned or locked, without acting on them);
  // Space acts on the highlighted tier (equip if owned, buy if locked and
  // affordable, gentle no-op otherwise); Enter stays the distinct
  // "start driving" confirm control.
  function onKeyDown(e: KeyboardEvent) {
    if (store.screen !== 'BUILDER') return;
    const entry = rowEls[focusedRow];

    switch (e.code) {
      case 'ArrowUp':
        focusedRow = (focusedRow - 1 + rowEls.length) % rowEls.length;
        render();
        break;
      case 'ArrowDown':
        focusedRow = (focusedRow + 1) % rowEls.length;
        render();
        break;
      case 'ArrowLeft':
        entry.highlighted = Math.max(0, entry.highlighted - 1);
        render();
        break;
      case 'ArrowRight':
        entry.highlighted = Math.min(entry.row.options.length - 1, entry.highlighted + 1);
        render();
        break;
      case 'Space':
        actOnTier(focusedRow, entry.highlighted);
        break;
      case 'Enter':
        store.beginDrive();
        break;
      default:
        return;
    }
    e.preventDefault();
  }
  window.addEventListener('keydown', onKeyDown);

  const unsubscribe = store.subscribe(render);

  return {
    dispose() {
      unsubscribe();
      window.removeEventListener('keydown', onKeyDown);
      container.removeChild(overlay);
    },
  };
}
