/* Feedback widget (Nov 18 2026): a small "Feedback" button on every sales intake page. One open field; it lands in the
   same feedback board and Slack alert as /feedback.html, tagged with the deal and the tab it came from. */
(function () {
  if (window.__dsFeedbackWidget) return; window.__dsFeedbackWidget = true;
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  function ident() {
    var k = store.get('ds-intake-key') || '';
    if (k) return { k: k };
    var u = null; try { u = JSON.parse(store.get('ds-intake-user') || 'null'); } catch (e) { u = null; }
    var email = (u && u.email) || store.get('ds-feedback-email') || '';
    return email ? { email: email } : null;
  }
  function context() {
    var deal = (location.pathname.match(/^\/(\d+)\/?$/) || [])[1] || '';
    var tabs = { discovery: 'Dossier content', app: 'Checklist', pricing: 'Pricing calculator', proposal: 'Proposal / MSA' }, tab = '';
    Object.keys(tabs).forEach(function (id) { var el = document.getElementById(id); if (el && !el.hidden && el.offsetParent !== null && !tab) tab = tabs[id]; });
    var inst = ''; var h = document.querySelector('.top h1, .top .inst, #inst-name'); if (h) inst = h.textContent.trim();
    var link = location.origin + location.pathname + (location.hash || '');
    return { deal: deal, tab: tab || (deal ? 'Checklist' : ''), institution: inst, link: link };
  }
  var css = '#dsfb-btn{position:fixed;right:18px;bottom:18px;z-index:9998;border:0;border-radius:999px;padding:10px 16px;font:600 13px/1 system-ui,-apple-system,Segoe UI,sans-serif;background:#0b3d91;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.18);cursor:pointer}' +
    '#dsfb-p{position:fixed;right:18px;bottom:66px;z-index:9999;width:340px;max-width:calc(100vw - 32px);background:#fff;color:#1d2433;border:1px solid #dfe3ea;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.18);padding:14px;font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;display:none}' +
    '#dsfb-p.on{display:block}#dsfb-p h4{margin:0 0 4px;font-size:14px}#dsfb-p .s{color:#5b6373;font-size:12px;margin:0 0 8px}' +
    '#dsfb-p textarea{width:100%;box-sizing:border-box;min-height:110px;border:1px solid #cfd5df;border-radius:8px;padding:8px;font:inherit;resize:vertical}' +
    '#dsfb-p label.c{display:flex;gap:6px;align-items:center;margin:8px 0;font-size:12.5px}#dsfb-p select{width:100%;margin:0 0 8px;padding:6px;border-radius:8px;border:1px solid #cfd5df;font:inherit}' +
    '#dsfb-p .r{display:flex;gap:8px;justify-content:flex-end;align-items:center}#dsfb-p button.go{border:0;border-radius:8px;padding:8px 14px;background:#0b3d91;color:#fff;font-weight:600;cursor:pointer}#dsfb-p button.go:disabled{opacity:.6}' +
    '#dsfb-p button.x{border:0;background:none;color:#5b6373;cursor:pointer}#dsfb-p .st{font-size:12px;margin-top:6px}#dsfb-p .st.err{color:#b42318}#dsfb-p .st.ok{color:#1d7a3e}' +
    '@media print{#dsfb-btn,#dsfb-p{display:none!important}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var btn = document.createElement('button'); btn.id = 'dsfb-btn'; btn.type = 'button'; btn.textContent = 'Feedback'; btn.className = 'no-print';
  var p = document.createElement('div'); p.id = 'dsfb-p'; p.className = 'no-print'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Send feedback');
  document.body.appendChild(btn); document.body.appendChild(p);
  var reps = null;
  function draw(msg, cls) {
    var id = ident(), c = context(), keep = (document.getElementById('dsfb-t') || {}).value || '';
    p.innerHTML = '<h4>Feedback</h4><p class="s">Something off, confusing or missing' + (c.tab ? ' on <b>' + esc(c.tab) + '</b>' : '') + '? Write it like a message. Daniel gets it right away.</p>' +
      (id ? '' : '<select id="dsfb-who"><option value="">Who are you?</option>' + (reps || []).map(function (r) { return '<option value="' + esc(r.email) + '">' + esc(r.name) + '</option>'; }).join('') + '</select>') +
      '<textarea id="dsfb-t" placeholder="What happened, and what you expected">' + esc(keep) + '</textarea>' +
      '<label class="c"><input type="checkbox" id="dsfb-idea"> This is an idea, not a problem</label>' +
      '<div class="r"><button type="button" class="x" id="dsfb-close">Close</button><button type="button" class="go" id="dsfb-send">Send</button></div>' +
      (msg ? '<div class="st ' + (cls || '') + '">' + esc(msg) + '</div>' : '');
    if (!id && reps === null) {
      reps = [];
      fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'reps' }) })
        .then(function (r) { return r.json(); }).then(function (j) { reps = (j && (j.reps || j.users)) || []; draw(msg, cls); }).catch(function () { });
    }
  }
  btn.addEventListener('click', function () { var on = p.classList.toggle('on'); if (on) { draw(); var t = document.getElementById('dsfb-t'); if (t) t.focus(); } });
  p.addEventListener('click', function (e) {
    if (e.target.id === 'dsfb-close') { p.classList.remove('on'); return; }
    if (e.target.id !== 'dsfb-send') return;
    var text = (document.getElementById('dsfb-t').value || '').trim();
    if (!text) { draw('Write something first.', 'err'); return; }
    var id = ident();
    if (!id) { var w = document.getElementById('dsfb-who'); var em = w && w.value; if (!em) { draw('Pick your name first.', 'err'); return; } store.set('ds-feedback-email', em); id = { email: em }; }
    var idea = document.getElementById('dsfb-idea').checked, c = context();
    e.target.disabled = true; e.target.textContent = 'Sending…';
    var payload = Object.assign({}, id, { feedback: { category: idea ? 'request' : 'intake', type: idea ? '' : c.tab, priority: 'Medium', institution: c.institution, company_id: '', deal_id: c.deal, links: c.link, description: text, expected: '' } });
    fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Bad response' }; }); })
      .then(function (j) {
        if (j && j.ok) { document.getElementById('dsfb-t').value = ''; draw('Sent. Thanks, Daniel has it.', 'ok'); }
        else draw((j && j.error) || 'Could not send. Try again.', 'err');
      }).catch(function () { draw('Could not send. Check your connection.', 'err'); });
  });
})();
