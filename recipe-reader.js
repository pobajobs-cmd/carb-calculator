// Runs on Cloudflare's servers at /api/recipe?url=... (called from worker.js)
// Browsers aren't allowed to read other websites directly, so the carb calculator asks this
// instead. It fetches the recipe page and pulls out the structured recipe data (schema.org
// "Recipe" JSON-LD) that nearly every recipe site includes for Google.

const MAX_BYTES = 4 * 1024 * 1024;

export async function handleRecipe(request) {
  const target = new URL(request.url).searchParams.get('url') || '';
  let pageUrl;
  try {
    pageUrl = new URL(target.trim());
    if (!/^https?:$/.test(pageUrl.protocol)) throw new Error();
  } catch (e) {
    return reply({ error: 'That doesn’t look like a web link. Paste the full address, starting with https://' }, 400);
  }

  let html;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(pageUrl.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
    });
    clearTimeout(timer);
    if (res.status === 404 || res.status === 410) return reply({ error: 'That page doesn’t exist. Check the link is copied in full.' }, 502);
    if (!res.ok) return reply({ error: `That website wouldn’t let us read the page (error ${res.status}). Some sites block this — try another recipe, or enter it by hand.` }, 502);
    html = (await res.text()).slice(0, MAX_BYTES);
  } catch (e) {
    return reply({ error: 'Couldn’t reach that page. Check the link and try again.' }, 502);
  }

  const recipe = findRecipe(html);
  if (!recipe) return reply({ error: 'Couldn’t find recipe details on that page. Some sites don’t include them — try another, or enter it by hand.' }, 422);

  const ingredients = toArray(recipe.recipeIngredient || recipe.ingredients).map(clean).filter(Boolean);
  if (!ingredients.length) return reply({ error: 'Found the recipe, but not its ingredient list.' }, 422);

  return reply({
    name: clean(recipe.name) || 'Imported recipe',
    image: pickImage(recipe.image, pageUrl),
    ingredients,
    servings: parseServings(recipe.recipeYield),
    yieldText: clean(toArray(recipe.recipeYield).join(' / ')),
    carbsPerServing: parseGrams(recipe.nutrition && recipe.nutrition.carbohydrateContent),
    site: pageUrl.hostname.replace(/^www\./, ''),
    url: pageUrl.toString(),
  }, 200, 86400);
}

function reply(body, status, cacheSeconds) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-store',
    },
  });
}

// ---- Find the Recipe object among the page's JSON-LD blocks ----
function findRecipe(html) {
  const blocks = [...html.matchAll(/<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, raw] of blocks) {
    let data;
    try { data = JSON.parse(raw.trim()); }
    catch (e) {
      try { data = JSON.parse(raw.trim().replace(/[\u0000-\u001F]+/g, ' ')); } catch (e2) { continue; }
    }
    const found = walk(data);
    if (found) return found;
  }
  return null;
}
function walk(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) { for (const n of node) { const f = walk(n, depth + 1); if (f) return f; } return null; }
  const type = toArray(node['@type']).map(String);
  if (type.some(t => t.toLowerCase() === 'recipe')) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const f = walk(node[key], depth + 1); if (f) return f;
  }
  return null;
}

// ---- Tidy helpers ----
function toArray(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }
function clean(s) {
  if (s == null) return '';
  return decodeEntities(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘' };
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') { const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isFinite(code) ? String.fromCodePoint(code) : m; }
    return named[e.toLowerCase()] ?? m;
  });
}
function pickImage(img, base) {
  let url = '';
  for (const i of toArray(img)) {
    url = typeof i === 'string' ? i : (i && (i.url || i.contentUrl)) || '';
    if (url) break;
  }
  try { return url ? new URL(url, base).toString() : ''; } catch (e) { return ''; }
}
function parseServings(y) {
  for (const v of toArray(y)) {
    const m = String(v).match(/(\d+(?:\.\d+)?)/);
    if (m) return parseFloat(m[1]);
  }
  return null;
}
function parseGrams(v) {
  if (v == null) return null;
  const m = String(v).match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}
