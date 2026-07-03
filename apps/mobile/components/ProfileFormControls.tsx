// Shared pickers for the onboarding and settings profile forms.

import type { BiologicalSex, WeightUnit } from '@workout/supabase'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import type { Goal } from '@/lib/nutrition'

const CM_PER_IN = 2.54

/** Split a centimeter height into whole feet + inches (rounded, no 12" spill). */
function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalIn = Math.round(cm / CM_PER_IN)
  return { ft: Math.floor(totalIn / 12), inch: totalIn % 12 }
}

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

const SEX_OPTIONS: { value: BiologicalSex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]

/** Biological sex — the Mifflin–St Jeor equation needs it to size resting BMR. */
export function SexPicker({
  sex,
  onChange,
}: {
  sex: BiologicalSex | null
  onChange: (sex: BiologicalSex) => void
}) {
  return (
    <View style={styles.goalRow}>
      {SEX_OPTIONS.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          onPress={() => onChange(option.value)}
          style={[styles.goalOption, sex === option.value && styles.goalOptionActive]}
        >
          <Text style={[styles.goalLabel, sex === option.value && styles.goalLabelActive]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

/**
 * Height entry that reports centimeters upward but lets the user type in the
 * system they think in (ft/in for imperial, cm for metric). Text state lives
 * here so typing stays stable; only the resolved cm value is lifted out. The
 * initial system follows the weight unit, and switching systems preserves the
 * height already entered. `initialCm` seeds the fields once on mount, so mount
 * it after any async profile load (e.g. behind a `hydrated` gate).
 */
export function HeightInput({
  initialCm,
  weightUnit,
  onChange,
}: {
  initialCm: number | null
  weightUnit: WeightUnit
  onChange: (cm: number | null) => void
}) {
  const [system, setSystem] = useState<'imperial' | 'metric'>(
    weightUnit === 'kg' ? 'metric' : 'imperial',
  )
  const seedImperial = initialCm != null ? cmToFtIn(initialCm) : null
  const [ftText, setFtText] = useState(seedImperial ? String(seedImperial.ft) : '')
  const [inText, setInText] = useState(seedImperial ? String(seedImperial.inch) : '')
  const [cmText, setCmText] = useState(initialCm != null ? String(Math.round(initialCm)) : '')

  function currentCm(): number | null {
    if (system === 'metric') {
      const cm = Number.parseFloat(cmText)
      return Number.isFinite(cm) && cm > 0 ? Math.round(cm) : null
    }
    const ft = Number.parseInt(ftText || '0', 10)
    const inch = Number.parseInt(inText || '0', 10)
    return ft || inch ? Math.round((ft * 12 + inch) * CM_PER_IN) : null
  }

  function switchSystem(next: 'imperial' | 'metric') {
    if (next === system) return
    const cm = currentCm() // preserve the height across the unit switch
    if (next === 'metric') {
      setCmText(cm != null ? String(cm) : '')
    } else if (cm != null) {
      const { ft, inch } = cmToFtIn(cm)
      setFtText(String(ft))
      setInText(String(inch))
    }
    setSystem(next)
    onChange(cm)
  }

  return (
    <View style={styles.heightBlock}>
      {system === 'imperial' ? (
        <View style={styles.heightRow}>
          <View style={styles.heightUnitField}>
            <TextInput
              style={styles.heightInput}
              value={ftText}
              onChangeText={(raw) => {
                const next = raw.replace(/[^0-9]/g, '')
                setFtText(next)
                const ft = Number.parseInt(next || '0', 10)
                const inch = Number.parseInt(inText || '0', 10)
                onChange(ft || inch ? Math.round((ft * 12 + inch) * CM_PER_IN) : null)
              }}
              keyboardType="number-pad"
              placeholder="5"
              placeholderTextColor="#AAA"
              maxLength={1}
            />
            <Text style={styles.heightSuffix}>ft</Text>
          </View>
          <View style={styles.heightUnitField}>
            <TextInput
              style={styles.heightInput}
              value={inText}
              onChangeText={(raw) => {
                const next = raw.replace(/[^0-9]/g, '')
                setInText(next)
                const ft = Number.parseInt(ftText || '0', 10)
                const inch = Number.parseInt(next || '0', 10)
                onChange(ft || inch ? Math.round((ft * 12 + inch) * CM_PER_IN) : null)
              }}
              keyboardType="number-pad"
              placeholder="10"
              placeholderTextColor="#AAA"
              maxLength={2}
            />
            <Text style={styles.heightSuffix}>in</Text>
          </View>
        </View>
      ) : (
        <View style={styles.heightUnitField}>
          <TextInput
            style={styles.heightInput}
            value={cmText}
            onChangeText={(raw) => {
              const next = raw.replace(/[^0-9]/g, '')
              setCmText(next)
              const cm = Number.parseInt(next, 10)
              onChange(Number.isFinite(cm) && cm > 0 ? cm : null)
            }}
            keyboardType="number-pad"
            placeholder="178"
            placeholderTextColor="#AAA"
            maxLength={3}
          />
          <Text style={styles.heightSuffix}>cm</Text>
        </View>
      )}
      <View style={styles.toggle}>
        {(['imperial', 'metric'] as const).map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            onPress={() => switchSystem(option)}
            style={[styles.toggleOption, system === option && styles.toggleOptionActive]}
          >
            <Text style={[styles.toggleLabel, system === option && styles.toggleLabelActive]}>
              {option === 'imperial' ? 'ft/in' : 'cm'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

/**
 * Birth month + year only — enough to approximate age for the calorie formula
 * without asking for a full date of birth. Text state is held by the parent.
 * Renders a short reassurance that we're not being nosy.
 */
export function BirthDateInput({
  month,
  year,
  onChangeMonth,
  onChangeYear,
}: {
  month: string
  year: string
  onChangeMonth: (value: string) => void
  onChangeYear: (value: string) => void
}) {
  return (
    <View style={styles.birthBlock}>
      <View style={styles.birthRow}>
        <TextInput
          style={[styles.birthInput, styles.birthMonth]}
          value={month}
          onChangeText={(raw) => onChangeMonth(raw.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="MM"
          placeholderTextColor="#AAA"
          maxLength={2}
        />
        <TextInput
          style={[styles.birthInput, styles.birthYear]}
          value={year}
          onChangeText={(raw) => onChangeYear(raw.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="YYYY"
          placeholderTextColor="#AAA"
          maxLength={4}
        />
      </View>
      <Text style={styles.disclaimer}>
        We only ask for the month and year — just enough to approximate your age for a more accurate
        calorie target. We’re not trying to be intrusive, and we never need the exact day.
      </Text>
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
  heightBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heightRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  heightUnitField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    paddingHorizontal: 12,
  },
  heightInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '600',
    color: '#111',
  },
  heightSuffix: {
    fontSize: 15,
    color: '#999',
  },
  birthBlock: {
    gap: 8,
  },
  birthRow: {
    flexDirection: 'row',
    gap: 12,
  },
  birthInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    padding: 12,
    fontSize: 22,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
  },
  birthMonth: {
    width: 88,
  },
  birthYear: {
    flex: 1,
  },
  disclaimer: {
    fontSize: 13,
    color: '#999',
    lineHeight: 18,
  },
})
