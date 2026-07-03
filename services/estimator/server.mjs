#!/usr/bin/env node
// exFat local nutrition estimator.
//
// Turns a natural-language meal description into structured per-item nutrition
// estimates by shelling out to `paseo run` (Claude, via this machine's paseo
// provider — no API key needed). Runs on THIS machine and is reached by the app
// over Tailscale (e.g. http://100.64.0.62:8787/estimate).
//
// This is a personal/dev backend: it only serves while this box is up and on the
// tailnet. For App Store scale you'd host the LLM step elsewhere (see the
// Supabase `estimate-nutrition` edge function kept in the repo for that path).
//
// Run:  node services/estimator/server.mjs   (or: pnpm estimator)
// Env:  EXFAT_PORT (8787), EXFAT_MODEL (claude-haiku-4-5), EXFAT_HOST (0.0.0.0),
//       EXFAT_WORKSPACE_ID (reuse a warm paseo workspace), EXFAT_TOKEN (optional
//       shared secret required as `x-exfat-token` / Bearer if set).

import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const PORT = Number(process.env.EXFAT_PORT ?? 8787)
const HOST = process.env.EXFAT_HOST ?? '0.0.0.0'
const MODEL = process.env.EXFAT_MODEL ?? 'claude-haiku-4-5'
const TOKEN = process.env.EXFAT_TOKEN ?? null
const WORKDIR = process.env.EXFAT_WORKDIR ?? `${process.env.HOME}/.exfat-estimator`
const RUN_TIMEOUT_MS = 100_000

// A warm paseo workspace is reused across requests (~8s vs ~19s cold).
let workspaceId = process.env.EXFAT_WORKSPACE_ID ?? null

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'quantity', 'unit', 'calories', 'protein', 'carbs', 'fat', 'confidence'],
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          calories: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' },
          confidence: { type: 'number' },
        },
      },
    },
  },
}

const SYSTEM =
  'You are a nutrition estimator. Break the meal into distinct food items and estimate ' +
  'per-item calories (kcal) and macros (grams). Values are ESTIMATES; confidence is 0..1. ' +
  'Use the amounts described; default to a sensible serving size if an amount is unstated.'

mkdirSync(WORKDIR, { recursive: true })

// Serialize runs so a burst doesn't spawn several cold workspaces at once.
let chain = Promise.resolve()
function enqueue(task) {
  const run = chain.then(task, task)
  chain = run.catch(() => {})
  return run
}

function runPaseo(text) {
  const prompt = `${SYSTEM}\n\nMeal: ${text}`
  const args = [
    'run',
    '--provider',
    'claude',
    '--model',
    MODEL,
    '--json',
    '--wait-timeout',
    '90s',
    '--title',
    'exfat-estimate',
    '--cwd',
    WORKDIR,
    '--output-schema',
    JSON.stringify(OUTPUT_SCHEMA),
  ]
  if (workspaceId) args.push('--workspace', workspaceId)
  args.push(prompt)

  return new Promise((resolve, reject) => {
    execFile('paseo', args, { timeout: RUN_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      const out = stdout ?? ''
      // Learn (and thereafter reuse) the workspace paseo created on the cold run.
      if (!workspaceId) {
        const m = out.match(/Created workspace (wks_[A-Za-z0-9]+)/)
        if (m) workspaceId = m[1]
      }
      const start = out.indexOf('{')
      const end = out.lastIndexOf('}')
      if (start === -1 || end === -1) {
        return reject(new Error(err ? `paseo failed: ${err.message}` : 'No JSON in paseo output'))
      }
      let parsed
      try {
        parsed = JSON.parse(out.slice(start, end + 1))
      } catch (e) {
        return reject(new Error(`Could not parse paseo output: ${e.message}`))
      }
      if (parsed.error) return reject(new Error(parsed.error.message ?? 'paseo error'))
      if (!Array.isArray(parsed.items)) return reject(new Error('paseo output missing items[]'))
      resolve(parsed.items)
    })
  })
}

// Run, self-healing if the warm workspace went away (e.g. after a janitor sweep
// or paseo GC): clear it and retry once cold.
async function runWithHeal(text) {
  try {
    return await runPaseo(text)
  } catch (e) {
    if (workspaceId) {
      console.warn('[estimate] retrying cold after error:', e.message)
      workspaceId = null
      return runPaseo(text)
    }
    throw e
  }
}

// Janitor: hard-delete finished estimator agents (they run in WORKDIR). The
// reused workspace is a separate entity and survives agent deletion, so this
// keeps the agent list from growing without breaking warm reuse. Enqueued on
// the same chain as runs, so it never interrupts an in-flight estimate.
function sweep() {
  return new Promise((resolve) => {
    execFile('paseo', ['delete', '--cwd', WORKDIR], { timeout: 30_000 }, (_err, stdout) => {
      const out = String(stdout ?? '').trim()
      if (out && !/no agents/i.test(out)) console.log('[janitor] swept estimator agents')
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
    unit: String(it.unit ?? 'serving'),
    calories: num(it.calories),
    protein: num(it.protein),
    carbs: num(it.carbs),
    fat: num(it.fat),
    confidence: num(it.confidence),
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
    'access-control-allow-methods': 'POST, OPTIONS',
  })
  res.end(payload)
}

function authorized(req) {
  if (!TOKEN) return true
  const header = req.headers['x-exfat-token'] ?? ''
  const bearer = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '')
  return header === TOKEN || bearer === TOKEN
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    return send(res, 200, { ok: true, service: 'exfat-estimator', model: MODEL, workspaceId })
  }
  if (req.method !== 'POST' || !req.url?.startsWith('/estimate')) {
    return send(res, 404, { error: 'not found' })
  }
  if (!authorized(req)) return send(res, 401, { error: 'unauthorized' })

  let raw = ''
  req.on('data', (c) => {
    raw += c
    if (raw.length > 100_000) req.destroy()
  })
  req.on('end', () => {
    let text
    try {
      text = String(JSON.parse(raw).text ?? '').trim()
    } catch {
      return send(res, 400, { error: 'invalid JSON body' })
    }
    if (!text) return send(res, 400, { error: 'missing "text"' })

    enqueue(() => runWithHeal(text))
      .then((items) => send(res, 200, shape(items)))
      .catch((e) => {
        console.error('[estimate] error:', e.message)
        send(res, 502, { error: 'estimation failed', detail: e.message })
      })
  })
})

server.listen(PORT, HOST, () => {
  console.log(`exFat estimator listening on http://${HOST}:${PORT}  (model: ${MODEL})`)
  console.log(`Reachable over Tailscale, e.g. http://100.64.0.62:${PORT}/estimate`)
})

// Clean leftover agents on startup, then sweep every 5 minutes.
enqueue(sweep)
setInterval(() => enqueue(sweep), 5 * 60 * 1000).unref()
