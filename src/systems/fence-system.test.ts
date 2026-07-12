import { describe, expect, it } from 'vitest';
import { FenceSystem } from './fence-system';
import { TRUCK_CONTACT_RADIUS } from '../core/driving/config';
import { FENCE_CONTACT_MARGIN } from '../core/fence/config';
import type { FenceInstance } from '../core/terrain';
import type { Vec2 } from '../core/types';

function noop() {}

const FENCE: FenceInstance = { id: 'fence-1', position: { x: 10, z: -10 }, rotationY: 0, footprintRadius: 2.945 };
const OTHER_FENCE: FenceInstance = { id: 'fence-2', position: { x: 30, z: -30 }, rotationY: 0, footprintRadius: 2.945 };
const FAR_AWAY: Vec2 = { x: 1000, z: 1000 };

describe('FenceSystem — collapse-on-contact (issue #54, AC8, ADR 0019 §1/§2)', () => {
  it('does not collapse a fence the truck has not reached', () => {
    const system = new FenceSystem([FENCE]);
    const collapses: string[] = [];
    system.update(0.016, FAR_AWAY, { onCollapse: (id) => collapses.push(id) });
    expect(collapses).toHaveLength(0);
    expect(system.isCollapsed(FENCE.id)).toBe(false);
  });

  it('collapses a still-standing fence the frame the truck makes contact (any contact, no speed/force gate)', () => {
    const system = new FenceSystem([FENCE]);
    const collapses: string[] = [];
    // Truck sits exactly at the fence's position -- well within contact range.
    system.update(0.016, FENCE.position, { onCollapse: (id) => collapses.push(id) });
    expect(collapses).toEqual([FENCE.id]);
    expect(system.isCollapsed(FENCE.id)).toBe(true);
  });

  it('fires onCollapse exactly once per segment, never again after collapse (ADR 0019 Risks: the one-way transition regression guard)', () => {
    const system = new FenceSystem([FENCE]);
    const collapses: string[] = [];
    // Stay in contact for several consecutive frames.
    for (let i = 0; i < 5; i++) {
      system.update(0.016, FENCE.position, { onCollapse: (id) => collapses.push(id) });
    }
    expect(collapses).toEqual([FENCE.id]);
  });

  it('collapsing one segment does not affect a still-standing sibling segment', () => {
    const system = new FenceSystem([FENCE, OTHER_FENCE]);
    const collapses: string[] = [];
    system.update(0.016, FENCE.position, { onCollapse: (id) => collapses.push(id) });
    expect(collapses).toEqual([FENCE.id]);
    expect(system.isCollapsed(FENCE.id)).toBe(true);
    expect(system.isCollapsed(OTHER_FENCE.id)).toBe(false);
  });

  it('uses TRUCK_CONTACT_RADIUS + FENCE_CONTACT_MARGIN as the truck side of the contact check (boundary sanity)', () => {
    const system = new FenceSystem([FENCE]);
    const justOutside: Vec2 = {
      x: FENCE.position.x + FENCE.footprintRadius + FENCE_CONTACT_MARGIN + TRUCK_CONTACT_RADIUS + 0.01,
      z: FENCE.position.z,
    };
    const collapses: string[] = [];
    system.update(0.016, justOutside, { onCollapse: (id) => collapses.push(id) });
    expect(collapses).toHaveLength(0);
  });

  it('collapses before the truck would be flush against the physics collider (FENCE_CONTACT_MARGIN regression guard, live-playtest bug)', () => {
    // Exactly at the physics collider's own boundary distance (footprintRadius
    // + truck's physics radius, with no margin at all) -- this is the
    // distance Rapier's kinematic controller would stop the truck at. Without
    // FENCE_CONTACT_MARGIN, isFenceContact's strict `<` would never fire here
    // (or beyond), since the solid collider structurally prevents the truck
    // from ever getting closer -- reproducing the live bug where a standing
    // fence never collapsed. With the margin, this point (still outside the
    // bare footprintRadius + TRUCK_CONTACT_RADIUS boundary) already counts as
    // contact.
    const system = new FenceSystem([FENCE]);
    const atPhysicsBoundary: Vec2 = { x: FENCE.position.x + FENCE.footprintRadius + TRUCK_CONTACT_RADIUS, z: FENCE.position.z };
    const collapses: string[] = [];
    system.update(0.016, atPhysicsBoundary, { onCollapse: (id) => collapses.push(id) });
    expect(collapses).toEqual([FENCE.id]);
  });

  it('never mutates the authored FenceInstance[] passed in (immutable data, mutable state lives in the system, ADR 0019 §1)', () => {
    const fences: FenceInstance[] = [{ ...FENCE }];
    const system = new FenceSystem(fences);
    system.update(0.016, FENCE.position, { onCollapse: noop });
    expect(fences[0]).toEqual(FENCE);
  });
});
