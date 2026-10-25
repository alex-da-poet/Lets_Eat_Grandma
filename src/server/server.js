/**
 * server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Express API for "Let's eat grandma".
 *
 * Endpoints:
 *   POST /api/read-recipe   – multipart image upload OR { dataUrl } JSON.
 *                             Returns a normalized recipe with universal measures.
 *   POST /api/recipes       – save a (reviewed) recipe + optional photo.
 *   GET  /api/recipes       – list saved recipes (for the home-page box).
 *   GET  /api/health        – liveness check.
 *
 * The Gemini key is read from the server environment (GEMINI_API_KEY) so it is
 * NEVER exposed to the browser. The client just uploads the photo.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { readRecipeFromImage } from './recipeAI.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Serve the front-end (submit.html, index.html) from the project root so the
// page and API share one origin — API_BASE in submit.html can stay empty.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, '..')));

app.get('/map', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'map.html'));
});

// Serve uploaded photos (grandma photos, recipe-card images). These are saved
// under server/data/uploads and referenced in pages as /data/uploads/<file>.
app.use('/data', express.static(path.join(__dirname, 'data')));

// store uploaded image in memory (we convert to a data URL, never to disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image uploads are allowed.'));
  }
});

/* ───────────────────────────────────────────────────────────────────────────
   Simple JSON-file store for submitted recipes.
   Swap readStore/writeStore for a real database when you're ready — the rest
   of the code doesn't need to change.
─────────────────────────────────────────────────────────────────────────── */
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'recipes.json');
const GRANDMA_STORE_FILE = path.join(DATA_DIR, 'grandmas.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

async function readStore() {
  try { return JSON.parse(await fs.readFile(STORE_FILE, 'utf8')); }
  catch { return []; }
}
async function writeStore(list) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(list, null, 2));
}
async function readGrandmas() {
  let grandmas;
  try { grandmas = JSON.parse(await fs.readFile(GRANDMA_STORE_FILE, 'utf8')); }
  catch (err) {
    if (err.code !== 'ENOENT') throw err;
    grandmas = [];
  }
  const existingNames = new Set(grandmas.map(grandma => grandma.name.toLowerCase()));
  for (const recipe of await readStore()) {
    const name = String(recipe.grandma ?? '').trim();
    if (!name || existingNames.has(name.toLowerCase())) continue;
    const slug = slugify(name);
    grandmas.push({
      id: `legacy-${slug}`,
      slug,
      name,
      from: String(recipe.from ?? '').trim(),
      description: String(recipe.grandmaDescription || recipe.blurb || `A treasured recipe from ${name}.`).trim(),
      photo: recipe.grandmaPhoto || null,
      url: `/grandmas/${slug}`
    });
    existingNames.add(name.toLowerCase());
  }
  return grandmas;
}
async function writeGrandmas(list) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(GRANDMA_STORE_FILE, JSON.stringify(list, null, 2));
}
function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'recipe';
}

app.get('/api/health', (_req, res) => res.json({ ok: true, model: 'gemini-flash-lite-latest' }));

