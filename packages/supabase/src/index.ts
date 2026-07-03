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
  getProfile,
  updateProfileVitals,
  type WeightUnit,
  type BiologicalSex,
  type ProfileVitals,
} from './profiles'

export {
  estimateNutrition,
  logDiaryEntries,
  updateDiaryEntryNutrition,
  deleteDiaryEntry,
  getDiaryEntries,
  getNutritionGoals,
  upsertNutritionGoals,
  type NutritionEstimate,
  type DiaryEntryInput,
} from './nutrition'

export {
  lookupBarcode,
  submitBarcodeFood,
  saveCorrectedFood,
  type BarcodeLookupResult,
  type BarcodeSubmissionInput,
} from './barcode'
