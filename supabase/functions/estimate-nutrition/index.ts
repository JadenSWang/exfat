// Edge Function: estimate-nutrition
// -----------------------------------------------------------------------------
// Turns a free-text meal description into per-item calorie/macro estimates via
// Claude. The Anthropic API key stays server-side (Deno.env) and never reaches
// the client. Auth is enforced two ways: config.toml sets verify_jwt = true,
// and we additionally resolve the caller with supabase.auth.getUser() so we
// never call the model for an unauthenticated request.
//
// Deploy:  supabase functions deploy estimate-nutrition
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'

// CORS: allow browser/native clients to preflight and call this function.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// JSON response helper that always carries the CORS headers.
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Tool the model must call. `strict: true` guarantees the returned input
// validates exactly against this schema (additionalProperties: false + required).
const tool = {
  name: 'record_nutrition',
  description: 'Record the estimated nutrition for each distinct food item in the described meal.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'name',
            'quantity',
            'unit',
            'calories',
            'protein',
            'carbs',
            'fat',
            'confidence',
            'foodId',
          ],
          properties: {
            name: { type: 'string' },
            quantity: { type: 'number' },
            unit: {
              type: 'string',
              enum: ['g', 'oz', 'ml', 'tbsp', 'tsp', 'cup', 'piece', 'serving'],
            },
            calories: { type: 'number' },
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fat: { type: 'number' },
            confidence: { type: 'number' },
            // Id of a known `foods` row (from search_foods) this item matches,
            // or null when it's a fresh estimate.
            foodId: { type: ['string', 'null'] },
          },
        },
      },
    },
  },
}

// Lets the model look up the user's known foods (previously scanned barcodes,
// crowdsourced labels, global products) so repeat items get exact label macros
// instead of a fresh guess.
const searchTool = {
  name: 'search_foods',
  description:
    "Search the user's known foods by name or brand. Returns per-serving label nutrition; " +
    'results marked "recent" were logged by this user lately (they often repeat the same ' +
    'products daily). Use before estimating packaged/branded or repeat-sounding items.',
  input_schema: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string', description: 'Food name or brand fragment, e.g. "egg" or "fage".' },
    },
  },
}

interface EstimatedItem {
  name: string
  quantity: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  confidence: number
  foodId?: string | null
}

const FOOD_COLUMNS = 'id, name, brand, serving_qty, serving_unit, calories, protein, carbs, fat'