/* ───────────────────────────────────────────────────────────────────────────
   Render a saved recipe as a full page, identical in styling to
   RecipeExample.html. We load that file as a template and swap in the dynamic
   content, so any design change to RecipeExample.html flows through here too.
─────────────────────────────────────────────────────────────────────────── */
const TEMPLATE_FILE = path.join(__dirname, '..', 'RecipeExample.html');

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Build the inner markup (title → by-line) that replaces the example recipe. */
function renderRecipeArticle(r) {
  const metaParts = [];
  if (r.servings) metaParts.push(`<span>Serves ${escapeHtml(r.servings)}</span>`);
  if (r.time)     metaParts.push(`<span>${escapeHtml(r.time)}</span>`);
  const meta = metaParts.length ? `<p class="meta">${metaParts.join('')}</p>` : '';

  const ingredients = (r.ingredients ?? [])
    .map(i => `            <li><label><input type="checkbox"><span>${escapeHtml(i)}</span></label></li>`)
    .join('\n');

  const steps = (r.steps ?? [])
    .map(s => `        <li>${escapeHtml(s)}</li>`)
    .join('\n');

  const blurb = r.blurb ? `<p class="meta"><span>${escapeHtml(r.blurb)}</span></p>` : '';
  const notes = r.notes
    ? `\n      <p class="note">Grandma's note: ${escapeHtml(r.notes)}</p>` : '';
  const grandmaLink = r.grandmaSlug
    ? `<a href="/grandmas/${escapeHtml(r.grandmaSlug)}">Meet ${escapeHtml(r.grandma)}</a> · `
    : '';

  return `    <article class="sheet recipe" aria-labelledby="title">
      <span class="tab">Recipe</span>
      <h1 id="title">${escapeHtml(r.title)}</h1>
      ${meta}
      ${blurb}
      <div class="cols">
        <div>
          <h3>Ingredients</h3>
          <ul class="ing">
${ingredients || '            <li><label><input type="checkbox"><span></span></label></li>'}
          </ul>
        </div>
      </div>

      <h3>How to make it</h3>
      <ol class="steps">
${steps || '        <li></li>'}
      </ol>${notes}
      <p class="by">Sent in by ${escapeHtml(r.by)} ${grandmaLink}<a href="/submit">Add a recipe</a></p>
    </article>`;
}

/** Build the "Meet grandma" intro section that replaces the example one. */
function renderGrandmaSection(r) {
  const name = r.grandma || r.name || '';
  const description = r.grandmaDescription || r.description || '';
  // Photo spot: show the uploaded grandma photo if there is one, otherwise fall
  // back to her initial (matching the template's default styling).
  const photo = r.grandmaPhoto
    ? `<img class="photo" src="${escapeHtml(r.grandmaPhoto)}" alt="${escapeHtml(name)}" style="width:190px;height:190px;object-fit:cover;">`
    : `<div class="photo" aria-hidden="true">${escapeHtml((name || '?').trim().charAt(0).toUpperCase())}</div>`;

  // "From" fact row — only shown when provided.
  const fromRow = r.from
    ? `\n          <dl class="facts"><dt>From</dt><dd>${escapeHtml(r.from)}</dd></dl>` : '';

  // Description of grandma; fall back to the recipe blurb, then a default line.
  const story = escapeHtml(description || r.blurb || `A treasured recipe from ${name}.`);

  return `    <section class="sheet" aria-labelledby="who">
      <span class="tab">${escapeHtml(name)}</span>
      <div class="about">
        <figure class="polaroid" style="margin:0">
          ${photo}
          <figcaption class="name">${escapeHtml(name)}</figcaption>
        </figure>
        <div>
          <h2 id="who">Meet ${escapeHtml(name)}</h2>${fromRow}
          <p class="story">${story}</p>
        </div>
      </div>
    </section>`;
}

function renderGrandmaRecipes(recipes) {
  if (!recipes.length) return '';
  const list = recipes.map(recipe => `      <li>
        <a href="${escapeHtml(recipe.url)}">${escapeHtml(recipe.title || 'Untitled recipe')}</a>
        ${recipe.blurb ? `<p>${escapeHtml(recipe.blurb)}</p>` : ''}
      </li>`).join('\n');
  return `  <section class="sheet" aria-labelledby="recipes">
    <span class="tab">From her kitchen</span>
    <h2 id="recipes">Her recipe cards</h2>
    <ul class="recipe-links">\n${list}\n    </ul>
  </section>`;
}

function buildGrandmaPage(template, grandma, recipes) {
  const main = `  <main>\n${renderGrandmaSection({
    ...grandma,
    grandma: grandma.name,
    grandmaDescription: grandma.description,
    grandmaPhoto: grandma.photo
  })}\n${renderGrandmaRecipes(recipes)}\n  </main>`;
  return template
    .replace(/<main>[\s\S]*<\/main>/, main)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>Meet ${escapeHtml(grandma.name)} · Let's eat grandma!</title>`)
    .replace(/href="index\.html"/g, 'href="/"')
    .replace(/href="submit\.html"/g, 'href="/submit"')
    .replace(/href="grandma-submit\.html"/g, 'href="/grandma-submit"');
}

