import type { EstimatedFoodItem, MacroNutrients } from '@workout/core'

/**
 * Result of a natural-language nutrition estimate. Shape matches the local
 * paseo-backed estimator service (services/estimator) and the Supabase
 * `estimate-nutrition` edge function.
 */
export interface NutritionEstimate {
  items: EstimatedFoodItem[]
  totals: MacroNutrients
  isEstimate: true
  note: string
}

// Dev default: the paseo estimator running on the host machine, reachable over
// Tailscale. Override with EXPO_PUBLIC_ESTIMATE_URL for other setups.
const DEFAULT_ESTIMATE_URL = 'http://100.64.0.62:8787/estimate'

const ESTIMATE_URL = process.env.EXPO_PUBLIC_ESTIMATE_URL ?? DEFAULT_ESTIMATE_URL
const ESTIMATE_TOKEN = process.env.EXPO_PUBLIC_ESTIMATE_TOKEN

/**
 * Estimate nutrition for a free-text meal description via the paseo estimator.
 * Throws on network/service errors so the caller can show a friendly hint.
 */
export async function estimateNutrition(text: string): Promise<NutritionEstimate> {
  const res = await fetch(ESTIMATE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(ESTIMATE_TOKEN ? { 'x-exfat-token': ESTIMATE_TOKEN } : {}),
    },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    throw new Error(`Estimator responded ${res.status}`)
  }
  return (await res.json()) as NutritionEstimate
}
