// Runs on Cloudflare's servers at /api/recipe?url=... (called from worker.js)
// Browsers aren't allowed to read other websites directly, so the carb calculator asks this
// instead. It fetches the recipe page and pulls out the structured recipe data (schema.org
// "Recipe" JSON-LD) that nearly every recipe site includes for Google. Sites without it
// (James Martin, Nigella, Mary Berry...) are read from the page's ingredient list instead.

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
    if (res.status === 401 || res.status === 403 || res.status === 429) return reply({ error: 'That website blocks other sites from reading its recipes.', blocked: true }, 502);
    if (!res.ok) return reply({ error: `That website wouldn’t let us read the page (error ${res.status}).`, blocked: true }, 502);
    html = (await res.text()).slice(0, MAX_BYTES);
  } catch (e) {
    return reply({ error: 'Couldn’t reach that page. Check the link and try again.' }, 502);
  }

  const recipe = findRecipe(html) || readHtmlRecipe(html);
  if (!recipe) return reply({ error: 'Couldn’t find an ingredient list on that page.', blocked: true }, 422);

  const ingredients = toArray(recipe.recipeIngredient || recipe.ingredients).map(clean).filter(Boolean);
  if (!ingredients.length) return reply({ error: 'Found the recipe, but not its ingredient list.' }, 422);

  return reply({
    name: clean(recipe.name) || 'Imported recipe',
    image: pickImage(recipe.image, pageUrl),
    ingredients,
    servings: parseServings(recipe.recipeYield),
    yieldText: clean(toArray(recipe.recipeYield).join(' / ')),
    carbsPerServing: parseGrams(recipe.nutrition && recipe.nutrition.carbohydrateContent),
    method: parseMethod(recipe.recipeInstructions).slice(0, 40),
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

// ---- Fallback for sites without schema.org JSON-LD: read the page's HTML ----
// Looks for (1) microdata (itemprop="recipeIngredient"/"ingredients") or (2) list items inside
// an element whose class mentions "ingredient" (but not "method"). Also picks up the title,
// photo and "Serves N" text so the result looks like a JSON-LD recipe.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function readHtmlRecipe(html) {
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, '');
  const micro = [], listed = [], microSteps = [], listedSteps = [];
  const stack = []; // {tag, ing, method, micro}
  let cur = null;   // {kind, depth, text}
  let heading = null, afterMethodHeading = false; // text of the heading being read; whether we're under "Method"/"Instructions"
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = tagRe.exec(body))) {
    if (m[4] !== undefined) { if (cur) cur.text += m[4]; if (heading) heading.text += m[4]; continue; }
    const closing = m[1] === '/', tag = m[2].toLowerCase(), attrs = m[3] || '';
    if (!closing) {
      if (cur && (tag === 'br' || tag === 'p' || tag === 'div')) cur.text += ' ';
      if (VOID.has(tag) || /\/\s*$/.test(attrs)) continue;
      if (tag === 'li') { // an open <li> closes the previous sibling <li>
        const i = stack.map(s => s.tag).lastIndexOf('li');
        if (i >= 0 && !stack.slice(i + 1).some(s => s.tag === 'ul' || s.tag === 'ol')) closeTo(i);
      }
      const cls = ((attrs.match(/\bclass\s*=\s*["']([^"']*)["']/i) || [])[1] || '').toLowerCase();
      const prop = ((attrs.match(/\bitemprop\s*=\s*["']([^"']*)["']/i) || [])[1] || '').toLowerCase();
      const parent = stack[stack.length - 1] || {};
      const saysIng = /ingredient/.test(cls), saysMethod = /method|instruction|direction|step/.test(cls);
      // A wrapper named for both ("ingredients-methods") marks neither
      if (/^h[1-6]$/.test(tag)) { heading = { depth: stack.length + 1, text: '' }; afterMethodHeading = false; }
      const node = { tag, ing: parent.ing || (saysIng && !saysMethod), method: parent.method || (saysMethod && !saysIng), stepList: parent.stepList || prop === 'recipeinstructions' };
      stack.push(node);
      const inMethod = node.stepList || node.method || (afterMethodHeading && !node.ing);
      if (!cur && /^(recipeingredient|ingredients)$/.test(prop)) cur = { kind: 'micro', depth: stack.length, text: '' };
      else if (!cur && tag === 'li' && node.ing && !node.method) cur = { kind: 'list', depth: stack.length, text: '' };
      else if (!cur && (tag === 'li' || tag === 'p') && inMethod) cur = { kind: node.stepList ? 'microStep' : 'step', depth: stack.length, text: '' };
    } else {
      const i = stack.map(s => s.tag).lastIndexOf(tag);
      if (i >= 0) closeTo(i);
    }
  }
  function closeTo(i) {
    while (stack.length > i) {
      if (heading && heading.depth === stack.length) {
        afterMethodHeading = /^(method|instructions|directions|steps|preparation|how to make)\b/i.test(clean(heading.text));
        heading = null;
      }
      if (cur && cur.depth === stack.length) {
        const t = clean(cur.text);
        if (t) ({ micro, list: listed, microStep: microSteps, step: listedSteps })[cur.kind].push(t);
        cur = null;
      }
      stack.pop();
    }
  }
  closeTo(0);
  // Sub-headings inside ingredient lists ("For the sauce", "Topping:") aren't ingredients
  const isHeading = t => /:$/.test(t) || (/^(for|to) (the|serve|decorate|garnish)\b/i.test(t) && !/\d/.test(t));
  let ingredients = (micro.length ? micro : listed).filter(t => t.length < 200 && !isHeading(t));
  // Some pages print the list twice (phone and desktop layouts): keep one copy.
  // Repeats within one list are real ("Cheddar" for the sauce and the topping), so they stay.
  ingredients = halve(ingredients);
  if (!ingredients.length) return null;
  const meta = name => clean(((html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i')) || [''])[0].match(/content=["']([^"']*)["']/i) || [])[1]);
  const h1 = clean((html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
  const microYield = clean((html.match(/itemprop=["']recipeYield["'][^>]*>([\s\S]*?)</i) || [])[1]) || ((html.match(/itemprop=["']recipeYield["'][^>]*content=["']([^"']+)/i) || [])[1] || '');
  const servesText = (clean(body).match(/\b(?:serves|servings|makes)\s*:?\s*(\d+(?:\s*[-–]\s*\d+)?)/i) || [])[1];
  const serves = microYield || (servesText ? 'Serves ' + servesText : '');
  // Page titles usually end in the site's name ("Katsu Chicken Curry - James Martin Chef")
  const strip = t => t.replace(/\s+[-|–—]\s+[^-|–—]+$/, '');
  const og = meta('og:title'), tab = clean((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  // Some sites set og:title to just the site's name ("Mary Berry"): then use the tab title
  const name = (og && strip(og) !== og) ? strip(og) : (tab && strip(tab) !== tab) ? strip(tab) : (h1 || og || tab);
  return {
    name,
    image: meta('og:image'),
    recipeIngredient: ingredients,
    recipeYield: serves,
    recipeInstructions: halve((microSteps.length ? microSteps : listedSteps).filter(t => t.length < 1500 && !/^print( recipe)?$/i.test(t))),
  };
}

// A list printed twice in a row (phone and desktop layouts): keep one copy
function halve(list) {
  const half = list.length / 2;
  return Number.isInteger(half) && half > 0 && list.slice(0, half).join('\n') === list.slice(half).join('\n') ? list.slice(0, half) : list;
}

// ---- Method: plain strings, HowToStep objects, or HowToSections of steps ----
function parseMethod(v) {
  const out = [];
  const add = (t) => { t = clean(t); if (t) out.push(t); };
  (function walkSteps(node) {
    if (node == null) return;
    if (typeof node === 'string') {
      // One long string: split on list items, paragraphs or line breaks
      const parts = node.split(/<\/?(?:li|p|br)[^>]*>|\n+/i);
      parts.length > 1 ? parts.forEach(add) : add(node);
      return;
    }
    if (Array.isArray(node)) { node.forEach(walkSteps); return; }
    if (typeof node === 'object') {
      const type = toArray(node['@type']).map(String).join(' ').toLowerCase();
      if (type.includes('howtosection') || node.itemListElement) {
        if (node.name) add(node.name + ':');
        walkSteps(node.itemListElement);
      } else add(node.text || node.name || '');
    }
  })(v);
  return out.map(tidyStep).filter(t => t.length > 2);
}
function tidyStep(t) {
  return t.replace(/^(?:step\s*)?\d+\s*[.):-]?\s+(?=\S)/i, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*\*/g, '').trim();
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
