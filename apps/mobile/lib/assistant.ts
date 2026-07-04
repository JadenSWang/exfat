import { authHeaders, ESTIMATOR_BASE, EstimateJobLostError } from '@/lib/estimate'

/**
 * The in-app AI nutrition coach, backed by the same paseo estimator service as
 * the meal estimates (see services/estimator/server.mjs, /chat/jobs). Sending a
 * turn kicks off a job the agent answers via callback; we poll it to completion.
 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatJobStatus {
  status: 'pending' | 'done' | 'error'
  result?: { reply: string }
  error?: string
}

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 2 * 60 * 1000

async function startChatJob(messages: ChatMessage[], userId: string, date?: string): Promise<string> {
  const res = await fetch(`${ESTIMATOR_BASE}/chat/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    // userId (when a real UUID) lets the coach see the day's goals and totals.
    body: JSON.stringify({ messages, userId, date }),
  })
  if (!res.ok) {
    throw new Error(`Assistant service responded ${res.status}`)
  }
  const { id } = (await res.json()) as { id: string }
  return id
}

async function getChatJob(id: string): Promise<ChatJobStatus> {
  const res = await fetch(`${ESTIMATOR_BASE}/chat/jobs/${id}`, { headers: authHeaders() })
  if (res.status === 404) {
    throw new EstimateJobLostError(id)
  }
  if (!res.ok) {
    throw new Error(`Assistant service responded ${res.status}`)
  }
  return (await res.json()) as ChatJobStatus
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Send the conversation so far and resolve with the assistant's reply. Throws a
 * user-facing message on error or timeout. `messages` should end with the user's
 * latest turn; pass the whole history so the coach keeps context.
 */
export async function sendChat(
  messages: ChatMessage[],
  userId: string,
  date?: string,
): Promise<string> {
  let jobId = await startChatJob(messages, userId, date)
  const deadline = Date.now() + POLL_TIMEOUT_MS
  let resubmits = 0
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    let job
    try {
      job = await getChatJob(jobId)
    } catch (e) {
      if (e instanceof EstimateJobLostError) {
        // The estimator restarted and dropped its in-memory job — resubmit.
        if (resubmits >= 2) {
          throw new Error('The assistant service keeps restarting. Try again shortly.')
        }
        resubmits += 1
        jobId = await startChatJob(messages, userId, date)
        continue
      }
      // Transient network blip — retry on the next tick.
      continue
    }
    if (job.status === 'done' && job.result) {
      return job.result.reply
    }
    if (job.status === 'error') {
      throw new Error(job.error ?? 'The assistant could not respond.')
    }
  }
  throw new Error('Timed out waiting for the assistant.')
}
