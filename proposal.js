/* Proposal tab: builds the client proposal (degreesight-proposal layout) from the approved pricing, the intake and the
   deal. Every option from the calculator prints, the starred one is marked primary. The MSA (April 2026) is appended
   verbatim; edits are allowed but flag the proposal for legal review. Generating needs approved pricing. */
window.DSProposal = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var money2 = function (n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var money = function (n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); };
  var fmtD = function (iso) { return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };

  var DESC = {
    'Installation': 'One-time implementation and onboarding: policy review workshop, {SIS} equivalency import, sandbox validation, {CRM} integration, single sign-on, and training.',
    'Inbound': 'A {SCHOOL}-branded transcript evaluation engine to help you recruit and enroll more students with prior credit (transfer, AP, CLEP, IB, dual enrollment), including transcript OCR, instant unofficial credit evaluation, and lead delivery into {CRM}.',
    'Insight': 'A {SCHOOL}-branded "what-if" audit engine that helps prospective students determine how their credits fit a given program of study at your institution.',
    'Planner': 'Degree planning for admitted and enrolled students, built on the same equivalency and audit data.',
    'Consultative Services': 'Transfer policy and workflow consulting delivered by the Partner Success team, scoped in the kickoff workshop.',
    'Custom': 'Custom line as agreed with {SCHOOL}.',
    'Custom development': 'Custom development as scoped in the Solutions Engineering review: a rough order of magnitude until the stories and prototype are defined.'
  };
  var NAME = { 'Installation': 'One-Time Implementation', 'Inbound': 'DegreeSight "Inbound" - Annual License', 'Insight': 'DegreeSight "Insight" - Annual License', 'Planner': 'DegreeSight "Planner" - Annual License', 'Consultative Services': 'Consultative Services', 'Custom development': 'Custom Development (scoped by Solutions Engineering)' };

  var host = null, X = null, mounted = false;

  function V() { return host ? host.values() : {}; }
  function D() { return host ? host.dossier() : {}; }
  function PD() { return window.DSCalc ? DSCalc.proposalData() : null; }
  function lines(t) { return String(t || '').split('\n').map(function (s) { return s.replace(/^\s*[-*•]\s*/, '').trim(); }).filter(Boolean); }
  function sisName() { var v = V(); return v.sis_name && v.sis_name !== 'Unknown' ? v.sis_name : 'your SIS'; }
  function crmName() { var v = V(); if (v.crm_name === 'Other' && v.crm_other) return v.crm_other; return v.crm_name && ['Unknown', 'None'].indexOf(v.crm_name) < 0 ? v.crm_name : 'your CRM'; }

  function paras(s) { return String(s || '').split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean); }
  var TRENDS = 'First-time, first-year pipelines are softening nationally; institutions are diversifying enrollment with transfer, online, graduate, and adult learners.\n80% of U.S. colleges cannot tell a student how their credits will transfer before the point of application, yet more than 50% of students will not consider applying without that answer.';
  function defaults() {
    var v = V(), d = D(), pd = PD() || {}, abbr = pd.abbr || ((d.institution || {}).name) || 'your institution', inst = pd.inst || (d.institution || {}).name || '';
    var ch = [];
    if (v.incumbent) ch.push('Current process at ' + abbr + ': ' + v.incumbent.replace(/\.$/, '') + '.');
    if (Array.isArray(v.rules_source) && v.rules_source.length) ch.push('Equivalency rules live in ' + v.rules_source.join(', ').toLowerCase() + ', so every evaluation depends on a few people.');
    ch.push('Prospective transfer students cannot see how their credits apply before they apply, and many never start an application.');
    if (ch.length < 3) ch.push('Transfer credit evaluation is manual and slow, and applicants drop off while they wait.');
    var go = ['Give prospective transfer students a self-service answer to "how will my credits transfer" before they apply.'];
    if (v.live_date || v.live_driver) go.push('Be live for students' + (v.live_date ? ' by ' + fmtD(v.live_date + 'T12:00:00') : '') + (v.live_driver ? ' (' + v.live_driver.replace(/\.$/, '') + ')' : '') + '.');
    go.push('Grow transfer enrollment while keeping faculty governance over equivalency decisions.');
    var signer = v.signer || '';
    var c = (d.contacts || [])[0] || {};
    return {
      challenge: ch.join('\n'), goals: go.join('\n'),
      trends: TRENDS,
      summary: inst + ' wants to grow its transfer student population and give prospective students a fast, responsive answer about their credits. DegreeSight helps institutions convert more of their prospects while reducing the time spent between the Enrollment and Registrar offices.',
      contact: signer || [c.name, c.title].filter(Boolean).join(', ') + (c.email ? ' (' + c.email + ')' : ''),
      address: (d.institution || {}).domain ? (d.institution || {}).domain : ''
    };
  }

  // More than one person on the proposal (e.g. the signer and the primary end user). The first contact stays in "Buyer contact";
  // each extra one has a role label and prints under it in the Buyer panel.
  var ROLES = ['Signer', 'Primary end user', 'Billing', 'Technical contact', 'Other'];
  function contactLine(c) { return [c.name_title, c.email].map(function (x) { return String(x || '').trim(); }).filter(Boolean).join(' (') + (String(c.email || '').trim() && String(c.name_title || '').trim() ? ')' : ''); }
  function extraContactsHtml() {
    return (X.contacts || []).filter(function (c) { return contactLine(c); }).map(function (c) {
      var role = c.role === 'Other' ? (String(c.roleOther || '').trim() || 'Contact') : (c.role || 'Contact');
      return '<div class="xc-line"><span class="ml">' + esc(role) + '</span> ' + esc(contactLine(c)) + '</div>';
    }).join('');
  }
  function contactsEditor() {
    var dc = (D().contacts || []), used = {};
    (X.contacts || []).forEach(function (c) { if (c.email) used[String(c.email).toLowerCase()] = true; });
    var taken = [String(X.text.contact || '')].concat((X.contacts || []).map(function (c) { return String(c.name_title || '') + ' ' + String(c.email || ''); })).join(' | ').toLowerCase();
    var avail = dc.filter(function (c) { var em = String(c.email || '').toLowerCase(), nm = String(c.name || '').trim().toLowerCase(); return !(em && (used[em] || taken.indexOf(em) >= 0)) && !(nm && taken.indexOf(nm) >= 0); });
    var rows = (X.contacts || []).map(function (c, i) {
      return '<div class="xcontact"><div class="xc-h"><select class="t" data-pc="' + i + '.role">' + ROLES.map(function (r) { return '<option' + (c.role === r ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="linkbtn" data-rmcontact="' + i + '" title="Remove this contact">Remove</button></div>' +
        (c.role === 'Other' ? '<label>Label<input class="t" data-pc="' + i + '.roleOther" value="' + esc(c.roleOther || '') + '" placeholder="e.g. Project lead"></label>' : '') +
        '<label>Name and title<input class="t" data-pc="' + i + '.name_title" value="' + esc(c.name_title || '') + '"></label>' +
        '<label>Email<input class="t" data-pc="' + i + '.email" value="' + esc(c.email || '') + '"></label></div>';
    }).join('');
    return rows +
      (avail.length ? '<label>Add from the deal\'s HubSpot contacts<select class="t" id="pr-pickcontact"><option value="">Choose a contact…</option>' + avail.map(function (c) { var k = dc.indexOf(c); return '<option value="' + k + '">' + esc([c.name, c.title].filter(Boolean).join(', ')) + '</option>'; }).join('') + '</select></label>' : '') +
      '<button class="btn" type="button" id="pr-addcontact" style="justify-content:center">+ Add another contact</button>';
  }

  function fresh() { return { v: 1, text: defaults(), ref: '', issuedAt: '', expiresAt: '', generatedBy: '', pricingApprovedAt: '', msaEdited: null, edited: {} }; }

  function msaVerbatim(inst) {
    return MSA_HTML.replace('_____________ ("Client")', esc(inst) + ' ("Client")')
      .replace(/effective as of date of execution/, 'effective as of ' + esc((PD() || {}).effText || 'date of execution'))
      .replace(/<h1 data-part="(\w+)">/g, '<h1 id="msa-part-$1" data-part="$1">');
  }
  function msaModified(inst) { return X.msaEdited != null && stripBilling(X.msaEdited) !== msaVerbatim(inst); }
  // Billing Contacts (proposal skill v2.3): yellow-highlighted block at the end of MSA Section 3 so Accounting can set up invoicing.
  // Only what the rep confirmed is filled in; anything else prints as a blank line for the client to complete at signing.
  function stripBilling(s) { return String(s || '').replace(/<div class="billing"[^>]*>[\s\S]*?<\/div><!--\/billing-->/g, ''); }
  function billingBlock() {
    var b = X.billing || {}, BL = '_______________________________________________';
    var val = function (c, k) { var v = String(((b[c] || {})[k]) || '').trim(); return v ? esc(v) : BL; };
    var hl = function (t) { return '<span class="hl">' + t + '</span>'; };
    var out = '<div class="billing" contenteditable="false"><p>' + hl('<strong>Billing Contacts.</strong> Client designates the following billing contact and alternate billing contact to receive invoices and billing correspondence under this Agreement. Client may update either contact at any time by written notice to Company, including by email.') + '</p>';
    [['primary', 'Billing Contact'], ['alternate', 'Alternate Billing Contact']].forEach(function (p) {
      out += '<p class="bt">' + hl('<strong>' + p[1] + '</strong>') + '</p><p class="bl">' + hl('Name and Title: ' + val(p[0], 'name_title')) + '</p><p class="bl">' + hl('Email: ' + val(p[0], 'email')) + '</p><p class="bl">' + hl('Phone: ' + val(p[0], 'phone')) + '</p>';
    });
    return out + '</div><!--/billing-->';
  }
  function msaWithBilling(html) {
    var s = stripBilling(html), a = 'compounded monthly.</p>', i = s.indexOf(a);
    return i < 0 ? s + billingBlock() : s.slice(0, i + a.length) + billingBlock() + s.slice(i + a.length);
  }

  function gate() {
    var pd = PD();
    if (!pd) return { ok: false, why: 'Pricing has not loaded.' };
    if (pd.status !== 'approved') return { ok: false, why: 'Approve the pricing first (Pricing calculator tab). The proposal prints every option and needs a number that passed the quote gate.' };
    return { ok: true };
  }
  function stale() { var pd = PD(); return !!(X.ref && pd && (pd.status !== 'approved' || pd.approvedAt !== X.pricingApprovedAt)); }

  function nextRef(abbr) {
    var d = new Date(), mmyy = ('0' + (d.getMonth() + 1)).slice(-2) + String(d.getFullYear()).slice(-2);
    var base = 'DS-' + String(abbr || 'SCHOOL').toUpperCase().replace(/[^A-Z0-9]/g, '') + '-' + mmyy;
    var seq = 1;
    if (X.ref && X.ref.indexOf(base) === 0) seq = (parseInt(X.ref.slice(base.length), 10) || 0) + 1;
    return base + ('00' + seq).slice(-3);
  }

  function doc() {
    var pd = PD() || { opts: [], flags: {} }, d = D(), deal = d.deal || {}, t = X.text;
    var inst = pd.inst || (d.institution || {}).name || 'Your institution', abbr = pd.abbr || inst;
    var rep = deal.ownerName || (host ? host.who() : '') || 'DegreeSight', repMail = deal.ownerEmail || '';
    var ref = X.ref || 'DRAFT', issue = X.issuedAt ? fmtD(X.issuedAt) : fmtD(new Date().toISOString()), exp = X.expiresAt ? fmtD(X.expiresAt) : fmtD(new Date(Date.now() + 90 * 86400000).toISOString());
    var f = pd.flags || {};
    var sub = function (s) { return esc(s).replace(/\{SCHOOL\}/g, esc(abbr)).replace(/\{SIS\}/g, esc(sisName())).replace(/\{CRM\}/g, esc(crmName())); };
    var h = '';
    h += '<div class="cover"><div class="logo">Degree<span>Sight</span></div><div class="tagline">Credit Transparency</div><div class="headline">Guarantee transfer <em>success.</em></div><div class="for">A proposal for ' + esc(inst) + '</div><div class="wavec"></div></div>';
    h += '<div class="cover-foot"><span>Prepared by <b>' + esc(rep) + '</b>, DegreeSight</span><span>' + esc(ref) + ' · ' + esc(issue) + '</span></div><div class="body">';
    h += '<div><div class="eb">What We Heard</div><h3>Listening first: your challenge in your words</h3>' +
      '<h4>Challenge</h4><ul class="d">' + lines(t.challenge).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' +
      '<h4>Goals / Objectives</h4><ul class="d">' + lines(t.goals).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' +
      '<h4>National trends</h4><ul class="d">' + lines(t.trends || TRENDS).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>';
    h += '<div><div class="eb">The Impact</div><h3>Credit transparency drives enrollment</h3><div class="pills"><span class="pill">2x More Transfer Leads</span><span class="pill">3x Faster Processing</span><span class="pill">25% Higher Yield</span></div><p>DegreeSight is a Transfer Credit Workflow Engine: a cloud-based enrollment, degree audit, and student success platform designed to help higher education institutions grow enrollment and evaluate and manage transfer credits efficiently.</p></div>';
    // Implementation SLAs (proposal skill v2.3, Drew Melendres, Oct 14 2026): Inbound 60 days from the Engagement Start Date, Insight 120 days from contract signature.
    var hasInsight = (pd.opts || []).some(function (o) { return (o.rows || []).some(function (r) { return r.key === 'Insight'; }); });
    h += '<div><div class="eb">Implementation</div><h3>We do the heavy lifting.</h3><p>Inbound and the equivalency management system typically launch within 60 days of the prescribed Engagement Start Date, depending on your team availability and data readiness.</p>' +
      (hasInsight ? '<p>Insight is generally live within 120 days of contract signature, depending on your team availability and data readiness.</p>' : '<p><b>Scope note.</b> This engagement is scoped to Inbound. Insight is not included in the current agreement. It can be added later under a separate schedule.</p>') +
      '<p class="rmnote">Timelines are typical and adjust to each institution&#39;s data readiness and team availability. Custom development needs may further extend timelines depending on scope.</p>' +
      (pd.scope === 'custom' ? '<p><b>Scope note.</b> Custom development is scoped by our Solutions Engineering team and priced as a rough order of magnitude until the stories and prototype are defined.</p>' : '') + '</div>';
    h += '<div><div class="eb">Executive Summary</div><h3>Growing transfer at ' + esc(inst) + '</h3>' + (paras(t.summary).length > 1 ? paras(t.summary).map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') : '<p>' + esc(t.summary) + '</p><p>DegreeSight will empower ' + esc(inst) + ' with a ' + esc(abbr) + '-branded transcript evaluation engine integrated with ' + esc(sisName()) + (crmName() !== 'your CRM' ? ' and ' + esc(crmName()) : '') + ', so students receive an instant unofficial evaluation and your team receives the lead.</p>') + '</div>';
    h += '<div class="quote"><div><div class="eb">The Investment</div><h3>Quote</h3><div class="cards"><div class="card"><div class="ml">Quote ref.</div><div class="mv">' + esc(ref) + '</div></div><div class="card"><div class="ml">Issue date</div><div class="mv">' + esc(issue) + '</div></div><div class="card"><div class="ml">Expires</div><div class="mv">' + esc(exp) + '</div></div><div class="card"><div class="ml">Currency</div><div class="mv">USD</div></div></div>' +
      '<div class="cards two" style="margin-top:8px"><div class="card"><div class="ml">Seller</div><div class="pn">DegreeSight</div>1401 Lavaca St, Unit 41477<br>Austin, TX 78701, US<div class="ml" style="margin-top:6px">Contact</div>' + esc(rep) + (repMail ? ' (' + esc(repMail) + ')' : '') + '</div>' +
      '<div class="card"><div class="ml">Buyer</div><div class="pn">' + esc(inst) + '</div>' + lines(t.address).map(esc).join('<br>') + '<div class="ml" style="margin-top:6px">Contact</div>' + esc(t.contact || '') + extraContactsHtml() + '</div></div></div>';
    var showDisc = !!f.disc, cols = showDisc ? 4 : 2;
    pd.opts.forEach(function (o, oi) {
      // The first option closes the .quote block (it stays on the quote page with its totals); each later option is its own unbreakable block.
      h += '<div class="' + (oi ? 'quote-opt' : '') + '"><div class="option-head"><h3 style="margin:0">' + esc(o.name) + '</h3>' + (o.primary && pd.opts.length > 1 ? '<span class="primary">Primary option</span>' : '') + '</div>' +
        '<div class="cards three" style="margin:10px 0"><div class="card"><div class="ml">Effective date</div><div class="mv">' + esc(pd.effText === 'date of execution' ? 'Date of execution' : pd.effText) + '</div></div><div class="card"><div class="ml">Term length</div><div class="mv">' + o.years + ' year' + (o.years > 1 ? 's' : '') + '</div></div>' +
        (o.term > 12 ? '<div class="card"><div class="ml">Multi-year</div><span class="mybadge"><span class="coin">$</span>Multi-year pricing, locked for the term</span></div>' : '<div class="card"><div class="ml">Protected pricing</div><div class="mv">' + (o.prot ? 'Yes' : 'No') + '</div></div>') + '</div>';
      h += '<table class="prod"><colgroup>' + (showDisc ? '<col style="width:46%"><col style="width:18%"><col style="width:18%"><col style="width:18%">' : '<col style="width:72%"><col style="width:28%">') + '</colgroup><thead><tr><th>Products and Pricing</th>' + (showDisc ? '<th class="n">Market rate</th><th class="n">Your savings</th><th class="n">Your rate</th>' : '<th class="n">Price</th>') + '</tr></thead>';
      var lastGrp = null, rows = o.rows;
      // By default the school sees one implementation fee; the breakdown stays internal unless the rep itemizes it.
      var one = rows.filter(function (r) { return r.oneTime; });
      if (!f.itemize && one.length > 1) {
        var q = 0, rt = 0, list = 0, reasons = [];
        one.forEach(function (r) { q += r.q; rt += r.rt; list += r.conc >= 100 ? r.rt : (r.conc ? r.q / (1 - r.conc / 100) : r.q); if (r.reason && reasons.indexOf(r.reason) < 0) reasons.push(r.reason); });
        var conc = list > 0 && list - q > 0.5 ? Math.round((1 - q / list) * 10000) / 100 : 0;
        rows = rows.filter(function (r) { return !r.oneTime; }).concat([{ key: 'Installation', label: 'One-Time Implementation', rt: rt, q: q, conc: conc, reason: reasons.join('; '), oneTime: true }]);
      }
      rows.forEach(function (r) {
        var grp = r.oneTime ? 'Implementation and development (one-time)' : 'Products (annual licenses)';
        if (grp !== lastGrp && rows.some(function (x) { return !!x.oneTime !== !!r.oneTime; })) h += '<tbody><tr class="grp"><td colspan="' + cols + '">' + grp + '</td></tr></tbody>';
        lastGrp = grp;
        var name = r.key === 'Custom' ? (o.customName || 'Custom') : (NAME[r.key] || r.label), per = r.oneTime ? '' : ' / year';
        // v2.3 one-page quote: the price cell carries only "N% off"; the reason goes on the billing line so the row stays short.
        // With the discount columns shown, "Your savings" already carries it, so the percentage moves to the billing line too.
        var tag = r.conc && !showDisc ? ' <span class="conc">' + r.conc + '% off</span>' : '';
        var why = r.conc ? ' · Concession: ' + (showDisc ? r.conc + '% off' + (r.reason ? ', ' : '') : '') + esc(r.reason || '') : '';
        if (r.conc && !showDisc && !r.reason) why = '';
        h += '<tbody><tr><td class="nm">' + esc(name) + '</td>' + (showDisc ? '<td class="n">' + money2(r.rt) + per + '</td><td class="n">' + (r.rt - r.q > 0.5 ? money2(r.rt - r.q) + per : '&mdash;') + '</td><td class="n">' + money2(r.q) + per + tag + '</td>' : '<td class="n">' + money2(r.q) + per + tag + '</td>') + '</tr>' +
          '<tr class="desc"><td colspan="' + cols + '">' + sub(DESC[r.key] || '') + '</td></tr><tr class="bill"><td colspan="' + cols + '">Billing summary: ' + (r.oneTime ? 'Starts on effective date' : 'Starts on effective date, billed annually for ' + o.years + ' year' + (o.years > 1 ? 's' : '') + (o.varies ? '; the price changes by year (see the schedule below)' : '')) + why + '</td></tr></tbody>';
      });
      h += '</table><div class="stats"><div class="stat"><div class="n">' + money(o.annual + o.oneTime) + '</div><div class="l">Year one total</div></div>' +
        (o.years > 1 && o.varies ? '<div class="stat"><div class="n">' + money(o.byYear[1]) + '</div><div class="l">Year two' + (o.years > 2 ? ' (schedule below)' : '') + '</div></div>' : o.years > 1 ? '<div class="stat"><div class="n">' + money(o.annual) + '</div><div class="l">Per year, years two' + (o.years > 2 ? ' to ' + o.years : '') + '</div></div>' : '<div class="stat"><div class="n">' + money(o.annual) + '</div><div class="l">Annual license total</div></div>') +
        (f.tcv ? '<div class="stat"><div class="n">' + money(o.tcv) + '</div><div class="l">' + o.years + '-year total cost of ownership</div></div>' : '<div class="stat"><div class="n">Net 30</div><div class="l">Payment terms</div></div>') + '</div>';
      if (o.varies && o.byYear && o.byYear.length > 1) h += '<table class="prod yrsched"><thead><tr><th>Annual investment by year</th><th class="r">Licenses</th><th class="r">One-time</th><th class="r">Total</th></tr></thead><tbody>' + o.byYear.map(function (v, k) { return '<tr><td>Year ' + (k + 1) + '</td><td class="r">' + money(v) + '</td><td class="r">' + (k ? '' : money(o.oneTime)) + '</td><td class="r">' + money(v + (k ? 0 : o.oneTime)) + '</td></tr>'; }).join('') + '</tbody></table>';
      if (showDisc && o.retailAnnual - o.annual > 0.5) h += '<p style="margin-top:8px"><b>Total savings:</b> ' + money2((o.retailAnnual - o.annual) * o.years) + ' over the term.</p>';
      h += '</div>';
      if (!oi) h += '</div>';
    });
    if (pd.note) h += '<div><div class="eb">Pricing note</div><p>' + esc(pd.note) + '</p></div>';
    h += '<div><div class="eb">Terms</div>';
    if (f.lock) h += '<h4>Lifetime Pricing Guarantee</h4><p>Client is guaranteed the quoted price for the entire life of the partnership so long as there is no break in service. This contract does NOT auto-renew after the initial term, and it is incumbent upon client and DegreeSight to agree to any future terms.</p>';
    if (f.roi) h += '<h4>Performance Out and Guaranteed ROI</h4><p>After a full academic year of utilizing DegreeSight, if the net tuition revenue generated as a direct outcome of these solutions does not at least equal the annual contract price, the client is entitled to terminate the agreement without penalty. Both parties agree to meet in October of each calendar year to review the ROI.</p>';
    h += '<h4>Payments</h4><p>Invoices are due within 30 days of notice. Client will incur a one percent (1%) increase in invoice for every 30 days beyond the first 60 days.</p><div>' + ['ACH (direct debit)'].concat(f.check ? ['Check'] : []).map(function (p) { return '<span class="chipp">' + esc(p) + '</span>'; }).join('') + '</div></div>';
    if (f.msa) {
      h += '<div id="msa-sec"><div class="eb">The Agreement</div><h3>Master Services Agreement</h3>' +
        '<div class="msa-bar no-print"><button type="button" class="btn" id="msa-edit">Edit agreement text</button><button type="button" class="btn" id="msa-reset">Reset to verbatim (' + esc(MSA_VERSION) + ')</button><span id="msa-status">' + (msaModified(inst) ? '<span class="mod">Modified from the ' + esc(MSA_VERSION) + ' text. Legal review required before sending.</span>' : '<span class="ok">Verbatim ' + esc(MSA_VERSION) + ' text, only the client name, effective date and billing contacts filled in.</span>') + '</span></div>' +
        '<div class="msa-toc no-print"><a href="#msa-part-msa">Master Services Agreement</a><a href="#msa-part-dpe">Data Processing Exhibit</a><a href="#msa-part-ferpa">FERPA Addendum</a></div>' +
        '<div class="legal" id="msa-body">' + msaWithBilling(X.msaEdited != null ? X.msaEdited : msaVerbatim(inst)) + '</div></div>';
    }
    h += '<div><div class="eb">Signature</div><h3>Acceptance</h3><p>By signing below, the undersigned acknowledges that they have read and agree to the terms and conditions of this proposal and the appended agreement, and represents that they are duly authorized to execute it on behalf of ' + esc(inst) + '.</p><div class="sig"><div class="sigline">Signature</div><div class="sigline">Printed name</div><div class="sigline">Title</div><div class="sigline">Date</div></div></div>';
    h += '<div class="foot"><span><b>' + esc(rep) + '</b> · DegreeSight' + (repMail ? ' · ' + esc(repMail) : '') + '</span><span>' + esc(ref) + ' · valid through ' + esc(exp) + '</span></div></div>';
    return h;
  }

  function render() {
    if (!mounted || !X) return;
    var box = $('proposal'); if (!box || box.hidden) return;
    var g = gate(), pd = PD() || {}, inst = pd.inst || (D().institution || {}).name || '';
    var st = X.ref ? (stale() ? 'stale' : 'ok') : 'none';
    var side = '<aside class="left prop-side no-print">' + checklist(st) +
      '<div class="card gate ' + (st === 'ok' ? 'ready' : 'hold') + '"><div class="gate-top"><div><div class="lbl">' + (st === 'ok' ? 'Proposal ' + esc(X.ref) : st === 'stale' ? 'Pricing changed since ' + esc(X.ref) : g.ok ? 'Ready to generate' : 'Draft preview') + '</div><div class="sub">' +
      (st !== 'none' ? 'Generated ' + fmtD(X.issuedAt) + ' by ' + esc(X.generatedBy) + ' · valid through ' + fmtD(X.expiresAt) : esc(g.ok ? 'Pricing approved by ' + pd.approvedBy : g.why)) + '</div></div></div>' +
      '<div class="card-b" style="display:grid;gap:8px"><button class="btn primary" type="button" id="pr-gen"' + (g.ok ? '' : ' disabled') + ' style="justify-content:center">' + (X.ref ? 'Regenerate (new ref) and save' : 'Generate proposal and save') + '</button>' +
      '<button class="btn" type="button" id="pr-print" style="justify-content:center">Print or save as PDF</button>' +
      (X.ref && msaModified(inst) ? '<p class="hint" style="margin:0;color:var(--amber)">The MSA text was edited: legal review before sending.</p>' : '') +
      '<p class="hint" style="margin:0">Generating stamps the quote ref, issue date and a 90-day expiry, saves it, and writes the ref and dates to the deal and company card. Proof it below; marking it reviewed attaches the PDF to the HubSpot deal. All ' + (pd.opts || []).length + ' options print; the starred one is primary.</p></div></div>' +
      reviewCard(st) +
      '<div class="card" id="pr-heard"><div class="card-h">What we heard</div><div class="card-b prop-edit">' +
      '<button class="btn primary" type="button" id="pr-ai" style="justify-content:center"' + (drafting ? ' disabled' : '') + '>' + (drafting ? 'Drafting from the calls, emails and notes…' : '&#10022; Draft with AI') + '</button>' +
      '<p class="hint" style="margin:0">Writes the challenges, goals, national trends and a two-paragraph summary from this deal\'s calls, emails, notes and the Discovery brief. It only uses what the school said; edit anything before it goes out.</p>' +
      '<label>Challenge (one bullet per line)<textarea class="t big" data-pt="challenge">' + esc(X.text.challenge) + '</textarea></label>' +
      '<label>Goals / objectives (one per line)<textarea class="t big" data-pt="goals">' + esc(X.text.goals) + '</textarea></label>' +
      '<label>National trends (one per line)<textarea class="t" data-pt="trends">' + esc(X.text.trends || TRENDS) + '</textarea></label>' +
      '<label>Executive summary (a blank line between paragraphs)<textarea class="t big" data-pt="summary">' + esc(X.text.summary) + '</textarea></label>' +
      '<label>Buyer contact<input class="t" data-pt="contact" value="' + esc(X.text.contact) + '"></label>' +
      contactsEditor() +
      '<label>Buyer address (one line per row)<textarea class="t" data-pt="address" style="min-height:60px">' + esc(X.text.address) + '</textarea></label>' +
      '<button class="btn" type="button" id="pr-reset" style="justify-content:center">Refill from the intake</button>' +
      '<p class="hint" style="margin:0">Prefilled from the intake (items 9, 11, 13, 14) and the deal contacts. Edit the words before it goes out; they are saved with the intake.</p></div></div>' +
      '<div class="card" id="pr-billing"><div class="card-h">Billing contacts</div><div class="card-b prop-edit">' +
      [['primary', 'Billing contact'], ['alternate', 'Alternate billing contact']].map(function (p) {
        var b = (X.billing || {})[p[0]] || {};
        return '<div class="lbl" style="margin-top:2px">' + p[1] + '</div>' +
          '<label>Name and title<input class="t" data-pb="' + p[0] + '.name_title" value="' + esc(b.name_title || '') + '"></label>' +
          '<label>Email<input class="t" data-pb="' + p[0] + '.email" value="' + esc(b.email || '') + '"></label>' +
          '<label>Phone<input class="t" data-pb="' + p[0] + '.phone" value="' + esc(b.phone || '') + '"></label>';
      }).join('') +
      '<p class="hint" style="margin:0">Goes in the MSA (end of Section 3, highlighted) so Accounting can set up invoicing. Fill only what the school confirmed (bursar, AP, business office); anything blank prints as a fill-in line for them to complete at signing.</p></div></div>' +
      '<p class="hint no-print">Pricing, terms and the effective date come from the Pricing calculator tab.</p></aside>';
    box.innerHTML = '<div class="calc-wrap prop-wrap">' + side + '<main class="calc-main"><div class="doc' + (X.ref && !stale() ? '' : ' draft') + '" id="proposal-doc">' + doc() + '</div></main></div>';
    wireMsa(inst);
  }

  function wireMsa(inst) {
    var body = $('msa-body'), edit = $('msa-edit'), reset = $('msa-reset');
    if (!body) return;
    edit.addEventListener('click', function () {
      var on = body.getAttribute('contenteditable') === 'true';
      body.setAttribute('contenteditable', on ? 'false' : 'true'); edit.classList.toggle('on', !on); edit.textContent = on ? 'Edit agreement text' : 'Done editing';
      if (on) render(); else body.focus();
    });
    body.addEventListener('input', function () { X.msaEdited = stripBilling(body.innerHTML); if (host) host.dirty(); });
    reset.addEventListener('click', function () { X.msaEdited = null; if (host) host.dirty(); render(); });
  }

  // ---- Before you send: everything the proposal needs, in order, each one a click away from where it is fixed.
  function filled(k) { return String((X.text || {})[k] || '').trim().length > 0; }
  function reviewed() { return !!(X.review && X.review.ref === X.ref && X.review.at); }
  function attached() { return !!(X.attach && X.attach.ref === X.ref && X.attach.fileId); }
  function checklist(st) {
    var pd = PD() || {}, b = (X.billing || {}).primary || {};
    var items = [
      [pd.status === 'approved', 'Pricing approved', 'go-pricing'],
      [filled('challenge') && filled('goals') && filled('summary'), 'What we heard: challenge, goals and summary', 'go-heard'],
      [filled('contact'), 'Buyer contact', 'go-heard'],
      [!!(b.name_title || b.email) || 'opt', 'Billing contact (or leave blank for the school to fill in)', 'go-billing'],
      [st === 'ok', st === 'stale' ? 'Proposal out of date: regenerate it' : 'Proposal generated', 'go-gen'],
      [st === 'ok' && reviewed(), 'Proofread and marked reviewed', 'go-review'],
      [st === 'ok' && attached(), 'PDF attached to the HubSpot deal', 'go-review']
    ];
    var done = items.filter(function (i) { return i[0] === true; }).length;
    return '<div class="card pr-check"><div class="card-h">Before you send <span class="pr-count">' + done + ' of ' + items.length + '</span></div><div class="card-b"><ul class="qlist">' +
      items.map(function (i) { var ok = i[0] === true, opt = i[0] === 'opt'; return '<li class="' + (ok ? '' : opt ? 'opt' : 'no') + '"><span class="qdot ' + (ok ? 'ok' : opt ? 'opt' : 'no') + '">' + (ok ? '&#10003;' : '!') + '</span><span>' + (ok ? esc(i[1]) : '<a href="#" data-go="' + i[2] + '">' + esc(i[1]) + '</a>') + '</span></li>'; }).join('') +
      '</ul></div></div>';
  }
  // ---- Proof before sending: the rep confirms the facts that most often go wrong, then the PDF goes to HubSpot.
  var RV = [['school', 'School name, contact and address are right'], ['price', 'Prices, discounts and terms match what we agreed'], ['options', 'The right options are in, and the starred one is primary'], ['dates', 'Effective date, issue date and expiry are right'], ['words', 'What we heard and the summary read well for this school'], ['billing', 'Billing contacts are filled in, or left blank on purpose']];
  function reviewCard(st) {
    if (st !== 'ok') return '';
    var r = X.review && X.review.ref === X.ref ? X.review : { checks: {} }, c = r.checks || {};
    if (reviewed()) return '<div class="card" id="pr-review"><div class="card-h">Proof before sending</div><div class="card-b"><p class="hint attach-st ok" style="margin:0">&#10003; Reviewed by ' + esc(r.by || '') + ' ' + fmtD(r.at) + '. Read the PDF once more before it goes to the school.</p>' + attachLine(st) +
      '<button class="btn" type="button" id="pr-unreview" style="justify-content:center;margin-top:8px">Undo reviewed</button></div></div>';
    var all = RV.every(function (x) { return c[x[0]]; });
    return '<div class="card" id="pr-review"><div class="card-h">Proof before sending</div><div class="card-b prop-review">' +
      '<p class="hint" style="margin:0 0 6px">Read the document on the right, top to bottom, then tick each line.</p>' +
      RV.map(function (x) { return '<label class="rv"><input type="checkbox" data-rv="' + x[0] + '"' + (c[x[0]] ? ' checked' : '') + '> ' + esc(x[1]) + '</label>'; }).join('') +
      '<button class="btn primary" type="button" id="pr-reviewed"' + (all ? '' : ' disabled') + ' style="justify-content:center;margin-top:8px">Reviewed: attach the PDF to HubSpot</button>' +
      '<button class="btn" type="button" id="pr-askreview" style="justify-content:center;margin-top:6px">Ask Daniel to review it</button>' +
      (r.asked && r.asked.ref === X.ref ? '<p class="hint" style="margin:6px 0 0">Review requested ' + fmtD(r.asked.at) + '.</p>' : '') +
      '</div></div>';
  }

  // Where the PDF stands in HubSpot for the current proposal ref.
  function attachLine(st) {
    if (st !== 'ok' || !reviewed()) return '';
    var a = X.attach || {};
    if (attaching) return '<p class="hint attach-st" style="margin:0">Creating the PDF and attaching it to the HubSpot deal…</p>';
    if (a.ref === X.ref && a.fileId) return '<p class="hint attach-st ok" style="margin:0">&#10003; PDF attached to the HubSpot deal ' + fmtD(a.at) + (a.by ? ' by ' + esc(a.by) : '') + ' (in a note, and in Files under Sales Intake Proposals).</p><button class="btn" type="button" id="pr-attach" style="justify-content:center">Attach the PDF again</button>';
    return (a.ref === X.ref && a.error ? '<p class="hint attach-st no" style="margin:0">The PDF was not attached: ' + esc(a.error) + '</p>' : '') + '<button class="btn" type="button" id="pr-attach" style="justify-content:center">Attach PDF to the HubSpot deal</button>';
  }
  var attaching = false, drafting = false;
  function attach(then) {
    var pd = PD() || {}, dd = $('proposal-doc'); if (!dd || !X.ref || !host || !host.attachPdf) { if (then) then(); return; }
    attaching = true; render();
    var who = host.who ? host.who() : '';
    host.attachPdf({ html: $('proposal-doc').outerHTML, ref: X.ref, filename: 'DegreeSight Proposal ' + (pd.inst || '') + ' ' + X.ref, attachedBy: who }).then(function (r) {
      attaching = false;
      X.attach = r && r.ok ? { ref: X.ref, fileId: r.fileId, noteId: r.noteId, at: r.attachedAt || new Date().toISOString(), by: who } : { ref: X.ref, error: (r && r.error) || 'Unknown error' };
      if (host.toast) host.toast(r && r.ok ? 'Proposal PDF attached to the HubSpot deal.' : 'Proposal saved, but the PDF was not attached: ' + X.attach.error);
      if (host) host.dirty();
      render();
      if (then) then();
    });
  }

  function onInput(e) {
    var t = e.target;
    if (t.id === 'pr-pickcontact') {
      var dc = (D().contacts || [])[parseInt(t.value, 10)]; if (!dc) return;
      X.contacts = X.contacts || []; X.contacts.push({ role: X.contacts.some(function (c) { return c.role === 'Signer'; }) ? 'Primary end user' : 'Signer', name_title: [dc.name, dc.title].filter(Boolean).join(', '), email: dc.email || '' });
      if (host) host.dirty(); render(); return;
    }
    if (t.matches('[data-pc]')) {
      var pc = t.getAttribute('data-pc').split('.'), ci = parseInt(pc[0], 10); X.contacts = X.contacts || []; if (!X.contacts[ci]) return;
      X.contacts[ci][pc[1]] = t.value; if (host) host.dirty();
      if (pc[1] === 'role') { render(); return; }
      var dd2 = $('proposal-doc'); if (dd2) { dd2.innerHTML = doc(); wireMsa((PD() || {}).inst || ''); } return;
    }
    if (t.matches('[data-rv]')) { if (!X.review || X.review.ref !== X.ref) X.review = { ref: X.ref, checks: {} }; X.review.checks = X.review.checks || {}; X.review.checks[t.getAttribute('data-rv')] = t.checked; if (host) host.dirty(); var rb = $('pr-reviewed'); if (rb) rb.disabled = !RV.every(function (x) { return X.review.checks[x[0]]; }); return; }
    if (t.matches('[data-pb]')) { var pk = t.getAttribute('data-pb').split('.'); X.billing = X.billing || {}; X.billing[pk[0]] = X.billing[pk[0]] || {}; X.billing[pk[0]][pk[1]] = t.value; if (host) host.dirty(); var db = $('proposal-doc'); if (db) { db.innerHTML = doc(); wireMsa((PD() || {}).inst || ''); } return; }
    if (t.matches('[data-pt]')) { X.text[t.getAttribute('data-pt')] = t.value; X.edited[t.getAttribute('data-pt')] = true; if (host) host.dirty(); var dd = $('proposal-doc'); if (dd) { dd.innerHTML = doc(); wireMsa((PD() || {}).inst || ''); } }
  }
  function onClick(e) {
    var t = e.target;
    if (t.id === 'pr-print') { document.body.classList.add('print-proposal'); window.print(); setTimeout(function () { document.body.classList.remove('print-proposal'); }, 500); return; }
    var go = t.closest ? t.closest('[data-go]') : null;
    if (go) { e.preventDefault(); var g = go.getAttribute('data-go'); if (g === 'go-pricing') { if (host && host.go) host.go('pricing', 'p-approve'); return; } var target = { 'go-heard': 'pr-heard', 'go-billing': 'pr-billing', 'go-gen': 'pr-gen', 'go-review': 'pr-review' }[g]; var el = target && $(target); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 1600); } return; }
    if (t.id === 'pr-reviewed') { var who = host ? host.who() : ''; if (!who) { if (host) host.needWho(); return; } X.review = Object.assign({}, X.review || {}, { ref: X.ref, by: who, at: new Date().toISOString() }); render(); attach(function () { if (host) host.save(); }); return; }
    if (t.id === 'pr-unreview') { if (X.review) { X.review.at = ''; X.review.by = ''; } if (host) host.dirty(); render(); return; }
    if (t.id === 'pr-askreview') { var who2 = host ? host.who() : ''; if (!who2) { if (host) host.needWho(); return; } if (!host || !host.askReview) return; t.disabled = true; t.textContent = 'Sending…'; host.askReview({ ref: X.ref, by: who2 }).then(function (r) { if (r && r.ok) { X.review = Object.assign({ ref: X.ref, checks: {} }, X.review || {}); X.review.asked = { ref: X.ref, at: new Date().toISOString(), by: who2 }; if (host) { host.dirty(); host.toast('Daniel got a Slack message with the link to this proposal.'); } } else if (host) host.toast((r && r.error) || 'Could not send the review request.'); render(); }); return; }
    if (t.id === 'pr-addcontact') { X.contacts = X.contacts || []; X.contacts.push({ role: X.contacts.some(function (c) { return c.role === 'Signer'; }) ? 'Primary end user' : 'Signer', name_title: '', email: '' }); if (host) host.dirty(); render(); return; }
    if (t.getAttribute && t.getAttribute('data-rmcontact') != null) { X.contacts.splice(parseInt(t.getAttribute('data-rmcontact'), 10), 1); if (host) host.dirty(); render(); return; }
    if (t.id === 'pr-ai') {
      if (drafting || !host || !host.draftHeard) return;
      var hasText = ['challenge', 'goals', 'summary'].some(function (k) { return X.edited[k]; });
      if (hasText && !window.confirm('Replace the challenge, goals, trends and summary with an AI draft? Your edits to these fields will be overwritten.')) return;
      drafting = true; render();
      host.draftHeard().then(function (r) {
        drafting = false;
        if (r && r.ok) {
          X.text.challenge = (r.challenge || []).join('\n'); X.text.goals = (r.goals || []).join('\n');
          if ((r.trends || []).length) X.text.trends = r.trends.join('\n');
          X.text.summary = (r.exec_summary || []).join('\n\n');
          ['challenge', 'goals', 'trends', 'summary'].forEach(function (k) { X.edited[k] = true; });
          X.aiDraftAt = new Date().toISOString();
          if (host) { host.dirty(); host.toast('Draft ready. Read it and edit anything before it goes out.'); }
        } else if (host) host.toast((r && r.error) || 'The AI draft did not work. Try again.');
        render();
      });
      return;
    }
    if (t.id === 'pr-attach') { if (attaching) return; attach(function () { if (host) host.save(); }); return; }
    if (t.id === 'pr-reset') { X.text = defaults(); X.edited = {}; if (host) host.dirty(); render(); return; }
    if (t.id === 'pr-gen') {
      if (!gate().ok) return;
      var who = host ? host.who() : '';
      if (!who) { if (host) host.needWho(); return; }
      var pd = PD();
      X.ref = nextRef(pd.abbr || pd.inst); X.issuedAt = new Date().toISOString(); X.expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
      X.generatedBy = who; X.pricingApprovedAt = pd.approvedAt;
      if (host) { host.dirty(); host.save(); }
      render();
      return;
    }
  }

  return {
    mount: function (h) { host = h; mounted = true; var box = $('proposal'); box.addEventListener('input', onInput); box.addEventListener('click', onClick); },
    load: function (saved) {
      X = saved && saved.v ? saved : fresh();
      if (!X.edited) X.edited = {};
      var d = defaults(); Object.keys(d).forEach(function (k) { if (!X.edited[k] && !X.ref) X.text[k] = d[k]; });
      render();
    },
    refreshDefaults: function () { if (!X || X.ref) return; var d = defaults(); Object.keys(d).forEach(function (k) { if (!X.edited[k]) X.text[k] = d[k]; }); },
    state: function () { return X; },
    status: function () { if (!X) return {}; var g = !!X.ref; return { generated: g, stale: g && stale(), reviewed: g && !stale() && reviewed(), attached: g && !stale() && attached(), ref: X.ref }; },
    summary: function () { if (!X || !X.ref) return null; var inst = (PD() || {}).inst || ''; return { ref: X.ref, issuedAt: X.issuedAt, expiresAt: X.expiresAt, generatedBy: X.generatedBy, stale: stale(), msaModified: msaModified(inst) }; },
    render: function () { if (X && !X.ref) this.refreshDefaults(); render(); }
  };
})();
