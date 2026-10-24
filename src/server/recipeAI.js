/**
 * recipeAI.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The AI brain: takes an image of a recipe card and returns a fully structured,
 * universally-measured recipe.
 *
 * Provider: Google Gemini, via its OpenAI-compatible endpoint. This lets us keep
 * using the `openai` SDK (just pointed at Gemini's base URL) and Gemini's free
 * tier means no billing is required. Set GEMINI_API_KEY in your .env.
 * Get a free key at: https://aistudio.google.com/apikey
 *
 * Pipeline:
 *   1. Vision model reads the card (handwritten or printed) and extracts the raw
 *      recipe as JSON. We ask for a strict shape in the prompt and request a
 *      JSON object response, then validate/normalize the result ourselves.
 *   2. Every ingredient is run through the deterministic normalizer in
 *      measurements.js, which turns vague units into quantified metric + US
 *      amounts. The model does the *reading*; our code does the *math*.
 */

import OpenAI from 'openai';
import { normalizeIngredient, vagueReferenceForPrompt } from './measurements.js';

// Gemini's OpenAI-compatible endpoint. The `openai` SDK talks to it unchanged
// once we set this base URL and pass a Gemini API key.
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

// "gemini-flash-lite-latest" is fast, vision-capable, and has its own free-tier
// quota — handy because the full "gemini-flash-latest" free quota is small
// (~20 requests/day) and is easy to exhaust. Switch to 'gemini-flash-latest'
// for a bit more accuracy on messy handwriting once its quota resets.
const MODEL = 'gemini-flash-lite-latest';

/* The exact JSON shape the model must return. Gemini's OpenAI-compatible layer
   supports response_format: { type: 'json_object' } (guarantees valid JSON) but
   not OpenAI's enforced json_schema, so we describe the shape in the prompt and
   validate/normalize the result ourselves in normalizeRecipe(). */
const RECIPE_SHAPE = `{
  "title": string,                 // the recipe name
  "grandma": string,               // name of the recipe's owner/grandma, or ""
  "time": string,                  // total cook/prep time, or ""
  "servings": string,              // number of servings, or ""
  "blurb": string,                 // one-sentence description of the dish
  "ingredients": [                 // every ingredient, parsed into parts
    {
      "item": string,              // the ingredient itself, e.g. "plain flour"
      "quantity": string,          // number as written, e.g. "2", "1 1/2", or ""
      "unit": string,              // unit exactly as written: cup, g, pinch, knob, bag, clove, count, or ""
      "original": string           // the full original line exactly as on the card
    }
  ],
  "steps": [string],               // ordered method steps
  "notes": string                  // any extra tips/notes on the card, or ""
}`;

function buildSystemPrompt() {
  return `You are an expert recipe transcriber. You will be shown a photo of a recipe card — it may be handwritten (possibly in cursive or faded ink) or printed.

Your tasks:
1. Read EVERYTHING on the card carefully, including smudged or abbreviated text.
2. Split each ingredient line into { item, quantity, unit, original }.
   - Put the raw unit exactly as written in "unit" (e.g. "pinch", "knob", "bag", "cup", "g").
   - If an ingredient is just counted (e.g. "3 eggs"), set unit to "count".
   - Always preserve the full original line in "original".
3. Transcribe the method into clear ordered steps.
4. Do NOT convert or invent measurements yourself — just report exactly what the card says. Our system handles conversions afterward.

For reference, these vague terms will be normalized downstream (you don't need to convert, just capture them accurately):
${vagueReferenceForPrompt()}

Return ONLY a JSON object (no markdown, no code fences) matching exactly this shape:
${RECIPE_SHAPE}`;
}

/**
 * Read a recipe from an image.
 * @param {object} opts
 * @param {string} opts.apiKey       Gemini API key (GEMINI_API_KEY)
 * @param {string} opts.dataUrl      front of the card: data:image/...;base64,... OR a URL
 * @param {string} [opts.dataUrlBack] optional back of the card (e.g. the method side)
 * @returns {Promise<object>} normalized recipe
 */
