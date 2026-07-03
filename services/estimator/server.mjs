#!/usr/bin/env node
// exFat local nutrition estimator.
//
// Turns a natural-language meal description into structured per-item nutrition
// estimates by launching a detached `paseo run` agent (Claude, via this
// machine's paseo provider — no API key needed). The agent is instructed in its
// prompt to POST its JSON back to this server's local callback endpoint when it
// finishes, so nothing here blocks on a child process. Runs on THIS machine and
// is reached by the app over Tailscale (e.g. http://100.64.0.62:8787/estimate).
//
// This is a personal/dev backend: it only serves while this box is up and on the
// tailnet. For App Store scale you'd host the LLM step elsewhere (see the
// Supabase `estimate-nutrition` edge function kept in the repo for that path).
//
// Run:  node services/estimator/server.mjs   (or: pnpm estimator)
// Env:  EXFAT_PORT (8787), EXFAT_MODEL (claude-haiku-4-5), EXFAT_HOST (0.0.0.0),
//       EXFAT_WORKSPACE_ID (reuse a warm paseo workspace; otherwise the learned
//       id is persisted in $EXFAT_WORKDIR/.workspace-id), EXFAT_TOKEN (optional
//       shared secret required as `x-exfat-token` / Bearer if set).

import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'

const PORT = Number(process.env.EXFAT_PORT ?? 8787)
const HOST = process.env.EXFAT_HOST ?? '0.0.0.0'
const MODEL = process.env.EXFAT_MODEL ?? 'claude-haiku-4-5'
const TOKEN = process.env.EXFAT_TOKEN ?? null
const WORKDIR = process.env.EXFAT_WORKDIR ?? `${process.env.HOME}/.exfat-estimator`
// Optional Supabase access for the food-search tool the agent can call. When
// unset, search returns empty results and everything degrades to pure estimates.
const SUPABASE_URL = process.env.EXFAT_SUPABASE_URL ?? process.env.SUPABASE_URL ?? null
const SUPABASE_SERVICE_KEY =
  process.env.EXFAT_SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
const LAUNCH_TIMEOUT_MS = 30_000
const JOB_TIMEOUT_MS = 120_000

// A warm paseo workspace is reused across requests (~8s vs ~19s cold) AND
// across restarts (persisted to disk) — otherwise every restart cold-starts a
// new workspace and stale ones pile up in paseo with no CLI way to delete them.
const WORKSPACE_ID_FILE = `${WORKDIR}/.workspace-id`
let workspaceId = process.env.EXFAT_WORKSPACE_ID ?? loadWorkspaceId()

function loadWorkspaceId() {
  try {
    const id = readFileSync(WORKSPACE_ID_FILE, 'utf8').trim()
    return /^wks_[A-Za-z0-9]+$/.test(id) ? id : null
  } catch {
    return null
  }
}

function saveWorkspaceId(id) {
  try {
    if (id) writeFileSync(WORKSPACE_ID_FILE, id)
    else rmSync(WORKSPACE_ID_FILE, { force: true })
  } catch (e) {
    console.warn('[estimate] could not persist workspace id:', e.message)
  }
}

// Must match the app's FoodUnit type and the DB's food_unit enum — the diary
// insert rejects anything else.
const FOOD_UNITS = ['g', 'oz', 'ml', 'tbsp', 'tsp', 'cup', 'piece', 'serving']

const SYSTEM =
  'You are a nutrition estimator. Break the meal into distinct food items and estimate ' +
  'per-item calories (kcal) and macros (grams). Values are ESTIMATES; confidence is 0..1. ' +
  'Use the amounts described; default to a sensible serving size if an amount is unstated.'

// The agent delivers its result by POSTing to our callback — its text output is
// never read, so the prompt is explicit that curl is the only output channel.
function buildPrompt(text, jobId, canSearch) {
  const callback = `http://127.0.0.1:${PORT}/internal/jobs/${jobId}/result`
  const search = `http://127.0.0.1:${PORT}/internal/jobs/${jobId}/search`
  const searchSection = canSearch
    ? `
Before estimating, check the user's known foods — they often log the same products daily
(e.g. an egg brand they scanned yesterday). For each item that sounds like a packaged/branded
product or a repeat staple, run:

curl -fsS '${search}?q=<term>'

It returns {"results":[{"id","name","brand","servingQty","servingUnit","calories","protein","carbs","fat","recent"}]}
where macros are per serving and "recent": true means the user logged that exact food lately.
If a result clearly matches the described item, use its label macros scaled to the described
amount, set that item's "foodId" to the result's id, and confidence to 1. If nothing matches,
estimate as usual with "foodId": null. Search at most a handful of terms.
`
    : ''
  return `${SYSTEM}

Meal: ${text}
${searchSection}
Deliver the estimate by POSTing JSON to a local callback endpoint. This is your ONLY output channel — printing the JSON does nothing. Run exactly one command shaped like:

curl -fsS -X POST '${callback}' -H 'content-type: application/json' -d '{"items":[{"name":"...","quantity":1,"unit":"serving","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":0.5,"foodId":null}]}'

Rules:
- "unit" MUST be one of: ${FOOD_UNITS.join(', ')}.
- quantity/calories/protein/carbs/fat are numbers (grams for macros, kcal for calories); confidence is 0..1.
- "foodId" is the id of a matched known food, or null.
- If you cannot produce an estimate, POST {"items":[],"error":"<short reason>"} instead.
- After the curl succeeds, stop. Do not do anything else.`
}

