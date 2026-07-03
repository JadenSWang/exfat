// Profile helpers. A profile row is auto-provisioned on signup by the
// handle_new_user() trigger; these read and update it. `weight` is null until
// the user completes onboarding — the app uses that as the onboarding gate.

import type { WorkoutSupabaseClient, Tables } from './client'

export type WeightUnit = Tables<'profiles'>['default_unit']

/** Fetch the current user's profile, or `null` if none exists yet. */
export async function getProfile(
  client: WorkoutSupabaseClient,
): Promise<Tables<'profiles'> | null> {
  const { data, error } = await client.from('profiles').select('*').maybeSingle()
  if (error) throw error
  return data
}

/** Save the user's body weight (in `unit`) and make that their default unit. */
export async function updateProfileWeight(
  client: WorkoutSupabaseClient,
  userId: string,
  weight: number,
  unit: WeightUnit,
): Promise<void> {
  const { error } = await client
    .from('profiles')
    .update({ weight, default_unit: unit })
    .eq('id', userId)
  if (error) throw error
}
