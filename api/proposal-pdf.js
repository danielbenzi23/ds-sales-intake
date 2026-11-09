// Turns the generated proposal into a PDF (same print styles as "Print or save as PDF") and hands it to n8n,
// which uploads it to HubSpot Files and attaches it to the deal in a note. The browser never sees the n8n URL or key.
const N8N_BASE = process.env.N8N_WEBHOOK_BASE || 'https://degreesight.app.n8n.cloud/webhook';
const SITE = process.env.SITE_BASE || 'https://ds-sales-intake.vercel.app';

async function launch() {
  const puppeteer = require('puppeteer-core');
  if (process.env.CHROME_PATH) return puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
  const chromium = require('@sparticuz/chromium');
  return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true, defaultViewport: { width: 1200, height: 900 } });
}

function page(docHtml) {
  return '<!doctype html><html><head><meta charset="utf-8"><base href="' + SITE + '/">' +
    '<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">' +
    '<link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/calc.css"><link rel="stylesheet" href="/proposal.css"></head>' +
    '<body class="print-proposal"><section id="proposal"><div class="calc-wrap prop-wrap"><main class="calc-main">' + docHtml + '</main></div></section></body></html>';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
  const key = process.env.INTAKE_KEY;
  if (!key) { res.status(500).json({ ok: false, error: 'INTAKE_KEY is not configured on Vercel.' }); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const deal = String(body.deal || '').replace(/[^0-9]/g, '');
  const t = String(body.t || '').replace(/[^a-z0-9]/gi, '');
  const html = String(body.html || '');
  const ref = String(body.ref || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 60);
  if (!deal || !t || !html || !ref) { res.status(400).json({ ok: false, error: 'Missing deal, token, proposal or reference.' }); return; }
  if (html.length > 3000000) { res.status(413).json({ ok: false, error: 'Proposal too large.' }); return; }
  const H = { 'content-type': 'application/json', 'x-intake-key': key };
  try {
    // Only a valid intake link can attach files to its deal.
    const chk = await fetch(N8N_BASE + '/sales-intake/get', { method: 'POST', headers: H, body: JSON.stringify({ deal, t }) });
    if (!chk.ok) { res.status(404).json({ ok: false, error: 'This intake link is not valid.' }); return; }
  } catch (e) { res.status(502).json({ ok: false, error: 'Could not reach n8n.' }); return; }
  let pdf;
  let browser;
  try {
    browser = await launch();
    const p = await browser.newPage();
    await p.setContent(page(html), { waitUntil: 'networkidle0', timeout: 30000 });
    await p.emulateMediaType('print');
    pdf = await p.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Could not create the PDF: ' + String(e && e.message || e).slice(0, 200) }); return;
  } finally { if (browser) { try { await browser.close(); } catch (e) { } } }
  const filename = String(body.filename || ('DegreeSight Proposal ' + ref)).replace(/[^\w .()-]/g, '').slice(0, 120) + '.pdf';
  try {
    const r = await fetch(N8N_BASE + '/sales-intake/attach', { method: 'POST', headers: H, body: JSON.stringify({ deal, t, ref, filename, attachedBy: String(body.attachedBy || '').slice(0, 120), pdf: Buffer.from(pdf).toString('base64') }) });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { ok: false, error: 'Unexpected response from n8n' }; }
    res.status(r.ok ? 200 : r.status).json(Object.assign({ bytes: pdf.length }, data));
  } catch (e) { res.status(502).json({ ok: false, error: 'Could not reach n8n.' }); }
};
