import type { FoodUnit } from '@workout/core'
import type { Tables } from '@workout/supabase'
import {
  logDiaryEntries,
  lookupBarcode,
  saveCorrectedFood,
  submitBarcodeFood,
  updateDiaryEntryNutrition,
} from '@workout/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
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
import {
  EstimateJobLostError,
  getLabelJob,
  startLabelScanJob,
  type LabelScan,
} from '@/lib/estimate'
import { defaultMealForNow, todayISODate } from '@/lib/nutrition'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth'

// Retail food barcodes only — QR/PDF417 etc. are never nutrition labels.
const FOOD_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const

const GRAMS_PER_UNIT: Partial<Record<FoodUnit, number>> = { g: 1, oz: 28.35 }
const ML_PER_UNIT: Partial<Record<FoodUnit, number>> = { ml: 1, tsp: 4.93, tbsp: 14.79, cup: 236.59 }

/**
 * How many servings of `food` the original entry's quantity corresponds to,
 * or null when the units aren't comparable (e.g. an entry in grams against a
 * food whose label only gives per-serving numbers).
 */
function servingsForQuantity(
  food: Tables<'foods'>,
  quantity: number,
  unit: FoodUnit,
): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0 || food.serving_qty <= 0) return null
  const grams = GRAMS_PER_UNIT[unit]
  if (food.serving_unit === 'g' && grams) return (quantity * grams) / food.serving_qty
  const ml = ML_PER_UNIT[unit]
  if (food.serving_unit === 'ml' && ml) return (quantity * ml) / food.serving_qty
  // Count-based entries: treat each piece/serving as one serving of the product.
  if (unit === 'serving' || unit === 'piece') {
    return food.serving_unit === 'serving' ? quantity / food.serving_qty : quantity
  }
  return null
}

const LABEL_POLL_INTERVAL_MS = 2000
const LABEL_POLL_TIMEOUT_MS = 90 * 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Upload the photographed label and poll until the estimator's OCR agent
 * returns the per-serving facts. Mirrors the fire-and-forget job polling in
 * pendingLogs.ts: resubmit if the estimator restarted and lost the job.
 */
async function pollLabelScan(imageBase64: string): Promise<LabelScan> {
  let jobId = await startLabelScanJob(imageBase64)
  const deadline = Date.now() + LABEL_POLL_TIMEOUT_MS
  let resubmits = 0
  while (Date.now() < deadline) {
    await sleep(LABEL_POLL_INTERVAL_MS)
    let job
    try {
      job = await getLabelJob(jobId)
    } catch (e) {
      if (e instanceof EstimateJobLostError) {
        if (resubmits >= 2) {
          throw new Error('The estimator keeps restarting. Try again in a minute.')
        }
        resubmits += 1
        jobId = await startLabelScanJob(imageBase64)
        continue
      }
      // Dropped poll (network blip) — retry on the next tick.
      continue
    }
    if (job.status === 'done' && job.result) return job.result
    if (job.status === 'error') {
      throw new Error(job.error ?? 'Could not read the nutrition label.')
    }
  }
  throw new Error('Timed out reading the label. Try again with better lighting.')
}

type Phase =
  | { kind: 'scanning' }
  | { kind: 'looking-up'; barcode: string }
  | { kind: 'found'; food: Tables<'foods'> }
  | { kind: 'scan-label'; food: Tables<'foods'> }
  | { kind: 'reading-label'; food: Tables<'foods'> }
  | { kind: 'confirm-label'; food: Tables<'foods'>; extracted: SubmitLabelInput }
  | { kind: 'not-found'; barcode: string }

