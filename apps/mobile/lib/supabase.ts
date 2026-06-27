import 'react-native-url-polyfill/auto'

import AsyncStorage from '@react-native-async-storage/async-storage'
import { createSupabaseClient } from '@workout/supabase'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY (copy .env.example to .env).',
  )
}

/**
 * Singleton Supabase client for the app. Sessions are persisted with
 * AsyncStorage so the user stays signed in across launches.
 */
export const supabase = createSupabaseClient({
  url,
  anonKey,
  storage: AsyncStorage,
})