export async function readRecipeFromImage({ apiKey, dataUrl, dataUrlBack = null }) {
  if (!apiKey) throw new Error('Missing Gemini API key.');
  if (!dataUrl) throw new Error('Missing image.');

  // Same `openai` SDK, pointed at Gemini's OpenAI-compatible endpoint.
  // Gemini occasionally returns transient 503 (overloaded) / 429 / 500 errors;
  // the SDK retries those automatically with backoff. Each attempt is capped at
  // 45s so a slow call fails fast instead of hanging the browser request.
  const client = new OpenAI({
    apiKey,
    baseURL: GEMINI_BASE_URL,
    maxRetries: 4,
    timeout: 45_000
  });

  // Build the user message. If a back image is provided, include both and tell
  // the model they are the front and back of the SAME card, to be merged.
  const userContent = dataUrlBack
    ? [
        { type: 'text', text: 'These are two photos of the SAME recipe card — the front and the back. Combine everything from both into one recipe (ingredients and method may be split across the two sides).' },
        { type: 'text', text: 'Front of the card:' },
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: 'Back of the card:' },
        { type: 'image_url', image_url: { url: dataUrlBack } }
      ]
    : [
        { type: 'text', text: 'Transcribe this recipe card into the required structure.' },
        { type: 'image_url', image_url: { url: dataUrl } }
      ];

  const request = {
    model: MODEL,
    max_tokens: 2000,
    temperature: 0.1,
    response_format: { type: 'json_object' }, // Gemini compat: guarantees valid JSON
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: userContent }
    ]
  };

  let completion;
  try {
    completion = await client.chat.completions.create(request);
  } catch (err) {
    // Turn transient upstream failures into a clear, retryable message.
    if (err?.status === 503 || err?.status === 429 || err?.status === 500) {
      const e = new Error('The recipe reader is busy right now. Please click "Read recipe" again in a moment.');
      e.status = 503;
      throw e;
    }
    throw err;
  }

  let raw = completion.choices?.[0]?.message?.content ?? '{}';

  // Be defensive: if the model wraps the JSON in ```json fences, strip them.
  raw = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('The AI returned malformed data. Please try a clearer photo.');
  }

  return normalizeRecipe(parsed);
}

/** Run every ingredient through the universal measurement normalizer. */
export function normalizeRecipe(recipe) {
  const ingredients = (recipe.ingredients ?? []).map(raw => {
    const norm = normalizeIngredient({
      item: raw.item,
      quantity: raw.quantity,
      unit: raw.unit,
      original: raw.original
    });
    return {
      item: norm.item,
      original: norm.original,
      quantity: norm.quantity,
      unit: norm.unit,
      metric: norm.metric,   // { value, unit }  e.g. { value: 30, unit: 'g' }
      us: norm.us,           // { value, unit }  e.g. { value: 1.06, unit: 'oz' }
      notes: norm.notes,
      // a friendly display string combining both systems
      display: buildDisplay(norm)
    };
  });

  return {
    title: recipe.title ?? '',
    grandma: recipe.grandma ?? '',
    time: recipe.time ?? '',
    servings: recipe.servings ?? '',
    blurb: recipe.blurb ?? '',
    ingredients,
    steps: recipe.steps ?? [],
    notes: recipe.notes ?? ''
  };
}

/** Make a readable universal string, e.g. "30 g (≈ 1.06 oz) butter". */
function buildDisplay(norm) {
  const name = norm.item || '';
  if (norm.metric && norm.us) {
    return `${fmt(norm.metric)} (≈ ${fmt(norm.us)}) ${name}`.trim();
  }
  if (norm.quantity != null && norm.unit && norm.unit !== 'count') {
    return `${norm.quantity} ${norm.unit} ${name}`.trim();
  }
  if (norm.unit === 'to taste') return `${name} — to taste`.trim();
  if (norm.quantity != null) return `${norm.quantity} ${name}`.trim();
  return name;
}

function fmt(m) {
  return `${m.value} ${m.unit}`;
}
