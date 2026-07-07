import type { GameStore } from '../core/game-state';

// DOM HUD overlay per ADR 0001 §3: plain DOM over the canvas, not in-canvas
// UI. This pass only shows the coin count (animal AC6); gas gauge and
// hit-icon row are added by later passes.
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
  container.appendChild(el);

  function render() {
    el.textContent = `\u{1FA99} ${store.coins}`;
  }
  render();

  const unsubscribe = store.subscribe(render);

  return {
    dispose() {
      unsubscribe();
      container.removeChild(el);
    },
  };
}
