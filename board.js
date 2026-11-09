/* Feedback board. Admins see every ticket and the weekly reviews; reps see their own tickets.
   Sign-in is the same as the form: personal link (/?k=...) or the name picked on /feedback. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
  var params = new URLSearchParams(location.search);
  var fromUrl = (params.get('k') || '').replace(/[^a-z0-9]/gi, '');
  var KEY = fromUrl || (store.get('ds-intake-key') || '');
  var EMAIL = store.get('ds-feedback-email') || '';
  var ident = KEY ? { k: KEY } : { email: EMAIL };
  var CATS = ['HubSpot duplicate', 'Missing or wrong attribution', 'Wrong or outdated data', 'Sales intake page', 'Tooling or automation', 'Request or idea', 'Other'];
  var STATUSES = ['New', 'Triaged', 'In progress', 'Done', "Won't fix"];
  var SERIES = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
  var DATA = null, F = { range: '30', q: '', status: 'open', cat: '', rep: '', sort: 'at', dir: -1, week: 0 };

  function gate(title, msg) { $('h-user').innerHTML = ''; $('bd').innerHTML = '<div class="gate"><h2>' + esc(title) + '</h2><p>' + msg + '</p></div>'; }
  if (!KEY && !EMAIL) { gate('Who are you?', 'Open <a href="/feedback">Report an issue</a> once and pick your name, or open your personal link. Then come back here.'); return; }

  fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ action: 'board' }, ident)) })
    .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Bad response' }; }); })
    .then(function (r) {
      if (!r.ok) { gate('Could not open the board', esc(r.error || 'Try again in a minute.')); return; }
      if (fromUrl) { store.set('ds-intake-key', KEY); try { history.replaceState(null, '', '/feedback/board'); } catch (e) { } }
      DATA = r;
      DATA.tickets.forEach(function (t) { t.ts = Date.parse(String(t.at || '').replace(' UTC', 'Z').replace(' ', 'T')) || 0; t.rts = Date.parse(String(t.resolved_at || '').replace(' UTC', 'Z').replace(' ', 'T')) || 0; });
      $('h-user').innerHTML = '<span class="who-chip">' + esc(r.user.name || r.user.email) + (r.user.role === 'admin' ? ' <span class="pill">Admin</span>' : '') + '</span><a class="btn ghost" href="/feedback">Report an issue</a>' + (KEY ? '<a class="btn ghost" href="/">My deals</a>' : '');
      render();
    })
    .catch(function () { gate('Could not open the board', 'The connection failed. Reload the page in a minute.'); });

  function isOpen(t) { return ['New', 'Triaged', 'In progress'].indexOf(t.status || 'New') >= 0; }
  function inRange(t) { if (F.range === 'all') return true; return t.ts >= Date.now() - Number(F.range) * 86400000; }
  function count(list, key) { var m = {}; list.forEach(function (t) { var k = t[key] || '—'; m[k] = (m[k] || 0) + 1; }); return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; }); }
  function day(v) { if (!v) return ''; var d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function statusCls(s) { return { 'New': 'new', 'Triaged': 'triaged', 'In progress': 'progress', 'Done': 'done', "Won't fix": 'wontfix' }[s] || 'new'; }
  function median(a) { if (!a.length) return null; a = a.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; }
  function hrs(h) { return h == null ? '—' : h < 48 ? Math.round(h) + 'h' : (h / 24).toFixed(1) + 'd'; }

  function bars(pairs, colorBy) {
    if (!pairs.length) return '<div class="empty">Nothing in this range.</div>';
    var max = Math.max.apply(null, pairs.map(function (p) { return p[1]; })) || 1;
    return '<div class="bars">' + pairs.map(function (p, i) {
      var c = colorBy ? SERIES[Math.max(0, colorBy.indexOf(p[0])) % 8] : 's1';
      return '<div class="bar" title="' + esc(p[0]) + ': ' + p[1] + '"><span class="n">' + esc(p[0]) + '</span><span class="t"><i style="width:' + Math.round(p[1] / max * 100) + '%;background:var(--' + c + ')"></i></span><span class="v">' + p[1] + '</span></div>';
    }).join('') + '</div>';
  }

  function render() {
    var all = DATA.tickets, admin = DATA.user.role === 'admin';
    var ranged = all.filter(inRange);
    var open = all.filter(isOpen);
    var resolvedHrs = ranged.filter(function (t) { return t.rts && t.ts; }).map(function (t) { return (t.rts - t.ts) / 3600000; }).filter(function (h) { return h >= 0; });
    var weekAgo = Date.now() - 7 * 86400000, twoWeeks = Date.now() - 14 * 86400000;
    var thisWeek = all.filter(function (t) { return t.ts >= weekAgo; }).length, lastWeek = all.filter(function (t) { return t.ts >= twoWeeks && t.ts < weekAgo; }).length;
    var oldest = open.length ? Math.round((Date.now() - Math.min.apply(null, open.map(function (t) { return t.ts || Date.now(); }))) / 86400000) : 0;

    var h = '<div class="range"><span class="lbl">Range</span>' + [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['all', 'All time']].map(function (o) { return '<button type="button" class="chip' + (F.range === o[0] ? ' on' : '') + '" data-range="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>';

    h += '<div class="kpis">' +
      '<div class="kpi"><div class="l">Open</div><div class="v">' + open.length + '</div><div class="d">' + open.filter(function (t) { return t.status === 'New' || !t.status; }).length + ' new · oldest ' + oldest + 'd</div></div>' +
      '<div class="kpi"><div class="l">This week</div><div class="v">' + thisWeek + '</div><div class="d ' + (thisWeek > lastWeek ? 'up' : 'good') + '">' + (thisWeek - lastWeek >= 0 ? '+' : '') + (thisWeek - lastWeek) + ' vs last week</div></div>' +
      '<div class="kpi"><div class="l">Resolved (' + (F.range === 'all' ? 'all' : F.range + 'd') + ')</div><div class="v">' + ranged.filter(function (t) { return t.status === 'Done'; }).length + '</div><div class="d">' + ranged.filter(function (t) { return t.status === "Won't fix"; }).length + " won't fix</div></div>" +
      '<div class="kpi"><div class="l">Median time to resolve</div><div class="v">' + hrs(median(resolvedHrs)) + '</div><div class="d">' + resolvedHrs.length + ' resolved tickets</div></div>' +
      '<div class="kpi"><div class="l">High priority open</div><div class="v">' + open.filter(function (t) { return t.priority === 'High'; }).length + '</div><div class="d">' + open.filter(function (t) { return t.priority === 'Medium'; }).length + ' medium</div></div>' +
      '</div>';

    // Charts: category (ranged), rep (ranged), status stack + 8-week trend
    var byCat = count(ranged, 'category'), byRep = count(ranged, 'rep');
    var byStatus = STATUSES.map(function (s) { return [s, ranged.filter(function (t) { return (t.status || 'New') === s; }).length]; }).filter(function (p) { return p[1] > 0; });
    var tot = ranged.length || 1;
    var weeks = []; for (var w = 7; w >= 0; w--) { var start = Date.now() - (w + 1) * 7 * 86400000, end = Date.now() - w * 7 * 86400000; weeks.push({ label: day(end), n: all.filter(function (t) { return t.ts >= start && t.ts < end; }).length }); }
    var wmax = Math.max.apply(null, weeks.map(function (x) { return x.n; })) || 1;
    h += '<div class="grid">' +
      '<div class="card"><h3>By category</h3><div class="sub">Tickets in range</div>' + bars(byCat, CATS) + '</div>' +
      '<div class="card"><h3>' + (admin ? 'By rep' : 'By priority') + '</h3><div class="sub">Who is reporting</div>' + bars(admin ? byRep : count(ranged, 'priority'), null) + '</div>' +
      '<div class="card"><h3>Status</h3><div class="sub">' + ranged.length + ' tickets in range</div><div class="stack">' + byStatus.map(function (p, i) { return '<i style="width:' + (p[1] / tot * 100) + '%;background:var(--' + SERIES[STATUSES.indexOf(p[0])] + ')" title="' + esc(p[0]) + ': ' + p[1] + '"></i>'; }).join('') + '</div>' +
        '<div class="legend">' + byStatus.map(function (p) { return '<span><b style="background:var(--' + SERIES[STATUSES.indexOf(p[0])] + ')"></b>' + esc(p[0]) + ' ' + p[1] + '</span>'; }).join('') + '</div>' +
        '<h3 style="margin-top:14px">New tickets per week</h3><div class="trend">' + weeks.map(function (x) { return '<div class="c"><div class="col" data-v="' + (x.n || '') + '" style="height:' + Math.max(2, Math.round(x.n / wmax * 100)) + '%"></div><span>' + esc(x.label) + '</span></div>'; }).join('') + '</div></div>' +
      '</div>';

    // Weekly insights (admin)
    if (admin && DATA.reports && DATA.reports.length) {
      var rep = DATA.reports[Math.min(F.week, DATA.reports.length - 1)];
      h += '<div class="card ins"><div class="head"><h3>Weekly review · ' + esc(rep.week_start) + ' → ' + esc(rep.week_end) + '</h3>' +
        (DATA.reports.length > 1 ? '<select id="f-week">' + DATA.reports.map(function (r, i) { return '<option value="' + i + '"' + (i === F.week ? ' selected' : '') + '>Week of ' + esc(r.week_start) + '</option>'; }).join('') + '</select>' : '') + '</div>' +
        '<div class="headline">' + esc(rep.headline) + '</div><div class="cols"><div>' +
        '<h3>Improvements to get ahead</h3>' + (rep.improvements || []).map(function (x) {
          return '<div class="imp"><div class="t"><span class="tag ' + String(x.priority || 'p2').toLowerCase() + '">' + esc(x.priority || 'P2') + '</span><span class="tag mute">' + esc(x.effort || 'M') + ' · ' + esc(x.where || '') + '</span>' + esc(x.title) + '</div><div class="w">' + esc(x.what) + '</div><div class="y">Why: ' + esc(x.why) + '</div>' + (x.prevents ? '<div class="p">Prevents: ' + esc(x.prevents) + '</div>' : '') + '</div>';
        }).join('') + '</div><div>' +
        '<h3>Trends</h3><ul class="plain">' + (rep.trends || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
        (rep.watch && rep.watch.length ? '<h3 style="margin-top:12px">Watch next week</h3><ul class="plain">' + rep.watch.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
        (rep.kudos ? '<p class="sub" style="margin-top:10px">🎉 ' + esc(rep.kudos) + '</p>' : '') +
        '</div></div></div>';
    } else if (admin) {
      h += '<div class="card ins"><h3>Weekly review</h3><div class="sub">The first review lands next Monday 08:00 (or run the “Feedback Weekly Review” workflow in n8n).</div></div>';
    }

    // Improvement backlog captured by the triage agent while handling tickets (admin)
    if (admin && DATA.improvements && DATA.improvements.length) {
      var imps = DATA.improvements.slice().sort(function (a, b) { return (a.status === 'Open' ? 0 : 1) - (b.status === 'Open' ? 0 : 1) || String(a.priority).localeCompare(String(b.priority)); });
      h += '<div class="card ins"><div class="head"><h3>Improvement backlog · from ticket triage</h3><span class="sub">' + imps.filter(function (x) { return x.status === 'Open'; }).length + ' open</span></div><div class="sub">Patterns and requests the agent spotted while fixing tickets. The weekly review consolidates these.</div><div class="imps">' +
        imps.slice(0, 20).map(function (x) {
          return '<div class="imp"><div class="t"><span class="tag ' + String(x.priority || 'p2').toLowerCase() + '">' + esc(x.priority) + '</span><span class="tag ' + (x.status === 'Open' ? 'new' : 'done') + '">' + esc(x.status) + '</span>' + esc(x.title) + '</div>' + (x.detail && x.detail !== x.title ? '<div class="w">' + esc(x.detail) + '</div>' : '') + '<div class="y">' + esc(x.evidence) + (x.created ? ' · ' + esc(x.created) : '') + ' · ' + esc(x.source.replace('triage:', '')) + '</div></div>';
        }).join('') + '</div></div>';
    }

    // Table
    var reps = count(all, 'rep').map(function (p) { return p[0]; });
    var rows = ranged.filter(function (t) {
      if (F.status === 'open' && !isOpen(t)) return false;
      if (F.status !== 'open' && F.status !== 'all' && (t.status || 'New') !== F.status) return false;
      if (F.cat && t.category !== F.cat) return false;
      if (F.rep && t.rep !== F.rep) return false;
      var q = F.q.toLowerCase();
      if (q && [t.id, t.institution, t.what, t.expected, t.rep, t.resolution].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    rows.sort(function (a, b) { var x = F.sort === 'at' ? a.ts : (a[F.sort] || ''), y = F.sort === 'at' ? b.ts : (b[F.sort] || ''); return x < y ? -F.dir : x > y ? F.dir : 0; });
    h += '<div class="filters"><input type="search" id="f-q" placeholder="Search id, institution, text" value="' + esc(F.q) + '">' +
      '<select id="f-status"><option value="open"' + (F.status === 'open' ? ' selected' : '') + '>Open</option><option value="all"' + (F.status === 'all' ? ' selected' : '') + '>All statuses</option>' + STATUSES.map(function (s) { return '<option value="' + esc(s) + '"' + (F.status === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>' +
      '<select id="f-cat"><option value="">All categories</option>' + CATS.map(function (c) { return '<option' + (F.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      (admin ? '<select id="f-rep"><option value="">All reps</option>' + reps.map(function (r) { return '<option' + (F.rep === r ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select>' : '') +
      '<span class="count">' + rows.length + ' of ' + ranged.length + '</span></div>';
    h += '<div class="dl"><table class="deals"><thead><tr><th data-sort="at">Submitted</th><th data-sort="id">Ticket</th>' + (admin ? '<th data-sort="rep">Rep</th>' : '') + '<th data-sort="category">Category</th><th data-sort="institution">Institution</th><th>What happened</th><th data-sort="priority">Priority</th><th data-sort="status">Status</th><th>Resolution</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (t) {
        return '<tr class="open" data-id="' + esc(t.id) + '"><td class="sub">' + esc(day(t.ts)) + '</td><td class="inst">' + esc(t.id) + '</td>' + (admin ? '<td>' + esc(t.rep) + '</td>' : '') +
          '<td>' + esc(t.category) + (t.type ? '<div class="sub">' + esc(t.type) + '</div>' : '') + '</td>' +
          '<td>' + (t.company_url ? '<a href="' + esc(t.company_url) + '" target="_blank" rel="noopener">' + esc(t.institution) + '</a>' : esc(t.institution)) + (t.company_owner ? '<div class="sub">' + esc(t.company_owner) + '</div>' : '') + '</td>' +
          '<td class="what">' + esc(String(t.what || '').slice(0, 220)) + (String(t.what || '').length > 220 ? '…' : '') + '</td>' +
          '<td><span class="tag ' + String(t.priority || '').toLowerCase() + '">' + esc(t.priority) + '</span></td><td><span class="tag ' + statusCls(t.status || 'New') + '">' + esc(t.status || 'New') + '</span></td>' +
          '<td class="res">' + esc(String(t.resolution || '').slice(0, 160)) + '</td></tr>';
      }).join('') : '<tr><td colspan="9" class="empty">No tickets match.</td></tr>') + '</tbody></table></div>';
    $('bd').innerHTML = h;

    document.querySelectorAll('[data-range]').forEach(function (b) { b.addEventListener('click', function () { F.range = b.getAttribute('data-range'); render(); }); });
    $('f-q').addEventListener('input', function () { F.q = this.value; render(); $('f-q').focus(); $('f-q').setSelectionRange(F.q.length, F.q.length); });
    $('f-status').addEventListener('change', function () { F.status = this.value; render(); });
    $('f-cat').addEventListener('change', function () { F.cat = this.value; render(); });
    if ($('f-rep')) $('f-rep').addEventListener('change', function () { F.rep = this.value; render(); });
    if ($('f-week')) $('f-week').addEventListener('change', function () { F.week = +this.value; render(); });
    document.querySelectorAll('th[data-sort]').forEach(function (th) { th.addEventListener('click', function () { var k = th.getAttribute('data-sort'); if (F.sort === k) F.dir = -F.dir; else { F.sort = k; F.dir = k === 'at' ? -1 : 1; } render(); }); });
    document.querySelectorAll('tr.open').forEach(function (tr) { tr.addEventListener('click', function (e) { if (e.target.tagName === 'A') return; var t = all.filter(function (x) { return x.id === tr.getAttribute('data-id'); })[0]; var nx = tr.nextElementSibling; if (nx && nx.classList.contains('detail')) { nx.remove(); return; } var d = document.createElement('tr'); d.className = 'detail'; d.innerHTML = '<td colspan="9"><b>What happened:</b> ' + esc(t.what) + (t.expected ? '\n<b>Expected:</b> ' + esc(t.expected) : '') + (t.links ? '\n<b>Links:</b> ' + esc(t.links) : '') + (t.record_ids ? '\n<b>Records:</b> ' + esc(t.record_ids) : '') + (t.resolution ? '\n<b>Resolution:</b> ' + esc(t.resolution) : '') + (t.resolved_at ? '\n<b>Resolved at:</b> ' + esc(t.resolved_at) : '') + '\n<b>Submitted:</b> ' + esc(t.at) + ' by ' + esc(t.rep) + '</td>'; tr.after(d); }); });
  }
})();
