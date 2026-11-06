/* Report an issue. Same sign-in as My deals: the personal access key (/?k=... once, then localStorage).
   Submits to /api/feedback, which forwards to n8n; n8n appends a row to the SalesRep Feedback Google Sheet. */
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
  var PRE = { institution: params.get('institution') || '', deal_id: (params.get('deal') || '').replace(/[^0-9]/g, '') };

  var CATS = [
    ['duplicate', 'HubSpot duplicate', 'Two records for the same company, deal or contact', ['Company', 'Deal', 'Contact']],
    ['attribution', 'Missing or wrong attribution', 'A deal, meeting or contact is not credited to the right rep', ['Deal owner', 'Meeting / booking', 'Contact owner', 'Lead source']],
    ['data', 'Wrong or outdated data', 'Bad field value, stale lifecycle stage, wrong SIS/CRM, etc.', ['Company', 'Deal', 'Contact']],
    ['intake', 'Sales intake page', 'Something off in a dossier, checklist, pricing or proposal', ['Dossier content', 'Checklist', 'Pricing calculator', 'Proposal / MSA', 'Access link']],
    ['tooling', 'Tooling or automation', 'Sequences, Slack alerts, scheduler links, workflows', ['Sequence', 'Slack alert', 'Scheduler', 'Other automation']],
    ['request', 'Request or idea', 'Something you need that does not exist yet', []],
    ['other', 'Other', 'Anything else', []]
  ];
  var USER = null, S = { category: '', type: '', priority: 'Medium', company: null };
  var SUG = { list: [], open: false, timer: null, seq: 0 };

  function gate(title, msg) {
    $('h-user').innerHTML = '';
    $('fb').innerHTML = '<div class="gate"><h2>' + esc(title) + '</h2><p>' + msg + '</p></div>';
  }
  if (!KEY) { gate('Open your personal link', 'This page needs your personal access link, the same one that opens My deals. Ask Daniel for it, then open it once on this browser and you stay signed in.'); return; }

  // Reuse the My deals sign-in check so the header shows who is reporting.
  fetch('/api/intake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'deals', k: KEY }) })
    .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Bad response' }; }); })
    .then(function (r) {
      if (!r.ok) { store.del('ds-intake-key'); store.del('ds-intake-user'); gate('Access link not valid', esc(r.error || 'Could not sign you in.')); return; }
      store.set('ds-intake-key', KEY);
      USER = r.user || {};
      if (fromUrl) { try { history.replaceState(null, '', '/feedback' + (PRE.institution || PRE.deal_id ? '?' + params.toString().replace(/(^|&)k=[^&]*/, '').replace(/^&/, '') : '')); } catch (e) { } }
      $('h-user').innerHTML = '<span class="who-chip">' + esc(USER.name || USER.email) + '</span><a class="btn ghost" href="/">My deals</a>';
      render();
    })
    .catch(function () { gate('Could not load the page', 'The connection failed. Reload the page in a minute.'); });

  function render() {
    var cat = CATS.filter(function (c) { return c[0] === S.category; })[0];
    var h = '<div class="card">' +
      '<h2>What went wrong?</h2>' +
      '<p class="lead">Takes a minute. It lands in a shared sheet Daniel triages, and you get a reference id back.</p>' +
      '<div class="sec"><span class="lbl">Category <b>*</b></span><div class="cats">' + CATS.map(function (c) {
        return '<button type="button" class="cat' + (S.category === c[0] ? ' on' : '') + '" data-cat="' + c[0] + '"><div class="t">' + esc(c[1]) + '</div><div class="d">' + esc(c[2]) + '</div></button>';
      }).join('') + '</div></div>';
    if (cat && cat[3].length) {
      h += '<div class="sec"><span class="lbl">Which kind</span><div class="chips">' + cat[3].map(function (t) {
        return '<button type="button" class="chip' + (S.type === t ? ' on' : '') + '" data-type="' + esc(t) + '">' + esc(t) + '</button>';
      }).join('') + '</div></div>';
    }
    h += '<div class="sec row2">' +
      '<div class="ta"><label class="lbl" for="f-inst">Institution / account</label><input class="t" id="f-inst" autocomplete="off" placeholder="Start typing a HubSpot company" value="' + esc(PRE.institution) + '">' +
        '<div class="sug" id="f-sug" hidden></div>' +
        '<p class="hint" id="f-inst-hint">' + (S.company ? 'Linked to HubSpot company <b>' + esc(S.company.name) + '</b>' + (S.company.domain ? ' · ' + esc(S.company.domain) : '') + '. <a href="#" id="f-unlink">Unlink</a>' : 'Pick from the list to link the HubSpot record. Free text is fine too.') + '</p></div>' +
      '<div><span class="lbl">Priority</span><div class="chips">' + ['Low', 'Medium', 'High'].map(function (p) {
        return '<button type="button" class="chip' + (S.priority === p ? ' on' : '') + '" data-pri="' + p + '">' + p + '</button>';
      }).join('') + '</div></div></div>';
    h += '<div class="sec"><label class="lbl" for="f-links">HubSpot links</label><textarea class="t" id="f-links" style="min-height:58px" placeholder="Paste the record URLs, one per line. For a duplicate, paste both records."></textarea>' +
      '<p class="hint">Copy the address bar on the HubSpot record. Record ids are pulled from the links automatically.</p></div>';
    h += '<div class="sec"><label class="lbl" for="f-desc">What happened <b>*</b></label><textarea class="t" id="f-desc" placeholder="What you saw, where, and when. Names and dates help."></textarea></div>';
    h += '<div class="sec"><label class="lbl" for="f-exp">What should happen instead</label><textarea class="t" id="f-exp" style="min-height:64px" placeholder="Optional: the outcome you expect (merge into X, assign to me, fix the field to Y...)"></textarea></div>';
    h += '<div class="foot"><button type="button" class="btn primary" id="b-send">Send feedback</button><span class="state" id="f-state"></span></div>' +
      '</div>';
    $('fb').innerHTML = h;
    document.querySelectorAll('.cat').forEach(function (b) { b.addEventListener('click', function () { var c = b.getAttribute('data-cat'); if (S.category !== c) { S.category = c; S.type = ''; keepText(); render(); } }); });
    document.querySelectorAll('[data-type]').forEach(function (b) { b.addEventListener('click', function () { S.type = S.type === b.getAttribute('data-type') ? '' : b.getAttribute('data-type'); keepText(); render(); }); });
    document.querySelectorAll('[data-pri]').forEach(function (b) { b.addEventListener('click', function () { S.priority = b.getAttribute('data-pri'); keepText(); render(); }); });
    if (S.text) { $('f-inst').value = S.text.institution; $('f-links').value = S.text.links; $('f-desc').value = S.text.description; $('f-exp').value = S.text.expected; }
    $('b-send').addEventListener('click', send);
    typeahead();
  }
  function typeahead() {
    var inp = $('f-inst'), box = $('f-sug');
    var unlink = $('f-unlink');
    if (unlink) unlink.addEventListener('click', function (e) { e.preventDefault(); S.company = null; keepText(); render(); });
    function close() { SUG.open = false; box.hidden = true; }
    function show(list) {
      SUG.list = list;
      if (!list.length) { close(); return; }
      box.innerHTML = list.map(function (c, i) {
        return '<button type="button" class="opt" data-i="' + i + '"><span class="n">' + esc(c.name) + '</span><span class="m">' + esc([c.domain, c.place, c.lifecycle].filter(Boolean).join(' · ')) + '</span></button>';
      }).join('');
      box.hidden = false; SUG.open = true;
      box.querySelectorAll('.opt').forEach(function (b) { b.addEventListener('mousedown', function (e) { e.preventDefault(); pick(SUG.list[+b.getAttribute('data-i')]); }); });
    }
    function pick(c) { S.company = c; keepText(); S.text.institution = c.name; close(); render(); $('f-links').focus(); }
    inp.addEventListener('input', function () {
      if (S.company && inp.value !== S.company.name) S.company = null;
      var q = inp.value.trim();
      clearTimeout(SUG.timer);
      if (q.length < 2) { close(); return; }
      SUG.timer = setTimeout(function () {
        var seq = ++SUG.seq;
        fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'companies', k: KEY, q: q }) })
          .then(function (r) { return r.json().catch(function () { return {}; }); })
          .then(function (r) { if (seq !== SUG.seq || document.activeElement !== inp) return; show((r && r.companies) || []); })
          .catch(function () { });
      }, 350);
    });
    inp.addEventListener('blur', function () { setTimeout(close, 150); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); if (e.key === 'Enter' && SUG.open && SUG.list.length) { e.preventDefault(); pick(SUG.list[0]); } });
  }
  function keepText() { S.text = { institution: $('f-inst').value, links: $('f-links').value, description: $('f-desc').value, expected: $('f-exp').value }; }

  function send() {
    keepText();
    var st = $('f-state'); st.className = 'state';
    if (!S.category) { st.className = 'state err'; st.textContent = 'Pick a category.'; return; }
    if (S.text.description.trim().length < 10) { st.className = 'state err'; st.textContent = 'Describe what happened (a sentence is enough).'; $('f-desc').focus(); return; }
    var btn = $('b-send'); btn.disabled = true; st.textContent = 'Sending…';
    var payload = { k: KEY, feedback: { category: S.category, type: S.type, priority: S.priority, institution: S.text.institution, company_id: S.company ? S.company.id : '', deal_id: PRE.deal_id, links: S.text.links, description: S.text.description, expected: S.text.expected } };
    fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Bad response' }; }); })
      .then(function (r) {
        if (!r.ok) { btn.disabled = false; st.className = 'state err'; st.textContent = r.error || 'Could not send. Try again.'; return; }
        $('fb').innerHTML = '<div class="card done"><div class="big">✓</div><h2>Sent. Thank you.</h2><p>Reference <code>' + esc(r.id || '') + '</code>. Daniel gets a Slack ping and the row is in the feedback sheet.</p>' +
          '<div class="btns"><button type="button" class="btn primary" id="b-again">Report another</button><a class="btn" href="/">Back to My deals</a></div></div>';
        $('b-again').addEventListener('click', function () { S = { category: '', type: '', priority: 'Medium', company: null }; PRE = { institution: '', deal_id: '' }; render(); });
      })
      .catch(function () { btn.disabled = false; st.className = 'state err'; st.textContent = 'The connection failed. Try again in a minute.'; });
  }
})();
