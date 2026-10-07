// Kylo Loki — the site's server code (a Cloudflare Worker).
//
// Everything on kyloloki.com is served straight from the files in this repo, except
// addresses starting /api/, which come here first (see "run_worker_first" in wrangler.jsonc):
//
//   /api/calendar...   the shared family calendar, stored in the D1 database "kyloloki-family".
//                      Only people signed in through Cloudflare Access can read or change it.
//   /api/recipe        reads a recipe page for the carb calculator's link importer.

import { handleRecipe } from './recipe-reader.js';

const TYPES = ['pump', 'sensor', 'transmitter', 'pen', 'other'];
const INTERVAL_KEYS = ['pump', 'sensor', 'transmitter', 'pen'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/recipe') return await handleRecipe(request);
      if (url.pathname === '/api/calendar' || url.pathname.startsWith('/api/calendar/')) return await handleCalendar(request, env, url);
      if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return json({ error: 'Something went wrong on the server.' }, 500);
    }
  },
};

// ---------------------------------------------------------------------------
// Shared calendar
// ---------------------------------------------------------------------------
async function handleCalendar(request, env, url) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Please sign in to use the family calendar.' }, 401);

  await ensureSchema(env);
  const parts = url.pathname.split('/').filter(Boolean); // ['api','calendar',...]
  const method = request.method;

  if (method !== 'GET' && method !== 'HEAD') {
    // Writes must come from our own pages as JSON (blocks cross-site form posts).
    const origin = request.headers.get('Origin');
    if (origin && new URL(origin).host !== url.host) return json({ error: 'Not allowed.' }, 403);
    if (method !== 'DELETE' && !(request.headers.get('Content-Type') || '').includes('application/json')) {
      return json({ error: 'Expected JSON.' }, 415);
    }
  }

  // GET /api/calendar  -> everything the page needs
  if (parts.length === 2 && method === 'GET') {
    const [entries, settings] = await Promise.all([listEntries(env), getSettings(env)]);
    return json({ me: { email: user, name: nameFor(env, user) }, entries, settings });
  }

  // POST /api/calendar/entries  -> log a change
  if (parts[2] === 'entries' && parts.length === 3 && method === 'POST') {
    const body = await readJson(request);
    const entry = cleanEntry(body);
    if (entry.error) return json({ error: entry.error }, 400);
    entry.id = crypto.randomUUID();
    await insertEntry(env, entry, user);
    return json({ entry: decorate(env, { ...entry, createdBy: user, createdAt: new Date().toISOString() }) }, 201);
  }

  // DELETE /api/calendar/entries/:id
  if (parts[2] === 'entries' && parts.length === 4 && method === 'DELETE') {
    const res = await env.DB.prepare('DELETE FROM entries WHERE id = ?').bind(parts[3]).run();
    return json({ deleted: res.meta.changes });
  }

  // PUT /api/calendar/settings  -> change intervals ({ reset: true } goes back to defaults)
  if (parts[2] === 'settings' && method === 'PUT') {
    const body = await readJson(request);
    if (body.reset) {
      await env.DB.prepare("DELETE FROM settings WHERE key LIKE 'interval.%'").run();
    } else {
      const stmts = [];
      for (const k of INTERVAL_KEYS) {
        const v = parseInt(body[k], 10);
        if (v >= 1 && v <= 400) {
          stmts.push(env.DB.prepare('INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at')
            .bind('interval.' + k, String(v), user, new Date().toISOString()));
        }
      }
      if (stmts.length) await env.DB.batch(stmts);
    }
    return json({ settings: await getSettings(env) });
  }

  // POST /api/calendar/import  -> copy entries saved on a device into the shared calendar
  if (parts[2] === 'import' && method === 'POST') {
    const body = await readJson(request);
    const list = Array.isArray(body.entries) ? body.entries.slice(0, 2000) : [];
    let added = 0;
    for (const raw of list) {
      const entry = cleanEntry(raw);
      if (entry.error) continue;
      entry.id = 'device-' + String(raw.id || crypto.randomUUID()).replace(/[^\w-]/g, '').slice(0, 60);
      const res = await insertEntry(env, entry, user, true);
      added += res.meta.changes || 0;
    }
    return json({ added });
  }

  return json({ error: 'Not found' }, 404);
}

