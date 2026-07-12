import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameStore } from '../core/game-state';

// createBuilderScreen (issue #45, closing the zero-coverage gap flagged by
// code-reviewer while reviewing 62e3bed / issue #34's preview-rebuild perf
// fix) needs real DOM-shaped objects (document.createElement, window
// keydown listeners, button click listeners) to exercise -- unlike
// scene.test.ts (whose header comment this issue points at), which sidesteps
// the "no jsdom in this plain-Node vitest environment" constraint by testing
// exported *pure* helpers (`carryOverWheelRotations`,
// `buildChickenDisplayModel`, ...) instead of the WebGLRenderer-owning
// `createGameScene` itself. `createBuilderScreen` has no such pure-function
// escape hatch: the behavior under test (issue #34's `buildsEqual`/
// `cosmeticsEqual` rebuild gating) is reachable only by driving the real
// keyboard/click event flow through the whole closure. This project has no
// jsdom/happy-dom dependency (vitest.config.ts: `environment: 'node'`), so
// rather than adding one, this file hand-rolls the minimal fake
// `document`/`window` the module actually touches (createElement, style/
// textContent/innerHTML assignment, appendChild/removeChild,
// addEventListener/removeEventListener) via `vi.stubGlobal` -- enough surface
// for `createBuilderScreen` to run without throwing, nothing more.
//
// `THREE.WebGLRenderer` is the other non-Node-safe piece (needs a browser
// canvas/GL context to construct) -- `vi.mock('three', ...)` swaps in a
// no-op stand-in for just that one export, keeping every other THREE class
// (Scene, PerspectiveCamera, Group, Mesh, ...) real, the same way
// `buildTruckRig` already runs happily in `truck-rig.test.ts`/
// `scene.test.ts` without a real GL context.
//
// `buildTruckRig` itself is wrapped (not replaced) so these tests exercise
// the *real* production rebuild path end to end, only adding call-counting
// so the issue #34 gating assertions ("keyboard nav alone must not rebuild;
// a real tier/cosmetic change must rebuild exactly once") can be made
// concrete instead of relying on a manual trace.

const { buildTruckRigSpy, disposeSpy } = vi.hoisted(() => ({
  buildTruckRigSpy: vi.fn(),
  disposeSpy: vi.fn(),
}));

vi.mock('../render/truck-rig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/truck-rig')>();
  return {
    ...actual,
    buildTruckRig: (...args: Parameters<typeof actual.buildTruckRig>) => {
      buildTruckRigSpy(...args);
      const rig = actual.buildTruckRig(...args);
      const originalDispose = rig.dispose;
      rig.dispose = () => {
        disposeSpy();
        originalDispose();
      };
      return rig;
    },
  };
});

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeWebGLRenderer {
    domElement = new FakeElement('canvas');
    setSize(): void {}
    render(): void {}
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

// ---------------------------------------------------------------------
// Minimal fake DOM -- only the surface createBuilderScreen/builder.ts's
// helpers actually touch (see file-header comment above).
// ---------------------------------------------------------------------
class FakeElement {
  tagName: string;
  style: Record<string, string> = {};
  children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  textContent = '';
  innerHTML = '';
  type = '';
  private listeners = new Map<string, Array<(e: unknown) => void>>();

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  addEventListener(type: string, fn: (e: unknown) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }

  removeEventListener(type: string, fn: (e: unknown) => void): void {
    const arr = this.listeners.get(type);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: FakeElement): FakeElement {
    const idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
    return child;
  }

  /** Test helper -- simulates a real click event dispatch. */
  click(): void {
    for (const fn of this.listeners.get('click') ?? []) fn({});
  }
}

class FakeWindow {
  private listeners = new Map<string, Array<(e: unknown) => void>>();

  addEventListener(type: string, fn: (e: unknown) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }

  removeEventListener(type: string, fn: (e: unknown) => void): void {
    const arr = this.listeners.get(type);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  }

  /** Test helper -- simulates dispatching a keydown (or any) event. */
  dispatch(type: string, event: unknown): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
  }
}

function fakeKeyEvent(code: string) {
  return { code, preventDefault: vi.fn() };
}

