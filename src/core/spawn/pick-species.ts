// Weighted species picker (issue #48, ADR 0016 §1): chicken 0.7 / pig 0.25 /
// cow 0.05 per spawn, so a normal-length play session sees chicken most
// often but has a real (if rare) chance of a cow (AC4). A small, pure,
// separately-testable helper in core/spawn/, mirroring how
// pickSpawnPosition is its own function -- systems/animal-system.ts just
// calls this once per spawn.
import type { AnimalSpecies } from '../types';
import type { Rng } from './spawn-position';

/** Cumulative-weight order matters for `pickSpecies`'s roll-through below, but the weights themselves are the human-confirmed tuning values (ADR 0016 §1) -- not derived from anything else. */
const SPECIES_WEIGHTS: readonly { species: AnimalSpecies; weight: number }[] = [
  { species: 'chicken', weight: 0.7 },
  { species: 'pig', weight: 0.25 },
  { species: 'cow', weight: 0.05 },
];

/**
 * Picks a species for one spawn, weighted per `SPECIES_WEIGHTS`. `rng` is
 * injected (defaults to `Math.random`) for the same deterministic-testing
 * reason `pickSpawnPosition`'s `Rng` param exists -- a seeded fake lets tests
 * assert an exact distribution over many draws without flakiness.
 *
 * The final entry (cow) is returned for any roll that reaches or exceeds the
 * cumulative sum of the earlier weights, rather than an exact `< 1` check --
 * robust against floating-point rounding of the weights leaving a sliver
 * below 1.0 unclaimed, which would otherwise (rarely, and unrepros-ibly)
 * return `undefined`.
 */
export function pickSpecies(rng: Rng = Math.random): AnimalSpecies {
  const roll = rng();
  let cumulative = 0;
  for (const { species, weight } of SPECIES_WEIGHTS) {
    cumulative += weight;
    if (roll < cumulative) return species;
  }
  return SPECIES_WEIGHTS[SPECIES_WEIGHTS.length - 1].species;
}