/**
 * Replace the two <section>/<article> blocks inside <main>…</main> of the
 * template with this recipe's content, and swap the <title> tag.
 */
function buildRecipePage(template, r) {
  const main = `  <main>\n${renderGrandmaSection(r)}\n\n${renderRecipeArticle(r)}\n  </main>`;
  let html = template.replace(/<main>[\s\S]*<\/main>/, main);
  html = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(r.title)} · ${escapeHtml(r.grandma)} · Let's eat grandma!</title>`
  );
  // The recipe is served at /recipes/<slug>, so the template's RELATIVE nav
  // links (e.g. "index.html") would resolve to /recipes/index.html and 404.
  // Make them absolute so Home and Add-a-recipe work from any URL depth.
  html = html
    .replace(/href="index\.html"/g, 'href="/"')
    .replace(/href="submit\.html"/g, 'href="/submit"')
    .replace(/href="grandma-submit\.html"/g, 'href="/grandma-submit"');
  return html;
}

// The "Recipes" nav link: a page listing every recipe, alphabetized.
app.get('/recipes', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'recipes.html'));
});

// Pretty URL for the submit page (nav links use /submit, not /submit.html).
app.get('/submit', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'submit.html'));
});

app.get('/grandma-submit', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'grandma-submit.html'));
});

app.get('/api/grandmas', async (_req, res) => {
  try {
    const grandmas = await readGrandmas();
    res.json({ ok: true, grandmas: grandmas.map(({ id, name, slug, from, latitude, longitude, description, photo, url }) =>
      ({ id, name, slug, from, latitude, longitude, description, photo, url })) });
  } catch (err) {
    console.error('load grandmas failed:', err);
    res.status(500).json({ error: 'Failed to load grandma profiles.' });
  }
});

app.get('/grandmas/:slug', async (req, res) => {
  try {
    const grandmas = await readGrandmas();
    const grandma = grandmas.find(g => g.slug === req.params.slug);
    if (!grandma) return res.status(404).type('html').send('<h1>Grandma not found</h1><p><a href="/">Back to the recipe box</a></p>');
    const template = await fs.readFile(path.join(__dirname, '..', 'GrandmaExample.html'), 'utf8');
    const recipes = (await readStore()).filter(recipe =>
      recipe.grandmaId === grandma.id ||
      (!recipe.grandmaId && recipe.grandma?.toLowerCase() === grandma.name.toLowerCase())
    );
    res.type('html').send(buildGrandmaPage(template, grandma, recipes));
  } catch (err) {
    console.error('render grandma failed:', err);
    res.status(500).type('html').send('<h1>Could not load this grandma profile.</h1>');
  }
});

app.post('/api/grandmas',
  upload.single('grandmaPhoto'),
  async (req, res) => {
    try {
      let payload;
      try { payload = JSON.parse(req.body?.data ?? '{}'); }
      catch { return res.status(400).json({ error: 'Invalid grandma profile data.' }); }
      const missing = ['name', 'description'].filter(key => !String(payload[key] ?? '').trim());
      if (missing.length) {
        return res.status(422).json({ error: `Missing required field(s): ${missing.join(', ')}.` });
      }

      const grandmas = await readGrandmas();
      const name = String(payload.name).trim();
      const from = String(payload.from ?? '').trim();
      const latitude = Number(payload.latitude);
      const longitude = Number(payload.longitude);
      if (!from) return res.status(422).json({ error: 'Where Grandma is from is required so her profile can appear on the map.' });
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return res.status(422).json({ error: 'A valid location is required so Grandma can be placed on the map.' });
      }
      const baseSlug = slugify(name);
      let slug = baseSlug;
      let suffix = 2;
      while (grandmas.some(grandma => grandma.slug === slug)) slug = `${baseSlug}-${suffix++}`;

      const id = crypto.randomUUID();
      let photo = null;
      if (req.file) {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        const ext = (req.file.mimetype.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const fileName = `${id}-grandma.${ext}`;
        await fs.writeFile(path.join(UPLOAD_DIR, fileName), req.file.buffer);
        photo = `/data/uploads/${fileName}`;
      }
      const grandma = {
        id, slug, name,
        from,
        latitude,
        longitude,
        description: String(payload.description).trim(),
        photo,
        submittedAt: new Date().toISOString(),
        url: `/grandmas/${slug}`
      };
      grandmas.push(grandma);
      await writeGrandmas(grandmas);
      res.status(201).json({ ok: true, grandma });
    } catch (err) {
      console.error('save grandma failed:', err);
      res.status(500).json({ error: err.message || 'Failed to save grandma profile.' });
    }
  }
);

