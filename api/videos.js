// No longer needed — duration is returned by /api/search directly.
// Kept for backwards compatibility.
export default async function handler(req, res) {
  res.status(200).json({ items: [] });
}
