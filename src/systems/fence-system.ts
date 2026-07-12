// Bridges the fence collapse core logic (core/fence/contact.ts) <-> render
// (issue #54, ADR 0019 §1/§2): owns the per-session `collapsed: Set<id>`
// state -- constructed fresh in main.ts's startDriving every session, so
// "fences reset to standing at the start of each new session" (AC8) falls
// out for free by construction, mirroring FarmerSystem/FuelSystem's exact
// per-session-instance precedent. Deliberately simpler than those two: no
// spawn timer, no cap, no scatter -- a fence's authored data (STUB_FENCES)
// is fixed for the whole session, only its standing/collapsed state is
// mutable, and that mutation is one-way (a collapsed fence never re-stands
// within a session).
import { isFenceContact } from '../core/fence/contact';
import { FENCE_CONTACT_MARGIN } from '../core/fence/config';
import { TRUCK_CONTACT_RADIUS } from '../core/driving/config';
import type { FenceInstance } from '../core/terrain';
import type { Vec2 } from '../core/types';

export interface FenceSystemCallbacks {
  /** Fired exactly once per segment, the first frame a still-standing fence is contacted (AC8) -- never fires again for that id afterward. */
  onCollapse(id: string): void;
}

export class FenceSystem {
  private collapsed = new Set<string>();

  constructor(private fences: FenceInstance[]) {}

  /**
   * `dt` is accepted for interface symmetry with the other per-session
   * systems (AnimalSystem/FarmerSystem/FuelSystem all take `dt` first) even
   * though this system has no timer/animation of its own to advance -- kept
   * so main.ts's frame loop can call every system's `update` uniformly and
   * so a future speed/force-gated collapse rule (ADR 0019 §Open questions
   * #3, non-blocking) has somewhere to use it without a signature change.
   */
  update(dt: number, truckPosition: Vec2, callbacks: FenceSystemCallbacks): void {
    void dt;
    for (const fence of this.fences) {
      if (this.collapsed.has(fence.id)) continue;
      // FENCE_CONTACT_MARGIN (core/fence/config.ts): the contact radius is
      // deliberately larger than the physics collider's own footprintRadius
      // -- see that constant's doc comment for the live-playtest bug this
      // fixes (without it, the solid collider prevents the truck from ever
      // reaching the strict distance< threshold, and the fence would never
      // collapse).
      if (isFenceContact(truckPosition, TRUCK_CONTACT_RADIUS, fence.position, fence.footprintRadius + FENCE_CONTACT_MARGIN)) {
        this.collapsed.add(fence.id);
        callbacks.onCollapse(fence.id);
      }
    }
  }

  isCollapsed(id: string): boolean {
    return this.collapsed.has(id);
  }
}