// ---------------------------------------------------------------------------
// Food search backing the agent's tool call. Queries Supabase REST directly
// (service key) for the job's user: their recently logged foods first, then a
// name/brand match over their private + global foods.
// ---------------------------------------------------------------------------

function foodRowToResult(row, recent) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    servingQty: row.serving_qty,
    servingUnit: row.serving_unit,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    recent,
  }
}

async function supabaseRest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  })
  if (!res.ok) throw new Error(`supabase REST ${res.status} for ${path}`)
  return res.json()
}

const FOOD_COLUMNS = 'id,name,brand,serving_qty,serving_unit,calories,protein,carbs,fat'

async function searchFoods(userId, rawQuery) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !userId) return []
  // PostgREST filter values: strip characters that change filter syntax.
  const term = rawQuery.replace(/[,()*%]/g, '').trim().toLowerCase()
  if (!term) return []

  const [recentRows, nameRows] = await Promise.all([
    supabaseRest(
      `diary_entries?select=food_id,foods(${FOOD_COLUMNS})` +
        `&user_id=eq.${userId}&food_id=not.is.null&order=created_at.desc&limit=100`,
    ),
    supabaseRest(
      `foods?select=${FOOD_COLUMNS}` +
        `&and=(or(name.ilike.*${encodeURIComponent(term)}*,brand.ilike.*${encodeURIComponent(term)}*),` +
        `or(owner_id.is.null,owner_id.eq.${userId}))&limit=8`,
    ),
  ])

  const results = []
  const seen = new Set()
  for (const row of recentRows) {
    const food = row.foods
    if (!food || seen.has(food.id)) continue
    const haystack = `${food.name} ${food.brand ?? ''}`.toLowerCase()
    if (!haystack.includes(term)) continue
    seen.add(food.id)
    results.push(foodRowToResult(food, true))
  }
  for (const food of nameRows) {
    if (seen.has(food.id)) continue
    seen.add(food.id)
    results.push(foodRowToResult(food, false))
  }
  return results.slice(0, 8)
}

mkdirSync(WORKDIR, { recursive: true })

// Fire-and-forget jobs: POST /estimate/jobs returns an id immediately; the app
// polls GET /estimate/jobs/:id and the paseo agent POSTs the result to
// /internal/jobs/:id/result. Kept in memory — fine for a personal backend.
const jobs = new Map()
const JOB_TTL_MS = 60 * 60 * 1000

function gcJobs() {
  const cutoff = Date.now() - JOB_TTL_MS
  for (const [id, job] of jobs) if (job.createdAt < cutoff) jobs.delete(id)
}

function pendingJobCount() {
  let n = 0
  for (const job of jobs.values()) if (job.status === 'pending') n++
  return n
}

function createJob(userId) {
  const id = randomUUID()
  const job = { status: 'pending', createdAt: Date.now(), waiters: [], userId: userId ?? null }
  job.timer = setTimeout(() => {
    failJob(id, 'Timed out waiting for the estimator agent.')
  }, JOB_TIMEOUT_MS)
  job.timer.unref()
  jobs.set(id, job)
  return id
}

function settleJob(id, patch) {
  const job = jobs.get(id)
  if (!job || job.status !== 'pending') return false
  clearTimeout(job.timer)
  Object.assign(job, patch)
  for (const waiter of job.waiters) waiter(job)
  job.waiters = []
  return true
}

function completeJob(id, result) {
  return settleJob(id, { status: 'done', result })
}

function failJob(id, message) {
  const settled = settleJob(id, { status: 'error', error: message })
  if (settled) console.error('[estimate] job error:', message)
  return settled
}

