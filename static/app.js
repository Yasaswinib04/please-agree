let schools = [];
let selected = null;
let activeTab = 'dossier';
let activeKitName = null;

const $ = id => document.getElementById(id);
const esc = s => (s ?? '').toString().replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const md = s => (window.marked ? marked.parse(s || '') : `<pre>${esc(s)}</pre>`);

function toast(msg, ms = 3500) {
  const t = $('toast');
  t.innerHTML = msg; t.style.display = 'block';
  clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', ms);
}

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).detail || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

const STATUS_LABEL = {
  researched: 'Researched', outreach_sent: 'Outreach sent', following_up: 'Following up',
  responded: 'Responded — follow-ups halted', meeting_done: 'Meeting done',
  mou_drafted: 'MOU drafted', signed: 'Signed', opted_out: 'Opted out',
};

async function refresh(keepSel = true) {
  schools = await api(`/api/schools?kit=${encodeURIComponent(activeKitName || '')}`);
  renderPipeline();
  if (keepSel && selected) {
    selected = schools.find(s => s.id === selected.id) || null;
    renderDetail();
  }
}

function scoreClass(v) { return v >= 70 ? 'score-hi' : v >= 45 ? 'score-mid' : 'score-lo'; }

function renderPipeline() {
  const el = $('pipeline');
  el.innerHTML = schools.map(s => {
    const sc = s.dossier?.score?.overall ?? '–';
    const fu = s.followups_sent ? ` · FU ${s.followups_sent}/7` : '';
    return `<div class="school-card ${selected?.id === s.id ? 'active' : ''}" onclick="select('${s.id}')">
      <div class="row"><b>${esc(s.name)}</b><span class="score-pill ${scoreClass(sc)}">${sc}</span></div>
      <div class="city">${esc(s.city)}</div>
      <span class="status-badge status-${s.status}">${STATUS_LABEL[s.status] || s.status}${fu}</span>
    </div>`;
  }).join('') || '<p class="hint" style="padding:0 4px">Pipeline is empty.</p>';
}

function select(id) { selected = schools.find(s => s.id === id); discovery = null; activeTab = 'dossier'; rejecting = null; renderPipeline(); renderDetail(); }

// ---- reject & redo (review gate failure path) ----
let rejecting = null; // { target: 'email'|'whatsapp'|'followup:N'|'deck'|'mou', label }

const ISSUES = [
  ['wrong_facts', 'Wrong / invented fact about the school'],
  ['too_generic', 'Too generic — not written for this school'],
  ['wrong_tone', 'Tone off (salesy / stiff / too casual)'],
  ['too_long', 'Too long'],
  ['too_short', 'Too thin — needs substance'],
  ['wrong_angle', 'Wrong pitch angle'],
  ['weak_cta', 'CTA unclear or too pushy'],
  ['wrong_recipient', 'Wrong recipient targeting'],
];

function openReject(target, label) { rejecting = { target, label }; renderPane(); }
function cancelReject() { rejecting = null; renderPane(); }

function rejectPanel() {
  if (!rejecting) return '';
  return `<div class="gate" style="margin-top:12px">
    <b>✗ Rejecting: ${esc(rejecting.label)}</b> — tell the agent exactly what broke. It redoes <i>only this piece</i> for this school, then comes back for your review.
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin:8px 0">
      ${ISSUES.map(([k, lbl]) => `<label style="display:flex;gap:7px;align-items:center;font-size:13px;color:var(--text);margin:0;cursor:pointer"><input type="checkbox" class="rj" value="${k}" style="width:auto;margin:0;flex-shrink:0">${lbl}</label>`).join('')}
    </div>
    <textarea id="rjNotes" placeholder="Your own words (highest priority) — e.g. 'the fee figure is wrong, it's ₹80k not ₹1.7L' or 'lead with the State-syllabus point'"></textarea>
    <div class="btnrow">
      <button onclick="submitReject()">Redo with this feedback</button>
      <button class="ghost" onclick="cancelReject()">cancel</button>
    </div>
  </div>`;
}

