import type { WorkoutSupabaseClient } from './client'

/**
 * Sign in with a native Apple identity token.
 *
 * Obtain `identityToken` from expo-apple-authentication. If you generated a
 * nonce for the Apple request, pass the RAW (un-hashed) nonce here so Supabase
 * can verify it against the hashed value embedded in the token.
 */
export async function signInWithApple(
  client: WorkoutSupabaseClient,
  args: { identityToken: string; nonce?: string },
): Promise<{ error: Error | null }> {
  const { error } = await client.auth.signInWithIdToken({
    provider: 'apple',
    token: args.identityToken,
    nonce: args.nonce,
  })
  return { error }
}

/** Sign the current user out and clear the persisted session. */
export async function signOut(client: WorkoutSupabaseClient): Promise<void> {
  await client.auth.signOut()
}
