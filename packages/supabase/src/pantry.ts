// Pantry client helpers. The pantry is a lightweight inventory of foods the
// user has at home — populated from receipt photos or barcode scans, consumed
// by the AI coach when planning meals. Items are soft-deleted ("used it") via
// consumed_at.

import type { WorkoutSupabaseClient, Tables } from './client'

export type PantrySource = 'receipt' | 'barcode' | 'manual'

/** One pantry item to add, in the app's camelCase shape. */
export interface PantryItemInput {
  name: string
  brand?: string | null
  foodId?: string | null
  source: PantrySource
}

/**
 * Fetch the user's active (not yet consumed) pantry items, newest first.
 */
export async function getPantryItems(
  client: WorkoutSupabaseClient,
): Promise<Tables<'pantry_items'>[]> {
  const { data, error } = await client
    .from('pantry_items')
    .select('*')
    .is('consumed_at', null)
    .order('added_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Insert one or more pantry items for `userId`.
 */
export async function addPantryItems(
  client: WorkoutSupabaseClient,
  userId: string,
  items: PantryItemInput[],
): Promise<void> {
  const rows = items.map((item) => ({
    user_id: userId,
    name: item.name,
    brand: item.brand ?? null,
    food_id: item.foodId ?? null,
    source: item.source,
  }))

  const { error } = await client.from('pantry_items').insert(rows)
  if (error) throw error
}

/**
 * Mark a pantry item as used up. Soft delete: sets consumed_at so the item
 * drops out of the active list but stays around for history.
 */
export async function consumePantryItem(
  client: WorkoutSupabaseClient,
  itemId: string,
): Promise<void> {
  const { error } = await client
    .from('pantry_items')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', itemId)
  if (error) throw error
}
