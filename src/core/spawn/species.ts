// Animal species table (animal AC3, AC7). Sprint 1 requirements call for
// cows/chickens/pigs, but this thin end-to-end slice ships one species
// (chicken) end-to-end per the reduced scope for this pass — cows/pigs are
// an additive follow-up (append a row here + the render/physics asset, no
// core logic changes needed).
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
};
