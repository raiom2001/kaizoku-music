const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.privacyredirect.com',
  'https://piped-api.garudalinux.org',
];

function secsToDuration(s) {
  if (!s) return '';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  if (m >= 60) { const h = Math.floor(m / 60); return `${h}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}`; }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function isoToDuration(iso) {
  if (!iso) return '';
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const h = parseInt(m[1] || 0), min = parseInt(m[2] || 0), s = parseInt(m[3] || 0);
  if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${min}:${String(s).padStart(2, '0')}`;
}

function htmlDecode(str) {
  return (str || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function fromPiped(q, pageToken) {
  for (const base of PIPED) {
    try {
      const p = new URLSearchParams({ q, filter: 'videos', ...(pageToken ? { nextpage: pageToken } : {}) });
      const r = await fetch(`${base}/search?${p}`, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const data = await r.json();
      const tracks = (data.items || [])
        .filter(i => i.url && i.url.startsWith('/watch?v='))
        .map(i => {
          const id = i.url.slice(9); // remove /watch?v=
          return {
            id,
            title: htmlDecode(i.title),
            artist: i.uploaderName || '',
            thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            duration: secsToDuration(i.duration),
          };
        })
        .filter(t => t.id);
      return { tracks, nextPageToken: data.nextpage || '' };
    } catch (_) { continue; }
  }
  return null;
}

async function fromYouTube(q, pageToken, key, maxResults) {
  try {
    const sp = new URLSearchParams({ part: 'snippet', q, type: 'video', videoCategoryId: '10', maxResults: String(maxResults), key, ...(pageToken ? { pageToken } : {}) });
    const sr = await fetch(`https://www.googleapis.com/youtube/v3/search?${sp}`, { signal: AbortSignal.timeout(8000) });
    if (!sr.ok) return null;
    const sd = await sr.json();
    if (sd.error) return null;
    const ids = (sd.items || []).map(i => i.id?.videoId).filter(Boolean);
    if (!ids.length) return { tracks: [], nextPageToken: '' };
    const vp = new URLSearchParams({ part: 'contentDetails,snippet', id: ids.join(','), key });
    const vr = await fetch(`https://www.googleapis.com/youtube/v3/videos?${vp}`, { signal: AbortSignal.timeout(8000) });
    const vd = vr.ok ? await vr.json() : { items: [] };
    const dm = {};
    (vd.items || []).forEach(v => { dm[v.id] = v; });
    const tracks = (sd.items || []).map(item => {
      const id = item.id?.videoId;
      if (!id) return null;
      const snip = item.snippet;
      return {
        id,
        title: htmlDecode(snip?.title),
        artist: snip?.channelTitle || '',
        thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        duration: isoToDuration(dm[id]?.contentDetails?.duration || ''),
      };
    }).filter(Boolean);
    return { tracks, nextPageToken: sd.nextPageToken || '' };
  } catch (_) { return null; }
}

export default async function handler(req, res) {
  const { q, pageToken = '', maxResults = '12' } = req.query;
  if (!q) return res.status(400).json({ error: 'q required', tracks: [] });

  const piped = await fromPiped(q, pageToken);
  if (piped && piped.tracks.length > 0) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.json(piped);
  }

  if (process.env.YT_API_KEY) {
    const yt = await fromYouTube(q, pageToken, process.env.YT_API_KEY, maxResults);
    if (yt && yt.tracks.length > 0) {
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
      return res.json(yt);
    }
  }

  return res.status(503).json({ error: 'Serviço indisponível', tracks: [], nextPageToken: '' });
}
