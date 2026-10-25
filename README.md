# Let's eat grandma

A website for collecting grandmas' recipes. Upload a photo of a recipe card and
an AI vision model (Google Gemini) reads it, normalizes vague measurements into
universal units, and turns it into a shareable recipe page.

Browse the family recipe box and explore the illustrated world map to discover
recipes by region.

Grandma profiles have their own submission page. Add a Grandma first, then
select her profile when submitting a recipe so the recipe links to her story.
Submitted profiles are saved on the server and appear as map pins; each pin
links to the profile and any recipes associated with it.

## Run it locally

Requires Node.js 18+.

In VS Code, trust the workspace and allow automatic tasks when prompted. The
local server starts automatically when this project folder opens. Then visit
http://localhost:3000.

To start it manually instead:

```bash
cd src/server
npm install
# create your .env with a Gemini API key (see below)
npm start
```

Install dependencies once with `npm install` before the first automatic start.

### Environment variables

Create `src/server/.env`:

```
GEMINI_API_KEY=your-key-here
# optional:
# REQUIRE_REVIEW=true     # hold submissions for review before they show publicly
# PORT=3000
```

Get a free Gemini key at https://aistudio.google.com/apikey

## Publish it for free (Render)

GitHub alone can't run this app — it needs a Node server. The free path is:
push the code to GitHub, then deploy to Render's free tier.

1. **Put the code on GitHub**

   ```bash
   # from the project root
   git init
   git add .
   git commit -m "Initial commit"
   # create an empty repo on github.com, then:
   git remote add origin https://github.com/<you>/lets-eat-grandma.git
   git branch -M main
   git push -u origin main
   ```

2. **Deploy on Render**
   - Sign up at https://render.com (free).
   - New → **Blueprint**, and connect your GitHub repo. Render reads
     `render.yaml` and sets everything up.
   - When prompted, set the `GEMINI_API_KEY` environment variable to your real
     key (it is intentionally NOT stored in the repo).
   - Deploy. Render gives you a public URL like `lets-eat-grandma.onrender.com`.

### Things to know about the free tier

- **Sleeps when idle:** free Render services spin down after inactivity, so the
  first visit after a while takes ~30s to wake up.
- **Storage is temporary:** submitted recipes and uploaded photos are written to
  disk under `src/server/data/`, which Render's free tier wipes on restarts and
  redeploys. For recipes that persist, add a database + cloud file storage, or a
  host with a persistent disk.
- **Gemini free quota is small** (~20 requests/day on the full model). The app
  uses the lighter `gemini-flash-lite-latest` model to stretch it. If the reader
  is "busy," the quota is used up — the "skip this step" form still works without
  AI.

## Security

- Never commit `.env` or your API key (both are git-ignored).
- If a key is ever exposed, rotate it at https://aistudio.google.com/apikey