async function submitReject() {
  const issues = [...document.querySelectorAll('.rj:checked')].map(x => x.value);
  const notes = ($('rjNotes')?.value || '').trim();
  if (!issues.length && !notes) { toast('Pick at least one reason or write a note — the agent needs to know what broke'); return; }
  const r = rejecting;
  toast(`Redoing ${esc(r.label)} with your feedback… <span class="spin"></span>`, 120000);
  try {
    await api(`/api/schools/${selected.id}/revise`, { method: 'POST', body: JSON.stringify({ target: r.target, issues, notes: notes || null }) });
    rejecting = null;
    await refresh();
    toast(`${esc(r.label)} revised — back at the review gate`);
  } catch (err) { toast(`${esc(err.message)}`, 8000); }
}

let discovery = null;

function renderDiscovery() {
  const el = $('detail');
  const d = discovery;
  el.innerHTML = `
    <h2 style="font-size:18px">Prospects: ${esc(d.focus)} — ${esc(d.city)}</h2>
    <p class="hint">Found on real list/ranking pages: ${d.sources.map(u => `<a href="${esc(u)}" target="_blank">${esc(new URL(u).hostname)}</a>`).join(' · ')}</p>
    ${d.candidates.map((c, i) => `
      <div class="followup" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div>
          <b>${i + 1}. ${esc(c.name)}</b>
          <span class="status-badge" style="margin:0 0 0 8px">${esc(c.board_guess || '?')}</span>
          <div class="hint" style="margin-top:3px">${esc(c.why)}</div>
          <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:5px">
            ${(c.pros || []).map(x => `<span class="chip chip-yes">✓ ${esc(x)}</span>`).join('')}
            ${(c.cons || []).map(x => `<span class="chip chip-no">✗ ${esc(x)}</span>`).join('')}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <span class="score-pill ${scoreClass(c.quick_score)}">${c.quick_score}</span><br>
          <button class="secondary" style="margin-top:6px;font-size:12px" onclick="deepResearch(${i})">Research →</button>
        </div>
      </div>`).join('')}`;
}

async function deepResearch(i) {
  const c = discovery.candidates[i];
  toast(`Deep-researching ${esc(c.name)}… (~60s) <span class="spin"></span>`, 120000);
  try {
    const s = await api('/api/schools', { method: 'POST', body: JSON.stringify({
      name: c.name, city: c.city, website: c.website || null,
      fallback_urls: discovery.sources || [], context_note: c.why || null }) });
    await refresh(false); select(s.id);
    toast(`${esc(c.name)} researched & scored ${s.dossier?.score?.overall}/100`);
  } catch (err) { toast(`${esc(err.message)}`, 8000); }
}

function tabBtn(key, label) {
  return `<button class="${activeTab === key ? 'on' : ''}" onclick="setTab('${key}')">${label}</button>`;
}
function setTab(k) { activeTab = k; rejecting = null; renderDetail(); }

