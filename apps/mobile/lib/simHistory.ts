import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSyncExternalStore } from 'react'

import type { NutritionEstimate } from '@/lib/estimate'

/**
 * Persisted history of "simulated" meals — previews the user ran but may or may
 * not have logged. Stored per-device in AsyncStorage so it survives restarts.
 * The Simulate screen subscribes via {@link useSimHistory}.
 */
export interface SimEntry {
  id: string
  /** The meal description the user typed. */
  text: string
  estimate: NutritionEstimate
  /** ms epoch when the simulation was run. */
  createdAt: number
}

const STORAGE_KEY = 'exfat:sim-history'
const MAX_ENTRIES = 50

let entries: SimEntry[] = []
let hydrated = false
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

// Fire-and-forget persist. Guarded for SSR (AsyncStorage's web backend touches
// `window`/localStorage at call time — see lib/supabase.ts).
function persist() {
  if (typeof window === 'undefined') return
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries)).catch(() => {})
}

async function hydrate() {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      entries = parsed
      emit()
    }
  } catch {
    // Corrupt/unavailable storage — start empty rather than crash the screen.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Lazily load on first subscriber (client-only; hydrate() no-ops on server).
  void hydrate()
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return entries
}

/** Reactive, newest-first list of past simulations. */
export function useSimHistory(): SimEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Prepend a new simulation and return the created entry. */
export function addSimulation(text: string, estimate: NutritionEstimate): SimEntry {
  const entry: SimEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    text,
    estimate,
    createdAt: Date.now(),
  }
  entries = [entry, ...entries].slice(0, MAX_ENTRIES)
  emit()
  persist()
  return entry
}

/** Drop one simulation from history. */
export function removeSimulation(id: string) {
  entries = entries.filter((e) => e.id !== id)
  emit()
  persist()
}

/** Clear all simulation history. */
export function clearSimHistory() {
  entries = []
  emit()
  persist()
}
