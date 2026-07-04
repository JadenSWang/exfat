import type { Tables } from '@workout/supabase'
import { addPantryItems, consumePantryItem, getPantryItems } from '@workout/supabase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
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
  getReceiptJob,
  startReceiptScanJob,
  type ReceiptItem,
} from '@/lib/estimate'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/auth'

const RECEIPT_POLL_INTERVAL_MS = 2500
const RECEIPT_POLL_TIMEOUT_MS = 120 * 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Upload the photographed receipt and poll until the estimator's agent returns
 * the extracted food items. Same resubmit-on-restart pattern as the label scan.
 */
async function pollReceiptScan(imageBase64: string): Promise<ReceiptItem[]> {
  let jobId = await startReceiptScanJob(imageBase64)
  const deadline = Date.now() + RECEIPT_POLL_TIMEOUT_MS
  let resubmits = 0
  while (Date.now() < deadline) {
    await sleep(RECEIPT_POLL_INTERVAL_MS)
    let job
    try {
      job = await getReceiptJob(jobId)
    } catch (e) {
      if (e instanceof EstimateJobLostError) {
        if (resubmits >= 2) {
          throw new Error('The estimator keeps restarting. Try again in a minute.')
        }
        resubmits += 1
        jobId = await startReceiptScanJob(imageBase64)
        continue
      }
      // Dropped poll (network blip) — retry on the next tick.
      continue
    }
    if (job.status === 'done' && job.result) return job.result.items
    if (job.status === 'error') {
      throw new Error(job.error ?? 'Could not read that receipt.')
    }
  }
  throw new Error('Timed out reading the receipt. Try again with better lighting.')
}

/** A recency bucket for the pantry list. */
function recencyGroup(addedAt: string): string {
  const ageMs = Date.now() - new Date(addedAt).getTime()
  const day = 24 * 60 * 60 * 1000
  if (ageMs < day) return 'Today'
  if (ageMs < 7 * day) return 'This week'
  return 'Earlier'
}

type Phase =
  | { kind: 'list' }
  | { kind: 'capture' }
  | { kind: 'extracting' }
  | { kind: 'review'; items: ReceiptItem[]; excluded: Set<number> }