function renderDetail() {
  const el = $('detail');
  if (!selected) { el.innerHTML = '<p class="empty">Add a school or select one from the pipeline.</p>'; return; }
  const s = selected, d = s.dossier || {}, p = d.profile || {}, sc = d.score || {};
  el.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>${esc(s.name)} <span class="city">· ${esc(s.city)}</span></h2>
        ${s.website ? `<a href="${esc(s.website)}" target="_blank">${esc(s.website)}</a>` : ''}
      </div>
      <div style="text-align:right">
        <span class="score-pill ${scoreClass(sc.overall)}" style="font-size:17px">${sc.overall ?? '–'}/100</span><br>
        <button class="ghost" onclick="removeSchool('${s.id}')">delete</button>
      </div>
    </div>
    <span class="status-badge status-${s.status}">${STATUS_LABEL[s.status] || s.status}</span>
    <div class="tabs">
      ${tabBtn('dossier', '01 Dossier & Evidence')}${tabBtn('outreach', '02 Outreach & Voice')}${tabBtn('followups', '03 Follow-Up Sequence')}
      ${tabBtn('deck', '04 Institutional Deck')}${tabBtn('meeting', '05 Meeting Brief')}${tabBtn('mou', '06 MOU & Legal')}
    </div>
    <div class="tabpane" id="pane"></div>
    <div class="log"><h3>Activity log</h3>${(s.log || []).slice().reverse().map(l => `<div>${l.ts} — <b>${esc(l.event)}</b></div>`).join('')}</div>`;
  renderPane();
}

function renderPane() {
  const pane = $('pane'); if (!pane) return;
  const s = selected, d = s.dossier || {}, p = d.profile || {}, sc = d.score || {};
  if (activeTab === 'dossier') {
    const dims = Object.entries(sc).filter(([k, v]) => typeof v === 'number' && k !== 'overall');
    pane.innerHTML = `
      <div class="scorebar">
        ${dims.map(([k, v]) => {
          const pct = Math.max(3, Math.min(100, Math.round(((v ?? 0) / 25) * 100)));
          return `<div class="sc"><span class="sc-bar"><span class="${pct >= 80 ? '' : 'sc-fill-lo'}" style="width:${pct}%"></span></span><b>${v ?? '–'}</b><span>${esc(k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()))} /25</span></div>`;
        }).join('')}
      </div>
      ${s.kit ? `<p class="hint" style="margin:4px 0 0">Scored by kit: <b>${esc(s.product || s.kit)}</b> — dimensions come from kits/${esc(s.kit)}/scoring.json</p>` : ''}
      ${(sc.strengths || sc.concerns) ? `
      <div class="verdict">
        ${(sc.strengths || []).length ? `<div class="verdict-col">
          <h4>✓ Why recommended</h4>
          ${(sc.strengths || []).map(x => `<span class="chip chip-yes">✓ ${esc(x)}</span>`).join('')}
        </div>` : ''}
        ${(sc.concerns || []).length ? `<div class="verdict-col">
          <h4>✗ Watch-outs</h4>
          ${(sc.concerns || []).map(x => `<span class="chip chip-no">✗ ${esc(x)}</span>`).join('')}
        </div>` : ''}
      </div>` : ''}
      <p class="hint">${esc(sc.rationale || '')}</p>
      <dl class="kv">
        <dt>Board</dt><dd>${esc(p.board)}</dd>
        <dt>Medium</dt><dd>${esc(p.medium)}</dd>
        <dt>Student strength</dt><dd>${esc(p.student_strength_estimate)}</dd>
        <dt>Fee band</dt><dd>${esc(p.fee_band_estimate)}</dd>
        <dt>Programs</dt><dd>${esc((p.programs || []).join(', '))}</dd>
        <dt>Key contacts</dt><dd>${(p.key_contacts || []).map(c => `${esc(c.name)} (${esc(c.role)})`).join('; ') || 'unknown'}</dd>
        <dt>Phone / Email</dt><dd>${esc(p.phone || '–')} / ${esc(p.email || '–')}</dd>
        <dt>Recent news</dt><dd>${esc((p.recent_news || []).join(' · ') || '–')}</dd>
        <dt>Sources</dt><dd>${(s.research_sources || []).map(u => `<a href="${esc(u)}" target="_blank">${esc(new URL(u).hostname)}</a>`).join(' · ')}</dd>
      </dl>
      <h3 style="font-size:14px;margin-top:10px">Personalization hooks</h3>
      <ul class="hooks">${(d.personalization_hooks || []).map(h => `<li>${esc(h)}</li>`).join('')}</ul>
      <div class="angle-box"><b>RECOMMENDED ANGLE</b><p>${esc(d.recommended_angle || '')}</p></div>
      ${s.raw_research ? `
      <details style="margin-top:14px" class="evidence-details">
        <summary style="cursor:pointer;color:var(--accent-text);font-family:var(--font-mono);font-size:12.5px;text-transform:uppercase;letter-spacing:0.04em;">RAW EXTRACTED EVIDENCE — (${(s.raw_research.pages || []).length} pages scraped, ${(s.raw_research.results || []).length} search hits)</summary>
        <div class="md" style="font-size:12.5px">
          <b>Queries run:</b> ${(s.raw_research.queries || []).map(q => `<code>${esc(q)}</code>`).join(' · ')}
          <hr style="border-color:var(--border);margin:8px 0">
          <b>Search hits:</b>
          <ul>${(s.raw_research.results || []).map(r => `<li><a href="${esc(r.url)}" target="_blank">${esc(r.title)}</a> — <span style="color:var(--muted)">${esc((r.snippet || '').slice(0, 140))}</span></li>`).join('')}</ul>
          <hr style="border-color:var(--border);margin:8px 0">
          <b>Scraped page excerpts:</b>
          ${(s.raw_research.pages || []).map(p => `<p style="margin:6px 0"><a href="${esc(p.url)}" target="_blank">${esc(p.url)}</a><br><span style="color:var(--muted)">${esc(p.excerpt)}…</span></p>`).join('')}
        </div>
      </details>` : ''}`;
  } else if (activeTab === 'outreach') {
    if (!s.drafts) {
      pane.innerHTML = `
        <label>Target persona (who at this school are we writing to?)</label>
        <select id="ePersona">
          <option value="">Auto — best-reachable decision-maker from dossier</option>
          <option>Principal / Head</option>
          <option>Correspondent / Owner / Trustee</option>
          <option>Exam-cell / Academic Coordinator</option>
          <option>Activities / Events Coordinator</option>
        </select>
        <button id="genOut" onclick="genOutreach()" style="margin-top:8px">Generate personalized outreach</button>
        <p class="hint">Drafts email + WhatsApp + a 7-touch follow-up plan. Personalised by: school dossier × persona × funnel stage × your voice (kits/…/voice.md) × angle library.</p>`;
    } else {
      const approved = s.status !== 'researched';
      const e = s.drafts.email || {};
      const phone = (p.phone || '').replace(/[^\d]/g, '');
      const wa = `https://wa.me/${phone.length === 10 ? '91' + phone : phone}?text=${encodeURIComponent(s.drafts.whatsapp || '')}`;
      const mailto = `mailto:${encodeURIComponent(p.email || '')}?subject=${encodeURIComponent(e.subject || '')}&body=${encodeURIComponent(e.body || '')}`;
      const pm = s.drafts.params;
      const paramsPanel = pm ? `
        <details style="margin-bottom:12px" class="params-box">
          <summary style="cursor:pointer;font-size:12px;color:var(--accent-text);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.04em;">GTM BRAIN CONFIGURATION — how brand.md, voice.md & angles shaped these drafts</summary>
          <dl class="kv" style="font-size:12.5px;margin-top:6px">
            <dt>Product kit</dt><dd>${esc(pm.product)} (kits/${esc(pm.kit)}/)</dd>
            <dt>Target persona</dt><dd>${esc(pm.target_persona)}</dd>
            <dt>Funnel stage</dt><dd>${esc(pm.funnel_stage)}</dd>
            <dt>Sender voice</dt><dd>${esc(pm.sender_voice)}</dd>
            <dt>Demographics</dt><dd>${esc(Object.entries(pm.demographics || {}).map(([k, v]) => `${k}: ${v}`).join(' · '))}</dd>
            <dt>Hooks fed in</dt><dd>${(pm.hooks_used || []).map(h => `<div>• ${esc(h)}</div>`).join('')}</dd>
            <dt>Angle library</dt><dd>${esc((pm.angles_available || []).join(' · '))}</dd>
          </dl>
        </details>` : '';
      pane.innerHTML = `
        ${approved ? '' : `<div class="gate"><b>HUMAN REVIEW GATE</b> — Edit below, then approve. Nothing sends without you.</div>`}
        ${paramsPanel}
        <label>Email subject</label><input id="eSubj" value="${esc(e.subject)}" ${approved ? 'disabled' : ''}>
        <label>Email body</label><textarea id="eBody" style="min-height:170px" ${approved ? 'disabled' : ''}>${esc(e.body)}</textarea>
        <label>WhatsApp message</label><textarea id="eWa" ${approved ? 'disabled' : ''}>${esc(s.drafts.whatsapp)}</textarea>
        <div class="btnrow">
          ${approved
            ? `<a href="${wa}" target="_blank"><button class="secondary">Open in WhatsApp</button></a>
               <a href="${mailto}"><button class="secondary">Open email draft</button></a>
               <button class="secondary" onclick="copyText($('eBody').value)">Copy email</button>`
            : `<button onclick="approveOutreach()">Approve & mark sent</button>
               <button class="ghost" onclick="openReject('email', 'first-touch email')">✗ Reject email</button>
               <button class="ghost" onclick="openReject('whatsapp', 'first-touch WhatsApp')">✗ Reject WhatsApp</button>
               <button class="secondary" onclick="genOutreach()">↻ Regenerate all</button>`}
        </div>
        ${approved ? '' : rejectPanel()}`;
    }
  } else if (activeTab === 'followups') {
    const fps = (s.drafts || {}).followups || [];
    if (!fps.length) { pane.innerHTML = '<p class="hint">Generate outreach first — the 7-touch plan comes with it.</p>'; return; }
    const stopped = ['responded', 'meeting_done', 'mou_drafted', 'signed', 'opted_out'].includes(s.status);
    const n = s.followups_sent || 0;
    const next = fps[n];
    const nextDrafted = next && !!next.message;
    pane.innerHTML = `
      ${stopped ? `<div class="gate"><b>Stop condition active</b> — the school responded. All remaining follow-ups halted automatically.</div>`
                : `<div class="btnrow">
                     ${next ? (nextDrafted
                       ? `<button onclick="sendFollowup()">Send follow-up ${n + 1}/7</button>`
                       : `<button onclick="prepareFollowup()">Draft follow-up ${n + 1}/7 now — from the live conversation</button>`) : ''}
                   </div>
                   <p class="hint">Planned upfront: angle + timing per touch. Drafted just-in-time: the words — using every sent touch, any reply, and meeting synthesis. Stops automatically on: reply · meeting scheduled · opt-out · not-relevant · human takeover · 7-touch cap.</p>`}
      ${rejectPanel()}
      ${fps.map((f, i) => `<div class="followup ${i < n ? 'sent' : ''}">
        <div class="fh"><span>Day +${f.day_offset} · ${esc(f.channel)} ${i < n ? '· sent' : (f.message ? '· drafted — awaiting review' : '· planned')}</span><span class="angle">${esc(f.angle)}
          ${i >= n && !stopped && f.message ? `<button class="ghost" style="font-size:11px;margin-left:8px" onclick="openReject('followup:${i}', 'follow-up ${i + 1}/7 (day +${f.day_offset})')">✗ redo</button>` : ''}</span></div>
        ${f.message
          ? `${f.subject ? `<b style="font-size:13.5px">${esc(f.subject)}</b><br>` : ''}
             <span style="font-size:13.5px">${esc(f.message)}</span>
             ${f.angle_note ? `<div class="hint" style="margin-top:5px">${esc(f.angle_note)}</div>` : ''}`
          : `<span style="font-size:13.5px;color:var(--muted)"><i>Strategy: ${esc(f.planned_hook || '(message will be drafted when this touch is due)')}</i></span>`}
      </div>`).join('')}`;
  } else if (activeTab === 'deck') {
    pane.innerHTML = `
      <div class="btnrow">
        <button onclick="genDeck()">${s.deck_path ? 'Regenerate' : 'Generate'} personalized pitch deck</button>
        ${s.deck_path ? `<a href="${s.deck_path}" target="_blank"><button class="secondary">Open deck</button></a>
        <button class="ghost" onclick="openReject('deck', 'pitch deck')">✗ Reject with feedback</button>` : ''}
      </div>
      ${rejectPanel()}
      ${s.deck_path ? `<iframe src="${s.deck_path}" style="width:100%;height:520px;border:1px solid var(--rule);border-radius:0;background:#000"></iframe>` : '<p class="hint">A 6-slide first-pitch deck built from this school\'s dossier — different for every school.</p>'}`;
  } else if (activeTab === 'meeting') {
    pane.innerHTML = `
      ${!s.meeting_brief ? `
        <label>Simulate the school replying (paste any reply)</label>
        <textarea id="replyText">Thanks for reaching out. This sounds interesting — our teachers do spend a lot of time on corrections. Can you tell me more about pricing and how you handle our syllabus? — Principal</textarea>
        <button onclick="simReply()">Reply received → generate meeting brief</button>
        <p class="hint">Fires the stop condition (halts follow-ups) and auto-prepares the meeting brief.</p>`
      : `<h3 style="font-size:15px">Meeting brief</h3><div class="md">${md(s.meeting_brief)}</div>`}
      ${s.meeting_brief && !s.transcript_summary ? `
        <label style="margin-top:14px">After the meeting: paste transcript (demo: fake transcript is fine)</label>
        <textarea id="transcriptText" style="min-height:120px" placeholder="Paste meeting transcript..."></textarea>
        <button onclick="sumTranscript()">Summarize → commitments + tracker update</button>` : ''}
      ${s.transcript_summary ? `<h3 style="font-size:15px;margin-top:14px">Post-meeting summary</h3><div class="md">${md(s.transcript_summary)}</div>` : ''}`;
  } else if (activeTab === 'mou') {
    pane.innerHTML = `
      ${!s.mou_md ? `
        <label>Commercial terms (optional — defaults to free 1-exam pilot)</label>
        <input id="mouTerms" placeholder="e.g. Free pilot for one exam; ₹150/student/year thereafter">
        <button onclick="genMou()">Draft MOU from clause library</button>
        <p class="hint">Fixed clauses stay verbatim from your template; only school-specific placeholders are filled. Always flagged for human + legal review.</p>`
      : `<div class="gate"><b>HUMAN & LEGAL REVIEW GATE</b> — DRAFT requires human + legal review before external share (non-negotiable).</div>
         <div class="btnrow"><button class="secondary" onclick="copyText(selected.mou_md)">Copy markdown</button>
         <button class="ghost" onclick="openReject('mou', 'MOU draft')">✗ Reject with feedback</button>
         <button class="secondary" onclick="genMou()">↻ Regenerate</button></div>
         ${rejectPanel()}
         <div class="md">${md(s.mou_md)}</div>`}`;
  }
}

