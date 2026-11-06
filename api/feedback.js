// Server-side proxy between the feedback page and n8n. The browser never sees the n8n URL or the key.
const N8N_BASE = process.env.N8N_WEBHOOK_BASE || 'https://degreesight.app.n8n.cloud/webhook';
const ROUTE = 'sales-intake/feedback';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
  const key = process.env.INTAKE_KEY;
  if (!key) { res.status(500).json({ ok: false, error: 'INTAKE_KEY is not configured on Vercel.' }); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const k = String(body.k || '').replace(/[^a-z0-9]/gi, '');
  if (!k) { res.status(401).json({ ok: false, error: 'Open your personal access link first.' }); return; }
  const f = body.feedback && typeof body.feedback === 'object' ? body.feedback : {};
  const s = (v, n) => String(v == null ? '' : v).slice(0, n);
  const feedback = {
    category: s(f.category, 40), type: s(f.type, 120), priority: s(f.priority, 20),
    institution: s(f.institution, 200), deal_id: s(f.deal_id, 40), links: s(f.links, 2000),
    description: s(f.description, 5000), expected: s(f.expected, 3000)
  };
  try {
    const r = await fetch(N8N_BASE + '/' + ROUTE, { method: 'POST', headers: { 'content-type': 'application/json', 'x-intake-key': key }, body: JSON.stringify({ k, feedback }) });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { ok: false, error: 'Unexpected response from n8n' }; }
    if (r.status === 404 && !data.error) data = { ok: false, error: 'The feedback workflow is not active yet.' };
    res.status(r.status).json(data);
  } catch (e) { res.status(502).json({ ok: false, error: 'Could not reach n8n.' }); }
};
