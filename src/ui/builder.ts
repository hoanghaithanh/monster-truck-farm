import * as THREE from 'three';
import type { GameStore } from '../core/game-state';
import type { TruckBuild, TruckCosmetics } from '../core/types';
import { BODY_TIERS, ENGINE_TIERS, GAS_TIERS, WHEEL_TIERS } from '../core/stats/tiers';
import { owned, purchasable } from '../core/stats/ownership';
import type { AssetRegistry } from '../render/assets/asset-registry';
import { buildTruckRig, type TruckRigResult } from '../render/truck-rig';
import { WHEEL_LOOK_OPTIONS, type CosmeticOption } from '../render/cosmetics/cosmetic-manifest';

// DOM truck builder screen (issues #1-4, builder AC1/AC6; purchase flow
// backlog #14 / ADR 0006; live 3D preview + cosmetics section, ADR 0011
// §5/§6, issues #27/#30). Plain DOM overlay over the canvas, matching
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
//
// Cosmetic rows (ADR 0011 §6, cosmetics AC2/AC5/AC6) render in their own
// visually distinct section below the four functional rows -- own heading,
// own panel styling, never interleaved row-by-row with body/wheels/engine/
// gas-tank -- and are freely selectable (no owned/locked state at all,
// unlike the functional rows above).

type Axis = keyof TruckBuild;
type CosmeticPart = keyof TruckCosmetics;

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

interface CosmeticRow {
  part: CosmeticPart;
  label: string;
  options: CosmeticOption[];
}

// Body design was removed post-ship (issue #41, direct human decision -- see
// cosmetic-manifest.ts's header): "Wheel look" is now the only surviving
// cosmetic axis.
const COSMETIC_ROWS: CosmeticRow[] = [
  { part: 'wheelLook', label: 'Wheel look', options: WHEEL_LOOK_OPTIONS },
];

// Live 3D preview panel sizing (ADR 0011 §5) -- small and fixed, not a full
// game viewport; the builder's own tiny renderer/camera, separate from the
// driving scene's.
const PREVIEW_SIZE_PX = 220;
// "A slow idle spin ... not a full rAF loop" (ADR 0011 Risks) -- a low-rate
// interval, not requestAnimationFrame, keeps this cheap on a weak device.
const PREVIEW_TICK_MS = 100;
const PREVIEW_SPIN_RADIANS_PER_TICK = 0.02;

