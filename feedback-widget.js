/* Feedback widget (Nov 18 2026): a "Feedback" button on every sales intake page that opens the same feedback form as
   /feedback (same categories, type, priority, description and expected result) in a side panel, prefilled with the
   deal, the institution, the tab it came from and the page link. Submissions land in the same board and Slack alert. */
(function () {
  if (window.__dsFeedbackWidget) return; window.__dsFeedbackWidget = true;
  function context() {
    var deal = (location.pathname.match(/^\/(\d+)\/?$/) || [])[1] || '';
    var tabs = { discovery: 'Dossier content', app: 'Checklist', pricing: 'Pricing calculator', proposal: 'Proposal / MSA' }, tab = '';
    Object.keys(tabs).forEach(function (id) { var el = document.getElementById(id); if (el && !el.hidden && el.offsetParent !== null && !tab) tab = tabs[id]; });
    var inst = ''; var h = document.querySelector('.top h1, .top .inst, #inst-name'); if (h) inst = h.textContent.trim();
    return { deal: deal, tab: tab || (deal ? 'Checklist' : ''), institution: inst, link: location.origin + location.pathname + (location.hash || '') };
  }
  var css = '#dsfb-btn{position:fixed;right:18px;bottom:18px;z-index:9998;border:0;border-radius:999px;padding:10px 16px;font:600 13px/1 system-ui,-apple-system,Segoe UI,sans-serif;background:#0b3d91;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.18);cursor:pointer}' +
    '#dsfb-p{position:fixed;right:18px;bottom:66px;z-index:9999;width:600px;max-width:calc(100vw - 32px);height:min(820px,calc(100vh - 90px));background:#fff;border:1px solid #dfe3ea;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.2);display:none;overflow:hidden}' +
    '#dsfb-p.on{display:flex;flex-direction:column}#dsfb-h{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid #e3e6ea;font:600 13px system-ui,-apple-system,Segoe UI,sans-serif;color:#1d2433}' +
    '#dsfb-h button{border:0;background:none;font-size:20px;line-height:1;color:#5b6373;cursor:pointer}#dsfb-f{flex:1;border:0;width:100%}' +
    '@media print{#dsfb-btn,#dsfb-p{display:none!important}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var btn = document.createElement('button'); btn.id = 'dsfb-btn'; btn.type = 'button'; btn.textContent = 'Feedback'; btn.className = 'no-print';
  var p = document.createElement('div'); p.id = 'dsfb-p'; p.className = 'no-print'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Send feedback');
  p.innerHTML = '<div id="dsfb-h"><span>Feedback</span><button type="button" id="dsfb-x" aria-label="Close">&times;</button></div>';
  document.body.appendChild(btn); document.body.appendChild(p);
  btn.addEventListener('click', function () {
    if (p.classList.contains('on')) { p.classList.remove('on'); return; }
    var c = context(), q = new URLSearchParams({ embed: '1', category: 'intake', type: c.tab, links: c.link });
    if (c.deal) q.set('deal', c.deal);
    if (c.institution) q.set('institution', c.institution);
    var old = document.getElementById('dsfb-f'); if (old) old.remove();
    var f = document.createElement('iframe'); f.id = 'dsfb-f'; f.title = 'Feedback form'; f.src = '/feedback?' + q.toString();
    p.appendChild(f); p.classList.add('on');
  });
  p.addEventListener('click', function (e) { if (e.target.id === 'dsfb-x') p.classList.remove('on'); });
})();