export default function PantryScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [permission, requestPermission] = useCameraPermissions()

  const [phase, setPhase] = useState<Phase>({ kind: 'list' })
  const [error, setError] = useState<string | null>(null)
  const cameraRef = useRef<CameraView>(null)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['pantry', user?.id],
    queryFn: () => getPantryItems(supabase),
    enabled: Boolean(user),
  })

  // Optimistic "used it": the row disappears immediately; the query refetches
  // (and would restore it) only if the update failed.
  const consume = useMutation({
    mutationFn: (itemId: string) => consumePantryItem(supabase, itemId),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: ['pantry', user?.id] })
      queryClient.setQueryData<Tables<'pantry_items'>[]>(
        ['pantry', user?.id],
        (prev) => prev?.filter((item) => item.id !== itemId) ?? [],
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['pantry', user?.id] }),
  })

  async function startReceiptCapture() {
    setError(null)
    if (!permission?.granted) {
      const result = await requestPermission()
      if (!result.granted) return
    }
    setPhase({ kind: 'capture' })
  }

  // Snap the receipt, extract its food items via the estimator, and hand them
  // to the review checklist. Returns to the list on failure.
  async function readReceipt() {
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
    setPhase({ kind: 'extracting' })
    try {
      const extracted = await pollReceiptScan(base64)
      setPhase({ kind: 'review', items: extracted, excluded: new Set() })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the receipt — try again.')
      setPhase({ kind: 'list' })
    }
  }

  const [isSaving, setIsSaving] = useState(false)

  // Manual quick-add: free-text names, comma-separated for several at once
  // ("eggs, milk, leftover rice"). No AI round-trip — pantry items are just
  // names, and the coach reads free text fine at planning time.
  const [manualText, setManualText] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  async function addManual() {
    if (!user) {
      setError('You need to be signed in to save your pantry.')
      return
    }
    const names = manualText
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (names.length === 0) return
    setError(null)
    setIsAdding(true)
    try {
      await addPantryItems(
        supabase,
        user.id,
        names.map((name) => ({ name, source: 'manual' as const })),
      )
      setManualText('')
      await queryClient.invalidateQueries({ queryKey: ['pantry', user.id] })
    } catch {
      setError('Could not save to your pantry — is the backend running?')
    } finally {
      setIsAdding(false)
    }
  }

  async function saveReviewed(reviewItems: ReceiptItem[], excluded: Set<number>) {
    if (!user) {
      setError('You need to be signed in to save your pantry.')
      return
    }
    const kept = reviewItems.filter((_, i) => !excluded.has(i))
    if (kept.length === 0) {
      setPhase({ kind: 'list' })
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      await addPantryItems(
        supabase,
        user.id,
        kept.map((item) => ({ name: item.name, brand: item.brand, source: 'receipt' as const })),
      )
      await queryClient.invalidateQueries({ queryKey: ['pantry', user.id] })
      setPhase({ kind: 'list' })
    } catch {
      setError('Could not save to your pantry — is the backend running?')
    } finally {
      setIsSaving(false)
    }
  }

  if (phase.kind === 'capture') {
    return (
      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} />
        <View style={styles.cameraOverlay}>
          <Text style={styles.cameraHint}>Fit the whole receipt in the frame</Text>
          {error ? <Text style={styles.cameraError}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Capture receipt"
            style={styles.shutterButton}
            onPress={() => readReceipt()}
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setPhase({ kind: 'list' })}>
            <Text style={styles.cameraCancel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (phase.kind === 'extracting') {
    return (
      <Screen>
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color="#208AEF" />
          <Text style={styles.centerTitle}>Reading your receipt…</Text>
          <Text style={styles.centerSubtitle}>Picking out the food items.</Text>
        </View>
      </Screen>
    )
  }

  if (phase.kind === 'review') {
    const { items: reviewItems, excluded } = phase
    const keptCount = reviewItems.length - excluded.size
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Found on your receipt</Text>
          <Text style={styles.subtitle}>
            Uncheck anything that isn&apos;t right, then add the rest to your pantry.
          </Text>
          {reviewItems.map((item, i) => {
            const checked = !excluded.has(i)
            return (
              <Pressable
                key={i}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                onPress={() => {
                  const next = new Set(excluded)
                  if (checked) next.add(i)
                  else next.delete(i)
                  setPhase({ kind: 'review', items: reviewItems, excluded: next })
                }}
                style={[styles.reviewRow, !checked && styles.reviewRowExcluded]}
              >
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                  {checked ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.itemName, item.confidence < 0.5 && styles.itemUnsure]}>
                    {item.name}
                  </Text>
                  {item.brand ? <Text style={styles.itemBrand}>{item.brand}</Text> : null}
                </View>
              </Pressable>
            )
          })}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            label={keptCount > 0 ? `Add ${keptCount} to pantry` : 'Nothing to add'}
            disabled={keptCount === 0}
            loading={isSaving}
            onPress={() => saveReviewed(reviewItems, excluded)}
          />
          <Button label="Cancel" variant="secondary" onPress={() => setPhase({ kind: 'list' })} />
        </ScrollView>
      </Screen>
    )
  }

  // Group the active items into recency buckets, preserving newest-first order.
  const groups: { title: string; items: Tables<'pantry_items'>[] }[] = []
  for (const item of items) {
    const title = recencyGroup(item.added_at)
    const last = groups[groups.length - 1]
    if (last && last.title === title) last.items.push(item)
    else groups.push({ title, items: [item] })
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.actionsRow}>
          <View style={styles.actionButton}>
            <Button label="📸 Receipt" variant="secondary" onPress={startReceiptCapture} />
          </View>
          <View style={styles.actionButton}>
            <Button
              label="📷 Barcodes"
              variant="secondary"
              onPress={() => router.push({ pathname: '/scan', params: { mode: 'pantry' } })}
            />
          </View>
        </View>
        <View style={styles.manualRow}>
          <TextInput
            style={styles.manualInput}
            value={manualText}
            onChangeText={setManualText}
            placeholder="Or type it — eggs, milk, rice…"
            placeholderTextColor="#AAA"
            onSubmitEditing={addManual}
            returnKeyType="done"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add to pantry"
            disabled={!manualText.trim() || isAdding}
            onPress={addManual}
            style={({ pressed }) => [
              styles.manualButton,
              (!manualText.trim() || isAdding) && styles.manualButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            {isAdding ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.manualButtonLabel}>+</Text>
            )}
          </Pressable>
        </View>
        {permission?.canAskAgain === false && !permission.granted ? (
          <Text style={styles.error}>Camera access is off — enable it in Settings to scan.</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isLoading ? (
          <ActivityIndicator color="#208AEF" style={styles.loader} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyText}>
              After a shopping trip, photograph your receipt or scan barcodes — exFat keeps track
              of what you have and your AI coach plans meals around it.
            </Text>
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.title} style={styles.group}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              {group.items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={styles.rowText}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.brand ? <Text style={styles.itemBrand}>{item.brand}</Text> : null}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Used up ${item.name}`}
                    onPress={() => consume.mutate(item.id)}
                    style={({ pressed }) => [styles.usedButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.usedLabel}>Used it</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ))
        )}

        {items.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/assistant',
                params: { seed: 'Plan meals for the next few days using what is in my pantry.' },
              })
            }
            style={({ pressed }) => [styles.planButton, pressed && styles.pressed]}
          >
            <Text style={styles.planLabel}>✨ Plan meals with AI</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 40,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
  manualRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  manualInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
  manualButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualButtonDisabled: {
    backgroundColor: '#B9D9F7',
  },
  manualButtonLabel: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '300',
    lineHeight: 26,
  },
  loader: {
    marginTop: 32,
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    textAlign: 'center',
  },
  group: {
    gap: 8,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 16,
    color: '#111',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  itemUnsure: {
    color: '#999',
  },
  itemBrand: {
    fontSize: 13,
    color: '#999',
  },
  usedButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  usedLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  planButton: {
    borderRadius: 12,
    backgroundColor: '#8E5BEF',
    alignItems: 'center',
    paddingVertical: 14,
  },
  planLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E9',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  reviewRowExcluded: {
    opacity: 0.45,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#C5C5CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#208AEF',
    borderColor: '#208AEF',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  error: {
    color: '#d00',
    fontSize: 14,
    lineHeight: 20,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    marginTop: 8,
  },
  centerSubtitle: {
    fontSize: 14,
    color: '#999',
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
  pressed: {
    opacity: 0.85,
  },
})
