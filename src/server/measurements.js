/**
 * measurements.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Universal measurement normalization for recipe ingredients.
 *
 * Two jobs:
 *   1. VAGUE_MEASURES  – a reference table that turns fuzzy, grandma-era terms
 *                        ("a pinch", "a knob", "a glug", "a bag") into concrete
 *                        quantified ranges. This table is injected into the AI
 *                        prompt AND used as a deterministic fallback so the
 *                        results are consistent and never left to the model's
 *                        imagination.
 *
 *   2. convertUnit()   – pure-JS arithmetic that produces BOTH metric and US
 *                        amounts for every ingredient, so the output is truly
 *                        universal regardless of what the card used.
 *
 * Everything here is deterministic and unit-tested (see measurements.test.js).
 */

/* ───────────────────────────────────────────────────────────────────────────
   1. VAGUE / NON-STANDARD MEASURE DICTIONARY
   Each entry resolves to a canonical amount. Where a term is genuinely a range
   (a "pinch" is 1/16–1/8 tsp), we store the midpoint plus the range for notes.
─────────────────────────────────────────────────────────────────────────── */
export const VAGUE_MEASURES = {
  // dry seasoning amounts (volume → teaspoons)
  'smidgen':      { value: 1 / 32, unit: 'tsp', note: 'a smidgen ≈ 1/32 tsp' },
  'pinch':        { value: 1 / 16, unit: 'tsp', note: 'a pinch ≈ 1/16 tsp' },
  'dash':         { value: 1 / 8,  unit: 'tsp', note: 'a dash ≈ 1/8 tsp' },
  'tad':          { value: 1 / 4,  unit: 'tsp', note: 'a tad ≈ 1/4 tsp' },

  // liquid "pours" (volume → tablespoons / ml)
  'splash':       { value: 1,   unit: 'tbsp', note: 'a splash ≈ 1 tbsp' },
  'glug':         { value: 2,   unit: 'tbsp', note: 'a glug ≈ 2 tbsp' },
  'drizzle':      { value: 1,   unit: 'tbsp', note: 'a drizzle ≈ 1 tbsp' },
  'dollop':       { value: 1.5, unit: 'tbsp', note: 'a dollop ≈ 1.5 tbsp' },
  'spoonful':     { value: 1,   unit: 'tbsp', note: 'a (table)spoonful ≈ 1 tbsp' },
  'teaspoonful':  { value: 1,   unit: 'tsp',  note: 'a teaspoonful ≈ 1 tsp' },

  // fat (mass → grams)
  'knob':         { value: 15, unit: 'g',  note: 'a knob of butter ≈ 15 g (1 tbsp)' },
  'pat':          { value: 5,  unit: 'g',  note: 'a pat of butter ≈ 5 g (1 tsp)' },
  'lump':         { value: 20, unit: 'g',  note: 'a lump ≈ 20 g' },

  // produce / "handful" (mass → grams, approximate for leafy/loose items)
  'handful':      { value: 30,  unit: 'g', note: 'a handful ≈ 30 g (leafy) — adjust for density' },
  'small handful':{ value: 20,  unit: 'g', note: 'a small handful ≈ 20 g' },
  'large handful':{ value: 45,  unit: 'g', note: 'a large handful ≈ 45 g' },
  'bunch':        { value: 100, unit: 'g', note: 'a bunch (herbs/greens) ≈ 100 g' },
  'sprig':        { value: 2,   unit: 'g', note: 'a sprig ≈ 2 g' },
  'clove':        { value: 1,   unit: 'count', note: 'a garlic clove ≈ 1 count (~3 g)' },
  'stick':        { value: 113, unit: 'g', note: 'a stick of butter ≈ 113 g (1/2 cup, US)' },

  // packaging (resolved to a typical retail size → grams/ml)
  'bag':          { value: 500, unit: 'g',  note: 'a "bag" varies — assumed standard 500 g pack' },
  'small bag':    { value: 250, unit: 'g',  note: 'a small bag ≈ 250 g' },
  'large bag':    { value: 1000,unit: 'g',  note: 'a large bag ≈ 1 kg' },
  'packet':       { value: 7,   unit: 'g',  note: 'a packet (yeast/gelatine) ≈ 7 g' },
  'sachet':       { value: 7,   unit: 'g',  note: 'a sachet ≈ 7 g' },
  'can':          { value: 400, unit: 'g',  note: 'a can (tomatoes/beans) ≈ 400 g' },
  'small can':    { value: 200, unit: 'g',  note: 'a small can ≈ 200 g' },
  'tin':          { value: 400, unit: 'g',  note: 'a tin ≈ 400 g' },
  'jar':          { value: 340, unit: 'g',  note: 'a jar ≈ 340 g' },
  'box':          { value: 500, unit: 'g',  note: 'a box ≈ 500 g' },
  'carton':       { value: 500, unit: 'ml', note: 'a carton ≈ 500 ml' },
  'bottle':       { value: 750, unit: 'ml', note: 'a bottle ≈ 750 ml' },
  'stick (gum)':  { value: 1,   unit: 'count', note: '1 stick' },

  // vague counts / sizes (kept as count, flagged for the cook)
  'some':         { value: null, unit: 'to taste', note: '"some" — left to taste' },
  'to taste':     { value: null, unit: 'to taste', note: 'season to taste' },
  'a little':     { value: null, unit: 'to taste', note: '"a little" — a small amount, to taste' },
  'as needed':    { value: null, unit: 'to taste', note: 'use as much as needed' }
};

