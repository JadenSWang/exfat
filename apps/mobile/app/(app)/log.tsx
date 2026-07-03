import { sumMacros, type EstimatedFoodItem } from '@workout/core'
import { logDiaryEntries, type DiaryEntryInput } from '@workout/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
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
import { EstimateTag } from '@/components/EstimateTag'
import { Screen } from '@/components/Screen'
import { estimateNutrition } from '@/lib/estimate'
import { defaultMealForNow, todayISODate } from '@/lib/nutrition'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth'

const ESTIMATE_NOTE = 'These are AI estimates. For exact values, scan a barcode (coming soon).'

export default function LogFoodScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [text, setText] = useState('')
  const [items, setItems] = useState<EstimatedFoodItem[] | null>(null)
  const [isEstimating, setIsEstimating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleEstimate() {
    if (!text.trim() || isEstimating) return
    setError(null)
    setIsEstimating(true)
    try {
      const result = await estimateNutrition(text.trim())
      setItems(result.items)
      if (result.items.length === 0) {
        setError('No foods were recognized in that description. Try adding more detail.')
      }
    } catch {
      // Estimator unreachable — surface a friendly hint, don't crash.
      setError(
        'Could not reach the estimator. Make sure the paseo estimator is running on your machine and you are on the same Tailscale network.',
      )
    } finally {
      setIsEstimating(false)
    }
  }

  function updateItem(index: number, patch: Partial<EstimatedFoodItem>) {
    setItems((prev) =>
      prev ? prev.map((item, i) => (i === index ? { ...item, ...patch } : item)) : prev,
    )
  }

  function removeItem(index: number) {
    setItems((prev) => (prev ? prev.filter((_, i) => i !== index) : prev))
  }

  async function handleSave() {
    if (!items || items.length === 0 || isSaving) return
    if (!user) {
      setError('You need to be signed in to save to your diary.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      const entryDate = todayISODate()
      // Meal is implied from the time of day — we don't ask.
      const meal = defaultMealForNow()
      const entries: DiaryEntryInput[] = items.map((item) => ({
        entryDate,
        meal,
        description: item.name,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        source: 'ai_estimate',
      }))
      await logDiaryEntries(supabase, user.id, entries)
      await queryClient.invalidateQueries({ queryKey: ['diary', entryDate] })
      router.back()
    } catch {
      setError('Could not save to your diary — is the backend running?')
    } finally {
      setIsSaving(false)
    }
  }

  const total = items ? sumMacros(items) : null

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.field}>
            <Text style={styles.label}>What did you eat?</Text>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="e.g. 3 tbsp egg white, 68g avocado, 2 eggs, 89g cottage cheese"
              placeholderTextColor="#AAA"
              multiline
              editable={!isEstimating}
            />
          </View>

          <Button
            label="Estimate"
            onPress={handleEstimate}
            loading={isEstimating}
            disabled={!text.trim()}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {items && items.length > 0 ? (
            <View style={styles.results}>
              <View style={styles.noteRow}>
                <EstimateTag />
                <Text style={styles.note}>{ESTIMATE_NOTE}</Text>
              </View>

              {items.map((item, index) => (
                <EstimatedRow
                  key={index}
                  item={item}
                  onChange={(patch) => updateItem(index, patch)}
                  onRemove={() => removeItem(index)}
                />
              ))}

              {total ? (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>
                    {Math.round(total.calories)} kcal · {Math.round(total.protein)}P /{' '}
                    {Math.round(total.carbs)}C / {Math.round(total.fat)}F
                  </Text>
                </View>
              ) : null}

              <Button label="Save to diary" onPress={handleSave} loading={isSaving} />
            </View>
          ) : null}

          <View style={styles.seams}>
            <Text style={styles.seamsHeading}>More ways to log (coming soon)</Text>
            <DisabledButton label="Scan barcode" />
            <DisabledButton label="Search database" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

interface EstimatedRowProps {
  item: EstimatedFoodItem
  onChange: (patch: Partial<EstimatedFoodItem>) => void
  onRemove: () => void
}

function EstimatedRow({ item, onChange, onRemove }: EstimatedRowProps) {
  return (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <TextInput
          style={styles.itemName}
          value={item.name}
          onChangeText={(name) => onChange({ name })}
          placeholder="Food name"
          placeholderTextColor="#AAA"
        />
        <Pressable accessibilityRole="button" onPress={onRemove} hitSlop={8}>
          <Text style={styles.remove}>Remove</Text>
        </Pressable>
      </View>

      <View style={styles.itemMetaRow}>
        <EstimateTag />
        <Text style={styles.itemQty}>
          {formatQuantity(item.quantity)} {item.unit}
        </Text>
      </View>

      <View style={styles.numbersRow}>
        <NumberField
          label="kcal"
          value={item.calories}
          onChangeNumber={(calories) => onChange({ calories })}
        />
        <NumberField
          label="P"
          value={item.protein}
          onChangeNumber={(protein) => onChange({ protein })}
        />
        <NumberField label="C" value={item.carbs} onChangeNumber={(carbs) => onChange({ carbs })} />
        <NumberField label="F" value={item.fat} onChangeNumber={(fat) => onChange({ fat })} />
      </View>
    </View>
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

function DisabledButton({ label }: { label: string }) {
  return (
    <View style={styles.disabledButton}>
      <Text style={styles.disabledLabel}>{label}</Text>
      <Text style={styles.disabledHint}>Coming soon</Text>
    </View>
  )
}

function formatQuantity(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(1)
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
  screen: {
    paddingBottom: 0,
  },
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
  input: {
    minHeight: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    padding: 12,
    fontSize: 16,
    color: '#111',
    textAlignVertical: 'top',
  },
  error: {
    color: '#d00',
    fontSize: 14,
    lineHeight: 20,
  },
  results: {
    gap: 12,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  note: {
    flex: 1,
    fontSize: 13,
    color: '#B26A00',
    lineHeight: 18,
  },
  itemCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    padding: 12,
    gap: 10,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  itemName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  remove: {
    fontSize: 13,
    color: '#d00',
    fontWeight: '600',
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemQty: {
    fontSize: 13,
    color: '#999',
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
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
  },
  totalValue: {
    fontSize: 14,
    color: '#666',
  },
  seams: {
    gap: 10,
    marginTop: 8,
  },
  seamsHeading: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#999',
    letterSpacing: 0.5,
  },
  disabledButton: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    backgroundColor: '#F7F7F9',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  disabledLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#AAA',
  },
  disabledHint: {
    fontSize: 12,
    color: '#BBB',
  },
})