// ---- CRM table view ----
let crmMode = false;

function toggleCRM() { crmMode = !crmMode; $('crmBtn').classList.toggle('on', crmMode); crmMode ? renderCRM() : renderDetail(); }

function crmSelect(id) { crmMode = false; $('crmBtn').classList.remove('on'); select(id); }

function renderCRM() {
  const el = $('detail');
  const rows = schools.map(s => {
    const d = s.dossier || {}, p = d.profile || {}, c = (p.key_contacts || [])[0] || {};
    const last = (s.log || []).slice(-1)[0] || {};
    const sc = d.score?.overall ?? '–';
    return `<tr onclick="crmSelect('${s.id}')" style="cursor:pointer">
      <td><b>${esc(s.name)}</b><br><span class="hint">${esc(s.city)}</span></td>
      <td>${esc(s.product || 'Yomnita')}</td>
      <td><span class="score-pill ${scoreClass(sc)}">${sc}</span></td>
      <td><span class="status-badge status-${s.status}">${STATUS_LABEL[s.status] || s.status}</span></td>
      <td style="text-align:center">${s.followups_sent || 0}/7</td>
      <td>${esc(c.name || '–')}<br><span class="hint">${esc(c.role || '')}</span></td>
      <td>${esc(p.phone || '–')}<br><span class="hint">${esc(p.email || '')}</span></td>
      <td class="hint" style="max-width:220px">${esc(last.event || '–')}<br>${esc(last.ts || '')}</td>
    </tr>`;
  }).join('');
  const kitLabel = $('kitSel')?.selectedOptions?.[0]?.textContent || activeKitName || '';
  el.innerHTML = `
    <div class="detail-head"><h2>CRM — ${esc(kitLabel)}</h2>
      <a href="/api/export.csv?kit=${encodeURIComponent(activeKitName || '')}"><button class="secondary">Export CSV (opens in Google Sheets)</button></a></div>
    <p class="hint">${schools.length} school(s) tracked for this product · every stage logged · click a row to open the school</p>
    <div style="overflow-x:auto"><table class="crm">
      <thead><tr><th>School</th><th>Kit</th><th>Score</th><th>Status</th><th>FU</th><th>Contact</th><th>Phone / Email</th><th>Last activity</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="hint">Pipeline is empty.</td></tr>'}</tbody>
    </table></div>`;
}