export function createBuilderScreen(
  container: HTMLElement,
  store: GameStore,
  assetRegistry?: AssetRegistry,
): { dispose: () => void } {
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.background = 'rgba(20, 30, 20, 0.85)';
  overlay.style.font = '18px sans-serif';
  overlay.style.color = '#fff';
  overlay.style.overflowY = 'auto';

  const panel = document.createElement('div');
  panel.style.background = 'rgba(0, 0, 0, 0.6)';
  panel.style.borderRadius = '16px';
  panel.style.padding = '24px 32px';
  panel.style.minWidth = '360px';
  panel.style.display = 'flex';
  panel.style.gap = '24px';
  panel.style.flexWrap = 'wrap';

  // Left column: title + functional tier rows + cosmetics section + confirm.
  const leftColumn = document.createElement('div');
  leftColumn.style.flex = '1 1 320px';

  const title = document.createElement('h1');
  title.textContent = '\u{1F69C} Build your monster truck';
  title.style.font = 'bold 24px sans-serif';
  title.style.margin = '0 0 16px 0';
  leftColumn.appendChild(title);

  // ---------------------------------------------------------------------
  // Right column: live 3D preview (ADR 0011 §5, AC4/cosmetics AC8) -- the
  // exact same buildTruckRig(...) assembly the driving scene uses, so what
  // a player sees here can never mismatch what they drive.
  // ---------------------------------------------------------------------
  const rightColumn = document.createElement('div');
  rightColumn.style.flex = '0 0 auto';
  rightColumn.style.display = 'flex';
  rightColumn.style.flexDirection = 'column';
  rightColumn.style.alignItems = 'center';
  rightColumn.style.gap = '8px';

  const previewLabel = document.createElement('div');
  previewLabel.textContent = 'Your truck';
  previewLabel.style.font = 'bold 14px sans-serif';
  previewLabel.style.opacity = '0.85';
  rightColumn.appendChild(previewLabel);

  const previewHost = document.createElement('div');
  previewHost.style.width = `${PREVIEW_SIZE_PX}px`;
  previewHost.style.height = `${PREVIEW_SIZE_PX}px`;
  previewHost.style.borderRadius = '12px';
  previewHost.style.overflow = 'hidden';
  previewHost.style.background = 'linear-gradient(180deg, #8fd3ff 0%, #bfeecb 100%)';
  rightColumn.appendChild(previewHost);

  // A small, self-contained renderer -- deliberately separate from the
  // driving scene's (ADR 0011 §5: "its own tiny renderer + camera"). Sized
  // once; the builder overlay's own dimensions are fixed, so no resize
  // listener is needed (unlike scene.ts's full-viewport renderer).
  const previewScene = new THREE.Scene();
  const previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 20);
  previewCamera.position.set(2.4, 1.8, 3.2);
  previewCamera.lookAt(0, 0.5, 0);
  const previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  previewRenderer.setSize(PREVIEW_SIZE_PX, PREVIEW_SIZE_PX);
  previewHost.appendChild(previewRenderer.domElement);

  previewScene.add(new THREE.DirectionalLight(0xffffff, 1.3).translateX(3).translateY(4).translateZ(2));
  previewScene.add(new THREE.AmbientLight(0x404040, 1.8));

  let previewRig: TruckRigResult = buildTruckRig(store.build, store.cosmetics, assetRegistry);
  previewScene.add(previewRig.group);

  // Last-seen build/cosmetics the preview rig was actually built from (issue
  // #34 perf fix): render() is invoked from every keyboard nav event
  // (ArrowUp/Down/Left/Right), not just from an actual tier/cosmetic change,
  // so without this the full dispose+buildTruckRig cost was paid on every
  // keystroke. Both TruckBuild and TruckCosmetics are small flat objects of
  // primitives, so a shallow field-by-field comparison is enough -- no need
  // for a deep-equal library.
  let lastBuild: TruckBuild = { ...store.build };
  let lastCosmetics: TruckCosmetics = { ...store.cosmetics };

  function buildsEqual(a: TruckBuild, b: TruckBuild): boolean {
    return a.body === b.body && a.wheels === b.wheels && a.engine === b.engine && a.gasTank === b.gasTank;
  }

  function cosmeticsEqual(a: TruckCosmetics, b: TruckCosmetics): boolean {
    return a.wheelLook === b.wheelLook;
  }

  /** Rebuilds the preview rig from the *current* store state -- the single assembly path shared with scene.ts's driving-scene truck (ADR 0011 §5). Called whenever render() detects an actual build/cosmetics change, and unconditionally from previewInterval's own opportunistic asset-upgrade check -- never blocking first paint since buildTruckRig always returns *something* (primitive fallback if assets aren't ready yet, per ADR 0010 §7/vehicle-art AC11/AC13). */
  function rebuildPreview(): void {
    const rebuilt = buildTruckRig(store.build, store.cosmetics, assetRegistry);
    rebuilt.group.rotation.y = previewRig.group.rotation.y; // keep the idle spin continuous across a rebuild
    previewScene.remove(previewRig.group);
    previewRig.dispose();
    previewRig = rebuilt;
    previewScene.add(previewRig.group);
    lastBuild = { ...store.build };
    lastCosmetics = { ...store.cosmetics };
  }

  const previewInterval = setInterval(() => {
    if (store.screen !== 'BUILDER') return; // overlay hidden -- no point spending the tick
    // Opportunistic upgrade-in-place (ADR 0010 §4/§7): if the preview is
    // still showing a primitive fallback for some part (asset still
    // loading when the builder mounted), retry once assets are ready --
    // independent of any store change, since asset readiness doesn't itself
    // emit a GameStore event.
    if (!previewRig.allAssetsReady) rebuildPreview();
    previewRig.group.rotation.y += PREVIEW_SPIN_RADIANS_PER_TICK;
    previewRenderer.render(previewScene, previewCamera);
  }, PREVIEW_TICK_MS);

  panel.appendChild(leftColumn);
  panel.appendChild(rightColumn);

  let focusedRow = 0;
  // Keyboard highlight cursor per row (ADR 0006 §5): the option index the
  // player has navigated to with Left/Right, independent of which tier is
  // actually equipped -- Space then acts on whichever option is highlighted.
  // A single flat nav list spans BOTH the functional tier rows and the
  // cosmetic rows below them (ADR 0011 §6: reuse the existing Up/Down/
  // Left/Right/Space scheme -- the cosmetic rows are just additional
  // focusable rows), even though they render in visually distinct sections.
  interface TierRowEntry {
    kind: 'tier';
    row: AxisRow;
    optionButtons: HTMLButtonElement[];
    highlighted: number;
  }
  interface CosmeticRowEntry {
    kind: 'cosmetic';
    row: CosmeticRow;
    optionButtons: HTMLButtonElement[];
    highlighted: number;
  }
  const navRows: (TierRowEntry | CosmeticRowEntry)[] = [];

  const tierSection = document.createElement('div');
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
    const entry: TierRowEntry = { kind: 'tier', row, optionButtons, highlighted: 0 };
    for (const option of row.options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.padding = '8px 12px';
      btn.style.borderRadius = '8px';
      btn.style.border = '2px solid transparent';
      btn.style.cursor = 'pointer';
      btn.style.font = '14px sans-serif';
      btn.addEventListener('click', () => {
        const rowIndex = navRows.indexOf(entry);
        const optionIndex = row.options.indexOf(option);
        actOnTier(rowIndex, optionIndex);
      });
      optionsEl.appendChild(btn);
      optionButtons.push(btn);
    }
    rowEl.appendChild(optionsEl);
    tierSection.appendChild(rowEl);
    navRows.push(entry);
  }
  leftColumn.appendChild(tierSection);

  // ---------------------------------------------------------------------
  // Cosmetics section (ADR 0011 §6, cosmetics AC2): its own heading and its
  // own visually distinct panel (a subtly different background/border),
  // never interleaved row-by-row with the functional rows above -- so a
  // child can't confuse "how it looks" with "what it does".
  // ---------------------------------------------------------------------
  const cosmeticsSection = document.createElement('div');
  cosmeticsSection.style.marginTop = '8px';
  cosmeticsSection.style.padding = '14px 16px';
  cosmeticsSection.style.borderRadius = '12px';
  cosmeticsSection.style.background = 'rgba(255, 226, 122, 0.12)';
  cosmeticsSection.style.border = '1px solid rgba(255, 226, 122, 0.35)';

  // Body color and body design were both removed post-ship (direct human
  // decisions), leaving "Wheel look" as the only surviving cosmetic axis --
  // heading/copy simplified to match a single picker (issue #41, not gated,
  // just a UX pass while we're here).
  const cosmeticsTitle = document.createElement('h2');
  cosmeticsTitle.textContent = '\u{1F3A8} Wheel style';
  cosmeticsTitle.style.font = 'bold 18px sans-serif';
  cosmeticsTitle.style.margin = '0 0 4px 0';
  cosmeticsSection.appendChild(cosmeticsTitle);

  const cosmeticsSubtitle = document.createElement('div');
  cosmeticsSubtitle.textContent = 'Just for looks -- pick any wheel style, any time. No cost, no stats.';
  cosmeticsSubtitle.style.font = '13px sans-serif';
  cosmeticsSubtitle.style.opacity = '0.75';
  cosmeticsSubtitle.style.marginBottom = '10px';
  cosmeticsSection.appendChild(cosmeticsSubtitle);

  for (const row of COSMETIC_ROWS) {
    const rowEl = document.createElement('div');
    rowEl.style.marginBottom = '12px';

    const labelEl = document.createElement('div');
    labelEl.textContent = row.label;
    labelEl.style.font = 'bold 15px sans-serif';
    labelEl.style.marginBottom = '6px';
    rowEl.appendChild(labelEl);

    const optionsEl = document.createElement('div');
    optionsEl.style.display = 'flex';
    optionsEl.style.gap = '8px';
    optionsEl.style.flexWrap = 'wrap';

    const optionButtons: HTMLButtonElement[] = [];
    const entry: CosmeticRowEntry = { kind: 'cosmetic', row, optionButtons, highlighted: 0 };
    for (const option of row.options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = option.label;
      btn.style.padding = '8px 12px';
      btn.style.borderRadius = '8px';
      btn.style.border = '2px solid transparent';
      btn.style.cursor = 'pointer';
      btn.style.font = '14px sans-serif';
      btn.addEventListener('click', () => {
        const rowIndex = navRows.indexOf(entry);
        const optionIndex = row.options.indexOf(option);
        actOnCosmetic(rowIndex, optionIndex);
      });
      optionsEl.appendChild(btn);
      optionButtons.push(btn);
    }
    rowEl.appendChild(optionsEl);
    cosmeticsSection.appendChild(rowEl);
    navRows.push(entry);
  }
  leftColumn.appendChild(cosmeticsSection);

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.textContent = 'Confirm — start driving!';
  confirmBtn.style.marginTop = '14px';
  confirmBtn.style.padding = '10px 18px';
  confirmBtn.style.borderRadius = '10px';
  confirmBtn.style.border = 'none';
  confirmBtn.style.background = '#ffe27a';
  confirmBtn.style.color = '#222';
  confirmBtn.style.font = 'bold 16px sans-serif';
  confirmBtn.style.cursor = 'pointer';
  confirmBtn.addEventListener('click', () => store.beginDrive());
  leftColumn.appendChild(confirmBtn);

  overlay.appendChild(panel);
  container.appendChild(overlay);

  // Equip the highlighted tier if owned; buy it if locked and purchasable;
  // gentle no-op (no coins deducted, nothing crashes) otherwise -- e.g. not
  // enough coins yet, or the axis's next-in-line tier isn't this one.
  function actOnTier(rowIndex: number, optionIndex: number) {
    const entry = navRows[rowIndex];
    if (entry.kind !== 'tier') return;
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

  /** Always applies -- no ownership/coin gate for cosmetics (ADR 0011 §6, cosmetics AC5/AC6). */
  function actOnCosmetic(rowIndex: number, optionIndex: number) {
    const entry = navRows[rowIndex];
    if (entry.kind !== 'cosmetic') return;
    focusedRow = rowIndex;
    entry.highlighted = optionIndex;
    store.selectCosmetic(entry.row.part, entry.row.options[optionIndex].id);
    render();
  }

  function render() {
    // Only pay the dispose+rebuild cost when build/cosmetics actually
    // changed (issue #34) -- render() also fires on pure cursor-navigation
    // keypresses and on unrelated store emits (coins, ownership, etc.),
    // none of which should tear down and reassemble the rig.
    if (!buildsEqual(lastBuild, store.build) || !cosmeticsEqual(lastCosmetics, store.cosmetics)) {
      rebuildPreview();
    }

    const build = store.build;
    const ownership = store.ownership;
    const coins = store.coins;
    const cosmetics = store.cosmetics;

    for (const entry of navRows) {
      if (entry.kind === 'tier') {
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

          btn.style.borderColor = focusedRow === navRows.indexOf(entry) && entry.highlighted === index ? '#ffe27a' : 'transparent';
        });
      } else {
        const { row, optionButtons } = entry;
        optionButtons.forEach((btn, index) => {
          const option = row.options[index];
          const isSelected = cosmetics[row.part] === option.id;
          btn.style.background = isSelected ? '#ffe27a' : 'rgba(255, 255, 255, 0.15)';
          btn.style.color = isSelected ? '#222' : '#fff';
          btn.style.fontWeight = isSelected ? 'bold' : 'normal';
          btn.style.borderColor = focusedRow === navRows.indexOf(entry) && entry.highlighted === index ? '#fff' : 'transparent';
        });
      }
    }
    overlay.style.display = store.screen === 'BUILDER' ? 'flex' : 'none';

    // Contextual label (ADR 0009 §6): a voluntary mid-run pause reads
    // "Resume driving!" instead of the fresh-build "Confirm — start
    // driving!" -- the same button, routed by beginDrive() above.
    confirmBtn.textContent = store.pausedMidRun ? 'Resume driving!' : 'Confirm — start driving!';
  }
  render();

  // Keyboard-only operability (builder constraint, ADR 0006 §5; cosmetics
  // AC3): Up/Down move between rows -- functional tiers AND cosmetic rows
  // share this one flat list; Left/Right move a highlight cursor across the
  // focused row's options (owned or locked, without acting on them); Space
  // acts on the highlighted option (tier row: equip if owned, buy if locked
  // and affordable, gentle no-op otherwise; cosmetic row: always applies);
  // Enter stays the distinct "start driving" confirm control.
  function onKeyDown(e: KeyboardEvent) {
    if (store.screen !== 'BUILDER') return;
    const entry = navRows[focusedRow];

    switch (e.code) {
      case 'ArrowUp':
        focusedRow = (focusedRow - 1 + navRows.length) % navRows.length;
        render();
        break;
      case 'ArrowDown':
        focusedRow = (focusedRow + 1) % navRows.length;
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
        if (entry.kind === 'tier') actOnTier(focusedRow, entry.highlighted);
        else actOnCosmetic(focusedRow, entry.highlighted);
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
      clearInterval(previewInterval);
      previewRig.dispose();
      previewRenderer.dispose();
      container.removeChild(overlay);
    },
  };
}
