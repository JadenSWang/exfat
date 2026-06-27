import type { WorkoutSet } from './set'

/**
 * An exercise as performed within a workout: a reference to its catalog
 * {@link WorkoutExercise.exerciseId} plus the sets logged against it.
 */
export interface WorkoutExercise {
  /** Identifier of the referenced {@link Exercise}. */
  exerciseId: string
  /** Position of this exercise within the workout (0-based). */
  order: number
  /** Sets logged for this exercise, in performed order. */
  sets: WorkoutSet[]
  /** Optional free-form notes for this exercise. */
  notes?: string
}

/** A single training session. Timestamps are ISO 8601 strings. */
export interface Workout {
  /** Stable unique identifier. */
  id: string
  /** ISO 8601 timestamp for when the session began. */
  startedAt: string
  /** ISO 8601 timestamp for when the session ended; absent while in progress. */
  endedAt?: string
  /** Exercises performed during the session. */
  exercises: WorkoutExercise[]
  /** Optional free-form notes for the session. */
  notes?: string
}