function copyText(t) { navigator.clipboard.writeText(t); toast('Copied ✓'); }

async function act(btnLabel, fn) {
  try { await fn(); await refresh(); }
  catch (err) { toast(`${esc(err.message)}`, 6000); }
}

async function genOutreach() {
  const persona = $('ePersona')?.value || null;
  toast('Drafting personalized outreach + 7 follow-up angles… <span class="spin"></span>', 60000);
  await act('outreach', () => api(`/api/schools/${selected.id}/outreach`, { method: 'POST', body: JSON.stringify({ persona }) }));
  activeTab = 'outreach'; toast('Outreach drafted — review before sending');
}
async function approveOutreach() {
  await act('approve', () => api(`/api/schools/${selected.id}/approve`, { method: 'POST', body: JSON.stringify({
    email_subject: $('eSubj').value, email_body: $('eBody').value, whatsapp: $('eWa').value }) }));
  toast('Approved — first touch marked sent');
}
async function prepareFollowup() {
  toast('Drafting this touch from the live conversation — sent touches, replies, meeting notes… <span class="spin"></span>', 60000);
  await act('prepare', () => api(`/api/schools/${selected.id}/followup/prepare`, { method: 'POST' }));
  toast('Drafted just-in-time — review it, then send');
}
async function sendFollowup() {
  await act('followup', () => api(`/api/schools/${selected.id}/followup`, { method: 'POST' }));
}
async function simReply() {
  toast('Reply received — halting follow-ups, preparing meeting brief… <span class="spin"></span>', 60000);
  await act('reply', () => api(`/api/schools/${selected.id}/simulate_reply`, { method: 'POST', body: JSON.stringify({ text: $('replyText').value }) }));
  toast('Meeting brief ready');
}
async function sumTranscript() {
  toast('Summarizing transcript… <span class="spin"></span>', 60000);
  await act('transcript', () => api(`/api/schools/${selected.id}/transcript`, { method: 'POST', body: JSON.stringify({ text: $('transcriptText').value }) }));
  toast('Summary + commitments extracted');
}
async function genDeck() {
  toast('Designing the deck for this school… (30-60s) <span class="spin"></span>', 90000);
  await act('deck', () => api(`/api/schools/${selected.id}/deck`, { method: 'POST' }));
  toast('Deck ready');
}
async function genMou() {
  toast('Drafting MOU from clause library… <span class="spin"></span>', 60000);
  await act('mou', () => api(`/api/schools/${selected.id}/mou`, { method: 'POST', body: JSON.stringify({ commercial_terms: $('mouTerms') ? $('mouTerms').value || null : null }) }));
  toast('MOU drafted — pending human + legal review');
}
async function removeSchool(id) {
  if (!confirm('Remove this school from the pipeline?')) return;
  await api(`/api/schools/${id}`, { method: 'DELETE' });
  selected = null; await refresh(false); renderDetail();
}

