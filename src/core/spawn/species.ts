// Animal species table (animal AC3, AC7). Sprint 1 requirements call for
// cows/chickens/pigs, but the original thin end-to-end slice shipped one
// species (chicken) end-to-end per the reduced scope for that pass. Issue
// #48 (docs/requirements/farm-animals-pig-cow.md, ADR 0016) is exactly the
// additive follow-up this file's old comment anticipated: pig/cow rows
// appended below with the tiers resolved 2026-07-10 (pig medium/medium=20
// coins, cow large/medium=30 coins via the unchanged computeCoins formula) —
// no core logic changes needed, just two more rows.
import type { AnimalSpecies, SizeTier, SpeedTier } from '../types';

export interface AnimalSpeciesDef {
  species: AnimalSpecies;
  sizeTier: SizeTier;
  speedTier: SpeedTier;
  /** Collision/spawn-avoidance radius, matching the obstacle radii's units. */
  radius: number;
}

export const ANIMAL_SPECIES: Record<AnimalSpecies, AnimalSpeciesDef> = {
  chicken: { species: 'chicken', sizeTier: 'small', speedTier: 'fast', radius: 0.4 },
  // Radii sized proportionate to the confirmed size tiers (medium/large),
  // scaled up from chicken's small-tier 0.4 — reasonable, not measured off
  // the real .glb bounding boxes (ADR 0016 §1's own "radius ~0.6"/"~0.9").
  pig: { species: 'pig', sizeTier: 'medium', speedTier: 'medium', radius: 0.6 },
  cow: { species: 'cow', sizeTier: 'large', speedTier: 'medium', radius: 0.9 },
};
