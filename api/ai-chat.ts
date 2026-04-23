// Vercel serverless proxy for Eden AI.
// Client calls /api/ai-chat (same-origin, no CORS) → this function forwards
// to the Supabase edge function server-to-server, bypassing any mobile ISP
// restrictions on Deno Deploy's IP space.

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/ai-chat`;

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header. Please log in again.' });
  }

  try {
    const farmId = req.body?.farm_id || '(missing)';
    console.log(`[ai-chat proxy] farm_id=${farmId} user=${req.body?.messages?.length ?? 0} msgs`);
    const upstream = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err: any) {
    console.error('ai-chat proxy error:', err?.message);
    return res.status(502).json({ error: 'Could not reach AI service. Please try again.' });
  }
}