// Backing query for search_foods: the user's recently logged foods that match,
// then a name/brand match over foods RLS lets them see (own + global). The
// user-scoped client enforces row visibility.
// deno-lint-ignore no-explicit-any
async function searchFoods(supabase: any, term: string): Promise<unknown[]> {
  const clean = term.replace(/[,()*%]/g, '').trim()
  if (!clean) return []
  const pattern = `%${clean}%`

  const [recentRes, nameRes] = await Promise.all([
    supabase
      .from('diary_entries')
      .select(`food_id, foods(${FOOD_COLUMNS})`)
      .not('food_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('foods')
      .select(FOOD_COLUMNS)
      .or(`name.ilike.${pattern},brand.ilike.${pattern}`)
      .limit(8),
  ])

  const results: unknown[] = []
  const seen = new Set<string>()
  const push = (food: Record<string, unknown>, recent: boolean) => {
    if (seen.has(food.id as string)) return
    seen.add(food.id as string)
    results.push({
      id: food.id,
      name: food.name,
      brand: food.brand,
      servingQty: food.serving_qty,
      servingUnit: food.serving_unit,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      recent,
    })
  }
  const lowered = clean.toLowerCase()
  for (const row of recentRes.data ?? []) {
    const food = row.foods
    if (!food) continue
    if (!`${food.name} ${food.brand ?? ''}`.toLowerCase().includes(lowered)) continue
    push(food, true)
  }
  for (const food of nameRes.data ?? []) push(food, false)
  return results.slice(0, 8)
}

Deno.serve(async (req) => {
  // CORS preflight.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Auth gate: resolve the caller from their Authorization header. If there's
  // no valid user, refuse before spending any Anthropic tokens.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // Parse and validate the request body.
  let text = ''
  try {
    const body = await req.json()
    text = typeof body?.text === 'string' ? body.text.trim() : ''
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!text) {
    return json({ error: 'Missing meal description ("text")' }, 400)
  }

  try {
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    const system =
      'You are a nutrition estimator. Given a free-text meal description, break it into ' +
      'distinct food items and estimate per-item calories (kcal) and macros (grams). Values ' +
      'are ESTIMATES. quantity/unit reflect the amount described (default to a sensible ' +
      'serving if unstated). confidence is 0..1 (how sure you are). Users often repeat the ' +
      'same products daily — for packaged/branded or repeat-sounding items, call search_foods ' +
      'first; if a result clearly matches, use its label macros scaled to the described amount, ' +
      'set that item\'s foodId to the result id and confidence to 1. Otherwise estimate with ' +
      'foodId null. Finish by calling record_nutrition exactly once; never reply in prose.'

    // Tool loop: the model may search the user's known foods a few times before
    // recording. Bounded so a pathological loop can't spin.
    // deno-lint-ignore no-explicit-any
    const messages: any[] = [{ role: 'user', content: text }]
    // deno-lint-ignore no-explicit-any
    let recordInput: { items?: EstimatedItem[] } | null = null
    for (let turn = 0; turn < 5 && !recordInput; turn++) {
      const msg = await anthropic.messages.create({
        // Exactly claude-opus-4-8 — no date suffix.
        model: 'claude-opus-4-8',
        max_tokens: 2048,
        system,
        messages,
        // deno-lint-ignore no-explicit-any
        tools: [tool as any, searchTool as any],
        // Force record_nutrition on the last turn so the loop always terminates
        // with a result; otherwise let the model choose (search or record).
        tool_choice: turn === 4 ? { type: 'tool', name: 'record_nutrition' } : { type: 'any' },
      })

      // The model can decline via a safety refusal — surface that rather than
      // trying to read a tool_use block that won't exist.
      if (msg.stop_reason === 'refusal') {
        return json({ error: 'The request was declined and could not be estimated.' }, 422)
      }

      const toolUses = msg.content.filter((block) => block.type === 'tool_use')
      const record = toolUses.find((block) => block.name === 'record_nutrition')
      if (record) {
        recordInput = record.input as { items?: EstimatedItem[] }
        break
      }
      if (toolUses.length === 0) {
        return json({ error: 'Model did not return a nutrition estimate.' }, 422)
      }

      // Answer every search_foods call and hand the results back.
      messages.push({ role: 'assistant', content: msg.content })
      const toolResults = await Promise.all(
        toolUses.map(async (block) => ({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify({
            results: await searchFoods(supabase, String((block.input as { query?: string })?.query ?? '')).catch(
              () => [],
            ),
          }),
        })),
      )
      messages.push({ role: 'user', content: toolResults })
    }

    if (!recordInput) {
      return json({ error: 'Model did not return a nutrition estimate.' }, 422)
    }

    const input = recordInput
    const items = Array.isArray(input.items) ? input.items : []

    // Compute totals server-side so the client always gets a trustworthy sum.
    const totals = items.reduce(
      (acc, item) => ({
        calories: acc.calories + (Number(item.calories) || 0),
        protein: acc.protein + (Number(item.protein) || 0),
        carbs: acc.carbs + (Number(item.carbs) || 0),
        fat: acc.fat + (Number(item.fat) || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    )

    return json({
      items,
      totals,
      isEstimate: true,
      note: 'AI estimate — scan a barcode for exact values.',
    })
  } catch (err) {
    // Never leak the API key or raw provider internals. Log server-side only.
    console.error('estimate-nutrition failed:', err)
    return json({ error: 'Failed to estimate nutrition. Please try again.' }, 500)
  }
})
