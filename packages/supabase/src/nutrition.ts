// Nutrition client helpers. These wrap the AI estimator Edge Function and the
// diary/goals tables so the mobile app never touches raw Supabase queries or
// the snake_case column names directly.

import type {
  EstimatedFoodItem,
  MacroNutrients,
  MealType,
  FoodUnit,
  FoodSource,
} from '@workout/core'
import type { WorkoutSupabaseClient, Tables } from './client'

/** Result of an AI meal estimate: per-item breakdown plus a server-computed total. */
export interface NutritionEstimate {
  items: EstimatedFoodItem[]
  totals: MacroNutrients
  isEstimate: true
  note: string
}

/**
 * One diary entry to log, in the app's camelCase shape. Mapped to the
 * `diary_entries` table columns by {@link logDiaryEntries}.
 */
export interface DiaryEntryInput {
  entryDate: string
  meal: MealType
  description: string
  quantity: number
  unit: FoodUnit
  calories: number
  protein: number
  carbs: number
  fat: number
  source: FoodSource
  foodId?: string | null
}

/**
 * Estimate the nutrition of a free-text meal via the `estimate-nutrition` Edge
 * Function (which calls Claude server-side). Throws if the function errors.
 */
export async function estimateNutrition(
  client: WorkoutSupabaseClient,
  text: string,
): Promise<NutritionEstimate> {
  const { data, error } = await client.functions.invoke<NutritionEstimate>('estimate-nutrition', {
    body: { text },
  })
  if (error) throw error
  if (!data) throw new Error('estimate-nutrition returned no data')
  return data
}

/**
 * Insert one or more diary entries for `userId`. Maps camelCase inputs to the
 * table's snake_case columns and derives `is_estimate` from the source.
 */
export async function logDiaryEntries(
  client: WorkoutSupabaseClient,
  userId: string,
  entries: DiaryEntryInput[],
): Promise<void> {
  const rows = entries.map((entry) => ({
    user_id: userId,
    entry_date: entry.entryDate,
    meal: entry.meal,
    description: entry.description,
    quantity: entry.quantity,
    unit: entry.unit,
    calories: entry.calories,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    source: entry.source,
    is_estimate: entry.source === 'ai_estimate',
    food_id: entry.foodId ?? null,
  }))

  const { error } = await client.from('diary_entries').insert(rows)
  if (error) throw error
}

/**
 * Replace a diary entry's food and nutrition in place — used when the user
 * refines an AI estimate by scanning the product's barcode. The entry's date
 * and meal are preserved; only what the food is (and its macros) changes.
 */
export async function updateDiaryEntryNutrition(
  client: WorkoutSupabaseClient,
  entryId: string,
  update: {
    description: string
    quantity: number
    unit: FoodUnit
    calories: number
    protein: number
    carbs: number
    fat: number
    source: FoodSource
    foodId?: string | null
  },
): Promise<void> {
  const { error } = await client
    .from('diary_entries')
    .update({
      description: update.description,
      quantity: update.quantity,
      unit: update.unit,
      calories: update.calories,
      protein: update.protein,
      carbs: update.carbs,
      fat: update.fat,
      source: update.source,
      is_estimate: update.source === 'ai_estimate',
      food_id: update.foodId ?? null,
    })
    .eq('id', entryId)
  if (error) throw error
}

/**
 * Delete a single diary entry by id.
 */
export async function deleteDiaryEntry(
  client: WorkoutSupabaseClient,
  entryId: string,
): Promise<void> {
  const { error } = await client.from('diary_entries').delete().eq('id', entryId)
  if (error) throw error
}

/**
 * Fetch a single day's diary entries (by `entry_date`), oldest logged first.
 */
export async function getDiaryEntries(
  client: WorkoutSupabaseClient,
  date: string,
): Promise<Tables<'diary_entries'>[]> {
  const { data, error } = await client
    .from('diary_entries')
    .select('*')
    .eq('entry_date', date)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/**
 * Fetch the current user's nutrition goals, or `null` if they haven't set any.
 */
export async function getNutritionGoals(
  client: WorkoutSupabaseClient,
): Promise<Tables<'nutrition_goals'> | null> {
  const { data, error } = await client.from('nutrition_goals').select('*').maybeSingle()
  if (error) throw error
  return data
}

/**
 * Create or replace the user's daily calorie/macro goals (keyed on user_id).
 */
export async function upsertNutritionGoals(
  client: WorkoutSupabaseClient,
  userId: string,
  goals: MacroNutrients,
): Promise<void> {
  const { error } = await client.from('nutrition_goals').upsert({
    user_id: userId,
    calories: goals.calories,
    protein: goals.protein,
    carbs: goals.carbs,
    fat: goals.fat,
  })
  if (error) throw error
}
