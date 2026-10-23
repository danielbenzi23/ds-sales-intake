(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var params = new URLSearchParams(location.search);
  // Deal comes from the path (/43820286731) or, for old links, from ?deal=. The token comes from ?t= the first
  // time a link from Slack is opened and is then remembered in this browser, so /<deal_id> works on its own afterwards.
  var pathDeal = (location.pathname.match(/^\/(\d+)\/?$/) || [])[1] || '';
  var DEAL = (pathDeal || params.get('deal') || '').replace(/[^0-9]/g, '');
  var tokenKey = 'ds-intake-token-' + DEAL;
  var TOKEN = (params.get('t') || '').replace(/[^a-z0-9]/gi, '');
  if (DEAL && !TOKEN) { try { TOKEN = localStorage.getItem(tokenKey) || ''; } catch (e) { TOKEN = ''; } }
  var needsLink = !!DEAL && !TOKEN;
  var isDemo = !DEAL;
  var S = { dossier: {}, values: {}, origin: {}, confirmed: {}, notes: {}, dirty: false, savedAt: null, savedBy: '' };
  var FIELDS = {}, ITEM_OF = {}, QUOTE_IDS = [];
  SPEC.sections.forEach(function (sec) { sec.items.forEach(function (it) { if (it.quote) QUOTE_IDS.push(it.id); it.fields.forEach(function (f) { FIELDS[f.key] = f; ITEM_OF[f.key] = it.id; }); }); });
  SPEC.kickoff.fields.forEach(function (f) { FIELDS[f.key] = f; ITEM_OF[f.key] = 'kickoff'; });
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
  $('who').value = store.get('ds-intake-who') || '';
  $('who').addEventListener('input', function () { store.set('ds-intake-who', $('who').value); });

  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 2600); }
  function banner(kind, html) { $('banner').innerHTML = html ? '<div class="' + kind + '">' + html + '</div>' : ''; }
  function api(action, extra) {
    return fetch('/api/intake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ action: action, deal: DEAL, t: TOKEN }, extra || {})) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Bad response' }; }).then(function (j) { j._status = r.status; return j; }); });
  }
  function hasVal(v) { return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length); }
  function itemAnswered(it) { return it.fields.some(function (f) { return hasVal(S.values[f.key]) && S.values[f.key] !== 'Unknown'; }); }
  function srcByRef(ref) { return (S.dossier.sources || []).filter(function (s) { return s.ref === ref; })[0] || null; }

  function load(data, demo) {
    S.dossier = data.dossier || {};
    var saved = data.answers || {};
    var dfields = S.dossier.fields || {};
    S.values = {}; S.origin = {};
    Object.keys(dfields).forEach(function (k) { if (FIELDS[k]) { S.values[k] = dfields[k].value; S.origin[k] = 'ai'; } });
    if (saved.values) Object.keys(saved.values).forEach(function (k) { if (FIELDS[k]) { S.values[k] = saved.values[k]; S.origin[k] = (saved.origin && saved.origin[k]) || 'rep'; } });
    S.confirmed = saved.confirmed || {}; S.notes = saved.notes || {};
    S.savedAt = data.saved_at || saved.savedAt || null; S.savedBy = data.saved_by || '';
    var draft = !demo && store.get('ds-intake-draft-' + DEAL);
    if (draft) { try { var d = JSON.parse(draft); if (d && d.ts && (!S.savedAt || d.ts > Date.parse(S.savedAt))) { S.values = d.values || S.values; S.origin = d.origin || S.origin; S.confirmed = d.confirmed || S.confirmed; S.notes = d.notes || S.notes; S.dirty = true; } } catch (e) { } }
    renderHeader(demo); renderApp(); renderSide(); setSaveState();
  }

  function renderHeader(demo) {
    var d = S.dossier.deal || {}, inst = S.dossier.institution || {};
    $('d-title').textContent = (inst.name || d.name || 'Sales intake');
    var meta = [];
    var pills = (demo ? '<span class="pill demo">Demo data</span> ' : '') + (d.stageLabel ? '<span class="pill">' + esc(d.stageLabel) + '</span>' : '');
    if (d.name && d.name !== inst.name) meta.push(esc(d.name));
    if (d.ownerName || d.ownerEmail) meta.push('Owner: ' + esc(d.ownerName || d.ownerEmail));
    if (inst.fte) meta.push('FTE ' + esc(inst.fte));
    if (S.dossier.builtAt) meta.push('Sources read ' + new Date(S.dossier.builtAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
    if (d.url) meta.push('<a href="' + esc(d.url) + '" target="_blank" rel="noopener" style="color:#7DD3FC">Open in HubSpot</a>');
    $('d-meta').innerHTML = pills + ' ' + meta.join(' · ');
    $('b-refresh').disabled = demo; $('b-save').disabled = false;
  }

  function fieldHtml(f) {
    var v = S.values[f.key], origin = S.origin[f.key], ai = (S.dossier.fields || {})[f.key];
    var tag = '';
    if (origin === 'ai' && ai) tag = '<button type="button" class="ai ' + (ai.confidence === 'low' ? 'low' : '') + '" data-ev="' + f.key + '" title="Prefilled from the sources. Click for the evidence.">AI · ' + esc(ai.confidence) + (ai.evidence && ai.evidence[0] ? ' · ' + esc(ai.evidence[0].ref) : '') + '</button>';
    else if (origin === 'rep') tag = '<span class="rep">Rep</span>';
    var ctl = '';
    if (f.type === 'choice' || f.type === 'multi') {
      ctl = '<div class="chips" role="group" aria-label="' + esc(f.label) + '">' + f.options.map(function (o) {
        var on = f.type === 'multi' ? (Array.isArray(v) && v.indexOf(o) >= 0) : v === o;
        return '<button type="button" class="chip' + (on ? ' on' : '') + (o === 'Unknown' ? ' unk' : '') + '" aria-pressed="' + on + '" data-k="' + f.key + '" data-o="' + esc(o) + '">' + esc(o) + '</button>';
      }).join('') + '</div>';
    } else if (f.type === 'date') {
      ctl = '<input class="t" type="date" data-k="' + f.key + '" value="' + esc(v || '') + '" style="max-width:200px">';
    } else {
      ctl = '<input class="t" type="text" data-k="' + f.key + '" value="' + esc(v || '') + '">';
    }
    var ev = '';
    if (ai && ai.evidence && ai.evidence.length) ev = '<div class="ev" id="ev-' + f.key + '">' + (origin !== 'ai' ? '<span class="src">AI suggested: ' + esc(Array.isArray(ai.value) ? ai.value.join(', ') : ai.value) + '</span>' : '') + ai.evidence.map(function (e) { var s = srcByRef(e.ref) || {}; return '<div><q>' + esc(e.quote) + '</q><span class="src">' + esc(e.ref) + ' · ' + esc(s.title || '') + (s.date ? ' · ' + esc(s.date) : '') + (s.url ? ' · <a href="' + esc(s.url) + '" target="_blank" rel="noopener">open</a>' : '') + '</span></div>'; }).join('') + '</div>';
    return '<div class="f"><div class="f-l">' + esc(f.label) + tag + '</div>' + ctl + ev + '</div>';
  }

  function renderApp() {
    var html = '<aside class="left" id="left"></aside><main id="main">';
    SPEC.sections.forEach(function (sec) {
      html += '<div class="sec-h" id="sec-' + sec.id + '"><h2>' + esc(sec.title) + '</h2><span class="rule"></span></div>';
      sec.items.forEach(function (it) {
        var done = !!S.confirmed[it.id];
        html += '<section class="card item' + (it.quote ? ' quote' : '') + (done ? ' done' : '') + '" id="' + it.id + '">' +
          '<div class="item-h"><div class="num">' + it.n + '</div><h3>' + esc(it.title) + (it.quote ? '<span class="badge quote">Quote</span>' : '') + '</h3>' +
          '<label class="confirm' + (done ? ' on' : '') + '"><input type="checkbox" data-confirm="' + it.id + '"' + (done ? ' checked' : '') + '> Confirmed with the school</label></div>' +
          (it.hint ? '<p class="hint">' + esc(it.hint) + '</p>' : '') +
          (it.say ? '<div class="say">' + esc(it.say) + '</div>' : '') +
          '<div class="fields">' + it.fields.map(fieldHtml).join('') + '</div>' +
          '<details class="notes"' + (S.notes[it.id] ? ' open' : '') + '><summary>Notes</summary><textarea class="t" data-note="' + it.id + '" placeholder="What they said, in their words">' + esc(S.notes[it.id] || '') + '</textarea></details>' +
          '</section>';
      });
    });
    html += '<div class="sec-h" id="sec-kickoff"><h2>' + esc(SPEC.kickoff.title) + '</h2><span class="rule"></span></div>';
    html += '<section class="card kick"><div class="card-b"><p class="hint" style="margin:0">' + esc(SPEC.kickoff.note) + '</p><div class="kick-grid">' + SPEC.kickoff.fields.map(fieldHtml).join('') + '</div></div></section>';
    html += '<section class="card"><div class="card-h">Things to say once, in writing</div><div class="card-b"><ul class="say-once">' +
      ['We are domestic: international transcripts and WES or ECE evaluations are not something we evaluate.', 'Prior learning, portfolio, and industry certifications (ServSafe, NCLEX) are not an intake source.', 'Historical catalog lookup and public equivalency search, the two things schools use TES and Transferology for, are not things we replace.', 'Reverse transfer, Parchment and Clearinghouse connectors, EDI/PESC, a native mobile app, and single-tenant hosting: not offered.'].map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div></section>';
    html += '</main><aside class="right" id="right"></aside>';
    var app = $('app'); app.className = 'wrap'; app.innerHTML = html;
  }

  function renderSide() {
    var a = assessIntake(S.values);
    var names = { q1: 'Populations and rules', q5: 'SIS, hosting, replacement', q7: 'What they expect written back', q8: 'Integration gates go-live', q13: 'What live means, and the date' };
    var nums = { q1: 1, q5: 5, q7: 7, q8: 8, q13: 13 };
    var answered = SPEC.sections.reduce(function (n, s) { return n + s.items.filter(itemAnswered).length; }, 0);
    var confirmedN = Object.keys(S.confirmed).filter(function (k) { return S.confirmed[k]; }).length;
    var left = '<div class="card gate ' + (a.quoteReady ? 'ready' : 'hold') + '"><div class="gate-top"><div class="big">' + (5 - a.quoteMissing.length) + '/5</div><div><div class="lbl">' + (a.quoteReady ? 'Ready to quote' : 'Not ready to quote') + '</div><div class="sub">QUOTE items answered</div></div></div>' +
      '<ul class="qlist">' + Object.keys(names).map(function (k) { return '<li data-go="' + k + '"><span class="qdot ' + (a.quote[k] ? 'ok' : 'no') + '">' + (a.quote[k] ? '&#10003;' : nums[k]) + '</span>' + esc(names[k]) + '</li>'; }).join('') + '</ul>' +
      (a.quoteReady ? '' : '<div class="script">If they ask for a quote first: "Hold on one second. For me to scope this properly, I have to ask you a few questions. Give me the basics and I’ll get you a quote."</div>') + '</div>';
    left += '<div class="card"><div class="card-h">Specialist on the next call?</div><div class="card-b">' + (a.flags.length ? '<ul class="flags">' + a.flags.map(function (f) { return '<li class="' + f.level + '"><span class="tag">' + (f.level === 'specialist' ? 'Bring a specialist' : 'Watch out') + ' · item ' + f.item + '</span>' + esc(f.text) + '</li>'; }).join('') + '</ul>' : '<p class="empty">Routine so far. Familiar stacks (Colleague on-prem + Slate, Banner + Slate with files in, J1 + standard Salesforce, PeopleSoft + Slate with files in) need no specialist.</p>') + '</div></div>';
    left += '<div class="card"><div class="card-h">Progress</div><div class="card-b"><div style="display:flex;justify-content:space-between;font-size:12.5px"><span>' + answered + ' of 18 have an answer</span><span>' + confirmedN + ' confirmed</span></div><div class="progress"><i style="width:' + Math.round(answered / 18 * 100) + '%"></i></div><ul class="nav">' +
      SPEC.sections.map(function (s) { var n = s.items.filter(itemAnswered).length; return '<li><a href="#sec-' + s.id + '">' + esc(s.title) + '<b>' + n + '/' + s.items.length + '</b></a></li>'; }).join('') + '<li><a href="#sec-kickoff">Kickoff extras<b>PS</b></a></li></ul></div></div>';
    $('left').innerHTML = left;

    var d = S.dossier, c = d.counts || {};
    var right = '';
    if (d.summary) right += '<div class="card"><div class="card-h">What we know</div><div class="card-b"><p class="summary">' + esc(d.summary) + '</p></div></div>';
    if ((d.openQuestions || []).length) right += '<div class="card"><div class="card-h">Ask next</div><div class="card-b"><ul class="ul">' + d.openQuestions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></div></div>';
    if ((d.risks || []).length) right += '<div class="card"><div class="card-h">Risks the sources show</div><div class="card-b"><ul class="ul">' + d.risks.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></div></div>';
    if ((d.contacts || []).length) right += '<div class="card"><div class="card-h">Contacts on the deal</div><div class="card-b"><ul class="contacts">' + d.contacts.map(function (p) { return '<li><b>' + esc(p.name || p.email) + '</b>' + (p.title ? ', ' + esc(p.title) : '') + '</li>'; }).join('') + '</ul></div></div>';
    right += '<div class="card"><div class="card-h">Sources read</div><div class="card-b"><div class="counts">' +
      [['transcripts', 'call transcripts'], ['emails', 'emails'], ['meetings', 'meetings'], ['notes', 'notes'], ['calls', 'calls'], ['zoom', 'Zoom recordings'], ['starbridge', 'Starbridge']].map(function (p) { return '<span>' + (c[p[0]] || 0) + ' ' + p[1] + '</span>'; }).join('') + '</div>' +
      '<ul class="src-list" style="margin-top:10px">' + (d.sources || []).map(function (s) { return '<li><span class="ref">' + esc(s.ref) + '</span><span>' + (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title) + '</a>' : esc(s.title)) + (s.date ? '<span class="d"> · ' + esc(s.date) + '</span>' : '') + '</span></li>'; }).join('') + '</ul>' +
      (d.aiOk === false ? '<p class="empty" style="margin-top:8px">The AI extraction failed on the last build. Fields show what the rep entered.</p>' : '') + '</div></div>';
    $('right').innerHTML = right;
  }

  function setSaveState() {
    var el = $('save-state');
    if (S.dirty) { el.textContent = 'Unsaved changes'; el.className = 'save-state dirty'; }
    else if (S.savedAt) { el.textContent = 'Saved ' + new Date(S.savedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + (S.savedBy ? ' by ' + S.savedBy : ''); el.className = 'save-state'; }
    else { el.textContent = isDemo ? 'Demo: saves stay in this browser' : 'Not saved yet'; el.className = 'save-state'; }
  }
  function touch(itemId) {
    S.dirty = true; setSaveState();
    if (!isDemo) store.set('ds-intake-draft-' + DEAL, JSON.stringify({ ts: Date.now(), values: S.values, origin: S.origin, confirmed: S.confirmed, notes: S.notes }));
    if (itemId && itemId !== 'kickoff') { var sec = document.getElementById(itemId); if (sec) { var it = null; SPEC.sections.forEach(function (s) { s.items.forEach(function (x) { if (x.id === itemId) it = x; }); }); if (it) sec.querySelector('.fields').innerHTML = it.fields.map(fieldHtml).join(''); } }
    renderSide();
  }

  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (chip) {
      var k = chip.getAttribute('data-k'), o = chip.getAttribute('data-o'), f = FIELDS[k];
      if (f.type === 'multi') { var arr = Array.isArray(S.values[k]) ? S.values[k].slice() : []; var i = arr.indexOf(o); if (i >= 0) arr.splice(i, 1); else arr.push(o); S.values[k] = arr; }
      else S.values[k] = S.values[k] === o ? '' : o;
      S.origin[k] = 'rep';
      if (ITEM_OF[k] === 'kickoff') { chip.parentNode.parentNode.outerHTML = fieldHtml(f); touch(null); } else touch(ITEM_OF[k]);
      return;
    }
    var ai = e.target.closest('[data-ev]');
    if (ai) { var ev = document.getElementById('ev-' + ai.getAttribute('data-ev')); if (ev) ev.classList.toggle('open'); return; }
    var go = e.target.closest('[data-go]');
    if (go) { var tgt = document.getElementById(go.getAttribute('data-go')); if (tgt) tgt.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.matches('input.t[data-k]')) { S.values[t.getAttribute('data-k')] = t.value; S.origin[t.getAttribute('data-k')] = 'rep'; S.dirty = true; setSaveState(); renderSide(); if (!isDemo) store.set('ds-intake-draft-' + DEAL, JSON.stringify({ ts: Date.now(), values: S.values, origin: S.origin, confirmed: S.confirmed, notes: S.notes })); }
    if (t.matches('[data-note]')) { S.notes[t.getAttribute('data-note')] = t.value; S.dirty = true; setSaveState(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('[data-confirm]')) { var id = t.getAttribute('data-confirm'); S.confirmed[id] = t.checked; var sec = document.getElementById(id); sec.classList.toggle('done', t.checked); t.parentNode.classList.toggle('on', t.checked); S.dirty = true; setSaveState(); renderSide(); }
  });

  function answersPayload() { return { values: S.values, origin: S.origin, confirmed: S.confirmed, notes: S.notes, savedAt: new Date().toISOString(), specVersion: SPEC.version }; }
  function save() {
    var a = assessIntake(S.values), who = $('who').value.trim();
    if (!who) { $('who').focus(); toast('Add your name first, so the team knows who saved it.'); return; }
    if (isDemo) { store.set('ds-intake-demo', JSON.stringify(answersPayload())); S.dirty = false; S.savedAt = new Date().toISOString(); S.savedBy = who; setSaveState(); toast('Demo saved in this browser only.'); return; }
    $('b-save').disabled = true; $('b-save').textContent = 'Saving…';
    api('save', { answers: answersPayload(), savedBy: who, quoteReady: a.quoteReady, specialistNeeded: a.specialistNeeded, quoteMissing: a.quoteMissing, flags: a.flags })
      .then(function (r) {
        if (r.ok) { S.dirty = false; S.savedAt = r.saved_at || new Date().toISOString(); S.savedBy = who; store.set('ds-intake-draft-' + DEAL, ''); toast('Saved. Daniel gets a Slack DM in test mode.'); }
        else toast(r.error || 'Save failed.');
      }).catch(function () { toast('Save failed: network error.'); })
      .then(function () { $('b-save').disabled = false; $('b-save').textContent = 'Save'; setSaveState(); });
  }
  $('b-save').addEventListener('click', save);
  document.addEventListener('keydown', function (e) { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } });
  window.addEventListener('beforeunload', function (e) { if (S.dirty && !isDemo) { e.preventDefault(); e.returnValue = ''; } });

  $('b-refresh').addEventListener('click', function () {
    $('b-refresh').disabled = true;
    api('build').then(function (r) { toast(r.ok ? 'Refresh started. Reload in about a minute; your answers are kept.' : (r.error || 'Refresh failed.')); }).catch(function () { toast('Refresh failed.'); }).then(function () { setTimeout(function () { $('b-refresh').disabled = false; }, 4000); });
  });

  $('b-copy').addEventListener('click', function () {
    var a = assessIntake(S.values), d = S.dossier, lines = [];
    lines.push('Sales intake: ' + ((d.institution || {}).name || '') + (d.deal && d.deal.stageLabel ? ' (' + d.deal.stageLabel + ')' : ''));
    lines.push(a.quoteReady ? 'Ready to quote: all five QUOTE items answered.' : 'Not ready to quote. Missing: ' + a.quoteMissing.map(function (q) { return 'item ' + q.slice(1); }).join(', ') + '.');
    lines.push('');
    SPEC.sections.forEach(function (sec) { sec.items.forEach(function (it) {
      var parts = it.fields.filter(function (f) { return hasVal(S.values[f.key]); }).map(function (f) { var v = S.values[f.key]; return f.label + ': ' + (Array.isArray(v) ? v.join(', ') : v); });
      if (parts.length || S.notes[it.id]) lines.push(it.n + '. ' + it.title + (S.confirmed[it.id] ? ' [confirmed]' : '') + '\n   ' + parts.join('; ') + (S.notes[it.id] ? '\n   Notes: ' + S.notes[it.id] : ''));
    }); });
    if (a.flags.length) { lines.push(''); lines.push('Flags:'); a.flags.forEach(function (f) { lines.push('- ' + (f.level === 'specialist' ? '[specialist] ' : '') + f.text); }); }
    var text = lines.join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Recap copied. Paste it into HubSpot or Slack.'); }).catch(function () { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Recap copied.'); } catch (e) { toast('Copy failed.'); } ta.remove(); });
  });

  if (isDemo) {
    banner('info', '<b>Demo.</b> This is fictional data showing what a rep sees. Real intakes open from the Slack message with a link that carries the deal and a private token.');
    var demoSaved = null; try { demoSaved = JSON.parse(store.get('ds-intake-demo') || 'null'); } catch (e) { }
    load({ dossier: DEMO, answers: demoSaved || {} }, true);
  } else if (needsLink) {
    $('d-title').textContent = 'Sales intake';
    $('b-save').disabled = true; $('b-refresh').disabled = true;
    $('app').innerHTML = '<div class="loading">Open this deal once from its Slack message (the link carries a private key). After that, ' + esc(location.host) + '/' + esc(DEAL) + ' opens directly in this browser.</div>';
  } else {
    api('get').then(function (r) {
      if (r.ok) {
        try { localStorage.setItem(tokenKey, TOKEN); } catch (e) { }
        if (location.pathname !== '/' + DEAL || location.search) { try { history.replaceState(null, '', '/' + DEAL); } catch (e) { } }
      }
      if (!r.ok) { try { localStorage.removeItem(tokenKey); } catch (e) { } $('app').innerHTML = '<div class="loading">' + esc(r.error || 'Could not load this intake.') + '</div>'; $('d-title').textContent = 'Sales intake'; $('b-save').disabled = true; $('b-refresh').disabled = true; if (r.inactive) banner('info', 'The n8n workflow <b>Sales Intake API</b> is not active yet.'); return; }
      load(r, false);
    }).catch(function () { $('app').innerHTML = '<div class="loading">Network error. Try again.</div>'; });
  }
})();
