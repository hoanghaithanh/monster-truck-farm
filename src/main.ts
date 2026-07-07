import { createHelloWorldScene } from './render/scene';
import { initPhysics } from './physics/world';
import { nextScreen } from './core/game-state';

// Phase 2 (devops) bootstrap: proves Vite + TypeScript + Three.js + Rapier
// build, init, and render together, and that the core/ <-> physics/ <->
// render/ wiring point (systems/, in the full design) is reachable. No
// gameplay yet — that starts with the Sprint 1 stories.

async function main() {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app root element missing');

  // Prove the core/ pure-logic seam is wired up and usable from the bootstrap.
  console.info('[core] screen FSM sample transition:', nextScreen('BUILDER', 'confirm'));

  // Kick off Rapier's async WASM init early (ADR 0001 risk mitigation: do
  // this during the builder screen so physics is ready before DRIVING).
  await initPhysics();
  console.info('[physics] Rapier world initialized');

  const { tick } = createHelloWorldScene(app);
  let last = performance.now();
  function frame(now: number) {
    const dt = (now - last) / 1000;
    last = now;
    tick(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error('Failed to start Monster Truck Farm', err);
});
