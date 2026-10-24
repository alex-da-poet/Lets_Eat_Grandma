/**
 * seed-samples.mjs
 * One-off seeder: give the home-page sample recipes real pages so their links
 * resolve. Idempotent — running it again won't create duplicates.
 *   node seed-samples.mjs
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_FILE = path.join(__dirname, 'data', 'recipes.json');

const SAMPLES = [
  {
    slug: 'apple-kuchen',
    title: 'Apple Kuchen',
    grandma: 'Oma Greta',
    by: 'Hanna S.',
    from: 'Rothenburg, Bavaria',
    grandmaDescription: 'Oma Greta baked every Sunday and judged a kuchen by how fast it vanished.',
    time: '1 hr 15 min',
    servings: '8–10',
    blurb: 'A buttery yeast cake with apples and a cinnamon crumb.',
    ingredients: [
      '500 g (≈ 1.1 lb) plain flour',
      '7 g (≈ 1 packet) dried yeast',
      '250 ml (≈ 1 cup) warm milk',
      '100 g (≈ 1/2 cup) sugar',
      '100 g (≈ 7 tbsp) butter, softened',
      '2 eggs',
      '4 tart apples, peeled and thinly sliced',
      '2 tsp ground cinnamon',
      '50 g (≈ 1/4 cup) brown sugar (for the crumb)'
    ],
    steps: [
      'Warm the milk and stir in the yeast and a pinch of sugar. Let it foam for 10 minutes.',
      'Mix the flour, sugar, softened butter and eggs, then add the yeast milk. Knead into a soft dough.',
      'Cover and let rise in a warm spot until doubled, about 45 minutes.',
      'Press the dough into a buttered sheet pan and arrange the apple slices on top.',
      'Rub the brown sugar and cinnamon into a little butter and scatter over the apples.',
      'Bake at 190°C (375°F) for 30–35 minutes until golden. Cool before slicing.'
    ],
    notes: 'Best the day it is baked, with coffee.'
  },
  {
    slug: 'caramel-pork',
    title: 'Caramel Pork',
    grandma: 'Bà Ngoại Lan',
    by: 'Kim T.',
    from: 'Huế, Vietnam',
    grandmaDescription: 'Bà Ngoại Lan cooked this in a clay pot and never measured a thing.',
    time: '2 hrs',
    servings: '4',
    blurb: 'Pork belly braised in coconut water until it falls apart.',
    ingredients: [
      '1 kg (≈ 2.2 lb) pork belly, cut into chunks',
      '3 tbsp sugar',
      '2 tbsp fish sauce',
      '500 ml (≈ 2 cups) coconut water',
      '3 shallots, sliced',
      '3 garlic cloves, minced',
      '2 eggs, hard-boiled (optional)',
      'Black pepper, to taste'
    ],
    steps: [
      'Melt the sugar in a pot over medium heat until it turns amber — this is the caramel.',
      'Add the shallots and garlic and stir for a minute, then add the pork and brown on all sides.',
      'Pour in the fish sauce and coconut water. Add the hard-boiled eggs if using.',
      'Bring to a simmer, cover partly, and cook on low for 1.5 hours until the pork is tender and the sauce is syrupy.',
      'Finish with a good grind of black pepper. Serve with steamed rice.'
    ],
    notes: 'Even better reheated the next day.'
  },
  {
    slug: 'buttermilk-biscuits',
    title: 'Buttermilk Biscuits',
    grandma: 'Granny Mae',
    by: 'Devon R.',
    from: 'Asheville, North Carolina',
    grandmaDescription: 'Granny Mae made these every morning and swore by a light hand with the dough.',
    time: '35 min',
    servings: '10 biscuits',
    blurb: 'Tall, flaky, and best eaten hot with too much butter.',
    ingredients: [
      '320 g (≈ 2 1/2 cups) plain flour',
      '1 tbsp baking powder',
      '1 tsp salt',
      '1/2 tsp baking soda',
      '115 g (≈ 1/2 cup) cold butter, cubed',
      '300 ml (≈ 1 1/4 cups) cold buttermilk'
    ],
    steps: [
      'Heat the oven to 220°C (425°F).',
      'Whisk the flour, baking powder, salt and baking soda together.',
      'Cut in the cold butter until the mixture looks like coarse crumbs with some pea-sized pieces.',
      'Stir in the buttermilk just until it comes together — do not overwork it.',
      'Pat the dough out, fold it over a few times, then cut into rounds.',
      'Bake for 15–18 minutes until tall and golden. Eat warm.'
    ],
    notes: 'Keep everything cold for the flakiest layers.'
  },
  {
    slug: 'arroz-con-leche',
    title: 'Arroz con Leche',
    grandma: 'Abuela Luz',
    by: 'Sofia M.',
    from: 'Cartagena, Colombia',
    grandmaDescription: 'Abuela Luz stirred this slowly and tasted it the whole way through.',
    time: '50 min',
    servings: '6',
    blurb: 'Creamy rice pudding with cinnamon sticks and lime peel.',
    ingredients: [
      '200 g (≈ 1 cup) short-grain rice',
      '1 L (≈ 4 cups) whole milk',
      '2 cinnamon sticks',
      'Peel of 1 lime',
      '150 g (≈ 3/4 cup) sugar',
      '1 pinch of salt',
      'Ground cinnamon, to finish'
    ],
    steps: [
      'Rinse the rice and simmer it gently in a little water until almost absorbed.',
      'Add the milk, cinnamon sticks and lime peel. Simmer on low, stirring often.',
      'When the rice is soft and the milk has thickened, stir in the sugar and salt.',
      'Cook a few more minutes until creamy. Remove the cinnamon sticks and lime peel.',
      'Serve warm or cold, dusted with ground cinnamon.'
    ],
    notes: 'It thickens as it cools — loosen with a splash of milk if needed.'
  },
  {
    slug: 'lemon-chicken',
    title: 'Lemon Chicken',
    grandma: 'Safta Ruth',
    by: 'Eli K.',
    from: 'Haifa, Israel',
    grandmaDescription: 'Safta Ruth roasted this for Friday dinners, the kitchen smelling of lemon and garlic.',
    time: '1 hr 30 min',
    servings: '4–6',
    blurb: 'Roast chicken over potatoes soaked in lemon and garlic.',
    ingredients: [
      '1 whole chicken, cut into pieces',
      '1 kg (≈ 2.2 lb) potatoes, cut into wedges',
      '4 lemons (juice of 3, 1 sliced)',
      '8 garlic cloves, smashed',
      '4 tbsp olive oil',
      '2 tsp dried oregano',
      'Salt and black pepper, to taste'
    ],
    steps: [
      'Heat the oven to 200°C (400°F).',
      'Toss the potatoes with half the lemon juice, half the garlic, olive oil, salt and pepper in a roasting pan.',
      'Rub the chicken with the remaining lemon juice, garlic, oregano, salt and pepper and lay it over the potatoes.',
      'Tuck the lemon slices around the pan.',
      'Roast for about 1 hour 15 minutes, basting once or twice, until the chicken is golden and cooked through.',
      'Rest for 10 minutes before serving.'
    ],
    notes: 'The potatoes underneath soak up all the juices — the best part.'
  }
];

const store = JSON.parse(await fs.readFile(STORE_FILE, 'utf8').catch(() => '[]'));
const existing = new Set(store.map(r => r.slug));

let added = 0;
for (const s of SAMPLES) {
  if (existing.has(s.slug)) continue;
  store.push({
    id: crypto.randomUUID(),
    slug: s.slug,
    status: 'published',
    submittedAt: new Date('2024-01-01T00:00:00.000Z').toISOString(), // old so they sort after real submissions by date, but Recipes page sorts alphabetically anyway
    url: `/recipes/${s.slug}`,
    image: null,
    imageBack: null,
    grandmaPhoto: null,
    title: s.title,
    grandma: s.grandma,
    from: s.from,
    grandmaDescription: s.grandmaDescription,
    by: s.by,
    time: s.time,
    servings: s.servings,
    blurb: s.blurb,
    notes: s.notes,
    ingredients: s.ingredients,
    steps: s.steps
  });
  added++;
}

await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2));
console.log(`Seeded ${added} sample recipe(s). Store now has ${store.length} recipes.`);
console.log('Slugs:', store.map(r => r.slug).join(', '));
