/**
 * TMDB 프록시 (Vercel Serverless)
 * 환경 변수 TMDB_API_KEY 만 서버에 두면 브라우저 번들에 키가 노출되지 않습니다.
 */
function sanitizePath(p) {
  if (p == null || typeof p !== 'string') return null;
  const s = p.trim();
  if (!s || s.includes('..')) return null;
  if (!/^[a-z0-9/_-]+$/i.test(s)) return null;
  return s;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.TMDB_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'TMDB_API_KEY is not set on the server' });
  }

  const rawPath = req.query.path;
  const pathStr = sanitizePath(Array.isArray(rawPath) ? rawPath[0] : rawPath);
  if (!pathStr) {
    return res.status(400).json({ error: 'Missing or invalid path' });
  }

  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k === 'path') continue;
    const val = Array.isArray(v) ? v[v.length - 1] : v;
    if (val != null && val !== '') usp.append(k, String(val));
  }
  usp.set('api_key', key);

  const target = `https://api.themoviedb.org/3/${pathStr}?${usp.toString()}`;
  const r = await fetch(target);
  const data = await r.json().catch(() => ({}));

  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(r.status).json(data);
}
