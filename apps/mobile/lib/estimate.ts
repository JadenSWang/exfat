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

export interface EstimateJobStatus {
  status: 'pending' | 'done' | 'error'
  result?: NutritionEstimate
  error?: string
}

function authHeaders(): Record<string, string> {
  return ESTIMATE_TOKEN ? { 'x-exfat-token': ESTIMATE_TOKEN } : {}
}

/**
 * Kick off a fire-and-forget estimate job. Returns immediately with a job id
 * to poll via {@link getEstimateJob} — big meals can take longer than the
 * platform fetch timeout, so we never wait on a single long request.
 */
export async function startEstimateJob(text: string, userId?: string): Promise<string> {
  const res = await fetch(`${ESTIMATE_URL}/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    // userId lets the estimator search the user's previously scanned/logged
    // foods and match items to exact label data instead of estimating.
    body: JSON.stringify({ text, userId }),
  })
  if (!res.ok) {
    throw new Error(`Estimator responded ${res.status}`)
  }
  const { id } = (await res.json()) as { id: string }
  return id
}

/**
 * The estimator no longer knows this job id — its jobs are in-memory, so a
 * restart mid-estimate drops them. Callers should resubmit rather than keep
 * polling a dead id.
 */
export class EstimateJobLostError extends Error {
  constructor(id: string) {
    super(`Estimate job ${id} was lost (estimator restarted).`)
  }
}

/** Poll the status of a job started with {@link startEstimateJob}. */
export async function getEstimateJob(id: string): Promise<EstimateJobStatus> {
  const res = await fetch(`${ESTIMATE_URL}/jobs/${id}`, { headers: authHeaders() })
  if (res.status === 404) {
    throw new EstimateJobLostError(id)
  }
  if (!res.ok) {
    throw new Error(`Estimator responded ${res.status}`)
  }
  return (await res.json()) as EstimateJobStatus
}
