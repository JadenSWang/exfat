import { updateProfileWeight, upsertNutritionGoals, type WeightUnit } from '@workout/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { Button } from '@/components/Button'
import { Screen } from '@/components/Screen'
import { goalsFromCalories, suggestCalorieTarget } from '@/lib/nutrition'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth'

export default function OnboardingScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [weightText, setWeightText] = useState('')
  const [unit, setUnit] = useState<WeightUnit>('lb')
  // Null while the user hasn't touched the target — track the suggestion.
  const [calorieOverride, setCalorieOverride] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const weight = Number.parseFloat(weightText)
  const hasWeight = Number.isFinite(weight) && weight > 0
  const suggested = hasWeight ? suggestCalorieTarget(weight, unit) : null
  const calories = calorieOverride ?? suggested

  async function handleContinue() {
    if (!hasWeight || !calories || isSaving) return
    if (!user) {
      setError('You need to be signed in to continue.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      await updateProfileWeight(supabase, user.id, weight, unit)
      await upsertNutritionGoals(supabase, user.id, goalsFromCalories(calories))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['nutrition-goals'] }),
      ])
      router.replace('/')
    } catch {
      setError('Could not save your profile — is the backend running?')
      setIsSaving(false)
    }
  }

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Welcome</Text>
            <Text style={styles.subtitle}>
              One question and you’re in — we’ll figure out the rest.
            </Text>
          </View>

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
                autoFocus
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
                Suggested from your weight — tweak it if you have a goal in mind.
              </Text>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label="Start tracking"
            onPress={handleContinue}
            loading={isSaving}
            disabled={!hasWeight || !calories}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

function UnitToggle({ unit, onChange }: { unit: WeightUnit; onChange: (unit: WeightUnit) => void }) {
  return (
    <View style={styles.toggle}>
      {(['lb', 'kg'] as const).map((option) => (
        <Pressable
          key={option}
          accessibilityRole="button"
          onPress={() => onChange(option)}
          style={[styles.toggleOption, unit === option && styles.toggleOptionActive]}
        >
          <Text style={[styles.toggleLabel, unit === option && styles.toggleLabelActive]}>
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 24,
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    gap: 24,
    paddingTop: 24,
  },
  header: {
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
  },
  subtitle: {
    fontSize: 15,
    color: '#999',
    lineHeight: 21,
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
  toggle: {
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: '#F7F7F9',
    padding: 3,
  },
  toggleOption: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 9,
  },
  toggleOptionActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#999',
  },
  toggleLabelActive: {
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
})
