// Public entry point for @workout/supabase. The mobile app imports from here.

export type { Database } from './database.types'

export {
  createSupabaseClient,
  type WorkoutSupabaseClient,
  type Tables,
  type CreateClientOptions,
} from './client'

export { signInWithApple, signOut } from './auth'

export {
  estimateNutrition,
  logDiaryEntries,
  getDiaryEntries,
  getNutritionGoals,
  upsertNutritionGoals,
  type NutritionEstimate,
  type DiaryEntryInput,
} from './nutrition'
