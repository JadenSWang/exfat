import type { MealType } from '@workout/core'
import { logDiaryEntries, type DiaryEntryInput } from '@workout/supabase'
import type { QueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

import {
  EstimateJobLostError,
  getEstimateJob,
  startEstimateJob,
  type NutritionEstimate,
} from '@/lib/estimate'
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
  /** `YYYY-MM-DD` diary day the entries will land on. */
  entryDate: string
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
 * Start an estimate job and poll it to completion, returning the estimate.
 * Throws a user-facing message on error, timeout, or an empty result. Shared by
 * the fire-and-forget log flow and the "simulate" preview.
 */
async function runEstimateJob(text: string, userId: string): Promise<NutritionEstimate> {
  let jobId = await startEstimateJob(text, userId)
  const deadline = Date.now() + POLL_TIMEOUT_MS
  let resubmits = 0
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    let job
    try {
      job = await getEstimateJob(jobId)
    } catch (e) {
      if (e instanceof EstimateJobLostError) {
        // The estimator restarted and dropped its in-memory job — resubmit
        // instead of polling a dead id until the timeout.
        if (resubmits >= 2) {
          throw new Error('The estimator keeps restarting. Try again in a minute.')
        }
        resubmits += 1
        jobId = await startEstimateJob(text, userId)
        continue
      }
      // Dropped poll (network blip) — retry on the next tick.
      continue
    }
    if (job.status === 'done' && job.result) {
      if (job.result.items.length === 0) {
        throw new Error('No foods were recognized in that description. Try adding more detail.')
      }
      return job.result
    }
    if (job.status === 'error') {
      throw new Error(job.error ?? 'The estimator could not process that meal.')
    }
  }
  throw new Error('Timed out waiting for the estimate.')
}

/** Map an estimate's items into diary rows for a given day and meal. */
function estimateToEntries(
  estimate: NutritionEstimate,
  entryDate: string,
  meal: MealType,
): DiaryEntryInput[] {
  return estimate.items.map((item) => ({
    entryDate,
    meal,
    description: item.name,
    quantity: item.quantity,
    unit: item.unit,
    calories: item.calories,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    // Items matched to a known food (e.g. a product scanned before) carry
    // exact label macros — log them as database-sourced, not estimates.
    source: item.foodId ? 'database' : 'ai_estimate',
    foodId: item.foodId ?? null,
  }))
}

/**
 * Estimate a meal without logging it — used by "simulate" so the user can
 * preview the calories and macros before deciding to add them to the diary.
 */
export function simulateMeal(text: string, userId: string): Promise<NutritionEstimate> {
  return runEstimateJob(text, userId)
}

/**
 * Save an already-computed estimate to the diary. Used to commit a simulated
 * meal with the exact numbers the user previewed — no re-estimate, so the diary
 * matches what they saw. The implied meal is captured now, at save time.
 */
export async function saveEstimateToDiary(
  estimate: NutritionEstimate,
  userId: string,
  queryClient: QueryClient,
  entryDate: string = todayISODate(),
) {
  const entries = estimateToEntries(estimate, entryDate, defaultMealForNow())
  await logDiaryEntries(supabase, userId, entries)
  await queryClient.invalidateQueries({ queryKey: ['diary'] })
}

/**
 * Submit a meal description and return immediately. Date and implied meal are
 * captured now, not when the estimate finishes. Pass `entryDate` to log onto a
 * past day instead of today.
 */
export function submitPendingLog(
  text: string,
  userId: string,
  queryClient: QueryClient,
  entryDate: string = todayISODate(),
) {
  const localId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  // The fake dev-preview session has no real auth.users row — the diary insert
  // can only fail. Say so up front instead of after a successful estimate.
  if (userId === 'dev-user') {
    pending = [
      ...pending,
      {
        id: localId,
        text,
        entryDate,
        status: 'error',
        error: 'Dev preview session can’t save to the diary. Sign in, or enable anonymous sign-ins in Supabase.',
      },
    ]
    emit()
    return
  }
  const meal = defaultMealForNow()
  pending = [...pending, { id: localId, text, entryDate, status: 'estimating' }]
  emit()

  void (async () => {
    try {
      const result = await runEstimateJob(text, userId)
      update(localId, { status: 'saving' })
      await logDiaryEntries(supabase, userId, estimateToEntries(result, entryDate, meal))
      await queryClient.invalidateQueries({ queryKey: ['diary'] })
      remove(localId)
    } catch (e) {
      update(localId, {
        status: 'error',
        error:
          e instanceof Error
            ? e.message
            : (e as { message?: string } | null)?.message ?? 'Something went wrong logging that meal.',
      })
    }
  })()
}
