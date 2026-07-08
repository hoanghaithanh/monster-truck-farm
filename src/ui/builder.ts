import type { GameStore } from '../core/game-state';
import type { TruckBuild } from '../core/types';
import { BODY_TIERS, ENGINE_TIERS, GAS_TIERS, WHEEL_TIERS } from '../core/stats/tiers';

// DOM truck builder screen (issues #1-4, builder AC1/AC6): plain DOM overlay
// over the canvas, matching hud.ts's approach (ADR 0001 §3). All four axes
// are freely selectable this sprint -- no coin gating (Sprint 2, deferred).
// Selection/screen-transition logic itself lives in GameStore (core/); this
// module only renders it and forwards input.

type Axis = keyof TruckBuild;

interface AxisOption {
  tier: number;
  text: string;
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
    options: BODY_TIERS.map((t) => ({ tier: t.tier, text: `Tier ${t.tier} — ${t.hitCapacity} hits` })),
  },
  {
    axis: 'wheels',
    label: 'Wheels',
    options: WHEEL_TIERS.map((t) => ({ tier: t.tier, text: `${t.name} — clears ${t.clearance}` })),
  },
  {
    axis: 'engine',
    label: 'Engine',
    options: ENGINE_TIERS.map((t) => ({ tier: t.tier, text: `${t.name} — top speed ${t.topSpeed}` })),
  },
  {
    axis: 'gasTank',
    label: 'Gas tank',
    options: GAS_TIERS.map((t) => ({ tier: t.tier, text: `${t.name} — ${t.capacity}s of drive` })),
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
  const rowEls: { row: AxisRow; optionButtons: HTMLButtonElement[] }[] = [];

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
      btn.textContent = option.text;
      btn.style.padding = '8px 12px';
      btn.style.borderRadius = '8px';
      btn.style.border = '2px solid transparent';
      btn.style.cursor = 'pointer';
      btn.style.font = '14px sans-serif';
      btn.addEventListener('click', () => {
        focusedRow = ROWS.indexOf(row);
        store.selectTier(row.axis, option.tier);
      });
      optionsEl.appendChild(btn);
      optionButtons.push(btn);
    }
    rowEl.appendChild(optionsEl);
    panel.appendChild(rowEl);
    rowEls.push({ row, optionButtons });
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
  confirmBtn.addEventListener('click', () => store.confirmBuild());
  panel.appendChild(confirmBtn);

  overlay.appendChild(panel);
  container.appendChild(overlay);

  function render() {
    const build = store.build;
    for (const { row, optionButtons } of rowEls) {
      const selectedTier = build[row.axis];
      optionButtons.forEach((btn, index) => {
        const isSelected = row.options[index].tier === selectedTier;
        btn.style.background = isSelected ? '#4caf7d' : 'rgba(255, 255, 255, 0.15)';
        btn.style.color = isSelected ? '#fff' : '#eee';
      });
    }
    rowEls.forEach(({ optionButtons }, index) => {
      optionButtons.forEach((btn) => {
        btn.style.borderColor = index === focusedRow ? '#ffe27a' : 'transparent';
      });
    });
    overlay.style.display = store.screen === 'BUILDER' ? 'flex' : 'none';
  }
  render();

  // Keyboard-only operability (builder constraint): Up/Down move between
  // categories, Left/Right cycle the focused category's tier, Enter confirms.
  function onKeyDown(e: KeyboardEvent) {
    if (store.screen !== 'BUILDER') return;
    const { row } = rowEls[focusedRow];
    const build = store.build;
    const currentIndex = row.options.findIndex((o) => o.tier === build[row.axis]);

    switch (e.code) {
      case 'ArrowUp':
        focusedRow = (focusedRow - 1 + rowEls.length) % rowEls.length;
        render();
        break;
      case 'ArrowDown':
        focusedRow = (focusedRow + 1) % rowEls.length;
        render();
        break;
      case 'ArrowLeft': {
        const nextIndex = Math.max(0, currentIndex - 1);
        store.selectTier(row.axis, row.options[nextIndex].tier);
        break;
      }
      case 'ArrowRight': {
        const nextIndex = Math.min(row.options.length - 1, currentIndex + 1);
        store.selectTier(row.axis, row.options[nextIndex].tier);
        break;
      }
      case 'Enter':
      case 'Space':
        store.confirmBuild();
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
