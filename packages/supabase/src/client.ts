import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/** A Supabase client pre-typed against the workout app's database schema. */
export type WorkoutSupabaseClient = SupabaseClient<Database>

/** Shorthand for a table's `Row` type, e.g. `Tables<'workouts'>`. */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export interface CreateClientOptions {
  url: string
  anonKey: string
  /** Optional storage adapter (e.g. AsyncStorage) for persisting the auth session on native. */
  storage?: {
    getItem(key: string): Promise<string | null> | string | null
    setItem(key: string, value: string): Promise<void> | void
    removeItem(key: string): Promise<void> | void
  }
}

/**
 * Create the app's Supabase client. On native, pass a `storage` adapter (such
 * as AsyncStorage or expo-secure-store) so the session survives app restarts.
 *
 * `detectSessionInUrl` is disabled because the app authenticates with a native
 * Apple identity token, not a browser redirect/URL fragment.
 */
export function createSupabaseClient(opts: CreateClientOptions): WorkoutSupabaseClient {
  return createClient<Database>(opts.url, opts.anonKey, {
    auth: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      storage: opts.storage as any,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
}
