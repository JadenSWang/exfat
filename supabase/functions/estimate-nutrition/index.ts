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
          },
        },
      },
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

    const msg = await anthropic.messages.create({
      // Exactly claude-opus-4-8 — no date suffix.
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      system:
        'You are a nutrition estimator. Given a free-text meal description, break it into ' +
        'distinct food items and estimate per-item calories (kcal) and macros (grams). Values ' +
        'are ESTIMATES. quantity/unit reflect the amount described (default to a sensible ' +
        'serving if unstated). confidence is 0..1 (how sure you are). Always call the ' +
        'record_nutrition tool; never reply in prose.',
      messages: [{ role: 'user', content: text }],
      // deno-lint-ignore no-explicit-any
      tools: [tool as any],
      tool_choice: { type: 'tool', name: 'record_nutrition' },
    })

    // The model can decline via a safety refusal — surface that rather than
    // trying to read a tool_use block that won't exist.
    if (msg.stop_reason === 'refusal') {
      return json({ error: 'The request was declined and could not be estimated.' }, 422)
    }

    // Find the tool_use block and pull the structured items out of it.
    const toolUse = msg.content.find((block) => block.type === 'tool_use')

    if (!toolUse || toolUse.type !== 'tool_use') {
      return json({ error: 'Model did not return a nutrition estimate.' }, 422)
    }

    const input = toolUse.input as { items?: EstimatedItem[] }
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