$('discForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('discBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Scanning list pages…';
  try {
    discovery = await api('/api/discover', { method: 'POST', body: JSON.stringify({
      city: $('dCity').value.trim(), focus: $('dFocus').value.trim() || null }) });
    selected = null; renderPipeline(); renderDiscovery();
    toast(`${discovery.candidates.length} prospects found & ranked`);
  } catch (err) { toast(`${esc(err.message)}`, 8000); }
  btn.disabled = false; btn.textContent = 'Find & rank prospects';
});

$('addForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('addBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Researching live… (~60s)';
  try {
    const s = await api('/api/schools', { method: 'POST', body: JSON.stringify({
      name: $('fName').value.trim(), city: $('fCity').value.trim(), website: $('fSite').value.trim() || null }) });
    $('fName').value = ''; $('fCity').value = ''; $('fSite').value = '';
    await refresh(false); select(s.id);
    toast(`Researched & scored ${s.dossier?.score?.overall}/100`);
  } catch (err) { toast(`${esc(err.message)}`, 8000); }
  btn.disabled = false; btn.textContent = 'Research live';
});

// ---- onboard a new product (seller) from its website ----
function openNewKit() {
  selected = null; discovery = null; renderPipeline();
  $('detail').innerHTML = `
    <h2 style="font-size:18px">Onboard a product from its website</h2>
    <p class="hint">This agent is a platform: one <b>kit per product/company</b> (Yomnita, LIT School, anyone).
    Paste a company's site and it builds their whole GTM kit — positioning &amp; proof, their ICP scoring model,
    7 follow-up angles, and their brand colours, fonts and logo so every generated deck looks like <i>their</i> deck.
    Schools stay on the other side as prospects.</p>
    <label>Product website</label>
    <input id="kitUrl" placeholder="litschool.in" onkeydown="if(event.key==='Enter')buildKit()">
    <label style="display:flex;gap:7px;align-items:center;margin-top:6px">
      <input type="checkbox" id="kitActivate" checked style="width:auto;margin:0">Switch to this product once built</label>
    <div class="btnrow"><button onclick="buildKit()" id="kitBtn">Build kit from website</button></div>
    <p class="hint">Takes ~40s. Website copy is treated as untrusted data, and marketing claims are labelled
    website-claimed rather than passed off as proven.</p>
    <div id="kitResult"></div>`;
}