/* ───────────────────────────────────────────────────────────────────────────
   2. UNIT CONVERSION TABLES
   Base units: volume → millilitres (ml), mass → grams (g).
─────────────────────────────────────────────────────────────────────────── */

// volume → ml
const VOLUME_TO_ML = {
  ml: 1, milliliter: 1, millilitre: 1,
  l: 1000, liter: 1000, litre: 1000,
  tsp: 4.92892, teaspoon: 4.92892,
  tbsp: 14.7868, tablespoon: 14.7868,
  'fl oz': 29.5735, 'fluid ounce': 29.5735,
  cup: 236.588,          // US legal cup
  pint: 473.176,         // US pint
  quart: 946.353,
  gallon: 3785.41
};

// mass → g
const MASS_TO_G = {
  g: 1, gram: 1, gramme: 1,
  kg: 1000, kilogram: 1000,
  mg: 0.001,
  oz: 28.3495, ounce: 28.3495,
  lb: 453.592, pound: 453.592
};

const VOLUME_UNITS = new Set(Object.keys(VOLUME_TO_ML));
const MASS_UNITS = new Set(Object.keys(MASS_TO_G));

/* Preferred "nice" display units when we scale metric up/down.
   Small amounts keep extra decimal places so a "pinch" never rounds to 0. */
function tidyMetricVolume(ml) {
  if (ml >= 1000) return { value: round(ml / 1000, 2), unit: 'l' };
  if (ml >= 10)   return { value: round(ml, 0), unit: 'ml' };
  if (ml >= 1)    return { value: round(ml, 1), unit: 'ml' };
  return { value: round(ml, 2), unit: 'ml' };
}
function tidyMetricMass(g) {
  if (g >= 1000) return { value: round(g / 1000, 2), unit: 'kg' };
  if (g >= 10)   return { value: round(g, 0), unit: 'g' };
  if (g >= 1)    return { value: round(g, 1), unit: 'g' };
  return { value: round(g, 2), unit: 'g' };
}

/* US display: pick the most readable unit. */
function tidyUSVolume(ml) {
  const cups = ml / VOLUME_TO_ML.cup;
  if (cups >= 0.9) return { value: round(cups, 2), unit: 'cup' };
  const tbsp = ml / VOLUME_TO_ML.tbsp;
  if (tbsp >= 0.9) return { value: round(tbsp, 2), unit: 'tbsp' };
  const tsp = ml / VOLUME_TO_ML.tsp;
  return { value: round(tsp, 2), unit: 'tsp' };
}
function tidyUSMass(g) {
  const lb = g / MASS_TO_G.lb;
  if (lb >= 1) return { value: round(lb, 2), unit: 'lb' };
  return { value: round(g / MASS_TO_G.oz, 2), unit: 'oz' };
}

function round(n, dp) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/* ───────────────────────────────────────────────────────────────────────────
   3. PUBLIC API
─────────────────────────────────────────────────────────────────────────── */

