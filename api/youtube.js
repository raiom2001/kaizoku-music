export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const key = process.env.YT_API_KEY;
  if (!key) return res.status(500).json({ error: 'API key não configurada' });

  const { endpoint, ...params } = req.query;
  if (!endpoint) return res.status(400).json({ error: 'endpoint obrigatório' });

  const allowed = ['search', 'videos', 'channels'];
  if (!allowed.includes(endpoint)) return res.status(400).json({ error: 'endpoint inválido' });

  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  Object.entries({ ...params, key }).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const r = await fetch(url.toString());
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
