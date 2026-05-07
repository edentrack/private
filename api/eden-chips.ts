// Vercel serverless proxy for Eden's empty-state suggestion chips.
// Same pattern as /api/ai-chat — client calls /api/eden-chips → server-side
// fetch to the Supabase edge function. Bypasses mobile ISP issues with
// Deno Deploy IP ranges and avoids CORS preflights.

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/eden-chips`;

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'missing auth' });
  }
  if (!SUPABASE_URL) {
    return res.status(503).json({ error: 'AI service is not configured.' });
  }

  try {
    const upstream = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(req.body || {}),
    });
    const text = await upstream.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: 'Bad upstream response' });
    }
    return res.status(upstream.status).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[eden-chips proxy] fetch error:', msg);
    return res.status(502).json({ error: 'Could not reach chip generator.' });
  }
}
