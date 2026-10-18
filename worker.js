// Kylo Loki — the site's server code (a Cloudflare Worker).
//
// Everything on kyloloki.com is served straight from the files in this repo, except
// addresses starting /api/, which come here first (see "run_worker_first" in wrangler.jsonc):
//
//   /api/calendar...   the shared family calendar, stored in the D1 database "kyloloki-family".
//                      Only people signed in through Cloudflare Access can read or change it.
//   /api/calendar/appointments
//                      Kylo's appointments, read from Tom's shared iCloud calendar. The calendar's
//                      share link lives in the Cloudflare secret APPOINTMENTS_ICS (never in this repo).
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

  // GET /api/calendar/appointments  -> appointments from the iPhone calendar (read-only)
  if (parts[2] === 'appointments' && parts.length === 3 && method === 'GET') {
    return json(await getAppointments(env));
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
// Appointments from an iCloud "Public Calendar" link (an .ics feed).
// Times come back as wall-clock UK time ("2026-10-21", "14:30"), which is what the page shows.
// The feed is fetched at most every 10 minutes per server; if iCloud is down, the last copy is used.
// ---------------------------------------------------------------------------
let apptCache = { at: 0, src: '', data: null };
const DAY = 86400000;

async function getAppointments(env) {
  const src = String(env.APPOINTMENTS_ICS || '').trim();
  if (!src) return { configured: false, events: [] };
  if (apptCache.data && apptCache.src === src && Date.now() - apptCache.at < 10 * 60000) return apptCache.data;
  let text;
  try {
    const res = await fetch(src.replace(/^webcal:\/\//i, 'https://'), { headers: { 'User-Agent': 'kyloloki.com family calendar' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Not a calendar');
  } catch (e) {
    console.error('Appointments feed:', e.message);
    if (apptCache.data && apptCache.src === src) return { ...apptCache.data, stale: true };
    return { configured: true, events: [], error: 'Couldn’t read the iPhone calendar just now.' };
  }
  const now = wallNow();
  const data = { configured: true, events: parseIcs(text, now - 120 * DAY, now + 400 * DAY), fetchedAt: new Date().toISOString() };
  apptCache = { at: Date.now(), src, data };
  return data;
}

// "Wall" times: a UK clock reading stored as if it were UTC, so day/time maths never trips on clock changes.
const LONDON = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function toWall(utcMs) {
  const p = Object.fromEntries(LONDON.formatToParts(new Date(utcMs)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
}
function wallNow() { return toWall(Date.now()); }
const pad = (n) => String(n).padStart(2, '0');
const wallDate = (w) => { const d = new Date(w); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const wallTime = (w) => { const d = new Date(w); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };

function icsDate(value, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value).trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (h == null || params.VALUE === 'DATE') return { w: Date.UTC(+y, +mo - 1, +d), allDay: true };
  const w = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  return { w: z ? toWall(w) : w, allDay: false };
}
function icsDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v || '').trim());
  if (!m) return null;
  const ms = (((+m[2] || 0) * 7 + (+m[3] || 0)) * 24 * 3600 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}
const icsText = (v) => String(v || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();

function parseIcs(text, from, to) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const raw = [];
  let cur = null, depth = 0;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; depth = 0; continue; }
    if (!cur) continue;
    if (line.startsWith('BEGIN:')) { depth++; continue; }       // e.g. VALARM inside the event
    if (line.startsWith('END:') && depth) { depth--; continue; }
    if (line === 'END:VEVENT') { raw.push(cur); cur = null; continue; }
    if (depth) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const [name, ...pp] = line.slice(0, i).split(';');
    const params = Object.fromEntries(pp.map(x => { const j = x.indexOf('='); return [x.slice(0, j).toUpperCase(), x.slice(j + 1)]; }));
    (cur[name.toUpperCase()] ||= []).push({ v: line.slice(i + 1), params });
  }

  const one = (e, k) => e[k] && e[k][0];
  const overrides = new Map();   // "uid|wall" -> true for moved/edited single occurrences
  const out = [];
  const push = (e, start, end, allDay) => {
    if (end < from || start > to) return;
    const endShown = allDay ? Math.max(start, end - DAY) : end;    // all-day ends are "the next morning"
    out.push({
      id: (one(e, 'UID')?.v || 'x') + '@' + start,
      title: icsText(one(e, 'SUMMARY')?.v).slice(0, 120) || 'Appointment',
      location: icsText(one(e, 'LOCATION')?.v).slice(0, 160),
      notes: icsText(one(e, 'DESCRIPTION')?.v).slice(0, 400),
      date: wallDate(start), time: allDay ? '' : wallTime(start),
      endDate: wallDate(endShown), endTime: allDay ? '' : wallTime(end),
      allDay,
    });
  };

  for (const e of raw) {
    if ((one(e, 'STATUS')?.v || '').toUpperCase() === 'CANCELLED') continue;
    const rid = one(e, 'RECURRENCE-ID');
    if (rid) { const r = icsDate(rid.v, rid.params); if (r) overrides.set((one(e, 'UID')?.v || '') + '|' + r.w, true); }
  }

  for (const e of raw) {
    const ds = one(e, 'DTSTART'); if (!ds) continue;
    const st = icsDate(ds.v, ds.params); if (!st) continue;
    const cancelled = (one(e, 'STATUS')?.v || '').toUpperCase() === 'CANCELLED';
    const de = one(e, 'DTEND'), du = one(e, 'DURATION');
    const en = de ? icsDate(de.v, de.params) : null;
    const len = en ? en.w - st.w : du ? icsDuration(du.v) || 0 : st.allDay ? DAY : 0;
    if (one(e, 'RECURRENCE-ID')) { if (!cancelled) push(e, st.w, st.w + len, st.allDay); continue; }
    if (cancelled) continue;
    const rr = one(e, 'RRULE');
    if (!rr) { push(e, st.w, st.w + len, st.allDay); continue; }

    const uid = one(e, 'UID')?.v || '';
    const ex = new Set();
    for (const x of e.EXDATE || []) for (const v of x.v.split(',')) { const d = icsDate(v, x.params); if (d) ex.add(d.w); }
    const rule = Object.fromEntries(rr.v.split(';').map(x => x.split('=')));
    const freq = rule.FREQ, step = Math.max(1, +rule.INTERVAL || 1);
    const count = +rule.COUNT || Infinity;
    const until = rule.UNTIL ? (icsDate(rule.UNTIL, {})?.w ?? Infinity) : Infinity;
    const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const byDay = (rule.BYDAY || '').split(',').map(x => DAYS.indexOf(x.slice(-2))).filter(x => x >= 0);
    const emit = (w) => { if (!ex.has(w) && !overrides.has(uid + '|' + w)) push(e, w, w + len, st.allDay); };

    let n = 0;
    const s0 = new Date(st.w);
    for (let k = 0; n < count && k < 3000; k++) {
      let batch = [];
      if (freq === 'DAILY') batch = [st.w + k * step * DAY];
      else if (freq === 'WEEKLY') {
        const weekStart = st.w + k * step * 7 * DAY - s0.getUTCDay() * DAY;
        const days = byDay.length ? byDay : [s0.getUTCDay()];
        batch = days.sort((a, b) => a - b).map(d => weekStart + d * DAY).filter(w => w >= st.w);
      } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
        const months = freq === 'MONTHLY' ? k * step : k * step * 12;
        const d = new Date(Date.UTC(s0.getUTCFullYear(), s0.getUTCMonth() + months, s0.getUTCDate(), s0.getUTCHours(), s0.getUTCMinutes()));
        if (d.getUTCDate() === s0.getUTCDate()) batch = [d.getTime()];   // skip e.g. 31 Feb
      } else { batch = [st.w]; k = 3000; }
      let done = false;
      for (const w of batch) {
        if (w > until || w > to || n >= count) { done = true; break; }
        n++; emit(w);
      }
      if (done) break;
    }
  }
  out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return out.slice(0, 600);
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
