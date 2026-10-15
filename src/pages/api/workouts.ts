// Workouts from Apple Health.
//
// POST /api/workouts  ← your iPhone Shortcut sends recent workouts here.
//   Header:  Authorization: Bearer <WORKOUT_TOKEN>
//   Body:    { "workouts": [ { "type": "Running", "start": "2026-10-14T07:30:00-05:00", "end": "2026-10-14T08:05:00-05:00" }, ... ] }
//
// GET  /api/workouts  ← the Life lately page reads this week's summary.
//   Only workout type, day and minutes are ever shown. No heart rate, no routes.
//
// Storage: a free Upstash Redis database added through Vercel → Storage.
// Env vars (Vercel adds the first two for you when you connect the database):
//   KV_REST_API_URL / KV_REST_API_TOKEN   (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)
//   WORKOUT_TOKEN   a long random password you make up; the Shortcut sends it
//   SITE_TIMEZONE   optional, defaults to America/Chicago
import type { APIRoute } from 'astro';

export const prerender = false;

const KEY = 'workouts:v1';
const KEEP_DAYS = 60;
const MAX_ITEMS = 200;

type Workout = { type: string; start: string; minutes: number };

function env(name: string): string | undefined {
  const fromVite = (import.meta.env as Record<string, string | undefined> | undefined)?.[name];
  return fromVite ?? process.env[name];
}

function store() {
  const url = env('KV_REST_API_URL') ?? env('UPSTASH_REDIS_REST_URL');
  const token = env('KV_REST_API_TOKEN') ?? env('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) return null;
  return {
    async get(): Promise<Workout[]> {
      const res = await fetch(`${url}/get/${KEY}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`store get ${res.status}`);
      const { result } = await res.json();
      return result ? JSON.parse(result) : [];
    },
    async set(list: Workout[]) {
      const res = await fetch(`${url}/set/${KEY}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(list),
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

// ---------- helpers ----------

// Shortcuts sometimes sends "Traditional Strength Training" or "HKWorkoutActivityTypeRunning".
function cleanType(t: unknown): string {
  let s = String(t ?? '').trim();
  s = s.replace(/^HKWorkoutActivityType/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  s = s.replace(/^Traditional\s+/i, '');
  s = s.slice(0, 40);
  return s || 'Workout';
}

function toMinutes(w: Record<string, unknown>, start: Date): number | null {
  if (w.end) {
    const end = new Date(String(w.end));
    if (!isNaN(end.getTime())) return Math.round((end.getTime() - start.getTime()) / 60000);
  }
  // Fallback: "minutes" or "duration" (seconds, minutes or "hh:mm:ss")
  if (w.minutes != null) return Math.round(Number(w.minutes));
  if (w.duration != null) {
    const d = String(w.duration);
    if (d.includes(':')) {
      const parts = d.split(':').map(Number);
      const secs = parts.reduce((acc, n) => acc * 60 + n, 0);
      return Math.round(secs / 60);
    }
    const n = Number(d);
    if (!isNaN(n)) return n > 600 ? Math.round(n / 60) : Math.round(n); // big numbers are seconds
  }
  return null;
}

function normalize(raw: unknown): Workout | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Record<string, unknown>;
  const start = new Date(String(w.start ?? w.startDate ?? ''));
  if (isNaN(start.getTime())) return null;
  const minutes = toMinutes(w, start);
  if (minutes == null || minutes < 1 || minutes > 24 * 60) return null;
  return { type: cleanType(w.type ?? w.name), start: start.toISOString(), minutes };
}

// "2026-10-14" and weekday 0 (Mon)..6 (Sun) for a date in the site's timezone
function localDay(d: Date, tz: string) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d);
  const idx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd);
  return { ymd, idx, wd };
}

function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- routes ----------

export const GET: APIRoute = async () => {
  const db = store();
  if (!db) return json({ ok: false, reason: 'not_configured' });
  try {
    const tz = env('SITE_TIMEZONE') || 'America/Chicago';
    const list = await db.get();
    const today = localDay(new Date(), tz);
    const monday = addDays(today.ymd, -today.idx);
    const days = [0, 0, 0, 0, 0, 0, 0];
    let count = 0;
    for (const w of list) {
      const d = localDay(new Date(w.start), tz);
      if (d.ymd >= monday && d.ymd <= today.ymd) {
        days[d.idx] += w.minutes;
        count++;
      }
    }
    const latest = list[0] ?? null;
    return json(
      {
        ok: true,
        week: { count, minutes: days.reduce((a, b) => a + b, 0), days },
        latest: latest ? { type: latest.type, minutes: latest.minutes, day: localDay(new Date(latest.start), tz).wd, start: latest.start } : null,
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
  const auth = request.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) return json({ ok: false, reason: 'unauthorized' }, 401);

  const db = store();
  if (!db) return json({ ok: false, reason: 'not_configured' }, 500);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: 'bad_json' }, 400);
  }
  const incoming = Array.isArray(body) ? body : (body as { workouts?: unknown[] })?.workouts;
  if (!Array.isArray(incoming)) return json({ ok: false, reason: 'expected { workouts: [...] }' }, 400);

  const fresh = incoming.map(normalize).filter((w): w is Workout => w !== null);
  const skipped = incoming.length - fresh.length;

  try {
    const existing = await db.get();
    const byStart = new Map(existing.map((w) => [w.start, w]));
    for (const w of fresh) byStart.set(w.start, w); // same start time = same workout, so no duplicates
    const cutoff = Date.now() - KEEP_DAYS * 864e5;
    const merged = [...byStart.values()]
      .filter((w) => new Date(w.start).getTime() >= cutoff)
      .sort((a, b) => b.start.localeCompare(a.start))
      .slice(0, MAX_ITEMS);
    await db.set(merged);
    return json({ ok: true, received: incoming.length, saved: fresh.length, skipped, total: merged.length });
  } catch (err) {
    console.error(err);
    return json({ ok: false, reason: 'store_error' }, 500);
  }
};
