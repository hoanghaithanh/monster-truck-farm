// Keyboard -> DriveIntent mapping (drive AC1, AC3): exactly 4 keys, no combos,
// no modifiers, no precision timing. Arrow keys and WASD are equivalent.
import type { DriveIntent } from '../core/types';

const FORWARD_KEYS = new Set(['ArrowUp', 'KeyW']);
const BACK_KEYS = new Set(['ArrowDown', 'KeyS']);
const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);

export class KeyboardInput {
  private pressed = new Set<string>();
  private onKeyDown = (e: KeyboardEvent) => this.pressed.add(e.code);
  private onKeyUp = (e: KeyboardEvent) => this.pressed.delete(e.code);

  constructor(private target: Window = window) {
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
  }

  getIntent(): DriveIntent {
    let throttle = 0;
    for (const key of this.pressed) {
      if (FORWARD_KEYS.has(key)) throttle += 1;
      if (BACK_KEYS.has(key)) throttle -= 1;
    }
    let steer = 0;
    for (const key of this.pressed) {
      if (LEFT_KEYS.has(key)) steer -= 1;
      if (RIGHT_KEYS.has(key)) steer += 1;
    }
    return {
      throttle: Math.max(-1, Math.min(1, throttle)),
      steer: Math.max(-1, Math.min(1, steer)),
    };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
  }
}
