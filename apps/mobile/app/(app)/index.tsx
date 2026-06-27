import { estimateOneRepMax, totalVolume, type WorkoutSet } from '@workout/core'
import { signOut } from '@workout/supabase'
import { StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/Button'
import { Screen } from '@/components/Screen'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth'

// Sample data so the cross-package import from @workout/core is actually
// exercised (and therefore typechecked) at the call site.
const sampleSets: WorkoutSet[] = [
  { weight: 100, reps: 5, unit: 'kg', type: 'normal' },
  { weight: 100, reps: 5, unit: 'kg', type: 'normal' },
  { weight: 60, reps: 8, unit: 'kg', type: 'warmup' },
]

const estimatedOneRepMax = estimateOneRepMax(100, 5)
const sessionVolume = totalVolume(sampleSets)

export default function WorkoutsHomeScreen() {
  const { user } = useAuth()

  async function handleSignOut() {
    await signOut(supabase)
  }

  return (
    <Screen>
      <View style={styles.section}>
        <Text style={styles.heading}>Signed in</Text>
        <Text style={styles.value}>{user?.email ?? 'No email on file'}</Text>
        <Text style={styles.muted}>id: {user?.id ?? 'unknown'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>Sample metrics (@workout/core)</Text>
        <Text style={styles.value}>Est. 1RM @ 100kg x 5: {estimatedOneRepMax.toFixed(1)} kg</Text>
        <Text style={styles.value}>Session volume: {sessionVolume.toFixed(0)} kg</Text>
      </View>

      <View style={styles.spacer} />

      <Button label="Sign out" variant="secondary" onPress={handleSignOut} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  section: {
    gap: 4,
  },
  heading: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#999',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 17,
    color: '#111',
  },
  muted: {
    fontSize: 13,
    color: '#999',
  },
  spacer: {
    flex: 1,
  },
})
