// Server-side proxy between the intake page and n8n. The browser never sees the n8n URL or the key.
const N8N_BASE = process.env.N8N_WEBHOOK_BASE || 'https://degreesight.app.n8n.cloud/webhook';
const ROUTES = { get: 'sales-intake/get', save: 'sales-intake/save', build: 'sales-intake/build' };

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
  const key = process.env.INTAKE_KEY;
  if (!key) { res.status(500).json({ ok: false, error: 'INTAKE_KEY is not configured on Vercel.' }); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const route = ROUTES[body.action];
  if (!route) { res.status(400).json({ ok: false, error: 'Unknown action' }); return; }
  const deal = String(body.deal || '').replace(/[^0-9]/g, '');
  const t = String(body.t || '').replace(/[^a-z0-9]/gi, '');
  if (!deal || !t) { res.status(400).json({ ok: false, error: 'Missing deal or token' }); return; }
  const payload = body.action === 'build' ? { deal_id: deal, t } : Object.assign({}, body, { deal, t });
  delete payload.action;
  try {
    if (body.action === 'build') {
      // A refresh is only allowed for a link whose token is valid.
      const chk = await fetch(N8N_BASE + '/' + ROUTES.get, { method: 'POST', headers: { 'content-type': 'application/json', 'x-intake-key': key }, body: JSON.stringify({ deal, t }) });
      if (!chk.ok) { res.status(chk.status === 404 ? 404 : 502).json({ ok: false, error: 'This intake link is not valid.' }); return; }
    }
    const r = await fetch(N8N_BASE + '/' + route, { method: 'POST', headers: { 'content-type': 'application/json', 'x-intake-key': key }, body: JSON.stringify(payload) });
    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { ok: false, error: 'Unexpected response from n8n' }; }
    if (r.status === 404 && !data.error) data = { ok: false, error: 'The n8n workflow behind this page is not active yet.', inactive: true };
    if (body.action === 'build' && r.ok) data = { ok: true, message: 'Refresh started. The new dossier lands in about a minute.' };
    res.status(r.status).json(data);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'Could not reach n8n.' });
  }
};
