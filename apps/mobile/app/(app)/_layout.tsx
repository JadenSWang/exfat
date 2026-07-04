import { Stack } from 'expo-router'

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="log" options={{ title: 'Log food', presentation: 'modal' }} />
      <Stack.Screen name="edit" options={{ title: 'Edit entry', presentation: 'modal' }} />
      <Stack.Screen name="scan" options={{ title: 'Scan barcode', presentation: 'modal' }} />
      <Stack.Screen name="simulate" options={{ title: 'Simulate', presentation: 'modal' }} />
      <Stack.Screen name="assistant" options={{ title: 'AI helper', presentation: 'modal' }} />
      <Stack.Screen name="pantry" options={{ title: 'My Pantry' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
    </Stack>
  )
}
