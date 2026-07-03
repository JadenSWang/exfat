// Profile helpers. A profile row is auto-provisioned on signup by the
// handle_new_user() trigger; these read and update it. `weight` is null until
// the user completes onboarding — the app uses that as the onboarding gate.

import type { WorkoutSupabaseClient, Tables } from './client'

export type WeightUnit = Tables<'profiles'>['default_unit']
export type BiologicalSex = NonNullable<Tables<'profiles'>['sex']>

/** The physical attributes onboarding collects to size a calorie target. */
export interface ProfileVitals {
  weight: number
  unit: WeightUnit
  /** Height in centimeters (the canonical stored unit), or null if unknown. */
  heightCm: number | null
  sex: BiologicalSex | null
  /** Birth year/month only — enough to approximate age, less intrusive than a full DOB. */
  birthYear: number | null
  birthMonth: number | null
}

/** Fetch the current user's profile, or `null` if none exists yet. */
export async function getProfile(
  client: WorkoutSupabaseClient,
): Promise<Tables<'profiles'> | null> {
  const { data, error } = await client.from('profiles').select('*').maybeSingle()
  if (error) throw error
  return data
}

/**
 * Save the user's body vitals (weight, height, sex, approximate birth date) and
 * make their chosen weight unit the default. Height is stored in centimeters
 * regardless of how it was entered.
 */
export async function updateProfileVitals(
  client: WorkoutSupabaseClient,
  userId: string,
  vitals: ProfileVitals,
): Promise<void> {
  const { error } = await client
    .from('profiles')
    .update({
      weight: vitals.weight,
      default_unit: vitals.unit,
      height_cm: vitals.heightCm,
      sex: vitals.sex,
      birth_year: vitals.birthYear,
      birth_month: vitals.birthMonth,
    })
    .eq('id', userId)
  if (error) throw error
}
