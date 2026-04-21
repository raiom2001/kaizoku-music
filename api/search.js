export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { q, pageToken, maxResults = '12' } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });

  const params = new URLSearchParams({
    part: 'snippet',
    q,
    type: 'video',
    videoCategoryId: '10',
    maxResults: String(maxResults),
    key: process.env.YT_API_KEY
  });
  if (pageToken) params.set('pageToken', pageToken);

  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  const data = await r.json();
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  return res.status(r.status).json(data);
}
