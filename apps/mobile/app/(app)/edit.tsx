import type { FoodUnit } from '@workout/core'
import { deleteDiaryEntry, updateDiaryEntryNutrition } from '@workout/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { Button } from '@/components/Button'
import { Screen } from '@/components/Screen'
import { supabase } from '@/lib/supabase'

/**
 * Edit an existing diary entry in place: adjust its name, quantity, and macros,
 * or delete it. Changing the quantity rescales the macros proportionally so the
 * common case (I actually ate 3, not 2) needs a single edit. Any edit marks the
 * entry as `manual` — the numbers are now user-confirmed, not an estimate.
 *
 * The entry's fields arrive as route params (expo-router stringifies them); we
 * seed local state from them once and never re-read, so typing is stable.
 */
export default function EditEntryScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{
    id: string
    name: string
    quantity: string
    unit: string
    calories: string
    protein: string
    carbs: string
    fat: string
  }>()

  const unit = (params.unit ?? 'serving') as FoodUnit
  const [name, setName] = useState(params.name ?? '')
  const [quantity, setQuantity] = useState(() => parseNumber(params.quantity))
  const [calories, setCalories] = useState(() => parseNumber(params.calories))
  const [protein, setProtein] = useState(() => parseNumber(params.protein))
  const [carbs, setCarbs] = useState(() => parseNumber(params.carbs))
  const [fat, setFat] = useState(() => parseNumber(params.fat))
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Bumping the quantity rescales the macros by the same ratio, so the numbers
  // stay in step with the amount. Scaling from the *current* values (not the
  // originals) means direct macro edits survive later quantity tweaks.
  function changeQuantity(next: number) {
    if (quantity > 0 && next > 0) {
      const factor = next / quantity
      setCalories((c) => c * factor)
      setProtein((p) => p * factor)
      setCarbs((c) => c * factor)
      setFat((f) => f * factor)
    }
    setQuantity(next)
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Give this entry a name.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      await updateDiaryEntryNutrition(supabase, params.id, {
        description: name.trim(),
        quantity,
        unit,
        calories,
        protein,
        carbs,
        fat,
        // A hand-edited entry is no longer an AI guess or a raw barcode match.
        source: 'manual',
        foodId: null,
      })
      await queryClient.invalidateQueries({ queryKey: ['diary'] })
      router.back()
    } catch {
      setError('Could not save your changes — is the backend running?')
    } finally {
      setIsSaving(false)
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this entry?', name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: handleDelete },
    ])
  }

  async function handleDelete() {
    setError(null)
    setIsDeleting(true)
    try {
      await deleteDiaryEntry(supabase, params.id)
      await queryClient.invalidateQueries({ queryKey: ['diary'] })
      router.back()
    } catch {
      setError('Could not delete that entry — is the backend running?')
      setIsDeleting(false)
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>Food</Text>
            <TextInput
              style={styles.textField}
              value={name}
              onChangeText={setName}
              placeholder="Food name"
              placeholderTextColor="#AAA"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Amount</Text>
            <View style={styles.quantityRow}>
              <TextInput
                style={[styles.textField, styles.quantityInput]}
                value={formatNumberInput(quantity)}
                onChangeText={(raw) => changeQuantity(parseNumberInput(raw))}
                keyboardType="numeric"
                selectTextOnFocus
              />
              <Text style={styles.unit}>{unit}</Text>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Per this amount</Text>
            <View style={styles.numbersRow}>
              <NumberField label="kcal" value={calories} onChangeNumber={setCalories} />
              <NumberField label="P" value={protein} onChangeNumber={setProtein} />
              <NumberField label="C" value={carbs} onChangeNumber={setCarbs} />
              <NumberField label="F" value={fat} onChangeNumber={setFat} />
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button label="Save changes" onPress={handleSave} loading={isSaving} />
          <Pressable
            accessibilityRole="button"
            onPress={confirmDelete}
            disabled={isDeleting}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.dimmed]}
          >
            <Text style={styles.deleteLabel}>{isDeleting ? 'Deleting…' : 'Delete entry'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

function NumberField({
  label,
  value,
  onChangeNumber,
}: {
  label: string
  value: number
  onChangeNumber: (value: number) => void
}) {
  return (
    <View style={styles.numberField}>
      <Text style={styles.numberLabel}>{label}</Text>
      <TextInput
        style={styles.numberInput}
        value={formatNumberInput(value)}
        onChangeText={(raw) => onChangeNumber(parseNumberInput(raw))}
        keyboardType="numeric"
        selectTextOnFocus
      />
    </View>
  )
}

function parseNumber(raw: string | undefined): number {
  const parsed = Number.parseFloat(raw ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

function formatNumberInput(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

function parseNumberInput(raw: string): number {
  const parsed = Number.parseFloat(raw.replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: 20,
    paddingBottom: 40,
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
  textField: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    padding: 12,
    fontSize: 16,
    color: '#111',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityInput: {
    flex: 1,
  },
  unit: {
    fontSize: 16,
    color: '#666',
    minWidth: 56,
  },
  numbersRow: {
    flexDirection: 'row',
    gap: 8,
  },
  numberField: {
    flex: 1,
    gap: 4,
  },
  numberLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '700',
    textAlign: 'center',
  },
  numberInput: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    paddingVertical: 8,
    paddingHorizontal: 6,
    fontSize: 15,
    color: '#111',
    textAlign: 'center',
  },
  error: {
    color: '#d00',
    fontSize: 14,
    lineHeight: 20,
  },
  deleteButton: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLabel: {
    color: '#d00',
    fontSize: 16,
    fontWeight: '600',
  },
  dimmed: {
    opacity: 0.6,
  },
})
