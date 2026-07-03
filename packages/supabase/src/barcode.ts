// Barcode client helpers. Lookup goes through the `lookup-barcode` Edge
// Function (library → Open Food Facts → miss); on a miss the app collects the
// label from the user and submits it here.

import type { FoodUnit } from '@workout/core'
import type { WorkoutSupabaseClient, Tables } from './client'

/** Result of a barcode lookup: the matched food, or `found: false` on a miss. */
export interface BarcodeLookupResult {
  found: boolean
  /** Where the hit came from; absent on a miss. */
  source?: 'library' | 'openfoodfacts'
  food?: Tables<'foods'>
}

/**
 * Resolve a scanned barcode via the `lookup-barcode` Edge Function. A miss
 * (`found: false`) is a normal result, not an error — the caller should offer
 * the crowdsourced submission flow.
 */
export async function lookupBarcode(
  client: WorkoutSupabaseClient,
  barcode: string,
): Promise<BarcodeLookupResult> {
  const { data, error } = await client.functions.invoke<BarcodeLookupResult>('lookup-barcode', {
    body: { barcode },
  })
  if (error) throw error
  if (!data) throw new Error('lookup-barcode returned no data')
  return data
}

/** A user-entered nutrition label for a barcode nobody has data for yet. */
export interface BarcodeSubmissionInput {
  barcode: string
  name: string
  brand?: string | null
  servingQty: number
  servingUnit: FoodUnit
  calories: number
  protein: number
  carbs: number
  fat: number
}

/**
 * Record a crowdsourced nutrition label for a barcode. Writes two rows:
 *  1. `barcode_submissions` — the audit-trail row the future consensus job
 *     reads before promoting a barcode to the global library (upserted, so
 *     re-submitting replaces the user's previous answer).
 *  2. A private `foods` row (source 'barcode') so the submitter can use their
 *     own data immediately. Returned for logging into the diary.
 */
function labelColumns(input: BarcodeSubmissionInput) {
  return {
    barcode: input.barcode,
    name: input.name,
    brand: input.brand ?? null,
    serving_qty: input.servingQty,
    serving_unit: input.servingUnit,
    calories: input.calories,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
  }
}

/** Insert a private `foods` row (owned by the user) and return it. */
async function insertPrivateFood(
  client: WorkoutSupabaseClient,
  userId: string,
  input: BarcodeSubmissionInput,
): Promise<Tables<'foods'>> {
  const { data: food, error } = await client
    .from('foods')
    .insert({ ...labelColumns(input), source: 'barcode', owner_id: userId })
    .select()
    .single()
  if (error) throw error
  return food
}

export async function submitBarcodeFood(
  client: WorkoutSupabaseClient,
  userId: string,
  input: BarcodeSubmissionInput,
): Promise<Tables<'foods'>> {
  const { error: submissionError } = await client
    .from('barcode_submissions')
    .upsert({ user_id: userId, ...labelColumns(input) }, { onConflict: 'user_id,barcode' })
  if (submissionError) throw submissionError

  return insertPrivateFood(client, userId, input)
}

/**
 * Save a nutrition label the user read off the back of a product to correct a
 * scanned barcode whose numbers were wrong. Unlike {@link submitBarcodeFood},
 * this does NOT touch `barcode_submissions` — the correction stays private to
 * the user (v1). Returns the private `foods` row so the caller can point the
 * corrected diary entry at it.
 */
export async function saveCorrectedFood(
  client: WorkoutSupabaseClient,
  userId: string,
  input: BarcodeSubmissionInput,
): Promise<Tables<'foods'>> {
  return insertPrivateFood(client, userId, input)
}
