// Shared rules from "The Sales Checklist: Before You Quote" v2.1 (install-base table and QUOTE items).
// Used verbatim by the n8n dossier workflow and by the Vercel intake page.
function assessIntake(v, today) {
  v = v || {};
  var flags = [];
  var known = function (x) { return x !== undefined && x !== null && x !== '' && x !== 'Unknown' && !(Array.isArray(x) && !x.length); };
  var want = function (k) { return v[k] === 'Wanted' || v[k] === 'Required for go-live'; };
  var push = function (level, item, text) { flags.push({ level: level, item: item, text: text }); };
  var pushWanted = want('wb_coursework') || want('wb_rules');
  var pushGate = v.wb_coursework === 'Required for go-live' || v.wb_rules === 'Required for go-live' || v.golive_gate === 'Wait for the integration';
  var anyWb = want('wb_coursework') || want('wb_rules') || want('wb_transcripts_in') || want('wb_leads');
  var sis = v.sis_name, host = v.sis_hosting;

  if (sis === 'Colleague' && host === 'Ellucian SaaS') {
    if (pushWanted) push('specialist', 5, 'Colleague SaaS with write-back expected: the coursework push is not supported (SaaS blocks it) and the equivalency push by API is thin.');
  } else if (sis === 'Colleague') {
    if (pushGate) push('specialist', 5, 'Colleague push expected on a date: it works at 5 partners, but every setup has had a grade-scheme or permissions snag (GMU took 3 months).');
  } else if (sis === 'Banner') {
    if (pushWanted) push('specialist', 5, 'Banner coursework or rule push: QA only so far (first production push planned at Scranton). Files in are routine.');
  } else if (sis === 'PeopleSoft') {
    if (pushWanted) push('specialist', 5, 'PeopleSoft push: DS_API built, not installed anywhere yet. Files in are fine.');
  } else if (sis === 'Workday Student') {
    push('specialist', 5, 'Workday Student: only an equivalency pull exists; pushes are custom work priced from Banner hours.');
  } else if (sis === 'Jenzabar J1') {
    if (v.wb_coursework === 'Required for go-live' || (pushWanted && v.golive_gate === 'Wait for the integration')) push('specialist', 5, 'Jenzabar J1 SFTP coursework push as a go-live condition: Geneva erroring, Point Park and Menlo scoped.');
  } else if (sis === 'Jenzabar CX' || sis === 'SAP' || sis === 'Homegrown or other') {
    push('specialist', 5, sis + ': thin or unfamiliar stack. Bring an implementation specialist to the next call.');
  } else if (sis === 'Anthology / CampusNexus / CampusVue') {
    push('specialist', 5, 'Anthology / CampusNexus: portal only; any integration is a new adapter that touches core code (usually a no).');
  } else if (sis === 'Ellucian PowerCampus') {
    if (anyWb) push('specialist', 5, 'PowerCampus with integration expected: portal only today.');
  }
  if (v.sis_migration === 'Yes') push('warn', 5, 'SIS migration or sunset inside 18 months: the integration gets built twice.');
  if (v.audit_engine === 'uAchieve / DARS' || v.audit_engine === 'Stellic') push('specialist', 5, v.audit_engine + ': no live partner. Specialist needed for Insight.');

  var crmSpecialist = ['Salesforce Education Cloud', 'TargetX', 'Element 451', 'HubSpot', 'Ellucian Recruit', 'Radius', 'EAB Navigate'];
  if (crmSpecialist.indexOf(v.crm_name) >= 0) push('specialist', 6, v.crm_name + ': install base of zero or one. Bring a specialist.');
  if (v.crm_name === 'Slate' && v.wb_transcripts_in === 'Required for go-live') push('specialist', 6, 'Slate with official transcripts in as a go-live condition: done once (Scranton), being set up at GMU and St. John’s.');

  if (v.wb_mode === 'Update existing') push('specialist', 7, 'Update-existing write-back: we only do reads plus create-only pushes today.');
  if (v.wb_imaging === 'Yes (separate project)') push('specialist', 7, 'Documents into an imaging system is a separate project (Bellevue, Schoolcraft).');
  if (v.hs_beyond_printed === 'Yes') push('specialist', 2, 'High school needs beyond GPA as printed (recalculated GPA, custom fields, HS push) are not built.');
  if (Array.isArray(v.feeder_states) && v.feeder_states.length) {
    push('specialist', 10, 'District feeders in ' + v.feeder_states.join(', ') + ': new districts need DataOps and have open bugs.');
    if (v.feeder_samples !== 'Yes') push('warn', 10, 'Get three real feeder transcript samples over SFTP before contract.');
  }
  if (v.pop_diff_rules === 'Yes') push('warn', 1, 'Different rules by population: a second portal, a second price, and 3 months becomes 6 to 9.');
  if (v.pop_same_systems === 'No') push('warn', 1, 'Populations on different systems (two CRMs forced two portals at JWU).');
  if (v.military === 'Read the JST (roadmap)') push('warn', 3, 'Reading the JST is roadmap: label it, no date, no price.');
  if (v.rules_exportable === 'No, they must be built') push('warn', 9, 'No exportable rules: rule-building goes on the timeline (Otis, St. John’s).');
  if (v.parity === 'Full parity expected') push('warn', 14, 'Full parity expected: public equivalency search and historical catalog lookup are not things we replace.');
  if (v.security_gates === 'Yes') push('warn', 15, 'Security review gates go-live: get the owner and date (TCU forced an emergency release).');
  if (v.nonparity_written && v.nonparity_written !== 'Yes') push('warn', 17, 'Put the non-parity line in writing (verbal was worth nothing at GMU).');
  if (known(v.live_date)) {
    var now = today ? new Date(today) : new Date();
    var weeks = (new Date(v.live_date) - now) / (7 * 864e5);
    if (!isNaN(weeks) && weeks < 10) push('warn', 13, 'Target date is ' + Math.max(0, Math.round(weeks)) + ' weeks out. Best clean Inbound is ten weeks from kickoff; nothing has ever been 30 days.');
  }

  var quote = {
    q1: known(v.pop_day1) && known(v.pop_diff_rules),
    q5: known(v.sis_name) && known(v.sis_hosting),
    q7: known(v.wb_coursework) && known(v.wb_rules),
    q8: known(v.golive_gate),
    q13: known(v.live_definition) && known(v.live_date)
  };
  var quoteMissing = Object.keys(quote).filter(function (k) { return !quote[k]; });
  return { flags: flags, quote: quote, quoteMissing: quoteMissing, quoteReady: quoteMissing.length === 0, specialistNeeded: flags.some(function (f) { return f.level === 'specialist'; }) };
}