/**
 * Normalize a single vague term. Returns null if not found.
 * @param {string} term e.g. "pinch", "a knob", "bag"
 */
export function resolveVague(term) {
  if (!term) return null;
  const key = String(term).toLowerCase().trim().replace(/^an?\s+/, '');
  return VAGUE_MEASURES[key] ?? null;
}

/**
 * Convert an amount + unit into universal metric & US representations.
 * Returns { metric, us, base } or null for non-convertible (count / to taste).
 *
 * @param {number} value
 * @param {string} unit  canonical unit string (tsp, cup, g, oz, ...)
 */
export function convertUnit(value, unit) {
  if (value == null || !unit) return null;
  const u = String(unit).toLowerCase().trim();

  if (VOLUME_UNITS.has(u)) {
    const ml = value * VOLUME_TO_ML[u];
    return {
      base: { value: round(ml, 2), unit: 'ml' },
      metric: tidyMetricVolume(ml),
      us: tidyUSVolume(ml)
    };
  }
  if (MASS_UNITS.has(u)) {
    const g = value * MASS_TO_G[u];
    return {
      base: { value: round(g, 2), unit: 'g' },
      metric: tidyMetricMass(g),
      us: tidyUSMass(g)
    };
  }
  // Not a convertible unit (count, "to taste", "clove", etc.)
  return null;
}

/**
 * Given a raw ingredient object from the AI
 *   { item, quantity, unit, original }
 * produce a fully-normalized ingredient with universal measures.
 *
 * Handles three cases:
 *   a) vague term in `unit` (e.g. unit="pinch")   → resolve then convert
 *   b) standard unit (e.g. unit="cup", qty=2)     → convert directly
 *   c) count/to-taste                              → pass through with a note
 */
export function normalizeIngredient(raw) {
  const out = {
    item: raw.item ?? '',
    original: raw.original ?? '',
    quantity: raw.quantity ?? null,
    unit: raw.unit ?? '',
    metric: null,
    us: null,
    notes: []
  };

  let value = typeof raw.quantity === 'number' ? raw.quantity : parseLooseNumber(raw.quantity);
  let unit = (raw.unit ?? '').toLowerCase().trim();

  // (a) vague term?
  const vague = resolveVague(unit) || resolveVague(raw.original);
  if (vague) {
    out.notes.push(vague.note);
    if (vague.value == null) {
      // "to taste" style — nothing to quantify
      out.unit = vague.unit;
      out.quantity = null;
      return out;
    }
    // multiply by the stated count ("2 pinches" → value 2 × 1/16 tsp)
    const count = value && value > 0 ? value : 1;
    value = count * vague.value;
    unit = vague.unit;
    out.unit = unit;
    out.quantity = round(value, 4);
  }

  // (b) convert to universal metric + US
  const converted = convertUnit(value, unit);
  if (converted) {
    out.metric = converted.metric;
    out.us = converted.us;
  } else if (unit === 'count' || unit === '' ) {
    // (c) a plain count of items (e.g. "3 eggs")
    out.notes.push('counted item — no unit conversion needed');
  }

  return out;
}

/** Parse "1 1/2", "½", "2-3" (takes midpoint), "a" → sensible numbers. */
export function parseLooseNumber(input) {
  if (typeof input === 'number') return input;
  if (!input) return null;
  let s = String(input).trim().toLowerCase();

  const UNICODE = { '½':0.5,'¼':0.25,'¾':0.75,'⅓':1/3,'⅔':2/3,'⅛':0.125,'⅜':0.375,'⅝':0.625,'⅞':0.875 };
  for (const [g, v] of Object.entries(UNICODE)) s = s.replace(new RegExp(g, 'g'), ` ${v}`);

  // range "2-3" or "2 to 3" → midpoint
  const range = s.match(/^(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)$/);
  if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;

  // mixed number "1 1/2"
  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);

  // simple fraction "3/4"
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return parseInt(frac[1]) / parseInt(frac[2]);

  const num = parseFloat(s);
  return Number.isFinite(num) ? num : null;
}

/** Build the reference block injected into the AI system prompt. */
export function vagueReferenceForPrompt() {
  return Object.entries(VAGUE_MEASURES)
    .map(([term, def]) => `- "${term}": ${def.note}`)
    .join('\n');
}
