// Partner Success handoff PDF (built automatically when a deal moves to Closed Won).
// n8n sends the handoff content Claude wrote (partner-success-handoff skill schema) plus the intake answers.
// This renders the skill's template unchanged, adds two appendices (Unusual setup, and the intake questions with
// their answers), prints it with headless Chrome and hands the PDF to n8n, which attaches it to the HubSpot deal.
// Server to server only: the caller must send the intake key.
const nunjucks = require('nunjucks');
const TEMPLATE = require('./_lib/handoff-template.js');
const SPEC = require('../spec.json');
const N8N_BASE = process.env.N8N_WEBHOOK_BASE || 'https://degreesight.app.n8n.cloud/webhook';

const env = new nunjucks.Environment(null, { autoescape: true });

async function launch() {
  const pm = await import('puppeteer-core'); const puppeteer = pm.default || pm;
  if (process.env.CHROME_PATH) return puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
  const cm = await import('@sparticuz/chromium'); const chromium = cm.default || cm;
  return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true, defaultViewport: { width: 1200, height: 900 } });
}

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Several template fields print as HTML. Their text comes from Claude, which read prospect emails and calls,
// so keep only plain emphasis tags (no attributes) and drop everything else. Also no em dashes (house style).
function clean(node) {
  if (typeof node === 'string') {
    return node
      .replace(/<\s*(script|style|iframe|object|embed|svg|math)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*(\/?)\s*(strong|em|b|i|br)\b[^>]*>/gi, '<$1$2>')
      .replace(/<(?!\/?(?:strong|em|b|i|br)>)[^>]*>/gi, '')
      .replace(/\s*—\s*/g, ', ').replace(/–/g, '-');
  }
  if (Array.isArray(node)) return node.map(clean);
  if (node && typeof node === 'object') { const o = {}; Object.keys(node).forEach(k => { o[k] = clean(node[k]); }); return o; }
  return node;
}

// Same required shape as the skill's build_pdf.py, so a thin or broken answer from Claude never ships.
const REQUIRED = ['customer_name', 'prepared_by', 'prepared_date', 'contract_executed_date', 'glance', 'deal_summary', 'institutional_context', 'stakeholders', 'tech_stack_intro', 'tech_stack', 'pains', 'timeline', 'implementation_timeline', 'implementation', 'risks', 'comm_prefs', 'delivered_artifacts', 'footer_note'];
const TAGS = ['poc', 'exec', 'sponsor', 'support', ''];
function validate(c) {
  const e = [];
  REQUIRED.forEach(k => { if (c[k] === undefined || c[k] === null) e.push('Missing ' + k); });
  const ic = c.institutional_context || {}; ['intro', 'bullets', 'closing_paragraphs'].forEach(k => { if (ic[k] === undefined) e.push('Missing institutional_context.' + k); });
  const im = c.implementation || {}; ['fast', 'watch', 'wins'].forEach(k => { if (!Array.isArray(im[k])) e.push('Missing implementation.' + k); });
  (c.glance || []).forEach((r, i) => ['left_label', 'left_value', 'right_label', 'right_value'].forEach(k => { if (r[k] === undefined) e.push('glance[' + i + '] missing ' + k); }));
  (c.stakeholders || []).forEach((s, i) => { if (!s.name) e.push('stakeholders[' + i + '] missing name'); (s.tags || []).forEach(t => { if (TAGS.indexOf(t.color) < 0) t.color = 'support'; }); if (s.notes_html === undefined) s.notes_html = ''; });
  const it = c.implementation_timeline || {};
  const p = it.on_paper || {};
  if (!String(p.summary || '').trim()) e.push('implementation_timeline.on_paper.summary is empty');
  if (!String(p.source || '').trim()) e.push('implementation_timeline.on_paper.source is empty');
  const st = it.stated;
  if (!Array.isArray(st)) e.push('implementation_timeline.stated must be a list');
  else if (!st.length && String(it.stated_none_note || '').trim().length < 60) e.push('Section 7 Part B is empty and the note does not say what was searched');
  else st.forEach((s, i) => { ['date', 'speaker', 'role', 'source', 'quote', 'means'].forEach(k => { if (!String(s[k] || '').trim()) e.push('stated[' + i + '] missing ' + k); }); if (typeof s.verbatim !== 'boolean') s.verbatim = false; });
  if (!Array.isArray(it.reconciliation)) e.push('implementation_timeline.reconciliation must be a list');
  else if (!it.reconciliation.length && !String(it.reconciliation_none_note || '').trim()) e.push('Section 7 Part C is empty with no note');
  if (!Array.isArray(it.open_questions) || it.open_questions.length < 3) e.push('Section 7 Part D needs at least 3 kickoff questions');
  return e;
}

const fmt = v => Array.isArray(v) ? v.join(', ') : String(v);
const has = v => Array.isArray(v) ? v.length > 0 : (v !== undefined && v !== null && String(v).trim() !== '');

