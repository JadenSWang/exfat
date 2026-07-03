import {
  getNutritionGoals,
  getProfile,
  signOut,
  updateProfileWeight,
  upsertNutritionGoals,
  type WeightUnit,
} from '@workout/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { Button } from '@/components/Button'
import { GoalPicker, UnitToggle } from '@/components/ProfileFormControls'
import { Screen } from '@/components/Screen'
import { goalsFromCalories, suggestCalorieTarget, type Goal } from '@/lib/nutrition'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth'

export default function SettingsScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () => getProfile(supabase),
  })
  const goalsQuery = useQuery({
    queryKey: ['nutrition-goals-row'],
    queryFn: () => getNutritionGoals(supabase),
  })

  const [weightText, setWeightText] = useState('')
  const [unit, setUnit] = useState<WeightUnit>('lb')
  const [goal, setGoal] = useState<Goal>('recomp')
  // Null while untouched — track the suggestion from weight + goal. Seeded
  // with the saved target so we don't clobber a hand-picked number.
  const [calorieOverride, setCalorieOverride] = useState<number | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefill the form once both queries settle.
  useEffect(() => {
    if (hydrated || profileQuery.isLoading || goalsQuery.isLoading) return
    const profile = profileQuery.data
    if (profile?.weight) {
      setWeightText(String(profile.weight))
      setUnit(profile.default_unit)
    }
    if (goalsQuery.data) setCalorieOverride(goalsQuery.data.calories)
    setHydrated(true)
  }, [hydrated, profileQuery.isLoading, profileQuery.data, goalsQuery.isLoading, goalsQuery.data])

  const weight = Number.parseFloat(weightText)
  const hasWeight = Number.isFinite(weight) && weight > 0
  const suggested = hasWeight ? suggestCalorieTarget(weight, unit, goal) : null
  const calories = calorieOverride ?? suggested

  async function handleSave() {
    if (!hasWeight || !calories || isSaving) return
    if (!user) {
      setError('You need to be signed in to save.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      await updateProfileWeight(supabase, user.id, weight, unit)
      await upsertNutritionGoals(supabase, user.id, goalsFromCalories(calories, weight, unit))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['nutrition-goals'] }),
        queryClient.invalidateQueries({ queryKey: ['nutrition-goals-row'] }),
      ])
      router.back()
    } catch {
      setError('Could not save — is the backend running?')
      setIsSaving(false)
    }
  }

  if (!hydrated) {
    return (
      <Screen style={styles.screen}>
        <View style={styles.loading}>
          <ActivityIndicator color="#208AEF" />
        </View>
      </Screen>
    )
  }

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.field}>
            <Text style={styles.label}>Your weight</Text>
            <View style={styles.weightRow}>
              <TextInput
                style={styles.weightInput}
                value={weightText}
                onChangeText={(raw) => {
                  setWeightText(raw.replace(/[^0-9.]/g, ''))
                  setCalorieOverride(null)
                }}
                keyboardType="decimal-pad"
                placeholder={unit === 'lb' ? '160' : '73'}
                placeholderTextColor="#AAA"
              />
              <UnitToggle
                unit={unit}
                onChange={(next) => {
                  setUnit(next)
                  setCalorieOverride(null)
                }}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Your goal</Text>
            <GoalPicker
              goal={goal}
              onChange={(next) => {
                setGoal(next)
                setCalorieOverride(null)
              }}
            />
          </View>

          {calories ? (
            <View style={styles.targetCard}>
              <Text style={styles.targetLabel}>Daily calorie target</Text>
              <View style={styles.targetRow}>
                <TextInput
                  style={styles.targetInput}
                  value={String(calories)}
                  onChangeText={(raw) => {
                    const parsed = Number.parseInt(raw.replace(/[^0-9]/g, ''), 10)
                    setCalorieOverride(Number.isFinite(parsed) ? parsed : 0)
                  }}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <Text style={styles.targetUnit}>kcal</Text>
              </View>
              <Text style={styles.targetHint}>
                Change your weight or goal to get a fresh suggestion, or type your own number.
              </Text>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label="Save"
            onPress={handleSave}
            loading={isSaving}
            disabled={!hasWeight || !calories}
          />

          <Pressable accessibilityRole="button" onPress={() => signOut(supabase)} hitSlop={8}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 24,
  },
  flex: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 24,
    paddingTop: 24,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#999',
    letterSpacing: 0.5,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  weightInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    padding: 12,
    fontSize: 22,
    fontWeight: '600',
    color: '#111',
  },
  targetCard: {
    backgroundColor: '#F7F7F9',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  targetLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#999',
    letterSpacing: 0.5,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  targetInput: {
    fontSize: 34,
    fontWeight: '800',
    color: '#111',
    padding: 0,
    minWidth: 90,
  },
  targetUnit: {
    fontSize: 15,
    color: '#999',
  },
  targetHint: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  error: {
    color: '#d00',
    fontSize: 14,
    lineHeight: 20,
  },
  signOut: {
    fontSize: 15,
    color: '#d00',
    fontWeight: '600',
    textAlign: 'center',
  },
})
