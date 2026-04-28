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

  if (!SUPABASE_URL) {
    console.error('[ai-chat proxy] VITE_SUPABASE_URL not set');
    return res.status(503).json({ error: 'AI service is not configured. Contact support.' });
  }

  try {
    const farmId = req.body?.farm_id || '(missing)';
    console.log(`[ai-chat proxy] farm_id=${farmId} msgs=${req.body?.messages?.length ?? 0}`);

    const upstream = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(req.body || {}),
    });

    // Always parse as text first to avoid SyntaxError crashing the proxy
    const text = await upstream.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.error('[ai-chat proxy] upstream returned non-JSON:', upstream.status, text.slice(0, 200));
      return res.status(502).json({ error: 'Eden AI returned an unexpected response. Please try again.' });
    }

    return res.status(upstream.status).json(data);
  } catch (err: any) {
    console.error('[ai-chat proxy] fetch error:', err?.message);
    return res.status(502).json({ error: 'Could not reach Eden AI. Please check your connection and try again.' });
  }
}
