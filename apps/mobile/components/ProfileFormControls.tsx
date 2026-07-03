// Shared pickers for the onboarding and settings profile forms.

import type { WeightUnit } from '@workout/supabase'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { Goal } from '@/lib/nutrition'

const GOAL_OPTIONS: { value: Goal; label: string }[] = [
  { value: 'lose', label: 'Lose weight' },
  { value: 'recomp', label: 'Recomp' },
  { value: 'bulk', label: 'Bulk' },
]

export function GoalPicker({ goal, onChange }: { goal: Goal; onChange: (goal: Goal) => void }) {
  return (
    <View style={styles.goalRow}>
      {GOAL_OPTIONS.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          onPress={() => onChange(option.value)}
          style={[styles.goalOption, goal === option.value && styles.goalOptionActive]}
        >
          <Text style={[styles.goalLabel, goal === option.value && styles.goalLabelActive]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

export function UnitToggle({
  unit,
  onChange,
}: {
  unit: WeightUnit
  onChange: (unit: WeightUnit) => void
}) {
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
  goalRow: {
    flexDirection: 'row',
    gap: 8,
  },
  goalOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E9',
  },
  goalOptionActive: {
    borderColor: '#111',
    backgroundColor: '#111',
  },
  goalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  goalLabelActive: {
    color: '#fff',
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
})