function cleanEntry(b) {
  if (!b || typeof b !== 'object') return { error: 'Missing details.' };
  const type = String(b.type || '');
  if (!TYPES.includes(type)) return { error: 'Unknown change type.' };
  const date = String(b.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Invalid date.' };
  const text = (v, n) => (v == null ? '' : String(v)).trim().slice(0, n);
  const label = text(b.label, 80);
  if (type === 'other' && !label) return { error: 'Give the entry a name.' };
  const repeat = type === 'other' && !!b.repeat;
  const repeatDays = repeat ? Math.min(Math.max(parseInt(b.repeatDays, 10) || 30, 1), 400) : null;
  return { type, date, label, notes: text(b.notes, 500), earlyReason: text(b.earlyReason, 300), repeat, repeatDays };
}

function insertEntry(env, e, user, ignoreDuplicates) {
  return env.DB.prepare(`INSERT ${ignoreDuplicates ? 'OR IGNORE ' : ''}INTO entries (id, type, date, label, notes, early_reason, repeat, repeat_days, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(e.id, e.type, e.date, e.label, e.notes, e.earlyReason, e.repeat ? 1 : 0, e.repeatDays, user, new Date().toISOString())
    .run();
}

async function listEntries(env) {
  const { results } = await env.DB.prepare('SELECT * FROM entries ORDER BY date, created_at').all();
  return results.map(r => decorate(env, {
    id: r.id, type: r.type, date: r.date, label: r.label || '', notes: r.notes || '', earlyReason: r.early_reason || '',
    repeat: !!r.repeat, repeatDays: r.repeat_days, createdBy: r.created_by, createdAt: r.created_at,
  }));
}

function decorate(env, e) { return { ...e, createdByName: nameFor(env, e.createdBy) }; }

async function getSettings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings WHERE key LIKE 'interval.%'").all();
  const out = {};
  for (const r of results) out[r.key.slice(9)] = parseInt(r.value, 10);
  return out;
}

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, date TEXT NOT NULL, label TEXT, notes TEXT, early_reason TEXT,
      repeat INTEGER NOT NULL DEFAULT 0, repeat_days INTEGER, created_by TEXT, created_at TEXT)`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS entries_date ON entries (date)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_by TEXT, updated_at TEXT)'),
  ]);
  schemaReady = true;
}

function nameFor(env, email) {
  if (!email) return '';
  let names = env.FAMILY_NAMES || {};
  if (typeof names === 'string') { try { names = JSON.parse(names); } catch (e) { names = {}; } }
  return names[email.toLowerCase()] || email.split('@')[0];
}

// ---------------------------------------------------------------------------
// Who is this? Cloudflare Access signs everyone in and passes a signed token
// (a JWT) with every request. We check that signature against Access's public keys,
// so nobody can get at the calendar data by going round the login.
// ---------------------------------------------------------------------------
let jwksCache = { at: 0, keys: [] };

async function getUser(request, env) {
  // Local testing only: `.dev.vars` can set DEV_USER. This file is never uploaded.
  if (env.DEV_USER) return String(env.DEV_USER).toLowerCase();

  const token = request.headers.get('Cf-Access-Jwt-Assertion') || readCookie(request, 'CF_Authorization');
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || env.ACCESS_AUD === 'FILL_ME') return null;
  try {
    const [h, p, s] = token.split('.');
    const header = JSON.parse(b64urlText(h));
    const payload = JSON.parse(b64urlText(p));
    const team = env.ACCESS_TEAM_DOMAIN.replace(/\/$/, '');
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(env.ACCESS_AUD)) return null;
    if (payload.iss !== team) return null;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;

    const key = await accessKey(team, header.kid);
    if (!key) return null;
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(h + '.' + p));
    return ok && payload.email ? String(payload.email).toLowerCase() : null;
  } catch (e) {
    return null;
  }
}

async function accessKey(team, kid) {
  if (Date.now() - jwksCache.at > 3600_000 || !jwksCache.keys.some(k => k.kid === kid)) {
    const res = await fetch(team + '/cdn-cgi/access/certs');
    if (!res.ok) return null;
    jwksCache = { at: Date.now(), keys: (await res.json()).keys || [] };
  }
  const jwk = jwksCache.keys.find(k => k.kid === kid);
  if (!jwk) return null;
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

function b64urlBytes(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
function b64urlText(s) { return new TextDecoder().decode(b64urlBytes(s)); }
function readCookie(request, name) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
async function readJson(request) {
  try { return await request.json(); } catch (e) { return {}; }
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