// Imported *after* the vi.mock calls above so the mocked modules are the
// ones builder.ts's own imports resolve to.
let createBuilderScreen: typeof import('./builder').createBuilderScreen;

describe('createBuilderScreen (issue #45)', () => {
  let fakeWindow: FakeWindow;
  let container: FakeElement;
  let store: GameStore;
  let screen: { dispose: () => void };

  beforeEach(async () => {
    vi.stubGlobal('document', { createElement: (tag: string) => new FakeElement(tag) });
    fakeWindow = new FakeWindow();
    vi.stubGlobal('window', fakeWindow);

    buildTruckRigSpy.mockClear();
    disposeSpy.mockClear();

    ({ createBuilderScreen } = await import('./builder'));

    container = new FakeElement('div');
    store = new GameStore();
  });

  afterEach(() => {
    screen?.dispose();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('builds exactly one preview rig on mount', () => {
    screen = createBuilderScreen(container as unknown as HTMLElement, store);
    expect(buildTruckRigSpy).toHaveBeenCalledTimes(1);
    expect(disposeSpy).not.toHaveBeenCalled();
  });

  it('does not rebuild the preview on pure keyboard-navigation (ArrowUp/Down/Left/Right) that never changes build/cosmetics', () => {
    screen = createBuilderScreen(container as unknown as HTMLElement, store);
    buildTruckRigSpy.mockClear();

    fakeWindow.dispatch('keydown', fakeKeyEvent('ArrowDown'));
    fakeWindow.dispatch('keydown', fakeKeyEvent('ArrowRight'));
    fakeWindow.dispatch('keydown', fakeKeyEvent('ArrowRight'));
    fakeWindow.dispatch('keydown', fakeKeyEvent('ArrowUp'));
    fakeWindow.dispatch('keydown', fakeKeyEvent('ArrowLeft'));

    expect(buildTruckRigSpy).not.toHaveBeenCalled();
    expect(disposeSpy).not.toHaveBeenCalled();
  });

  it('rebuilds the preview exactly once (not twice, despite render() firing from both actOnTier and the store emit) when a real tier purchase changes the build', () => {
    store.addCoins(1000); // afford the wheels tier-1 purchase without exercising the coin-gate itself
    screen = createBuilderScreen(container as unknown as HTMLElement, store);
    buildTruckRigSpy.mockClear();
    disposeSpy.mockClear();

    // Nav order is [body, wheels, engine, gasTank, wheelLook] (ROWS then
    // COSMETIC_ROWS) -- one ArrowDown reaches the wheels row; one ArrowRight
    // highlights tier 1 (off-road, the sequential next-unlockable tier).
    fakeWindow.dispatch('keydown', fakeKeyEvent('ArrowDown'));
    fakeWindow.dispatch('keydown', fakeKeyEvent('ArrowRight'));
    expect(buildTruckRigSpy).not.toHaveBeenCalled(); // cursor movement alone still must not rebuild

    fakeWindow.dispatch('keydown', fakeKeyEvent('Space')); // buys + equips wheels tier 1

    expect(store.build.wheels).toBe(1);
    expect(buildTruckRigSpy).toHaveBeenCalledTimes(1);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('rebuilds the preview exactly once when a cosmetic selection changes, via either Space or a direct click', () => {
    screen = createBuilderScreen(container as unknown as HTMLElement, store);
    buildTruckRigSpy.mockClear();
    disposeSpy.mockClear();

    // Nav index 4 is the sole cosmetic row (wheelLook); its second option is
    // a different id than the default ('standard').
    for (let i = 0; i < 4; i++) fakeWindow.dispatch('keydown', fakeKeyEvent('ArrowDown'));
    fakeWindow.dispatch('keydown', fakeKeyEvent('ArrowRight'));
    const beforeWheelLook = store.cosmetics.wheelLook;
    fakeWindow.dispatch('keydown', fakeKeyEvent('Space'));

    expect(store.cosmetics.wheelLook).not.toBe(beforeWheelLook);
    expect(buildTruckRigSpy).toHaveBeenCalledTimes(1);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('does not rebuild the preview on a store emit unrelated to build/cosmetics (e.g. addCoins)', () => {
    screen = createBuilderScreen(container as unknown as HTMLElement, store);
    buildTruckRigSpy.mockClear();

    store.addCoins(50);

    expect(buildTruckRigSpy).not.toHaveBeenCalled();
    expect(disposeSpy).not.toHaveBeenCalled();
  });

  it('supports the whole builder purely via keyboard: navigate, purchase/equip a tier, then confirm with Enter', () => {
    store.addCoins(1000);
    screen = createBuilderScreen(container as unknown as HTMLElement, store);

    fakeWindow.dispatch('keydown', fakeKeyEvent('ArrowDown')); // -> wheels row
    fakeWindow.dispatch('keydown', fakeKeyEvent('ArrowRight')); // -> tier 1
    fakeWindow.dispatch('keydown', fakeKeyEvent('Space')); // buy + equip
    expect(store.build.wheels).toBe(1);

    expect(store.screen).toBe('BUILDER');
    fakeWindow.dispatch('keydown', fakeKeyEvent('Enter'));
    expect(store.screen).toBe('DRIVING');
  });

  it('ignores keyboard input once the builder is no longer the active screen', () => {
    store.confirmBuild(); // BUILDER -> DRIVING
    screen = createBuilderScreen(container as unknown as HTMLElement, store);
    buildTruckRigSpy.mockClear();

    fakeWindow.dispatch('keydown', fakeKeyEvent('ArrowDown'));
    fakeWindow.dispatch('keydown', fakeKeyEvent('Space'));

    expect(buildTruckRigSpy).not.toHaveBeenCalled();
  });

  it('clicking a tier option button acts exactly like the equivalent Space keypress (buys + equips + rebuilds once)', () => {
    store.addCoins(1000);
    screen = createBuilderScreen(container as unknown as HTMLElement, store);
    buildTruckRigSpy.mockClear();
    disposeSpy.mockClear();

    // Row 1 (wheels) in the DOM tree: leftColumn -> tierSection -> rowEl(body),
    // rowEl(wheels)... walk container to find the buttons the same way a real
    // click would hit them, rather than reaching into closure internals.
    const overlay = container.children[0];
    const panel = overlay.children[0];
    const leftColumn = panel.children[0];
    const tierSection = leftColumn.children[1]; // [0]=title, [1]=tierSection
    const wheelsRowEl = tierSection.children[1]; // [0]=body row, [1]=wheels row
    const wheelsOptionsEl = wheelsRowEl.children[1]; // [0]=label, [1]=options
    const tier1Button = wheelsOptionsEl.children[1]; // [0]=tier0, [1]=tier1

    tier1Button.click();

    expect(store.build.wheels).toBe(1);
    expect(buildTruckRigSpy).toHaveBeenCalledTimes(1);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('dispose() tears down cleanly: unsubscribes from the store and disposes the current preview rig exactly once', () => {
    screen = createBuilderScreen(container as unknown as HTMLElement, store);
    buildTruckRigSpy.mockClear();
    disposeSpy.mockClear();

    screen.dispose();
    expect(disposeSpy).toHaveBeenCalledTimes(1);

    // Post-dispose, further store activity must not touch the (now torn
    // down) preview rig -- the render() subscription was removed. Unlike
    // addCoins() alone (which doesn't touch store.build/store.cosmetics, so
    // builder.ts's own buildsEqual/cosmeticsEqual gate would suppress a
    // rebuild regardless of whether unsubscribe() actually ran -- issue #56:
    // that gate made the old version of this test pass even with
    // unsubscribe() commented out), purchaseTier() below *does* change
    // store.build -- a change that WOULD cause a rebuild if the render()
    // subscription were still live. Clearing the spy first, and asserting it
    // stays uncalled after a real build-changing store action, is what
    // actually distinguishes "dispose() unsubscribed" from "dispose() didn't."
    buildTruckRigSpy.mockClear();
    store.addCoins(1000);
    store.purchaseTier('wheels', 1);
    expect(buildTruckRigSpy).not.toHaveBeenCalled();
    expect(disposeSpy).toHaveBeenCalledTimes(1);

    screen = { dispose: () => {} }; // afterEach's screen.dispose() is now a no-op guard against double-dispose
  });
});
