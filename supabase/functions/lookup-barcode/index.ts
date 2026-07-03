// Edge Function: lookup-barcode
// -----------------------------------------------------------------------------
// Resolves a scanned barcode to nutrition facts in three tiers:
//   1. Our own foods library (global rows, then the caller's private rows).
//   2. Open Food Facts (free, ODbL) — a hit is cached as a global foods row
//      (source 'database', verified true) so subsequent scans skip the network.
//   3. Miss — the client falls back to a crowdsourced submission form.
//
// Auth mirrors estimate-nutrition: config.toml sets verify_jwt = true AND we
// resolve the caller with supabase.auth.getUser(). The global cache insert
// uses the service role key (RLS forbids clients writing owner_id-null rows).
//
// Deploy:  supabase functions deploy lookup-barcode

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Open Food Facts asks API consumers to identify themselves via User-Agent.
const OFF_USER_AGENT = 'exFat/0.0 (jaden@openrelay.inc)'

// The nutriment fields we need from Open Food Facts, per serving and per 100g.
const OFF_FIELDS = 'product_name,brands,serving_quantity,serving_quantity_unit,nutriments'

interface OffNutriments {
  'energy-kcal_serving'?: number
  proteins_serving?: number
  carbohydrates_serving?: number
  fat_serving?: number
  'energy-kcal_100g'?: number
  proteins_100g?: number
  carbohydrates_100g?: number
  fat_100g?: number
}

interface OffProduct {
  product_name?: string
  brands?: string
  serving_quantity?: number | string
  serving_quantity_unit?: string
  nutriments?: OffNutriments
}

/**
 * Map an Open Food Facts product to a foods-row shape, or null if it lacks
 * usable nutrition data. Prefers per-serving values (with the serving size in
 * grams/ml when OFF knows it); falls back to per-100g.
 */
function offToFood(barcode: string, product: OffProduct) {
  const n = product.nutriments ?? {}
  const name = product.product_name?.trim()
  if (!name) return null

  const brand = product.brands?.split(',')[0]?.trim() || null
  const servingQty = Number(product.serving_quantity)
  const servingUnit = product.serving_quantity_unit === 'ml' ? 'ml' : 'g'

  const perServing =
    typeof n['energy-kcal_serving'] === 'number' && Number.isFinite(servingQty) && servingQty > 0

  const pick = (serving: number | undefined, per100g: number | undefined) =>
    Math.round(((perServing ? serving : per100g) ?? 0) * 100) / 100

  const calories = pick(n['energy-kcal_serving'], n['energy-kcal_100g'])
  if (calories === 0 && n['energy-kcal_100g'] === undefined && !perServing) return null

  return {
    name,
    brand,
    source: 'database' as const,
    barcode,
    serving_qty: perServing ? servingQty : 100,
    serving_unit: perServing ? servingUnit : 'g',
    calories,
    protein: pick(n.proteins_serving, n.proteins_100g),
    carbs: pick(n.carbohydrates_serving, n.carbohydrates_100g),
    fat: pick(n.fat_serving, n.fat_100g),
    owner_id: null,
    verified: true,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Auth gate: reject before doing any lookups.
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )

  const {
    data: { user },
  } = await userClient.auth.getUser()

  if (!user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let barcode = ''
  try {
    const body = await req.json()
    barcode = typeof body?.barcode === 'string' ? body.barcode.replace(/\D/g, '') : ''
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  // EAN-8 through EAN-14 / UPC-A — anything else is not a food barcode.
  if (!/^\d{8,14}$/.test(barcode)) {
    return json({ error: 'Invalid barcode' }, 400)
  }

  try {
    // Tier 1: our own library. The user client sees global rows plus the
    // caller's private rows under RLS; prefer global/verified matches.
    const { data: existing, error: selectError } = await userClient
      .from('foods')
      .select('*')
      .eq('barcode', barcode)
      .order('owner_id', { ascending: true, nullsFirst: true })
      .limit(1)
      .maybeSingle()
    if (selectError) throw selectError

    if (existing) {
      return json({ found: true, source: 'library', food: existing })
    }

    // Tier 2: Open Food Facts.
    const offRes = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=${OFF_FIELDS}`,
      { headers: { 'User-Agent': OFF_USER_AGENT } },
    )

    if (offRes.status === 404) {
      return json({ found: false })
    }
    if (!offRes.ok) {
      throw new Error(`Open Food Facts responded ${offRes.status}`)
    }

    const offBody = (await offRes.json()) as { status?: number; product?: OffProduct }
    const food = offBody.status === 1 && offBody.product ? offToFood(barcode, offBody.product) : null

    if (!food) {
      return json({ found: false })
    }

    // Cache as a global row with the service role (bypasses RLS). A concurrent
    // scan may have inserted first — on unique violation, return that row.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: inserted, error: insertError } = await admin
      .from('foods')
      .insert(food)
      .select()
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: raced } = await admin
          .from('foods')
          .select('*')
          .eq('barcode', barcode)
          .is('owner_id', null)
          .single()
        if (raced) return json({ found: true, source: 'openfoodfacts', food: raced })
      }
      throw insertError
    }

    return json({ found: true, source: 'openfoodfacts', food: inserted })
  } catch (err) {
    console.error('lookup-barcode failed:', err)
    return json({ error: 'Barcode lookup failed. Please try again.' }, 500)
  }
})
