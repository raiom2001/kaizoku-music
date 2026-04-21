export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { ids } = req.query;
  if (!ids) return res.status(400).json({ error: 'ids required' });

  const params = new URLSearchParams({
    part: 'contentDetails,snippet',
    id: ids,
    key: process.env.YT_API_KEY
  });

  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
  const data = await r.json();
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=120');
  return res.status(r.status).json(data);
}
