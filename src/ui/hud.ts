import type { GameStore } from '../core/game-state';

// DOM HUD overlay per ADR 0001 §3: plain DOM over the canvas, not in-canvas
// UI. Coin count (animal AC6), a gas gauge (drive AC10/AC12/AC14 -- readable
// at a glance, no numbers required) and a hit-icon row (farmer AC4 -- icons,
// not numbers, so a child understands the stat without reading digits).
export function createHud(container: HTMLElement, store: GameStore): { dispose: () => void } {
  const el = document.createElement('div');
  el.style.position = 'absolute';
  el.style.top = '12px';
  el.style.left = '12px';
  el.style.padding = '6px 14px';
  el.style.borderRadius = '8px';
  el.style.background = 'rgba(0, 0, 0, 0.45)';
  el.style.color = '#ffe27a';
  el.style.font = 'bold 20px sans-serif';
  el.style.pointerEvents = 'none';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '4px';
  container.appendChild(el);

  const coinsRow = document.createElement('div');
  el.appendChild(coinsRow);

  // Gas gauge (drive AC14: never a "game over", just a readable fill bar).
  const gasTrack = document.createElement('div');
  gasTrack.style.width = '140px';
  gasTrack.style.height = '10px';
  gasTrack.style.borderRadius = '5px';
  gasTrack.style.background = 'rgba(255, 255, 255, 0.25)';
  gasTrack.style.overflow = 'hidden';
  const gasFill = document.createElement('div');
  gasFill.style.height = '100%';
  gasFill.style.background = '#5ec9ff';
  gasFill.style.transition = 'width 0.1s linear';
  gasTrack.appendChild(gasFill);
  el.appendChild(gasTrack);

  // Hit-icon row (farmer AC4/AC5): full heart per remaining hit, dim heart per spent one.
  const hitsRow = document.createElement('div');
  hitsRow.style.font = '18px sans-serif';
  hitsRow.style.letterSpacing = '2px';
  el.appendChild(hitsRow);

  // Pause/shop button (ADR 0009 §6, human decision 1): top-right, kept apart
  // from the top-left stat readout above. The HUD root is `pointerEvents:
  // 'none'` so it doesn't steal canvas input; this button opts back in with
  // its own `pointerEvents: 'auto'`. Button only -- no keyboard shortcut.
  const pauseBtn = document.createElement('button');
  pauseBtn.type = 'button';
  pauseBtn.textContent = '\u{1F6D2} Shop';
  pauseBtn.style.position = 'absolute';
  pauseBtn.style.top = '12px';
  pauseBtn.style.right = '12px';
  pauseBtn.style.padding = '8px 14px';
  pauseBtn.style.borderRadius = '8px';
  pauseBtn.style.border = 'none';
  pauseBtn.style.background = '#ffe27a';
  pauseBtn.style.color = '#222';
  pauseBtn.style.font = 'bold 16px sans-serif';
  pauseBtn.style.cursor = 'pointer';
  pauseBtn.style.pointerEvents = 'auto';
  pauseBtn.addEventListener('click', () => store.pauseToBuilder());
  container.appendChild(pauseBtn);

  function render() {
    coinsRow.textContent = `\u{1FA99} ${store.coins}`;

    const spec = store.spec;
    const drivingScreen = store.screen === 'DRIVING';
    gasTrack.style.display = drivingScreen && spec ? 'block' : 'none';
    hitsRow.style.display = drivingScreen && spec ? 'block' : 'none';
    pauseBtn.style.display = drivingScreen ? 'block' : 'none';
    if (drivingScreen && spec) {
      const gasFraction = spec.gasCapacity > 0 ? store.gas / spec.gasCapacity : 0;
      gasFill.style.width = `${Math.max(0, Math.min(100, gasFraction * 100))}%`;
      hitsRow.textContent = '❤️'.repeat(store.hitsRemaining) + '\u{1F5A4}'.repeat(spec.hitCapacity - store.hitsRemaining);
    }
  }
  render();

  const unsubscribe = store.subscribe(render);

  return {
    dispose() {
      unsubscribe();
      container.removeChild(el);
      container.removeChild(pauseBtn);
    },
  };
}
