/** A primary or secondary muscle group targeted by an exercise. */
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'forearms'
  | 'fullBody'

/** The piece of equipment an exercise is performed with. */
export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'kettlebell'
  | 'band'
  | 'other'

/** Whether an exercise trains many joints (`compound`) or one (`isolation`). */
export type ExerciseCategory = 'compound' | 'isolation'

/**
 * A movement that can be logged in a workout. Built-in exercises ship with the
 * app; user-defined ones are flagged via {@link Exercise.isCustom}.
 */
export interface Exercise {
  /** Stable unique identifier. */
  id: string
  /** Human-readable name, e.g. "Barbell Bench Press". */
  name: string
  /** The primary muscle group worked. */
  primaryMuscle: MuscleGroup
  /** Additional muscle groups recruited, if any. */
  secondaryMuscles?: MuscleGroup[]
  /** Equipment required to perform the exercise. */
  equipment: Equipment
  /** Compound vs. isolation classification. */
  category: ExerciseCategory
  /** True when the exercise was created by the user rather than built-in. */
  isCustom?: boolean
}
