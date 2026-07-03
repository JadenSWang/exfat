import 'react-native-url-polyfill/auto'

import AsyncStorage from '@react-native-async-storage/async-storage'
import { createSupabaseClient } from '@workout/supabase'

const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const envAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

function resolveConfig(): { url: string; anonKey: string } {
  if (envUrl && envAnonKey) return { url: envUrl, anonKey: envAnonKey }

  // In development, fall back to a harmless placeholder so the app can boot
  // (e.g. in Expo Go before a Supabase project exists). Auth and data calls
  // will fail until real values are set in `.env`.
  if (__DEV__) {
    console.warn(
      '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — ' +
        'using a placeholder client so the app can boot. Set them in .env to enable auth and data.',
    )
    return { url: 'https://placeholder.supabase.co', anonKey: 'placeholder-anon-key' }
  }

  throw new Error(
    'Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY (copy .env.example to .env).',
  )
}

const { url, anonKey } = resolveConfig()

/**
 * Singleton Supabase client for the app. Sessions are persisted with
 * AsyncStorage so the user stays signed in across launches.
 *
 * During web static rendering (SSR) there is no `window`, and AsyncStorage's
 * web backend touches it at call time — omit storage there; the session is
 * only needed at runtime.
 */
const isServer = typeof window === 'undefined'

export const supabase = createSupabaseClient({
  url,
  anonKey,
  storage: isServer ? undefined : AsyncStorage,
})
