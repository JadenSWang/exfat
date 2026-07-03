import { logDiaryEntries, type DiaryEntryInput } from '@workout/supabase'
import type { QueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

import { getEstimateJob, startEstimateJob, type NutritionEstimate } from '@/lib/estimate'
import { defaultMealForNow, todayISODate } from '@/lib/nutrition'
import { supabase } from '@/lib/supabase'

/**
 * Fire-and-forget meal logs. Submitting kicks off an estimator job and returns
 * immediately; a background poller saves the entries to the diary when the
 * estimate lands. The dashboard subscribes via {@link usePendingLogs} to show
 * in-flight and failed logs. In-memory only: a log submitted right before the
 * app is killed is lost, which is acceptable for this personal backend.
 */
export interface PendingLog {
  id: string
  text: string
  status: 'estimating' | 'saving' | 'error'
  error?: string
}

const POLL_INTERVAL_MS = 2500
const POLL_TIMEOUT_MS = 4 * 60 * 1000

let pending: PendingLog[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function update(id: string, patch: Partial<PendingLog>) {
  pending = pending.map((log) => (log.id === id ? { ...log, ...patch } : log))
  emit()
}

function remove(id: string) {
  pending = pending.filter((log) => log.id !== id)
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return pending
}

/** Reactive list of in-flight / failed fire-and-forget logs. */
export function usePendingLogs(): PendingLog[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Drop a failed log from the list. */
export function dismissPendingLog(id: string) {
  remove(id)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Submit a meal description and return immediately. Date and implied meal are
 * captured now, not when the estimate finishes.
 */
export function submitPendingLog(text: string, userId: string, queryClient: QueryClient) {
  const localId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const entryDate = todayISODate()
  const meal = defaultMealForNow()
  pending = [...pending, { id: localId, text, status: 'estimating' }]
  emit()

  void (async () => {
    try {
      const jobId = await startEstimateJob(text)
      const deadline = Date.now() + POLL_TIMEOUT_MS
      let result: NutritionEstimate | null = null
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS)
        let job
        try {
          job = await getEstimateJob(jobId)
        } catch {
          // Dropped poll (network blip) — retry on the next tick.
          continue
        }
        if (job.status === 'done' && job.result) {
          result = job.result
          break
        }
        if (job.status === 'error') {
          throw new Error(job.error ?? 'The estimator could not process that meal.')
        }
      }
      if (!result) throw new Error('Timed out waiting for the estimate.')
      if (result.items.length === 0) {
        throw new Error('No foods were recognized in that description. Try adding more detail.')
      }
      update(localId, { status: 'saving' })
      const entries: DiaryEntryInput[] = result.items.map((item) => ({
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
      await logDiaryEntries(supabase, userId, entries)
      await queryClient.invalidateQueries({ queryKey: ['diary', entryDate] })
      remove(localId)
    } catch (e) {
      update(localId, {
        status: 'error',
        error: e instanceof Error ? e.message : 'Something went wrong logging that meal.',
      })
    }
  })()
}
