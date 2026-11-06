/* My deals. A personal access link (/?k=<key>) signs the person in on this browser; the key is then kept in
   localStorage and removed from the address bar. Reps see the deals they own in HubSpot; admins see every deal. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { } }
  };
  var params = new URLSearchParams(location.search);
  var fromUrl = (params.get('k') || '').replace(/[^a-z0-9]/gi, '');
  var KEY = fromUrl || (store.get('ds-intake-key') || '');
  var STAGES = ['Qualify', 'Discovery', 'Quote', 'Driving to Close'];
  var F = { q: '', owner: '', stage: '', status: 'all', sort: 'updated', dir: -1 };
  try { var saved = JSON.parse(store.get('ds-intake-home-filters') || '{}'); ['owner', 'stage', 'status', 'sort', 'dir'].forEach(function (k) { if (saved[k] !== undefined) F[k] = saved[k]; }); } catch (e) { }
  var USER = null, DEALS = [];

  function day(v) { if (!v) return ''; var d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function stageRank(s) { var i = STAGES.indexOf(s); return i < 0 ? 99 : i; }
  function updated(d) { return d.saved_at || d.built_at || ''; }

  function gate(title, msg) {
    $('h-title').textContent = 'Sales intake';
    $('h-user').innerHTML = '';
    $('home').innerHTML = '<div class="gate"><h2>' + esc(title) + '</h2><p>' + msg + '</p><p class="hint">Every deal page also opens from the <b>Sales Intake</b> field on the deal in HubSpot.</p></div>';
  }

  if (!KEY) { gate('Open your personal link', 'This page needs your personal access link. Ask Daniel for it, then open it once on this browser and you stay signed in.'); return; }

  fetch('/api/intake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'deals', k: KEY }) })
    .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Bad response' }; }); })
    .then(function (r) {
      if (!r.ok) {
        store.del('ds-intake-key'); store.del('ds-intake-user');
        gate('Access link not valid', esc(r.error || 'Could not load your deals.'));
        return;
      }
      store.set('ds-intake-key', KEY);
      USER = r.user || {};
      store.set('ds-intake-user', JSON.stringify({ name: USER.name, role: USER.role }));
      if (!store.get('ds-intake-who') && USER.name) store.set('ds-intake-who', USER.name);
      if (fromUrl) { try { history.replaceState(null, '', '/'); } catch (e) { } }
      DEALS = r.deals || [];
      if (USER.role !== 'admin') F.owner = '';
      header();
      render();
    })
    .catch(function () { gate('Could not load your deals', 'The connection failed. Reload the page in a minute.'); });

  function header() {
    var admin = USER.role === 'admin';
    $('h-title').textContent = admin ? 'All intake pages' : 'My deals';
    $('h-meta').innerHTML = '<span>' + DEALS.length + ' open DS Sales deals' + (admin ? ' across the team' : ' you own in HubSpot') + '</span>';
    $('h-user').innerHTML = '<span class="who-chip">' + esc(USER.name || USER.email) + (admin ? ' <span class="pill">Admin</span>' : '') + '</span>' +
      '<a class="btn ghost" href="/feedback">Report an issue</a>' +
      '<button class="btn ghost" type="button" id="b-signout">Sign out</button>';
    $('b-signout').addEventListener('click', function () {
      store.del('ds-intake-key'); store.del('ds-intake-user');
      gate('Signed out', 'Open your personal access link again to sign back in.');
    });
  }

  function status(d) {
    if (d.pricing === 'approved') return 'priced';
    if (d.quote_ready) return 'ready';
    if (d.saved_at) return 'progress';
    return 'new';
  }
  var STATS = [
    ['all', 'Deals', function () { return true; }],
    ['new', 'Not started', function (d) { return !d.saved_at; }],
    ['progress', 'Intake saved', function (d) { return !!d.saved_at; }],
    ['ready', 'Quote ready', function (d) { return d.quote_ready; }],
    ['specialist', 'Specialist needed', function (d) { return d.specialist; }],
    ['priced', 'Pricing approved', function (d) { return d.pricing === 'approved'; }]
  ];
  function statFn(id) { return (STATS.filter(function (s) { return s[0] === id; })[0] || STATS[0])[2]; }

  function filtered() {
    var q = F.q.toLowerCase();
    return DEALS.filter(function (d) {
      if (F.owner && (F.owner === '_none' ? d.owner_email : d.owner_email !== F.owner)) return false;
      if (F.stage && d.stage !== F.stage) return false;
      if (q && (d.institution + ' ' + d.deal_name + ' ' + d.owner_name).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function render() {
    var admin = USER.role === 'admin';
    var base = filtered();
    var rows = base.filter(statFn(F.status));
    rows.sort(function (a, b) {
      var x, y;
      if (F.sort === 'inst') { x = a.institution.toLowerCase(); y = b.institution.toLowerCase(); }
      else if (F.sort === 'stage') { x = stageRank(a.stage); y = stageRank(b.stage); }
      else if (F.sort === 'owner') { x = (a.owner_name || '~').toLowerCase(); y = (b.owner_name || '~').toLowerCase(); }
      else { x = updated(a); y = updated(b); }
      return x < y ? -F.dir : x > y ? F.dir : 0;
    });
    var owners = {};
    DEALS.forEach(function (d) { if (d.owner_email) owners[d.owner_email] = d.owner_name || d.owner_email; });
    var hasNone = DEALS.some(function (d) { return !d.owner_email; });
    var stages = STAGES.filter(function (s) { return DEALS.some(function (d) { return d.stage === s; }); });
    DEALS.forEach(function (d) { if (d.stage && stages.indexOf(d.stage) < 0) stages.push(d.stage); });

    var h = '<div class="stats">' + STATS.map(function (s) {
      return '<button type="button" class="stat' + (F.status === s[0] ? ' on' : '') + '" data-status="' + s[0] + '"><div class="l">' + s[1] + '</div><div class="v">' + base.filter(s[2]).length + '</div></button>';
    }).join('') + '</div>';
    h += '<div class="filters"><input type="search" id="f-q" placeholder="Search institution or deal" value="' + esc(F.q) + '" aria-label="Search">';
    if (admin) h += '<select id="f-owner" aria-label="Owner"><option value="">Every owner</option>' + Object.keys(owners).sort(function (a, b) { return owners[a].localeCompare(owners[b]); }).map(function (e) { return '<option value="' + esc(e) + '"' + (F.owner === e ? ' selected' : '') + '>' + esc(owners[e]) + '</option>'; }).join('') + (hasNone ? '<option value="_none"' + (F.owner === '_none' ? ' selected' : '') + '>No owner</option>' : '') + '</select>';
    h += '<select id="f-stage" aria-label="Stage"><option value="">Every stage</option>' + stages.map(function (s) { return '<option' + (F.stage === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>';
    h += '<span class="count">' + rows.length + ' of ' + DEALS.length + ' deals</span></div>';

    var arrow = function (k) { return F.sort === k ? (F.dir > 0 ? ' ↑' : ' ↓') : ''; };
    h += '<div class="dl">';
    if (!rows.length) h += '<div class="empty">' + (DEALS.length ? 'No deals match these filters.' : 'No open deals with an intake page yet. New deals get one as soon as they are created in HubSpot.') + '</div>';
    else {
      h += '<table class="deals"><thead><tr><th data-sort="inst">Institution' + arrow('inst') + '</th>' + (admin ? '<th data-sort="owner">Owner' + arrow('owner') + '</th>' : '') +
        '<th data-sort="stage">Stage' + arrow('stage') + '</th><th>Intake</th><th>QUOTE items</th><th>Pricing and proposal</th><th data-sort="updated">Updated' + arrow('updated') + '</th><th></th></tr></thead><tbody>';
      rows.forEach(function (d) {
        var q = d.quote_ready ? 5 : (d.quote_missing == null ? null : 5 - d.quote_missing);
        var intake = d.saved_at ? '<span class="tag ok">Saved</span><div class="sub">by ' + esc(d.saved_by || 'unknown') + '</div>' : '<span class="tag mute">Not started</span>';
        if (!d.ai_ok) intake += '<div><span class="tag ai" title="The AI pre-fill did not run for this page yet">AI pre-fill pending</span></div>';
        else if (!d.saved_at && d.coverage) intake += '<div class="sub">' + d.coverage + ' of 18 pre-filled</div>';
        var qcell = q == null ? '<span class="sub">See intake</span>' : '<span class="qbar">' + [0, 1, 2, 3, 4].map(function (i) { return '<i' + (i < q ? ' class="on"' : '') + '></i>'; }).join('') + '</span>' + (d.quote_ready ? '<span class="tag ok">Ready</span>' : '<span class="sub">' + q + '/5</span>');
        if (d.specialist) qcell += '<div><span class="tag bad">Specialist</span></div>';
        var pcell = (d.pricing === 'approved' ? '<span class="tag ok">Approved</span>' + (d.pricing_by ? '<div class="sub">by ' + esc(d.pricing_by) + '</div>' : '') : d.pricing ? '<span class="tag warn">Draft</span>' : '<span class="sub">Not priced</span>') +
          (d.proposal ? '<div><span class="tag mute">' + esc(d.proposal) + '</span></div>' : '');
        h += '<tr data-href="' + esc(d.url) + '"><td><div class="inst">' + esc(d.institution || d.deal_name) + '</div><div class="sub">' + esc(d.deal_name) + '</div></td>' +
          (admin ? '<td>' + (d.owner_email ? esc(d.owner_name) : '<span class="sub">No owner</span>') + '</td>' : '') +
          '<td>' + esc(d.stage) + '</td><td>' + intake + '</td><td>' + qcell + '</td><td>' + pcell + '</td>' +
          '<td class="hide-m"><span class="sub">' + day(updated(d)) + '</span></td>' +
          '<td class="open"><a href="' + esc(d.url) + '">Open</a></td></tr>';
      });
      h += '</tbody></table>';
    }
    h += '</div>';
    $('home').innerHTML = h;

    var keep = function () { store.set('ds-intake-home-filters', JSON.stringify({ owner: F.owner, stage: F.stage, status: F.status, sort: F.sort, dir: F.dir })); };
    var qi = $('f-q');
    qi.addEventListener('input', function () { F.q = qi.value; var pos = qi.selectionStart; render(); var n = $('f-q'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } });
    if ($('f-owner')) $('f-owner').addEventListener('change', function (e) { F.owner = e.target.value; keep(); render(); });
    $('f-stage').addEventListener('change', function (e) { F.stage = e.target.value; keep(); render(); });
    document.querySelectorAll('[data-status]').forEach(function (b) { b.addEventListener('click', function () { F.status = b.getAttribute('data-status'); keep(); render(); }); });
    document.querySelectorAll('th[data-sort]').forEach(function (th) { th.addEventListener('click', function () { var k = th.getAttribute('data-sort'); if (F.sort === k) F.dir = -F.dir; else { F.sort = k; F.dir = k === 'updated' ? -1 : 1; } keep(); render(); }); });
    document.querySelectorAll('tr[data-href]').forEach(function (tr) {
      tr.addEventListener('click', function (e) { if (e.target.closest('a')) return; var u = tr.getAttribute('data-href'); if (e.metaKey || e.ctrlKey) window.open(u, '_blank'); else location.href = u; });
    });
  }
})();