app.get('/recipes/:slug', async (req, res) => {
  try {
    const store = await readStore();
    const recipe = store.find(r => r.slug === req.params.slug && r.status === 'published')
                || store.find(r => r.slug === req.params.slug);
    if (!recipe) {
      return res.status(404).type('html').send('<h1>Recipe not found</h1><p><a href="/">Back to the box</a></p>');
    }
    const template = await fs.readFile(TEMPLATE_FILE, 'utf8');
    let grandma = recipe;
    if (recipe.grandmaId) {
      grandma = (await readGrandmas()).find(item => item.id === recipe.grandmaId) || recipe;
    }
    res.type('html').send(buildRecipePage(template, {
      ...recipe,
      grandmaSlug: grandma.slug,
      grandma: grandma.name ?? recipe.grandma,
      from: grandma.from ?? recipe.from,
      grandmaDescription: grandma.description ?? recipe.grandmaDescription,
      grandmaPhoto: grandma.photo ?? recipe.grandmaPhoto
    }));
  } catch (err) {
    console.error('render recipe failed:', err);
    res.status(500).type('html').send('<h1>Could not load this recipe.</h1>');
  }
});

app.post('/api/read-recipe',
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'imageBack', maxCount: 1 }]),
  async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Server is missing GEMINI_API_KEY. Set it in a .env file (see .env.example). Get a free key at https://aistudio.google.com/apikey'
      });
    }

    // Turn an uploaded file into a data URL; fall back to a JSON-provided one.
    const fileToDataUrl = file =>
      file ? `data:${file.mimetype};base64,${file.buffer.toString('base64')}` : null;

    // Front: multipart file OR JSON { dataUrl }. Back: optional second side.
    const dataUrl     = fileToDataUrl(req.files?.image?.[0])     || req.body?.dataUrl;
    const dataUrlBack = fileToDataUrl(req.files?.imageBack?.[0]) || req.body?.dataUrlBack || null;

    if (!dataUrl) {
      return res.status(400).json({ error: 'No image provided. Upload a file or send a dataUrl.' });
    }

    const recipe = await readRecipeFromImage({ apiKey, dataUrl, dataUrlBack });
    res.json({ ok: true, recipe });

  } catch (err) {
    console.error('read-recipe failed:', err);

    // The OpenAI SDK attaches the upstream HTTP status (400, 401, 403, 429, …)
    // to err.status. Surface that directly so the real cause isn't masked as
    // 500. Its detailed message lives on err.error?.message (or err.message).
    const upstream = Number.isInteger(err?.status) ? err.status : null;
    const detail = err?.error?.message || err?.message || 'Failed to read recipe.';

    let status = upstream;
    if (!status) {
      status = /api key/i.test(detail) ? 401
             : /malformed|clearer photo/i.test(detail) ? 422
             : 500;
    }

    // Give a human hint for the most common upstream failures.
    let hint = '';
    if (upstream === 400 || upstream === 401 || upstream === 403) {
      hint = ' (Gemini rejected the request — check GEMINI_API_KEY in .env is a valid key from https://aistudio.google.com/apikey)';
    } else if (upstream === 429) {
      hint = ' (Gemini free-tier rate limit reached — wait a minute and try again.)';
    }

    res.status(status).json({ error: detail + hint });
  }
});

