import type { GameStore } from '../core/game-state';

// DOM game-over overlay (farmer AC6/AC7): a simple, friendly "let's build a
// new truck!" beat -- no scary/violent framing, matching hud.ts/builder.ts's
// existing DOM-over-canvas style (ADR 0001 §3). Confirming here calls
// store.restart(), which the screen FSM turns into GAME_OVER -> BUILDER,
// resetting coins and keeping the prior build selection (builder AC7).
export function createGameOverScreen(container: HTMLElement, store: GameStore): { dispose: () => void } {
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.display = 'none';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.background = 'rgba(20, 30, 20, 0.85)';
  overlay.style.font = '18px sans-serif';
  overlay.style.color = '#fff';

  const panel = document.createElement('div');
  panel.style.background = 'rgba(0, 0, 0, 0.6)';
  panel.style.borderRadius = '16px';
  panel.style.padding = '32px 40px';
  panel.style.textAlign = 'center';

  const title = document.createElement('h1');
  title.textContent = '\u{1F69C} Oops! Let’s build a new truck!';
  title.style.font = 'bold 24px sans-serif';
  title.style.margin = '0 0 16px 0';
  panel.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.textContent = 'The farmer caught up with you. Time to try again!';
  subtitle.style.margin = '0 0 20px 0';
  panel.appendChild(subtitle);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Build a new truck!';
  button.style.padding = '10px 18px';
  button.style.borderRadius = '10px';
  button.style.border = 'none';
  button.style.background = '#ffe27a';
  button.style.color = '#222';
  button.style.font = 'bold 16px sans-serif';
  button.style.cursor = 'pointer';
  button.addEventListener('click', () => store.restart());
  panel.appendChild(button);

  overlay.appendChild(panel);
  container.appendChild(overlay);

  function render() {
    overlay.style.display = store.screen === 'GAME_OVER' ? 'flex' : 'none';
  }
  render();

  // Keyboard-only operability, matching builder.ts: Enter/Space restarts.
  function onKeyDown(e: KeyboardEvent) {
    if (store.screen !== 'GAME_OVER') return;
    if (e.code === 'Enter' || e.code === 'Space') {
      store.restart();
      e.preventDefault();
    }
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
