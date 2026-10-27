/* Discovery tab: the Discovery prep brief on the deal page. It shows what the Slack brief carries (deal, institution,
   stack, contacts, HubSpot meetings and notes, the Zoom call summary, Starbridge) plus what the intake dossier found
   (summary, open questions, risks, sources) and the pricing inputs. Read-only; edits happen on the other tabs. */
window.DSDiscovery = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var money = function (n) { var x = Number(n); return !n || isNaN(x) ? 'not set' : '$' + Math.round(x).toLocaleString('en-US'); };
  var day = function (v) { if (!v) return ''; var d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
  var host = null, mounted = false;

  // Slack mrkdwn (what Claude writes for the brief) to safe HTML.
  function mrkdwn(t) {
    var out = [], list = false;
    String(t || '').split('\n').forEach(function (raw) {
      var line = esc(raw).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/&lt;(https?:[^|&]+)\|([^&]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener">$2</a>');
      var li = raw.match(/^\s*[-•]\s+/);
      if (li) { if (!list) { out.push('<ul class="ul">'); list = true; } out.push('<li>' + line.replace(/^\s*[-•]\s+/, '') + '</li>'); return; }
      if (list) { out.push('</ul>'); list = false; }
      if (raw.trim()) out.push('<p>' + line + '</p>');
    });
    if (list) out.push('</ul>');
    return out.join('');
  }
  function f(label, val, missing) { return '<div class="df"><span>' + esc(label) + '</span><b' + (val ? '' : ' class="miss"') + '>' + (val ? esc(val) : esc(missing || 'unknown')) + '</b></div>'; }

  function render() {
    if (!mounted) return;
    var box = $('discovery'); if (!box || box.hidden) return;
    var d = host.dossier() || {}, x = host.discovery() || {}, v = host.values() || {}, deal = d.deal || {}, inst = d.institution || {};
    var xd = x.deal || {}, xc = x.company || {}, a = host.assess();
    var pr = window.DSCalc ? DSCalc.summary() : null;
    var h = '<div class="calc-wrap"><aside class="left no-print">';
    h += '<div class="card"><div class="card-h">Discovery prep</div><div class="card-b">' +
      '<div class="dhead">' + esc(inst.name || deal.name || 'This deal') + '</div><div class="hint" style="margin:2px 0 10px">' + esc(deal.stageLabel || '') + (deal.ownerName ? ' · ' + esc(deal.ownerName) : '') + '</div>' +
      '<div style="display:grid;gap:6px">' +
      '<button class="btn" type="button" data-goview="intake" style="justify-content:center">Sales intake (' + (5 - a.quoteMissing.length) + '/5 QUOTE)</button>' +
      '<button class="btn" type="button" data-goview="pricing" style="justify-content:center">Pricing calculator' + (pr ? ' (' + esc(pr.status) + ')' : '') + '</button>' +
      '<button class="btn" type="button" data-goview="proposal" style="justify-content:center">Proposal</button>' +
      (deal.url ? '<a class="btn" href="' + esc(deal.url) + '" target="_blank" rel="noopener" style="justify-content:center;text-decoration:none">Open deal in HubSpot</a>' : '') + '</div>' +
      (x.builtAt ? '<p class="hint" style="margin:10px 0 0">Brief built ' + day(x.builtAt) + ' when the deal moved to Discovery.</p>' : '<p class="hint" style="margin:10px 0 0">The Slack brief has not run for this deal yet; this page shows what the intake sources found.</p>') + '</div></div>';
    h += '<div class="card"><div class="card-h">Pricing calculator inputs</div><div class="card-b dgrid1">' +
      f('Enrollment (FTE)', (pr && pr.fte) || inst.fte, 'missing in HubSpot') +
      f('SIS', v.sis_name || xc.current_sis) + f('CRM', v.crm_name || xc.current_crm_and_enrollments_systems) + f('Degree audit', v.audit_engine) +
      f('Control', xc.institutional_control_public_private) + f('Catalog', xc.catalog_type) +
      (pr ? f('Primary option', pr.primary + ' · ' + money(pr.annual) + '/yr') : '') + '</div></div>';
    h += '</aside><main class="calc-main">';

    h += '<section class="card"><div class="card-h">Deal and institution</div><div class="card-b dgrid">' +
      f('Deal', deal.name) + f('Stage', deal.stageLabel) + f('Owner', deal.ownerName || deal.ownerEmail) + f('Amount', xd.amount ? money(xd.amount) : '', 'not set') +
      f('Close date', day(xd.closedate), 'not set') + f('Next step', xd.hs_next_step, 'not set') +
      f('Institution', inst.name) + f('Domain / state', [inst.domain || xc.domain, xc.state].filter(Boolean).join(' / ')) + '</div></section>';

    h += '<section class="card"><div class="card-h">From the calls</div><div class="card-b brief">' +
      (x.brief ? mrkdwn(x.brief) : (d.summary ? '<p>' + esc(d.summary) + '</p><p class="hint">Summary from the intake dossier (transcripts, emails, Starbridge). The Zoom call brief appears here once the Discovery workflow runs.</p>' : '<p class="hint">No call summary yet.</p>')) +
      ((x.transcripts || []).length ? '<div class="hint" style="margin-top:8px">Recordings: ' + x.transcripts.map(function (t) { return esc(day(t.start_time) + ' ' + t.topic) + (t.share_url ? ' <a href="' + esc(t.share_url) + '" target="_blank" rel="noopener">recording</a>' : ''); }).join(' · ') + '</div>' : '') + '</div></section>';

    var ask = (d.openQuestions || []).slice();
    var two = '<div class="calc-grid">';
    two += '<section class="card"><div class="card-h">Ask in Discovery</div><div class="card-b">' + (ask.length ? '<ul class="ul">' + ask.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul>' : '<p class="hint">No open questions from the sources.</p>') +
      (a.quoteMissing.length ? '<p class="hint" style="margin-top:8px">QUOTE items still open on the intake: ' + a.quoteMissing.map(function (q) { return 'item ' + q.slice(1); }).join(', ') + '.</p>' : '<p class="hint" style="margin-top:8px">All five QUOTE items are answered.</p>') + '</div></section>';
    two += '<section class="card"><div class="card-h">Risks and flags</div><div class="card-b">' +
      ((d.risks || []).length || a.flags.length ? '<ul class="ul">' + (d.risks || []).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + a.flags.map(function (fl) { return '<li><b>' + (fl.level === 'specialist' ? 'Specialist' : 'Watch') + ':</b> ' + esc(fl.text) + '</li>'; }).join('') + '</ul>' : '<p class="hint">Nothing flagged so far.</p>') + '</div></section></div>';
    h += two;

    var contacts = (x.contacts && x.contacts.length ? x.contacts : d.contacts) || [];
    h += '<div class="calc-grid"><section class="card"><div class="card-h">Contacts on the deal</div><div class="card-b">' + (contacts.length ? '<ul class="contacts">' + contacts.map(function (p) { return '<li><b>' + esc(p.name || p.email) + '</b>' + (p.title ? ', ' + esc(p.title) : '') + (p.email ? ' <span class="hint">' + esc(p.email) + '</span>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="hint">None associated. Associate the primary contact before the call.</p>') + '</div></section>';
    var mt = x.meetings || [], nt = x.notes || [];
    h += '<section class="card"><div class="card-h">HubSpot meetings and notes</div><div class="card-b">' + (mt.length || nt.length ? '<ul class="ul">' + mt.map(function (m) { return '<li><b>' + esc(day(m.date)) + '</b> ' + esc(m.title || 'Meeting') + (m.outcome ? ' (' + esc(String(m.outcome).toLowerCase()) + ')' : '') + (m.notes ? '<br><span class="hint">' + esc(m.notes) + '</span>' : '') + '</li>'; }).join('') + nt.map(function (n) { return '<li><b>' + esc(day(n.date)) + '</b> note: ' + esc(n.body) + '</li>'; }).join('') + '</ul>' : '<p class="hint">' + (x.builtAt ? 'No meetings or notes on the deal.' : 'Shown once the Discovery brief runs. The intake sources tab lists ' + ((d.counts || {}).meetings || 0) + ' meetings and ' + ((d.counts || {}).notes || 0) + ' notes.') + '</p>') + '</div></section></div>';

    h += '<section class="card"><div class="card-h">Starbridge intelligence</div><div class="card-b">' + (x.starbridge && x.starbridge.summary ? '<p><b>' + esc(x.starbridge.name || '') + '</b></p><p>' + esc(x.starbridge.summary) + '</p>' : '<p class="hint">' + ((d.counts || {}).starbridge ? 'Starbridge was read for the intake; see its source on the intake tab.' : 'No Starbridge buyer profile found for this institution.') + '</p>') + '</div></section>';
    h += '</main></div>';
    box.innerHTML = h;
  }

  return {
    mount: function (h) {
      host = h; mounted = true;
      $('discovery').addEventListener('click', function (e) { var b = e.target.closest('[data-goview]'); if (b) host.showView(b.getAttribute('data-goview')); });
    },
    render: render
  };
})();