/* Save a reviewed recipe (JSON in the `data` field) + optional card photos. */
app.post('/api/recipes',
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'imageBack', maxCount: 1 }
  ]),
  async (req, res) => {
  try {
    let payload;
    try { payload = JSON.parse(req.body?.data ?? '{}'); }
    catch { return res.status(400).json({ error: 'Invalid recipe data.' }); }

    // Validate the required fields (mirrors the front-end check).
    const missing = ['title', 'grandmaId', 'by'].filter(k => !String(payload[k] ?? '').trim());
    if (missing.length) {
      return res.status(422).json({ error: `Missing required field(s): ${missing.join(', ')}.` });
    }

    const grandma = (await readGrandmas()).find(item => item.id === payload.grandmaId);
    if (!grandma) return res.status(422).json({ error: 'Choose a valid Grandma profile before submitting the recipe.' });

    const id = crypto.randomUUID();
    const slug = slugify(payload.title);

    // By default new recipes are published immediately so they appear in the
    // box right away. Set REQUIRE_REVIEW=true in .env to instead hold them as
    // 'pending_review' until an admin approves (they'd then be hidden from the
    // default GET /api/recipes and visible via ?status=all).
    const requireReview = /^true$/i.test(process.env.REQUIRE_REVIEW || '');
    const status = requireReview ? 'pending_review' : 'published';

    // Helper: persist one uploaded image file and return its public path.
    async function saveImage(file, suffix) {
      if (!file) return null;
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      const ext = (file.mimetype.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const fileName = `${id}${suffix}.${ext}`;
      await fs.writeFile(path.join(UPLOAD_DIR, fileName), file.buffer);
      return `/data/uploads/${fileName}`;
    }

    const imagePath        = await saveImage(req.files?.image?.[0], '');
    const imageBackPath    = await saveImage(req.files?.imageBack?.[0], '-back');

    const record = {
      id,
      slug,
      status,                          // 'published' by default; see REQUIRE_REVIEW
      submittedAt: new Date().toISOString(),
      url: `/recipes/${slug}`,
      image: imagePath,
      imageBack: imageBackPath,
      title:    String(payload.title).trim(),
      grandmaId: grandma.id,
      grandma: grandma.name,
      grandmaSlug: grandma.slug,
      by:       String(payload.by).trim(),
      time:     String(payload.time ?? '').trim(),
      servings: String(payload.servings ?? '').trim(),
      blurb:    String(payload.blurb ?? '').trim(),
      notes:    String(payload.notes ?? '').trim(),
      ingredients: Array.isArray(payload.ingredients) ? payload.ingredients : [],
      steps:       Array.isArray(payload.steps) ? payload.steps : []
    };

    const store = await readStore();
    store.push(record);
    await writeStore(store);

    res.status(201).json({ ok: true, id, recipe: record });

  } catch (err) {
    console.error('save recipe failed:', err);
    res.status(500).json({ error: err.message || 'Failed to save recipe.' });
  }
});

/* List saved recipes. ?status=all returns pending ones too (for a review page). */
app.get('/api/recipes', async (req, res) => {
  try {
    const store = await readStore();
    const list = req.query.status === 'all'
      ? store
      : store.filter(r => r.status === 'published');
    res.json({ ok: true, recipes: list });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load recipes.' });
  }
});

// Multer / generic error handler
app.use((err, _req, res, _next) => {
  if (err.message?.includes('File too large')) {
    return res.status(413).json({ error: 'Image is too large (max 10 MB).' });
  }
  res.status(400).json({ error: err.message || 'Request failed.' });
});

app.listen(PORT, () => {
  console.log(`🍲 Let's eat grandma AI running on http://localhost:${PORT}`);
});

export default app; // for testing