export default function ScanBarcodeScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  // When set, we're refining an existing AI-estimated diary entry: the scanned
  // product replaces that entry's nutrition instead of logging a new one. The
  // entry keeps its logged quantity/unit; macros are rescaled to it.
  const params = useLocalSearchParams<{
    date?: string
    refineEntryId?: string
    refineQty?: string
    refineUnit?: string
  }>()
  const refine = params.refineEntryId
    ? {
        entryId: params.refineEntryId,
        quantity: Number.parseFloat(params.refineQty ?? ''),
        unit: (params.refineUnit ?? 'serving') as FoodUnit,
      }
    : null
  const [permission, requestPermission] = useCameraPermissions()

  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' })
  const [servings, setServings] = useState(1)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Guards against the camera firing onBarcodeScanned many times per second.
  const handledRef = useRef(false)
  // Imperative handle for the still-capture camera used to photograph a label.
  const cameraRef = useRef<CameraView>(null)

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

  // Snap the nutrition label, read it via the estimator, and hand the extracted
  // numbers to the confirmation form. Returns to the found screen on failure.
  async function readLabel(food: Tables<'foods'>) {
    setError(null)
    let base64: string | undefined
    try {
      const photo = await cameraRef.current?.takePictureAsync({ base64: true, quality: 0.5 })
      base64 = photo?.base64
    } catch {
      setError('Could not capture the photo — try again.')
      return
    }
    if (!base64) {
      setError('Could not capture the photo — try again.')
      return
    }
    setPhase({ kind: 'reading-label', food })
    try {
      const scan = await pollLabelScan(base64)
      setPhase({
        kind: 'confirm-label',
        food,
        extracted: {
          barcode: food.barcode ?? '',
          name: scan.name,
          brand: scan.brand,
          servingQty: scan.servingQty,
          servingUnit: scan.servingUnit,
          calories: scan.calories,
          protein: scan.protein,
          carbs: scan.carbs,
          fat: scan.fat,
        },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the label — try again.')
      setPhase({ kind: 'found', food })
    }
  }

  async function saveFood(food: Tables<'foods'>, servingCount: number) {
    if (!user) {
      setError('You need to be signed in to save to your diary.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      if (refine) {
        // Keep the entry's date, meal, and logged quantity; rescale macros to
        // that quantity using the label's per-serving numbers. If the units
        // aren't comparable, `servingCount` is the user's stepper choice.
        const auto = servingsForQuantity(food, refine.quantity, refine.unit)
        const factor = auto ?? servingCount
        const keepQuantity = Number.isFinite(refine.quantity) && refine.quantity > 0
        await updateDiaryEntryNutrition(supabase, refine.entryId, {
          description: food.brand ? `${food.brand} ${food.name}` : food.name,
          quantity: keepQuantity ? refine.quantity : food.serving_qty * factor,
          unit: keepQuantity ? refine.unit : food.serving_unit,
          calories: food.calories * factor,
          protein: food.protein * factor,
          carbs: food.carbs * factor,
          fat: food.fat * factor,
          source: 'barcode',
          foodId: food.id,
        })
      } else {
        await logDiaryEntries(supabase, user.id, [
          {
            // The log screen passes the diary's selected day, so scans can
            // land on past days too.
            entryDate: params.date ?? todayISODate(),
            // Meal is implied from the time of day — we don't ask.
            meal: defaultMealForNow(),
            description: food.brand ? `${food.brand} ${food.name}` : food.name,
            quantity: food.serving_qty * servingCount,
            unit: food.serving_unit,
            calories: food.calories * servingCount,
            protein: food.protein * servingCount,
            carbs: food.carbs * servingCount,
            fat: food.fat * servingCount,
            source: 'barcode',
            foodId: food.id,
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

  if (phase.kind === 'scanning') {
    return (
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: [...FOOD_BARCODE_TYPES] }}
          onBarcodeScanned={({ data }) => handleScanned(data)}
        />
        <View style={styles.cameraOverlay}>
          <Text style={styles.cameraHint}>
            {refine ? 'Scan the barcode to replace the estimate' : 'Point at a food barcode'}
          </Text>
          {error ? <Text style={styles.cameraError}>{error}</Text> : null}
        </View>
      </View>
    )
  }

  // The camera unmounts the moment a barcode is read — the scan feels instant
  // and the user isn't left holding the product up while we look it up.
  if (phase.kind === 'looking-up') {
    return (
      <Screen>
        <View style={styles.lookupWrap}>
          <ActivityIndicator size="large" color="#208AEF" />
          <Text style={styles.lookupTitle}>Got it!</Text>
          <Text style={styles.lookupSubtitle}>Looking up nutrition facts…</Text>
        </View>
      </Screen>
    )
  }

  if (phase.kind === 'found') {
    const { food } = phase
    const autoServings = refine ? servingsForQuantity(food, refine.quantity, refine.unit) : null
    const shownServings = autoServings ?? servings
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

          {autoServings != null && refine ? (
            <Text style={styles.refineNote}>
              For your logged {formatQuantity(refine.quantity)} {refine.unit}:
            </Text>
          ) : (
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
          )}

          <Text style={styles.totalLine}>
            {Math.round(food.calories * shownServings)} kcal ·{' '}
            {Math.round(food.protein * shownServings)}P /{' '}
            {Math.round(food.carbs * shownServings)}C / {Math.round(food.fat * shownServings)}F
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={refine ? 'Replace estimate' : 'Save to diary'}
            onPress={() => saveFood(food, servings)}
            loading={isSaving}
          />
          <Button
            label="Nutrition looks off? Scan the label"
            variant="secondary"
            onPress={() => {
              setError(null)
              setPhase({ kind: 'scan-label', food })
            }}
          />
          <Button label="Scan again" variant="secondary" onPress={resetScanner} />
        </ScrollView>
      </Screen>
    )
  }

  // Correct a scanned product whose numbers looked wrong: photograph the label
  // so the estimator can read the real per-serving facts off it.
  if (phase.kind === 'scan-label') {
    const { food } = phase
    return (
      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} />
        <View style={styles.cameraOverlay}>
          <Text style={styles.cameraHint}>Fill the frame with the Nutrition Facts panel</Text>
          {error ? <Text style={styles.cameraError}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Capture label"
            style={styles.shutterButton}
            onPress={() => readLabel(food)}
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setPhase({ kind: 'found', food })}>
            <Text style={styles.cameraCancel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (phase.kind === 'reading-label') {
    return (
      <Screen>
        <View style={styles.lookupWrap}>
          <ActivityIndicator size="large" color="#208AEF" />
          <Text style={styles.lookupTitle}>Reading the label…</Text>
          <Text style={styles.lookupSubtitle}>Pulling the numbers off the photo.</Text>
        </View>
      </Screen>
    )
  }

  // Prefilled with the scanned numbers so the user can eyeball/fix them before
  // they overwrite the entry's macros. Saved as a private corrected food.
  if (phase.kind === 'confirm-label') {
    const { food, extracted } = phase
    return (
      <SubmitLabelForm
        barcode={extracted.barcode}
        initial={extracted}
        title="Confirm the label"
        subtitle="Check these against the label, then use them to replace the calories and macros on this item."
        submitLabel="Use these values"
        error={error}
        isSaving={isSaving}
        onCancel={() => setPhase({ kind: 'found', food })}
        onSubmit={async (input) => {
          if (!user) {
            setError('You need to be signed in to save corrections.')
            return
          }
          setError(null)
          setIsSaving(true)
          try {
            const corrected = await saveCorrectedFood(supabase, user.id, input)
            await saveFood(corrected, servings)
          } catch {
            setError('Could not save the correction — is the backend running?')
          } finally {
            setIsSaving(false)
          }
        }}
      />
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
  initial,
  title = 'New product',
  subtitle,
  submitLabel = 'Save and log',
  error,
  isSaving,
  onCancel,
  onSubmit,
}: {
  barcode: string
  initial?: Partial<SubmitLabelInput>
  title?: string
  subtitle?: string
  submitLabel?: string
  error: string | null
  isSaving: boolean
  onCancel: () => void
  onSubmit: (input: SubmitLabelInput) => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [brand, setBrand] = useState(initial?.brand ?? '')
  const [servingQty, setServingQty] = useState(initial?.servingQty ?? 1)
  const [servingUnit, setServingUnit] = useState<'g' | 'ml' | 'serving'>(
    initial?.servingUnit ?? 'serving',
  )
  const [calories, setCalories] = useState(initial?.calories ?? 0)
  const [protein, setProtein] = useState(initial?.protein ?? 0)
  const [carbs, setCarbs] = useState(initial?.carbs ?? 0)
  const [fat, setFat] = useState(initial?.fat ?? 0)

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.missTitle}>{title}</Text>
          <Text style={styles.missSubtitle}>
            {subtitle ??
              `Nobody has logged this barcode yet (${barcode}). Copy the nutrition label to add it — you'll help everyone who scans it after you.`}
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
            label={submitLabel}
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
  lookupWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  lookupTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    marginTop: 8,
  },
  lookupSubtitle: {
    fontSize: 14,
    color: '#999',
  },
  cameraError: {
    color: '#FFB4B4',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  cameraCancel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 8,
    paddingHorizontal: 16,
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
  refineNote: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
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
