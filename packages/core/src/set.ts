import type { WeightUnit } from './units'

/**
 * The nature of a logged set. `normal` sets count toward working volume;
 * `warmup` sets do not.
 */
export type SetType = 'normal' | 'warmup' | 'dropset' | 'failure'

/** A single logged set within a workout exercise. */
export interface WorkoutSet {
  /** Weight lifted, expressed in {@link WorkoutSet.unit}. */
  weight: number
  /** Number of repetitions performed. */
  reps: number
  /** Unit the {@link WorkoutSet.weight} is recorded in. */
  unit: WeightUnit
  /** Set classification; defaults to a normal working set when omitted. */
  type?: SetType
  /** Rate of Perceived Exertion, typically on a 1-10 scale. */
  rpe?: number
}

/**
 * A set counts as "working" (toward volume and PR estimates) unless it is an
 * explicit warmup. An omitted {@link WorkoutSet.type} is treated as working.
 */
export function isWorkingSet(set: WorkoutSet): boolean {
  return set.type !== 'warmup'
}
