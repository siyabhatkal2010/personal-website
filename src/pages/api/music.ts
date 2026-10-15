// Live "On repeat" data from Last.fm.
// Runs on the server (a Vercel function), so the API key never reaches visitors.
// Needs two environment variables in Vercel: LASTFM_API_KEY and LASTFM_USER.
import type { APIRoute } from 'astro';

export const prerender = false;

const API = 'https://ws.audioscrobbler.com/2.0/';

function env(name: string): string | undefined {
  const fromVite = (import.meta.env as Record<string, string | undefined> | undefined)?.[name];
  return fromVite ?? process.env[name];
}

async function lastfm(method: string, params: Record<string, string>) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    method,
    api_key: env('LASTFM_API_KEY') ?? '',
    user: env('LASTFM_USER') ?? '',
    format: 'json',
    ...params,
  }).toString();
  const res = await fetch(url, { headers: { 'User-Agent': 'siya-personal-site' } });
  if (!res.ok) throw new Error(`Last.fm ${method} failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Last.fm ${method}: ${data.message}`);
  return data;
}

function json(body: unknown, status = 200, cache = true) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Cache at Vercel's edge for 2 minutes so visits don't hit Last.fm every time.
      'Cache-Control': cache ? 'public, s-maxage=120, stale-while-revalidate=600' : 'no-store',
    },
  });
}

export const GET: APIRoute = async () => {
  if (!env('LASTFM_API_KEY') || !env('LASTFM_USER')) {
    return json({ ok: false, reason: 'not_configured' }, 200, false);
  }
  try {
    const [recent, top] = await Promise.all([
      lastfm('user.getrecenttracks', { limit: '1' }),
      lastfm('user.gettopartists', { period: '1month', limit: '1' }),
    ]);
    const raw = recent?.recenttracks?.track;
    const t = Array.isArray(raw) ? raw[0] : raw;
    const topArtist = top?.topartists?.artist?.[0];
    return json({
      ok: true,
      track: t
        ? {
            name: t.name,
            artist: t.artist?.['#text'] ?? t.artist?.name ?? '',
            url: t.url,
            nowPlaying: t['@attr']?.nowplaying === 'true',
            playedAt: t.date?.uts ? Number(t.date.uts) * 1000 : null,
          }
        : null,
      topArtist: topArtist ? { name: topArtist.name, plays: Number(topArtist.playcount) } : null,
    });
  } catch (err) {
    console.error(err);
    return json({ ok: false, reason: 'lastfm_error' }, 200, false);
  }
};
