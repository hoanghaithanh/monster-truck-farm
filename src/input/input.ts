// Keyboard + gamepad + touch -> DriveInput.
import { clamp } from '../core/math';
import type { DriveInput } from '../core/truck';

const KEYS = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  jump: ['Space'], boost: ['ShiftLeft', 'ShiftRight', 'KeyX', 'KeyN'], horn: ['KeyH', 'KeyE', 'KeyF'],
};
const GAME_KEYS = new Set(Object.values(KEYS).flat());
const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);

export class Input {
  /** Fired once per press of Escape / P / gamepad Start. */
  onPause: () => void = () => {};
  /** Fired on any key/button/touch: used to unlock audio. */
  onAny: () => void = () => {};
  private down = new Set<string>();
  private touch = { left: false, right: false, gas: false, brake: false, jump: false, boost: false, horn: false };
  private touchUi: HTMLElement | null = null;
  private padStart = false;

  constructor(private root: HTMLElement) {
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.clear);
    window.addEventListener('touchstart', this.firstTouch, { passive: true });
    window.addEventListener('pointerdown', this.any);
  }

  private any = () => this.onAny();
  private clear = () => this.down.clear();
  private keyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    this.onAny();
    if (GAME_KEYS.has(e.code)) e.preventDefault(); // no page scroll on arrows/space
    if (e.repeat) return;
    this.down.add(e.code);
    if (e.code === 'Escape' || e.code === 'KeyP') this.onPause();
  };
  private keyUp = (e: KeyboardEvent) => this.down.delete(e.code);
  private has = (codes: string[]) => codes.some((c) => this.down.has(c));

  private firstTouch = () => {
    window.removeEventListener('touchstart', this.firstTouch);
    const ui = (this.touchUi = document.createElement('div'));
    ui.className = 'touch';
    const btn = (key: keyof Input['touch'], label: string, cls: string) => {
      const b = document.createElement('button');
      b.className = `touch-btn ${cls}`;
      b.textContent = label;
      const set = (v: boolean) => (e: Event) => { e.preventDefault(); this.touch[key] = v; this.onAny(); };
      b.addEventListener('pointerdown', set(true));
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, set(false));
      ui.appendChild(b);
    };
    btn('left', '◀', 't-left'); btn('right', '▶', 't-right');
    btn('gas', '▲', 't-gas'); btn('brake', '▼', 't-brake');
    btn('jump', '⤴', 't-jump'); btn('boost', '🔥', 't-boost'); btn('horn', '📯', 't-horn');
    this.root.appendChild(ui);
  };

  /** Touch controls only make sense while driving. */
  setTouchVisible(visible: boolean): void { this.touchUi?.classList.toggle('show', visible); }

  read(): DriveInput {
    const t = this.touch;
    let throttle = (this.has(KEYS.up) || t.gas ? 1 : 0) - (this.has(KEYS.down) || t.brake ? 1 : 0);
    let steer = (this.has(KEYS.right) || t.right ? 1 : 0) - (this.has(KEYS.left) || t.left ? 1 : 0);
    let jump = this.has(KEYS.jump) || t.jump, boost = this.has(KEYS.boost) || t.boost, horn = this.has(KEYS.horn) || t.horn;
    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      const b = (i: number) => pad.buttons[i]?.pressed ?? false, v = (i: number) => pad.buttons[i]?.value ?? 0;
      steer += dead(pad.axes[0] ?? 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
      throttle += v(7) - v(6) + (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
      jump ||= b(0); boost ||= b(2) || b(5); horn ||= b(3) || b(1);
      if (b(9) && !this.padStart) this.onPause();
      if (pad.buttons.some((x) => x.pressed)) this.onAny();
      this.padStart = b(9);
    }
    return { throttle: clamp(throttle, -1, 1), steer: clamp(steer, -1, 1), jump, boost, horn };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.clear);
    window.removeEventListener('touchstart', this.firstTouch);
    window.removeEventListener('pointerdown', this.any);
    this.touchUi?.remove();
  }
}
