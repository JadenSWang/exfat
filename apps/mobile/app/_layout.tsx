import { getProfile } from '@workout/supabase'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { supabase } from '@/lib/supabase'
import { AuthProvider, useAuth } from '@/providers/auth'

const queryClient = new QueryClient()

function RootNavigator() {
  const { session, isLoading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  // Weight is captured during onboarding, so a null weight means the user
  // hasn't onboarded yet. On fetch failure (dev mode / no backend) we return
  // undefined and skip the onboarding redirect rather than trap the user.
  const profileQuery = useQuery({
    queryKey: ['profile'],
    enabled: !!session,
    queryFn: async () => {
      try {
        return await getProfile(supabase)
      } catch {
        return undefined
      }
    },
  })

  useEffect(() => {
    if (isLoading) return

    const inAuthGroup = segments[0] === '(auth)'
    const inOnboarding = (segments as string[]).includes('onboarding')

    if (!session && !inAuthGroup) {
      // Not signed in and trying to view a protected route -> go to sign-in.
      router.replace('/sign-in')
    } else if (session && inAuthGroup) {
      // Signed in but sitting on an auth route -> go to the app.
      router.replace('/')
    } else if (session && profileQuery.data && profileQuery.data.weight == null && !inOnboarding) {
      // Signed in but never told us their weight -> onboarding first.
      router.replace('/onboarding')
    }
  }, [session, isLoading, segments, router, profileQuery.data])

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#208AEF" />
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(app)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="+not-found" />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RootNavigator />
            <StatusBar style="auto" />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