async function buildKit() {
  const url = $('kitUrl').value.trim();
  if (!url) { toast('Paste a website URL first'); return; }
  const btn = $('kitBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Reading site, extracting brand…';
  try {
    const r = await api('/api/kits/from_url', { method: 'POST', body: JSON.stringify({
      url, activate: $('kitActivate').checked }) });
    const b = r.brand || {}, m = r.meta || {};
    $('kitResult').innerHTML = `
      <div class="gate" style="margin-top:14px"><b>Kit created: ${esc(r.created)}</b> — ${esc(m.label || '')}</div>
      <div class="verdict">
        <div class="verdict-col"><h4>Extracted brand</h4>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            ${['primary', 'accent', 'bg'].filter(k => b[k]).map(k => `<span class="chip" style="border-color:${esc(b[k])};color:${esc(b[k])}">${esc(k)} ${esc(b[k])}</span>`).join('')}
          </div>
          <div class="hint" style="width:100%">Font: <b>${esc(b.font || '–')}</b> · Vibe: ${esc(b.vibe || '–')}</div>
          ${b.logo ? `<img src="${esc(b.logo)}" alt="" style="max-height:34px;max-width:100%;margin-top:6px;background:#fff;border-radius:0;padding:4px" onerror="this.remove()">` : ''}
        </div>
        <div class="verdict-col"><h4>Built from</h4>
          ${(r.sources || []).map(u => `<div class="hint" style="width:100%"><a href="${esc(u)}" target="_blank">${esc(u)}</a></div>`).join('')}
        </div>
      </div>
      <p class="hint">Files written to <code>kits/${esc(r.created)}/</code>: brand_kit.md · scoring.json ·
      followup_angles.json · brand.json · voice.md (blank — fill it in so outreach sounds like a person).</p>`;
    await loadKits();
    toast(`${esc(m.product || r.created)} onboarded — decks will now use their brand`);
  } catch (err) { toast(`${esc(err.message)}`, 9000); }
  btn.disabled = false; btn.textContent = 'Build kit from website';
}

async function loadKits() {
  const k = await api('/api/kits');
  activeKitName = k.active;
  const sel = $('kitSel');
  sel.innerHTML = k.kits.map(x => `<option value="${esc(x.name)}" ${x.name === k.active ? 'selected' : ''}>${esc(x.emoji)} ${esc(x.label)}</option>`).join('');
  const active = k.kits.find(x => x.name === k.active);
  $('appTitle').textContent = `${active.emoji} ${active.product} Partnerships Agent`;
  $('addHint').textContent = `Runs real web search + scrapes the school's site, then scores fit for ${active.product}.`;
  $('dFocus').placeholder = active.default_focus ? `Focus (default: ${active.default_focus.slice(0, 46)}…)` : 'Focus';
  const csv = $('csvLink');
  if (csv) csv.href = `/api/export.csv?kit=${encodeURIComponent(k.active)}`;
}

$('kitSel').addEventListener('change', async e => {
  try {
    await api('/api/kits/activate', { method: 'POST', body: JSON.stringify({ name: e.target.value }) });
    await loadKits();
    selected = null;
    await refresh(false);
    if (crmMode) renderCRM(); else renderDetail();
    toast('Kit switched — pipeline, discovery, scoring, outreach, decks & MOUs now scoped to this product only');
  } catch (err) { toast(`${esc(err.message)}`, 6000); }
});

(async () => {
  try { const c = await api('/api/config'); $('modelBadge').textContent = `${c.model} via OpenRouter`; } catch {}
  try { await loadKits(); } catch {}
  await refresh(false);
  // land on the CRM overview when a pipeline exists — no school pre-selected
  if (schools.length) { crmMode = true; $('crmBtn').classList.add('on'); renderCRM(); }
})();