/** Resolve when the job settles (already-settled jobs resolve immediately). */
function waitForJob(id) {
  const job = jobs.get(id)
  if (!job) return Promise.reject(new Error('unknown job'))
  if (job.status !== 'pending') return Promise.resolve(job)
  return new Promise((resolve) => job.waiters.push(resolve))
}

// Serialize launches so a burst doesn't spawn several cold workspaces at once.
let chain = Promise.resolve()
function enqueue(task) {
  const run = chain.then(task, task)
  chain = run.catch(() => {})
  return run
}

// Launch a detached agent for the job; resolves once paseo accepts the run.
// The result arrives later via the callback endpoint.
function launchPaseo(text, jobId) {
  // Re-ensure on every run: paseo refuses to create a workspace in a missing
  // cwd, and the dir can vanish out from under a long-running server.
  mkdirSync(WORKDIR, { recursive: true })
  const args = [
    'run',
    '-d',
    '--provider',
    'claude',
    '--model',
    MODEL,
    '--mode',
    'bypassPermissions',
    '--json',
    '--title',
    'exfat-estimate',
    '--cwd',
    WORKDIR,
  ]
  if (workspaceId) args.push('--workspace', workspaceId)
  const canSearch = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY && jobs.get(jobId)?.userId)
  args.push(buildPrompt(text, jobId, canSearch))

  return new Promise((resolve, reject) => {
    execFile('paseo', args, { timeout: LAUNCH_TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      // Learn (and thereafter reuse) the workspace paseo created on the cold
      // run. The "Created workspace" notice goes to stderr, not stdout.
      if (!workspaceId) {
        const m = `${stdout ?? ''}\n${stderr ?? ''}`.match(/Created workspace (wks_[A-Za-z0-9]+)/)
        if (m) {
          workspaceId = m[1]
          saveWorkspaceId(workspaceId)
        }
      }
      if (err) return reject(new Error(`paseo launch failed: ${err.message}`))
      try {
        const parsed = JSON.parse(stdout)
        if (!parsed.agentId) throw new Error('no agentId in output')
        resolve(parsed.agentId)
      } catch (e) {
        reject(new Error(`Could not parse paseo launch output: ${e.message}`))
      }
    })
  })
}

// Launch, self-healing if the warm workspace went away (e.g. after a janitor
// sweep or paseo GC): clear it and retry once cold.
async function launchWithHeal(text, jobId) {
  try {
    return await launchPaseo(text, jobId)
  } catch (e) {
    if (workspaceId) {
      console.warn('[estimate] retrying launch cold after error:', e.message)
      workspaceId = null
      saveWorkspaceId(null)
      return launchPaseo(text, jobId)
    }
    throw e
  }
}

function startEstimate(text, userId) {
  const jobId = createJob(userId)
  enqueue(() => launchWithHeal(text, jobId)).catch((e) => failJob(jobId, e.message))
  return jobId
}

