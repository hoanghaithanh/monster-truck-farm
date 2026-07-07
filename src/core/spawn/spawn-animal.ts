import type { AnimalSpecies, AnimalState, Vec2 } from '../types';
import { ANIMAL_SPECIES } from './species';

export function spawnAnimal(id: string, species: AnimalSpecies, position: Vec2): AnimalState {
  const def = ANIMAL_SPECIES[species];
  return {
    id,
    species,
    position,
    sizeTier: def.sizeTier,
    speedTier: def.speedTier,
    alive: true,
  };
}
