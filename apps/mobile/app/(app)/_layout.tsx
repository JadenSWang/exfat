import { Stack } from 'expo-router'

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Today' }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="log" options={{ title: 'Log food', presentation: 'modal' }} />
    </Stack>
  )
}