// Janitor: hard-delete finished estimator agents (they run in WORKDIR). The
// reused workspace is a separate entity and survives agent deletion, so this
// keeps the agent list from growing without breaking warm reuse. `paseo delete`
// interrupts RUNNING agents too, so never sweep while a job is in flight.
function sweep() {
  if (pendingJobCount() > 0) return Promise.resolve()
  return new Promise((resolve) => {
    execFile('paseo', ['delete', '--cwd', WORKDIR], { timeout: 30_000 }, (_err, stdout) => {
      const out = String(stdout ?? '').trim()
      // Output looks like "DELETED\n<count>".
      const count = Number(out.split(/\s+/).pop())
      if (count > 0) console.log(`[janitor] swept ${count} estimator agent(s)`)
      resolve()
    })
  })
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function shape(rawItems) {
  const items = rawItems.map((it) => ({
    name: String(it.name ?? '').trim() || 'food',
    quantity: num(it.quantity),
    unit: FOOD_UNITS.includes(it.unit) ? it.unit : 'serving',
    calories: num(it.calories),
    protein: num(it.protein),
    carbs: num(it.carbs),
    fat: num(it.fat),
    confidence: num(it.confidence),
    foodId: typeof it.foodId === 'string' && it.foodId ? it.foodId : null,
  }))
  const totals = items.reduce(
    (acc, it) => ({
      calories: acc.calories + it.calories,
      protein: acc.protein + it.protein,
      carbs: acc.carbs + it.carbs,
      fat: acc.fat + it.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
  return {
    items,
    totals,
    isEstimate: true,
    note: 'AI estimate from paseo (Claude) — for exact values, scan a barcode (coming soon).',
  }
}

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, x-exfat-token',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  })
  res.end(payload)
}

function authorized(req) {
  if (!TOKEN) return true
  const header = req.headers['x-exfat-token'] ?? ''
  const bearer = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '')
  return header === TOKEN || bearer === TOKEN
}

function readBody(req, onJson) {
  let raw = ''
  req.on('data', (c) => {
    raw += c
    if (raw.length > 100_000) req.destroy()
  })
  req.on('end', () => onJson(raw))
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    return send(res, 200, { ok: true, service: 'exfat-estimator', model: MODEL, workspaceId })
  }

  // Agent callback. Localhost-only (the agent runs on this box); the unguessable
  // job UUID is the credential.
  const cbMatch = req.url?.match(/^\/internal\/jobs\/([\w-]+)\/result$/)
  if (req.method === 'POST' && cbMatch) {
    if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::ffff:127.0.0.1') {
      return send(res, 403, { error: 'callback is localhost-only' })
    }
    return readBody(req, (raw) => {
      let body
      try {
        body = JSON.parse(raw)
      } catch {
        return send(res, 400, { error: 'invalid JSON body' })
      }
      const job = jobs.get(cbMatch[1])
      if (!job) return send(res, 404, { error: 'unknown job' })
      if (job.status !== 'pending') return send(res, 409, { error: 'job already settled' })
      if (!Array.isArray(body.items)) return send(res, 400, { error: 'missing items[]' })
      if (body.items.length === 0) {
        failJob(cbMatch[1], body.error ?? 'The estimator could not process that meal.')
      } else {
        completeJob(cbMatch[1], shape(body.items))
      }
      return send(res, 200, { ok: true })
    })
  }

  // Agent food-search tool. Localhost-only, scoped to a live job so the agent
  // can only search on behalf of the user who submitted that job.
  const searchMatch = req.url?.match(/^\/internal\/jobs\/([\w-]+)\/search\?(.*)$/)
  if (req.method === 'GET' && searchMatch) {
    if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::ffff:127.0.0.1') {
      return send(res, 403, { error: 'search is localhost-only' })
    }
    const job = jobs.get(searchMatch[1])
    if (!job) return send(res, 404, { error: 'unknown job' })
    const q = new URLSearchParams(searchMatch[2]).get('q') ?? ''
    return searchFoods(job.userId, q)
      .then((results) => send(res, 200, { results }))
      .catch((e) => {
        console.error('[estimate] food search failed:', e.message)
        send(res, 200, { results: [] }) // degrade to a plain estimate
      })
  }

  const jobMatch = req.url?.match(/^\/estimate\/jobs\/([\w-]+)$/)
  if (req.method === 'GET' && jobMatch) {
    if (!authorized(req)) return send(res, 401, { error: 'unauthorized' })
    const job = jobs.get(jobMatch[1])
    if (!job) return send(res, 404, { error: 'unknown job' })
    return send(res, 200, { status: job.status, result: job.result, error: job.error })
  }

  if (req.method !== 'POST' || !(req.url === '/estimate' || req.url === '/estimate/jobs')) {
    return send(res, 404, { error: 'not found' })
  }
  if (!authorized(req)) return send(res, 401, { error: 'unauthorized' })

  readBody(req, (raw) => {
    let text
    let userId = null
    try {
      const body = JSON.parse(raw)
      text = String(body.text ?? '').trim()
      // Enables the known-foods search for this job; UUIDs only (goes into
      // PostgREST filters).
      const rawUser = String(body.userId ?? '')
      userId = /^[0-9a-f-]{36}$/i.test(rawUser) ? rawUser : null
    } catch {
      return send(res, 400, { error: 'invalid JSON body' })
    }
    if (!text) return send(res, 400, { error: 'missing "text"' })

    const jobId = startEstimate(text, userId)

    if (req.url === '/estimate/jobs') {
      return send(res, 202, { id: jobId, status: 'pending' })
    }

    // Legacy synchronous endpoint: same job machinery, but hold the request
    // open until the callback (or timeout) settles it.
    waitForJob(jobId).then((job) => {
      if (job.status === 'done') return send(res, 200, job.result)
      send(res, 502, { error: 'estimation failed', detail: job.error })
    })
  })
})

server.listen(PORT, HOST, () => {
  console.log(`exFat estimator listening on http://${HOST}:${PORT}  (model: ${MODEL})`)
  console.log(`Reachable over Tailscale, e.g. http://100.64.0.62:${PORT}/estimate`)
})

// Clean leftover agents on startup, then sweep every 5 minutes.
enqueue(sweep)
setInterval(() => {
  gcJobs()
  enqueue(sweep)
}, 5 * 60 * 1000).unref()
