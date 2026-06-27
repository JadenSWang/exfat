import { convertWeight } from './units'
import type { WorkoutSet } from './set'

/** Supported one-rep-max estimation formulas. */
export type OneRepMaxFormula = 'epley' | 'brzycki'

/**
 * Estimate a one-rep max (1RM) from a weight x reps set.
 *
 * - `epley` (default): `weight * (1 + reps / 30)`
 * - `brzycki`: `weight * 36 / (37 - reps)`
 *
 * A single rep returns `weight` directly. Returns `0` for non-positive reps,
 * or for Brzycki when `reps >= 37` (outside the formula's valid domain).
 */
export function estimateOneRepMax(
  weight: number,
  reps: number,
  formula: OneRepMaxFormula = 'epley',
): number {
  if (reps < 1) return 0
  if (reps === 1) return weight
  if (formula === 'brzycki') {
    if (reps >= 37) return 0
    return (weight * 36) / (37 - reps)
  }
  return weight * (1 + reps / 30)
}

/**
 * Total training volume across `sets`, in kilograms.
 * Each set contributes `weight * reps`, with weight normalized to kg.
 */
export function totalVolume(sets: WorkoutSet[]): number {
  return sets.reduce((sum, set) => sum + convertWeight(set.weight, set.unit, 'kg') * set.reps, 0)
}

/** Total repetitions performed across `sets`. */
export function totalReps(sets: WorkoutSet[]): number {
  return sets.reduce((sum, set) => sum + set.reps, 0)
}

/**
 * Return the set with the highest estimated one-rep max (normalized to kg so
 * mixed-unit sets compare correctly), or `undefined` when `sets` is empty.
 */
export function topSetByEstimatedOneRepMax(sets: WorkoutSet[]): WorkoutSet | undefined {
  let best: WorkoutSet | undefined
  let bestEstimate = -Infinity
  for (const set of sets) {
    const estimate = estimateOneRepMax(convertWeight(set.weight, set.unit, 'kg'), set.reps)
    if (estimate > bestEstimate) {
      bestEstimate = estimate
      best = set
    }
  }
  return best
}