// Appendix: the Unusual setup list, then every intake question with the answer on file.
function appendix(b) {
  const values = b.values || {}, notes = b.notes || {}, confirmed = b.confirmed || {}, ai = b.aiFields || {};
  const answerOf = f => {
    if (has(values[f.key])) return { text: fmt(values[f.key]), from: 'Rep' };
    const a = ai[f.key];
    if (a && has(a.value)) return { text: fmt(a.value), from: 'From calls and emails' + ((a.evidence || [])[0] && a.evidence[0].quote ? ': "' + String(a.evidence[0].quote).slice(0, 160) + '"' : '') };
    return null;
  };
  let h = '<div style="page-break-before:always"></div>';
  h += '<h2>Appendix A. Unusual Setup</h2><p class="lede">Filled automatically from calls and emails, so the kickoff does not re-ask it.</p>';
  const odd = b.oddities || [];
  if (odd.length) {
    h += '<table class="stack"><thead><tr><th>Topic</th><th>What they said</th><th>Source</th></tr></thead><tbody>';
    odd.forEach(o => { const ev = (o.evidence || [])[0] || {}; h += '<tr><td class="system">' + esc(o.topic) + '</td><td>' + esc(o.detail) + '</td><td class="role">' + (ev.quote ? '&ldquo;' + esc(ev.quote) + '&rdquo; ' : '') + esc(ev.title || ev.ref || '') + '</td></tr>'; });
    h += '</tbody></table>';
  } else h += '<p>Nothing unusual came up in the calls and emails we could read.</p>';
  h += '<h2>Appendix B. Sales Intake: Questions and Answers</h2><p class="lede">The questions the rep worked through before quoting, with the answers on file at Closed Won. "Rep" means the rep entered or confirmed it; "From calls and emails" means it was read from the sources and the rep did not change it.</p>';
  const row = (q, rows, note, conf) => {
    let r = '<tr><td class="system">' + esc(q) + (conf ? '<br><span style="font-weight:400;color:#1d8348;font-size:8.5pt">Confirmed with the school</span>' : '') + '</td><td>';
    r += rows.length ? rows.map(x => '<div style="margin-bottom:4px"><strong>' + esc(x.label) + ':</strong> ' + esc(x.text) + ' <span style="color:#8a8f99;font-size:8.5pt">(' + esc(x.from) + ')</span></div>').join('') : '<span style="color:#b14e0a">No answer on file</span>';
    if (note) r += '<div style="color:#5b6373;font-style:italic">Notes: ' + esc(note) + '</div>';
    return r + '</td></tr>';
  };
  (SPEC.sections || []).forEach(sec => {
    h += '<h3>' + esc(sec.title) + '</h3><table class="stack"><thead><tr><th style="width:38%">Question</th><th>Answer</th></tr></thead><tbody>';
    sec.items.forEach(it => {
      const rows = it.fields.map(f => { const a = answerOf(f); return a ? { label: f.label, text: a.text, from: a.from } : null; }).filter(Boolean);
      h += row(it.title, rows, notes[it.id], confirmed[it.id] === true);
    });
    h += '</tbody></table>';
  });
  const kick = (SPEC.kickoff && SPEC.kickoff.fields || []).map(f => { const a = answerOf(f); return a ? { label: f.label, text: a.text, from: a.from } : null; }).filter(Boolean);
  if (kick.length) {
    h += '<h3>' + esc(SPEC.kickoff.title) + '</h3><table class="stack"><thead><tr><th style="width:38%">Question</th><th>Answer</th></tr></thead><tbody>';
    kick.forEach(k => { h += '<tr><td class="system">' + esc(k.label) + '</td><td>' + esc(k.text) + ' <span style="color:#8a8f99;font-size:8.5pt">(' + esc(k.from) + ')</span></td></tr>'; });
    h += '</tbody></table>';
  }
  return h;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
  const key = process.env.INTAKE_KEY;
  if (!key || req.headers['x-intake-key'] !== key) { res.status(401).json({ ok: false, error: 'Not allowed.' }); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const deal = String(body.deal || '').replace(/[^0-9]/g, '');
  const t = String(body.t || '').replace(/[^a-z0-9]/gi, '');
  if (!deal || !t || !body.content || typeof body.content !== 'object') { res.status(400).json({ ok: false, error: 'Missing deal, token or content.' }); return; }
  const content = clean(body.content);
  const errors = validate(content);
  if (errors.length) { res.status(422).json({ ok: false, error: 'Handoff content failed the skill checks.', errors }); return; }
  let html;
  try {
    html = env.renderString(TEMPLATE, content);
    // The footer line lives inside CSS, where HTML escaping would show up literally.
    html = html.replace(/(@bottom-left\s*\{\s*content:\s*")([^"]*)(")/, (m, a, b2, c) => a + b2.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '') + c);
    html = html.replace('</body>', appendix(Object.assign({}, body, { oddities: clean(body.oddities || []) })) + '</body>');
  } catch (e) { res.status(500).json({ ok: false, error: 'Template failed: ' + String(e && e.message || e).slice(0, 300) }); return; }
  let pdf, browser;
  try {
    browser = await launch();
    const p = await browser.newPage();
    await p.setJavaScriptEnabled(false);
    await p.setRequestInterception(true);
    p.on('request', r => (r.url().startsWith('data:') || r.url() === 'about:blank') ? r.continue() : r.abort());
    await p.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await p.emulateMediaType('print');
    pdf = await p.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Could not create the PDF: ' + String(e && e.message || e).slice(0, 200) }); return;
  } finally { if (browser) { try { await browser.close(); } catch (e) { } } }
  const pages = (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  const filename = String(body.filename || (content.customer_name + ' Partner Success Handoff')).replace(/[^\w .()-]/g, '').slice(0, 120);
  if (body.attach === false) { res.status(200).json({ ok: true, pages, bytes: pdf.length, pdf: Buffer.from(pdf).toString('base64') }); return; }
  try {
    const r = await fetch(N8N_BASE + '/sales-intake/attach', { method: 'POST', headers: { 'content-type': 'application/json', 'x-intake-key': key }, body: JSON.stringify({ deal, t, kind: 'handoff', ref: 'PS-HANDOFF', filename, attachedBy: 'the Closed Won automation', pdf: Buffer.from(pdf).toString('base64') }) });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { ok: false, error: 'Unexpected response from n8n' }; }
    res.status(r.ok ? 200 : r.status).json(Object.assign({ pages, bytes: pdf.length }, data));
  } catch (e) { res.status(502).json({ ok: false, error: 'Could not reach n8n.' }); }
};
