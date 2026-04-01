/**
 * TMDB 프록시 (Netlify Functions)
 * 대시보드에 TMDB_API_KEY 설정 후 배포
 */
function sanitizePath(p) {
  if (p == null || typeof p !== 'string') return null;
  const s = p.trim();
  if (!s || s.includes('..')) return null;
  if (!/^[a-z0-9/_-]+$/i.test(s)) return null;
  return s;
}

export async function handler(event) {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const key = process.env.TMDB_API_KEY;
  if (!key) {
    return { statusCode: 500, body: JSON.stringify({ error: 'TMDB_API_KEY is not set' }) };
  }

  const qs = event.queryStringParameters || {};
  const pathStr = sanitizePath(qs.path);
  if (!pathStr) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid path' }) };
  }

  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(qs)) {
    if (k === 'path' || v == null || v === '') continue;
    usp.append(k, v);
  }
  usp.set('api_key', key);

  const target = `https://api.themoviedb.org/3/${pathStr}?${usp.toString()}`;
  const r = await fetch(target);
  const data = await r.json().catch(() => ({}));

  return {
    statusCode: r.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(data),
  };
}
