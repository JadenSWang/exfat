import type { Tables } from '@workout/supabase'
import {
  logDiaryEntries,
  lookupBarcode,
  submitBarcodeFood,
  updateDiaryEntryNutrition,
} from '@workout/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
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
import { Screen } from '@/components/Screen'
import { defaultMealForNow, todayISODate } from '@/lib/nutrition'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth'

// Retail food barcodes only — QR/PDF417 etc. are never nutrition labels.
const FOOD_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const

type Phase =
  | { kind: 'scanning' }
  | { kind: 'looking-up'; barcode: string }
  | { kind: 'found'; food: Tables<'foods'> }
  | { kind: 'not-found'; barcode: string }

export default function ScanBarcodeScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  // When set, we're refining an existing AI-estimated diary entry: the scanned
  // product replaces that entry's nutrition instead of logging a new one.
  const { refineEntryId } = useLocalSearchParams<{ refineEntryId?: string }>()
  const [permission, requestPermission] = useCameraPermissions()

  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' })
  const [servings, setServings] = useState(1)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Guards against the camera firing onBarcodeScanned many times per second.
  const handledRef = useRef(false)

  async function handleScanned(barcode: string) {
    if (handledRef.current) return
    handledRef.current = true
    setError(null)
    setPhase({ kind: 'looking-up', barcode })
    try {
      const result = await lookupBarcode(supabase, barcode)
      if (result.found && result.food) {
        setServings(1)
        setPhase({ kind: 'found', food: result.food })
      } else {
        setPhase({ kind: 'not-found', barcode })
      }
    } catch {
      setError('Could not look up that barcode — check your connection and try again.')
      resetScanner()
    }
  }

  function resetScanner() {
    handledRef.current = false
    setPhase({ kind: 'scanning' })
  }

  async function saveFood(food: Tables<'foods'>, servingCount: number) {
    if (!user) {
      setError('You need to be signed in to save to your diary.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      const nutrition = {
        description: food.brand ? `${food.brand} ${food.name}` : food.name,
        quantity: food.serving_qty * servingCount,
        unit: food.serving_unit,
        calories: food.calories * servingCount,
        protein: food.protein * servingCount,
        carbs: food.carbs * servingCount,
        fat: food.fat * servingCount,
        source: 'barcode' as const,
        foodId: food.id,
      }
      if (refineEntryId) {
        // Keep the entry's date and meal; swap the estimate for label-accurate data.
        await updateDiaryEntryNutrition(supabase, refineEntryId, nutrition)
      } else {
        await logDiaryEntries(supabase, user.id, [
          {
            entryDate: todayISODate(),
            // Meal is implied from the time of day — we don't ask.
            meal: defaultMealForNow(),
            ...nutrition,
          },
        ])
      }
      await queryClient.invalidateQueries({ queryKey: ['diary'] })
      router.back()
    } catch {
      setError('Could not save to your diary — is the backend running?')
    } finally {
      setIsSaving(false)
    }
  }

  if (!permission?.granted) {
    return (
      <Screen>
        <Text style={styles.permissionText}>
          exFat needs camera access to scan food barcodes.
        </Text>
        <Button
          label={permission?.canAskAgain === false ? 'Enable in Settings' : 'Allow camera'}
          onPress={() => requestPermission()}
        />
      </Screen>
    )
  }

  if (phase.kind === 'scanning' || phase.kind === 'looking-up') {
    return (
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: [...FOOD_BARCODE_TYPES] }}
          onBarcodeScanned={({ data }) => handleScanned(data)}
        />
        <View style={styles.cameraOverlay}>
          <Text style={styles.cameraHint}>
            {phase.kind === 'looking-up'
              ? 'Looking up…'
              : refineEntryId
                ? 'Scan the barcode to replace the estimate'
                : 'Point at a food barcode'}
          </Text>
          {error ? <Text style={styles.cameraError}>{error}</Text> : null}
        </View>
      </View>
    )
  }

  if (phase.kind === 'found') {
    const { food } = phase
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.foodName}>{food.name}</Text>
            {food.brand ? <Text style={styles.foodBrand}>{food.brand}</Text> : null}
            <Text style={styles.servingInfo}>
              Per serving ({formatQuantity(food.serving_qty)} {food.serving_unit}):{' '}
              {Math.round(food.calories)} kcal · {Math.round(food.protein)}P /{' '}
              {Math.round(food.carbs)}C / {Math.round(food.fat)}F
            </Text>
          </View>

          <View style={styles.stepperRow}>
            <Text style={styles.stepperLabel}>Servings</Text>
            <View style={styles.stepper}>
              <StepperButton
                label="−"
                onPress={() => setServings((s) => Math.max(0.5, s - 0.5))}
              />
              <Text style={styles.stepperValue}>{formatQuantity(servings)}</Text>
              <StepperButton label="+" onPress={() => setServings((s) => s + 0.5)} />
            </View>
          </View>

          <Text style={styles.totalLine}>
            {Math.round(food.calories * servings)} kcal · {Math.round(food.protein * servings)}P /{' '}
            {Math.round(food.carbs * servings)}C / {Math.round(food.fat * servings)}F
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={refineEntryId ? 'Replace estimate' : 'Save to diary'}
            onPress={() => saveFood(food, servings)}
            loading={isSaving}
          />
          <Button label="Scan again" variant="secondary" onPress={resetScanner} />
        </ScrollView>
      </Screen>
    )
  }

  // Miss everywhere — crowdsource the label from the user.
  return (
    <SubmitLabelForm
      barcode={phase.barcode}
      error={error}
      isSaving={isSaving}
      onCancel={resetScanner}
      onSubmit={async (input) => {
        if (!user) {
          setError('You need to be signed in to submit nutrition facts.')
          return
        }
        setError(null)
        setIsSaving(true)
        try {
          const food = await submitBarcodeFood(supabase, user.id, input)
          await saveFood(food, 1)
        } catch {
          setError('Could not save the nutrition facts — is the backend running?')
        } finally {
          setIsSaving(false)
        }
      }}
    />
  )
}

