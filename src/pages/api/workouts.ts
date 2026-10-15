// Exercise minutes from Apple Health (the green ring).
//
// POST /api/workouts  ← your iPhone Shortcut sends daily exercise minutes here.
//   Header:  Authorization: Bearer <WORKOUT_TOKEN>
//   Body:    { "days": [ { "date": "2026-10-14T00:00:00-05:00", "minutes": 42 }, ... ] }
//   Several entries for the same day are added together, then that day's total is saved
//   (so re-sending the same week never double counts).
//
// GET  /api/workouts  ← the Life lately page reads this week's minutes per day.
//
// Storage: a free Upstash Redis database added through Vercel → Storage.
// Env vars:
//   KV_REST_API_URL / KV_REST_API_TOKEN   (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)
//   WORKOUT_TOKEN   a long random password you make up; the Shortcut sends it
//   SITE_TIMEZONE   optional, defaults to America/Chicago
import type { APIRoute } from 'astro';

export const prerender = false;

const KEY = 'exercise:v1';
const KEEP_DAYS = 90;

type Days = Record<string, number>; // "2026-10-14" -> minutes

function env(name: string): string | undefined {
  const fromVite = (import.meta.env as Record<string, string | undefined> | undefined)?.[name];
  return fromVite ?? process.env[name];
}

function tz() {
  return env('SITE_TIMEZONE') || 'America/Chicago';
}

function store() {
  const url = env('KV_REST_API_URL') ?? env('UPSTASH_REDIS_REST_URL');
  const token = env('KV_REST_API_TOKEN') ?? env('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) return null;
  return {
    async get(): Promise<Days> {
      const res = await fetch(`${url}/get/${KEY}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`store get ${res.status}`);
      const { result } = await res.json();
      return result ? JSON.parse(result) : {};
    },
    async set(days: Days) {
      const res = await fetch(`${url}/set/${KEY}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(days),
      });
      if (!res.ok) throw new Error(`store set ${res.status}`);
    },
  };
}

function json(body: unknown, status = 200, cache = false) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cache ? 'public, s-maxage=300, stale-while-revalidate=3600' : 'no-store',
    },
  });
}

// "2026-10-14" and weekday 0 (Mon)..6 (Sun) in the site's timezone
function localDay(d: Date) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz(), weekday: 'short' }).format(d);
  return { ymd, wd, idx: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd) };
}

function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Accepts "2026-10-14", "2026-10-14T00:00:00-05:00", etc.
function dayOf(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : localDay(d).ymd;
}

// Accepts 42, "42", "42.5", "42 min"
function minutesOf(raw: unknown): number | null {
  const n = parseFloat(String(raw ?? '').replace(',', '.'));
  return isFinite(n) && n >= 0 && n <= 24 * 60 ? n : null;
}

export const GET: APIRoute = async () => {
  const db = store();
  if (!db) return json({ ok: false, reason: 'not_configured' });
  try {
    const all = await db.get();
    const today = localDay(new Date());
    const monday = addDays(today.ymd, -today.idx);
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => Math.round(all[addDays(monday, i)] ?? 0));
    const total = days.reduce((a, b) => a + b, 0);
    const activeDays = days.filter((m) => m >= 10).length;
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const best = days.indexOf(Math.max(...days));
    return json(
      {
        ok: true,
        week: { total, activeDays, days, today: days[today.idx], bestDay: total ? { day: names[best], minutes: days[best] } : null },
      },
      200,
      true,
    );
  } catch (err) {
    console.error(err);
    return json({ ok: false, reason: 'store_error' });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const secret = env('WORKOUT_TOKEN');
  if (!secret || (request.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }
  const db = store();
  if (!db) return json({ ok: false, reason: 'not_configured' }, 500);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: 'bad_json' }, 400);
  }
  const incoming = Array.isArray(body) ? body : (body as { days?: unknown[] })?.days;
  if (!Array.isArray(incoming)) return json({ ok: false, reason: 'expected { days: [...] }' }, 400);

  // Add up everything this request sent for each day.
  const totals: Days = {};
  let skipped = 0;
  for (const item of incoming) {
    const r = (item ?? {}) as Record<string, unknown>;
    const day = dayOf(r.date ?? r.start ?? r.startDate);
    const mins = minutesOf(r.minutes ?? r.value);
    if (!day || mins == null) { skipped++; continue; }
    totals[day] = (totals[day] ?? 0) + mins;
  }

  try {
    const all = await db.get();
    for (const [day, mins] of Object.entries(totals)) all[day] = Math.min(Math.round(mins), 24 * 60);
    const cutoff = addDays(localDay(new Date()).ymd, -KEEP_DAYS);
    for (const day of Object.keys(all)) if (day < cutoff) delete all[day];
    await db.set(all);
    return json({ ok: true, received: incoming.length, skipped, days: totals });
  } catch (err) {
    console.error(err);
    return json({ ok: false, reason: 'store_error' }, 500);
  }
};