interface SubmitLabelInput {
  barcode: string
  name: string
  brand: string | null
  servingQty: number
  servingUnit: 'g' | 'ml' | 'serving'
  calories: number
  protein: number
  carbs: number
  fat: number
}

function SubmitLabelForm({
  barcode,
  error,
  isSaving,
  onCancel,
  onSubmit,
}: {
  barcode: string
  error: string | null
  isSaving: boolean
  onCancel: () => void
  onSubmit: (input: SubmitLabelInput) => void
}) {
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [servingQty, setServingQty] = useState(1)
  const [servingUnit, setServingUnit] = useState<'g' | 'ml' | 'serving'>('serving')
  const [calories, setCalories] = useState(0)
  const [protein, setProtein] = useState(0)
  const [carbs, setCarbs] = useState(0)
  const [fat, setFat] = useState(0)

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.missTitle}>New product</Text>
          <Text style={styles.missSubtitle}>
            Nobody has logged this barcode yet ({barcode}). Copy the nutrition label to add it —
            you&apos;ll help everyone who scans it after you.
          </Text>

          <TextInput
            style={styles.textField}
            value={name}
            onChangeText={setName}
            placeholder="Product name"
            placeholderTextColor="#AAA"
          />
          <TextInput
            style={styles.textField}
            value={brand}
            onChangeText={setBrand}
            placeholder="Brand (optional)"
            placeholderTextColor="#AAA"
          />

          <View style={styles.servingRow}>
            <NumberField label="Serving size" value={servingQty} onChangeNumber={setServingQty} />
            <View style={styles.unitPicker}>
              {(['g', 'ml', 'serving'] as const).map((unit) => (
                <Pressable
                  key={unit}
                  accessibilityRole="button"
                  onPress={() => setServingUnit(unit)}
                  style={[styles.unitOption, servingUnit === unit && styles.unitOptionActive]}
                >
                  <Text
                    style={[styles.unitLabel, servingUnit === unit && styles.unitLabelActive]}
                  >
                    {unit}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.numbersRow}>
            <NumberField label="kcal" value={calories} onChangeNumber={setCalories} />
            <NumberField label="P" value={protein} onChangeNumber={setProtein} />
            <NumberField label="C" value={carbs} onChangeNumber={setCarbs} />
            <NumberField label="F" value={fat} onChangeNumber={setFat} />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label="Save and log"
            loading={isSaving}
            disabled={!name.trim()}
            onPress={() =>
              onSubmit({
                barcode,
                name: name.trim(),
                brand: brand.trim() || null,
                servingQty,
                servingUnit,
                calories,
                protein,
                carbs,
                fat,
              })
            }
          />
          <Button label="Scan again" variant="secondary" onPress={onCancel} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

function StepperButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.stepperButton}>
      <Text style={styles.stepperButtonLabel}>{label}</Text>
    </Pressable>
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
  flex: {
    flex: 1,
  },
  content: {
    gap: 16,
    paddingBottom: 40,
  },
  permissionText: {
    fontSize: 16,
    color: '#111',
    lineHeight: 22,
  },
  cameraWrap: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 48,
    gap: 12,
  },
  cameraHint: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  cameraError: {
    color: '#FFB4B4',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    padding: 16,
    gap: 4,
  },
  foodName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  foodBrand: {
    fontSize: 14,
    color: '#666',
  },
  servingInfo: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonLabel: {
    fontSize: 20,
    color: '#208AEF',
    fontWeight: '600',
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    minWidth: 32,
    textAlign: 'center',
  },
  totalLine: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
  error: {
    color: '#d00',
    fontSize: 14,
    lineHeight: 20,
  },
  missTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  missSubtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  textField: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    padding: 12,
    fontSize: 16,
    color: '#111',
  },
  servingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  unitPicker: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    overflow: 'hidden',
    height: 37,
  },
  unitOption: {
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  unitOptionActive: {
    backgroundColor: '#208AEF',
  },
  unitLabel: {
    fontSize: 14,
    color: '#666',
  },
  unitLabelActive: {
    color: '#fff',
    fontWeight: '600',
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
})
