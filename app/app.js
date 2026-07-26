/* Igea — console dello studio (standalone, zero build).
   Parla direttamente con Medplum FHIR. Viste: Oggi / Calendario / Pazienti / Impostazioni. */
'use strict';

const TAG = 'https://firmamento.tech/fhir/CodeSystem/source|segretaria-ai';
const TASK_SYS = 'https://firmamento.tech/fhir/CodeSystem/segretaria-task';
const CAT_SYS = 'https://firmamento.tech/fhir/CodeSystem/segretaria';
const TEL_SYS = 'urn:firmamento:segretaria:telefono';
let API = '', TOKEN = '', ME_PRACTITIONER = null;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── date helpers (Europe/Rome) ── */
const fmtTime = (iso) => !iso ? '' : new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const fmtDT = (iso) => !iso ? '' : new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const fmtD = (iso) => !iso ? '' : new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
function todayRome() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function romeIso(day, time) {
  const guess = new Date(day + 'T' + time + ':00Z');
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', timeZoneName: 'longOffset' }).formatToParts(guess).find((p) => p.type === 'timeZoneName').value;
  const m = tz.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  const off = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
  const utc = new Date(guess.getTime() - off * 60000);
  return utc.toISOString();
}
function mondayOf(dateIso) {
  const d = new Date(dateIso + 'T12:00:00Z');
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ── FHIR ── */
async function fhir(path, opts) {
  const r = await fetch(API + '/fhir/R4/' + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/fhir+json', ...(opts?.headers || {}) },
  });
  if (!r.ok) throw new Error('FHIR ' + r.status);
  return r.json();
}
const resources = (b) => (b.entry || []).map((e) => e.resource);
async function fhirPut(res) {
  return fhir(res.resourceType + '/' + res.id, { method: 'PUT', body: JSON.stringify(res) });
}
async function fhirPost(res) {
  return fhir(res.resourceType, { method: 'POST', body: JSON.stringify(res) });
}

/* ── PKCE + login ── */
function b64u(bytes) {
  return btoa(String.fromCharCode.apply(null, Array.from(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function pkcePair() {
  const buf = new Uint8Array(48);
  crypto.getRandomValues(buf);
  const verifier = b64u(buf);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64u(new Uint8Array(digest)) };
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('login-err');
  err.style.display = 'none';
  $('login-btn').disabled = true;
  API = $('api').value.replace(/\/$/, '');
  try {
    const pkce = await pkcePair();
    const login = await (await fetch(API + '/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: $('email').value.trim(), password: $('password').value, scope: 'openid',
        codeChallenge: pkce.challenge, codeChallengeMethod: 'S256',
      }),
    })).json();
    if (!login.code) throw new Error(login?.issue?.[0]?.details?.text || 'Credenziali non valide');
    const tok = await (await fetch(API + '/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: login.code, code_verifier: pkce.verifier }),
    })).json();
    if (!tok.access_token) throw new Error('Token non ottenuto');
    TOKEN = tok.access_token;
    // chi sono: il mio Practitioner (per legare i pazienti creati a me)
    try {
      const me = await (await fetch(API + '/auth/me', { headers: { Authorization: 'Bearer ' + TOKEN } })).json();
      // /auth/me: profile è la RISORSA Practitioner (id), il reference è in
      // membership.profile.reference ("Practitioner/<id>").
      ME_PRACTITIONER =
        (me.membership?.profile?.reference || '').replace('Practitioner/', '') ||
        me.profile?.id || null;
    } catch { ME_PRACTITIONER = null; }
    $('view-login').classList.add('hidden');
    $('view-app').classList.remove('hidden');
    $('who').textContent = $('email').value;
    loadOggi(); loadDocs(); loadStudio();
  } catch (ex) {
    err.textContent = 'Accesso fallito: ' + ex.message;
    err.style.display = 'block';
  } finally {
    $('login-btn').disabled = false;
  }
});
$('logout').addEventListener('click', () => location.reload());

/* ── navigazione ── */
document.querySelectorAll('.side-nav a').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.side-nav a').forEach((x) => x.classList.remove('active'));
    a.classList.add('active');
    document.querySelectorAll('.page').forEach((p) => p.classList.add('hidden'));
    $('page-' + a.dataset.view).classList.remove('hidden');
    if (a.dataset.view === 'calendario') loadCalendar();
    if (a.dataset.view === 'pazienti') loadPatients();
  });
});

/* ═══ OGGI ═══ */
async function loadOggi() {
  const day = todayRome();
  const since = (n) => addDays(day, -n);
  try {
    const c = (b) => b + '&_summary=count';
    const [msg7, appt30, hand, trig] = await Promise.all([
      fhir(c('Communication?_tag=' + encodeURIComponent(TAG) + '&sent=ge' + since(7))),
      fhir(c('Appointment?_tag=' + encodeURIComponent(TAG) + '&date=ge' + since(30))),
      fhir(c('Task?code=' + encodeURIComponent(TASK_SYS + '|segretaria-handoff') + '&status=requested')),
      fhir(c('Communication?_tag=' + encodeURIComponent(TAG) + '&sent=ge' + since(30))),
    ]);
    $('k-msg7').textContent = msg7.total ?? 0;
    $('k-appt30').textContent = appt30.total ?? 0;
    $('k-hand').textContent = hand.total ?? 0;
    // trigger 118: conta le Communication con category che inizia per 118 (client-side su 200)
    const comms = await fhir('Communication?_tag=' + encodeURIComponent(TAG) + '&sent=ge' + since(30) + '&_count=200');
    $('k-118').textContent = resources(comms).filter((r) => JSON.stringify(r.category || []).includes('"code":"118') || (r.category || []).flatMap((x) => x.coding || []).some((x) => (x.code || '').startsWith('118'))).length;
  } catch (e) { console.warn('kpi', e); }
  loadHandoff(); loadToday(); loadConversations();
}

async function loadHandoff() {
  const box = $('handoff-list');
  try {
    const tasks = resources(await fhir('Task?code=' + encodeURIComponent(TASK_SYS + '|segretaria-handoff') + '&status=requested&_sort=-authored-on&_count=50'));
    if (!tasks.length) { box.innerHTML = '<p class="empty">Nessun paziente in attesa di richiamo. 🎉</p>'; return; }
    box.innerHTML = tasks.map((t) => `
      <div class="row" id="task-${t.id}"><div class="row-top">
        <div>${t.priority === 'urgent' ? '<span class="badge badge-amber">URGENTE — possibile emergenza</span>' : ''}
          <div style="margin-top:4px">${esc(t.description)}</div><div class="muted">${fmtDT(t.authoredOn)}</div></div>
        <button class="btn btn-ghost btn-sm" onclick="takeCharge('${t.id}')">Preso in carico</button>
      </div></div>`).join('');
  } catch (e) { box.innerHTML = '<p class="empty">Errore: ' + esc(e.message) + '</p>'; }
}

window.takeCharge = async (id) => {
  try {
    const t = await fhir('Task/' + id);
    t.status = 'completed';
    await fhirPut(t);
    $('task-' + id).innerHTML = '<span class="done-tag">✓ Gestito</span>';
  } catch (e) { alert('Aggiornamento fallito: ' + e.message); }
};

const apptName = (a) => (a.participant || []).find((p) => p.actor && !p.actor.reference)?.actor?.display || 'Paziente';
const apptPhone = (a) => (a.identifier || []).find((i) => i.system === TEL_SYS)?.value || '';

async function loadToday() {
  const box = $('today-list');
  const day = todayRome();
  try {
    const appts = resources(await fhir('Appointment?_tag=' + encodeURIComponent(TAG) + '&date=ge' + day + 'T00:00:00&date=le' + day + 'T23:59:59&_sort=date&_count=100'));
    if (!appts.length) { box.innerHTML = '<p class="empty">Nessuna prenotazione di Igea per oggi.</p>'; return; }
    box.innerHTML = appts.map((a) => `
      <div class="row"><div class="row-top">
        <div><b>${esc(apptName(a))}</b><div class="muted">${esc(apptPhone(a))}</div></div>
        <b>${fmtTime(a.start)} – ${fmtTime(a.end)}</b>
      </div></div>`).join('');
  } catch (e) { box.innerHTML = '<p class="empty">Errore: ' + esc(e.message) + '</p>'; }
}

async function loadConversations() {
  const box = $('conv-list');
  try {
    const comms = resources(await fhir('Communication?_tag=' + encodeURIComponent(TAG) + '&_sort=-sent&_count=50'));
    if (!comms.length) { box.innerHTML = '<p class="empty">Nessuna conversazione ancora.</p>'; return; }
    box.innerHTML = comms.map((c) => {
      const cat = (c.category || []).flatMap((x) => x.coding || []).find((x) => x.system === CAT_SYS)?.code || 'conversazione';
      const is118 = cat.startsWith('118');
      const p = (c.payload || []).map((x) => x.contentString || '');
      const paz = (p.find((x) => x.startsWith('PAZIENTE: ')) || '').slice(10);
      const seg = (p.find((x) => x.startsWith('SEGRETARIA: ')) || '').slice(12);
      return `<div class="row conv" onclick="this.classList.toggle('open')">
        <div class="row-top">
          <div style="min-width:0"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(paz) || '(nessun testo)'}</div>
          <div class="muted">${fmtDT(c.sent)} · ${esc(c.medium?.[0]?.text || '')}</div></div>
          <span class="badge ${is118 ? 'badge-amber' : 'badge-grey'}">${esc(cat)}</span>
        </div>
        <div class="conv-detail">
          <div class="bubble bubble-p"><small>Paziente</small>${esc(paz)}</div>
          <div class="bubble bubble-b"><small>Igea</small>${esc(seg)}</div>
        </div></div>`;
    }).join('');
  } catch (e) { box.innerHTML = '<p class="empty">Errore: ' + esc(e.message) + '</p>'; }
}

/* ═══ CALENDARIO — griglia oraria stile Google Calendar ═══ */
const CAL_START_H = 7, CAL_END_H = 20;           // 7:00 → 20:00
const DAY_MIN = (CAL_END_H - CAL_START_H) * 60;  // 780

let calWeek = mondayOf(todayRome());
$('cal-prev').addEventListener('click', () => { calWeek = addDays(calWeek, -7); loadCalendar(); });
$('cal-next').addEventListener('click', () => { calWeek = addDays(calWeek, 7); loadCalendar(); });
$('cal-today').addEventListener('click', () => { calWeek = mondayOf(todayRome()); loadCalendar(); });

function gcalLink(a) {
  const d = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Visita — ' + apptName(a),
    dates: d(a.start) + '/' + d(a.end),
    details: 'Prenotato via Igea' + (apptPhone(a) ? ' — tel ' + apptPhone(a) : ''),
  });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

async function loadCalendar() {
  const box = $('cal-tg');
  const days = Array.from({ length: 7 }, (_, i) => addDays(calWeek, i));
  $('cal-label').textContent = fmtD(days[0] + 'T12:00:00Z') + ' – ' + fmtD(days[6] + 'T12:00:00Z');
  box.innerHTML = '<p class="empty">Caricamento…</p>';
  try {
    const appts = resources(await fhir(
      'Appointment?date=ge' + days[0] + 'T00:00:00&date=le' + days[6] + 'T23:59:59&_sort=date&_count=300'
    ));
    const today = todayRome();
    const wd = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
    const hours = [];
    for (let h = CAL_START_H; h < CAL_END_H; h++) hours.push(h);

    const evBlock = (a) => {
      const s = new Date(a.start), e = new Date(a.end || a.start);
      // minuti dal CAL_START_H nella giornata romana dell'evento
      const sRome = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hour12: false }).format(s).split(':').map(Number);
      const eRome = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hour12: false }).format(e).split(':').map(Number);
      const top = (sRome[0] * 60 + sRome[1]) - CAL_START_H * 60;
      const hgt = Math.max(18, (eRome[0] * 60 + eRome[1]) - (sRome[0] * 60 + sRome[1]));
      if (top < 0 || top > DAY_MIN) return '';
      return `<a class="cal-ev" style="top:${top}px;height:${hgt}px" href="${gcalLink(a)}" target="_blank" rel="noopener" title="${esc(apptName(a))} ${fmtTime(a.start)}–${fmtTime(a.end)} — apri in Google Calendar">
        <b>${fmtTime(a.start)}</b> ${esc(apptName(a))}</a>`;
    };

    box.innerHTML = `
      <div class="cal-tg-inner">
        <div class="cal-tg-corner"></div>
        ${days.map((d, i) => `<div class="cal-tg-dhead ${d === today ? 'today' : ''}">${wd[i]} ${d.slice(8)}/${d.slice(5, 7)}</div>`).join('')}
        <div class="cal-tg-hours">${hours.map((h) => `<div class="cal-tg-hour">${String(h).padStart(2, '0')}:00</div>`).join('')}</div>
        ${days.map((d, i) => `
          <div class="cal-tg-col ${d === today ? 'today' : ''}" style="height:${DAY_MIN}px">
            ${appts.filter((a) => (a.start || '').startsWith(d)).map(evBlock).join('')}
          </div>`).join('')}
      </div>`;
  } catch (e) { box.innerHTML = '<p class="empty">Errore: ' + esc(e.message) + '</p>'; }
}

/* ═══ PAZIENTI — anagrafica CRUD del dottore (FHIR Patient) ═══ */
async function loadPatients() {
  const tb = $('pat-table').querySelector('tbody');
  try {
    const pats = resources(await fhir('Patient?active=true&_sort=family&_count=200'));
    if (!pats.length) {
      tb.innerHTML = '<tr><td colspan="4" class="empty">Nessun paziente in anagrafica: aggiungine uno dal modulo sopra.</td></tr>';
      return;
    }
    tb.innerHTML = pats.map((p) => {
      const name = [(p.name?.[0]?.family || ''), (p.name?.[0]?.given || []).join(' ')].filter(Boolean).join(' ');
      const tel = (p.telecom || []).find((t) => t.system === 'phone')?.value || '';
      return `<tr id="pat-${p.id}">
        <td><b>${esc(name)}</b></td><td>${esc(tel)}</td><td>${p.birthDate ? fmtD(p.birthDate + 'T12:00:00Z') : '—'}</td>
        <td style="white-space:nowrap;text-align:right">
          <button class="btn btn-ghost btn-sm" onclick='editPatient(${JSON.stringify(p.id)})'>Modifica</button>
          <button class="btn btn-ghost btn-sm" onclick='delPatient(${JSON.stringify(p.id)})'>Elimina</button>
        </td></tr>`;
    }).join('');
  } catch (e) { tb.innerHTML = '<tr><td colspan="4" class="empty">Errore: ' + esc(e.message) + '</td></tr>'; }
}

$('pat-add').addEventListener('click', async () => {
  const msg = $('pat-msg');
  const nome = $('pat-nome').value.trim(), cognome = $('pat-cognome').value.trim();
  if (!cognome) { msg.textContent = 'Serve almeno il cognome.'; return; }
  try {
    const p = {
      resourceType: 'Patient', active: true,
      name: [{ family: cognome, given: nome ? [nome] : [] }],
      telecom: $('pat-tel').value.trim() ? [{ system: 'phone', value: $('pat-tel').value.trim() }] : [],
    };
    if ($('pat-nascita').value) p.birthDate = $('pat-nascita').value;
    if (ME_PRACTITIONER) p.generalPractitioner = [{ reference: 'Practitioner/' + ME_PRACTITIONER }];
    await fhirPost(p);
    msg.textContent = '✓ paziente aggiunto';
    $('pat-nome').value = ''; $('pat-cognome').value = ''; $('pat-tel').value = ''; $('pat-nascita').value = '';
    loadPatients();
  } catch (e) { msg.textContent = 'Errore: ' + e.message; }
});

window.editPatient = async (id) => {
  try {
    const p = await fhir('Patient/' + id);
    const nome = (p.name?.[0]?.given || []).join(' ');
    const cognome = p.name?.[0]?.family || '';
    const tel = (p.telecom || []).find((t) => t.system === 'phone')?.value || '';
    const n2 = prompt('Nome:', nome);
    if (n2 === null) return;
    const c2 = prompt('Cognome:', cognome);
    if (c2 === null) return;
    const t2 = prompt('Telefono:', tel);
    if (t2 === null) return;
    p.name = [{ family: c2.trim() || cognome, given: n2.trim() ? [n2.trim()] : [] }];
    p.telecom = t2.trim() ? [{ system: 'phone', value: t2.trim() }] : [];
    await fhirPut(p);
    loadPatients();
  } catch (e) { alert('Modifica fallita: ' + e.message); }
};

window.delPatient = async (id) => {
  if (!confirm('Eliminare questo paziente dall\'anagrafica? (disattivazione, i dati restano nello storico)')) return;
  try {
    const p = await fhir('Patient/' + id);
    p.active = false;
    await fhirPut(p);
    loadPatients();
  } catch (e) { alert('Eliminazione fallita: ' + e.message); }
};

/* ═══ IMPOSTAZIONI ═══ */
let studioOrg = null;

/* Extension segreteria-config — contratto COPIATO 1:1 da
   EMR apps/web/src/lib/multi-tenant/organization-extensions.ts e da
   services/segretaria/tenant.py: se cambia là, cambia anche qui. */
const EXT_SEGRETERIA = 'https://firmamento.tech/fhir/StructureDefinition/segreteria-config';
const SEG_KEYS = ['orari', 'numeroUrgenze', 'medicoDiTurno', 'farmaciaDiTurno', 'info'];
let segConfig = { orari: '', numeroUrgenze: '', medicoDiTurno: '', farmaciaDiTurno: '', info: '' };

function readSegreteriaConfig(org) {
  const root = (org?.extension || []).find((e) => e.url === EXT_SEGRETERIA);
  const out = { ...segConfig };
  (root?.extension || []).forEach((s) => {
    if (s && SEG_KEYS.includes(s.url) && typeof s.valueString === 'string') out[s.url] = s.valueString;
  });
  return out;
}

function withSegreteriaConfig(org, cfg) {
  const subExts = SEG_KEYS.map((k) => ({ url: k, valueString: cfg[k] || '' }));
  const others = (org.extension || []).filter((e) => e.url !== EXT_SEGRETERIA);
  return { ...org, extension: [...others, { url: EXT_SEGRETERIA, extension: subExts }] };
}

function fillSegreteriaForm() {
  $('st-orari').value = segConfig.orari;
  $('sg-urgenze').value = segConfig.numeroUrgenze;
  $('sg-medico').value = segConfig.medicoDiTurno;
  $('sg-farmacia').value = segConfig.farmaciaDiTurno;
  $('sg-info').value = segConfig.info;
}

async function loadStudio() {
  try {
    const orgs = resources(await fhir('Organization?_count=1'));
    studioOrg = orgs[0] || null;
    if (studioOrg) {
      $('st-nome').value = studioOrg.name || '';
      $('st-tel').value = (studioOrg.telecom || []).find((t) => t.system === 'phone')?.value || '';
      const addr = studioOrg.address?.[0];
      $('st-ind').value = addr ? [(addr.line || []).join(' '), addr.city, addr.postalCode].filter(Boolean).join(', ') : '';
      segConfig = readSegreteriaConfig(studioOrg);
    }
    fillSegreteriaForm();
  } catch (e) { console.warn('studio', e); }
}

$('st-save').addEventListener('click', async () => {
  const msg = $('st-msg');
  msg.textContent = '';
  try {
    if (!studioOrg) {
      studioOrg = { resourceType: 'Organization', name: '' };
    }
    studioOrg.name = $('st-nome').value.trim();
    studioOrg.telecom = [{ system: 'phone', value: $('st-tel').value.trim() }];
    studioOrg.address = [{ line: [$('st-ind').value.trim()], country: 'IT' }];
    // la card 1 possiede il campo orari; gli altri campi restano come caricati
    segConfig = { ...segConfig, orari: $('st-orari').value.trim() };
    studioOrg = withSegreteriaConfig(studioOrg, segConfig);
    studioOrg = studioOrg.id ? await fhirPut(studioOrg) : await fhirPost(studioOrg);
    msg.textContent = '✓ salvato';
  } catch (e) { msg.textContent = 'Errore: ' + e.message; }
});

$('sg-save').addEventListener('click', async () => {
  const msg = $('sg-msg');
  msg.textContent = '';
  try {
    if (!studioOrg) {
      msg.textContent = 'Salva prima i dati dello studio (sezione 1).';
      return;
    }
    segConfig = {
      ...segConfig,
      numeroUrgenze: $('sg-urgenze').value.trim(),
      medicoDiTurno: $('sg-medico').value.trim(),
      farmaciaDiTurno: $('sg-farmacia').value.trim(),
      info: $('sg-info').value.trim(),
    };
    studioOrg = await fhirPut(withSegreteriaConfig(studioOrg, segConfig));
    msg.textContent = '✓ salvato — Igea userà queste informazioni da subito';
  } catch (e) { msg.textContent = 'Errore: ' + e.message; }
});

async function loadDocs() {
  const tb = $('doc-table').querySelector('tbody');
  try {
    const docs = resources(await fhir('Practitioner?_count=100&_sort=family'));
    const since14 = addDays(todayRome(), 14);
    const rows = await Promise.all(docs.map(async (d) => {
      const name = [(d.name?.[0]?.given || []).join(' '), d.name?.[0]?.family || ''].filter(Boolean).join(' ');
      const scheds = resources(await fhir('Schedule?actor=Practitioner/' + d.id + '&_count=5'));
      let free = '—';
      if (scheds.length) {
        const c = await fhir('Slot?schedule=' + scheds.map((s) => 'Schedule/' + s.id).join(',') + '&status=free&start=le' + since14 + '&_summary=count');
        free = String(c.total ?? 0);
      }
      return { id: d.id, name, agenda: scheds.length ? 'attiva' : 'da creare', free };
    }));
    tb.innerHTML = rows.length
      ? rows.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td>${r.agenda}</td><td>${r.free}</td></tr>`).join('')
      : '<tr><td colspan="3" class="empty">Nessun medico: aggiungine uno qui sotto.</td></tr>';
    $('ag-medico').innerHTML = rows.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
  } catch (e) { tb.innerHTML = '<tr><td colspan="3" class="empty">Errore: ' + esc(e.message) + '</td></tr>'; }
}

$('doc-add').addEventListener('click', async () => {
  const msg = $('doc-msg');
  const nome = $('doc-nome').value.trim(), cognome = $('doc-cognome').value.trim();
  if (!cognome) { msg.textContent = 'Serve almeno il cognome.'; return; }
  try {
    await fhirPost({ resourceType: 'Practitioner', active: true, name: [{ family: cognome, given: nome ? [nome] : [] }] });
    msg.textContent = '✓ medico aggiunto';
    $('doc-nome').value = ''; $('doc-cognome').value = '';
    loadDocs();
  } catch (e) { msg.textContent = 'Errore: ' + e.message; }
});

$('ag-go').addEventListener('click', async () => {
  const msg = $('ag-msg');
  const pracId = $('ag-medico').value;
  if (!pracId) { msg.textContent = 'Aggiungi prima un medico.'; return; }
  const days = Array.from(document.querySelectorAll('#ag-days input:checked')).map((x) => Number(x.value));
  const from = $('ag-from').value, to = $('ag-to').value;
  const dur = Math.max(5, Number($('ag-dur').value) || 30);
  const weeks = Math.min(8, Math.max(1, Number($('ag-weeks').value) || 2));
  if (!days.length) { msg.textContent = 'Seleziona almeno un giorno.'; return; }
  msg.textContent = 'generazione in corso…';
  try {
    // 1. Schedule del medico (riusa se esiste)
    let sched = resources(await fhir('Schedule?actor=Practitioner/' + pracId + '&_count=1'))[0];
    if (!sched) {
      const prac = await fhir('Practitioner/' + pracId);
      const disp = [(prac.name?.[0]?.given || []).join(' '), prac.name?.[0]?.family || ''].filter(Boolean).join(' ');
      sched = await fhirPost({
        resourceType: 'Schedule', active: true,
        actor: [{ reference: 'Practitioner/' + pracId, display: disp }],
      });
    }
    // 2. Slot esistenti nello stesso arco (per non duplicare)
    const startDay = todayRome();
    const endDay = addDays(startDay, weeks * 7);
    const existing = new Set(
      resources(await fhir('Slot?schedule=Schedule/' + sched.id + '&start=ge' + startDay + '&start=le' + endDay + '&_count=500'))
        .map((s) => (s.start || '').slice(0, 16))
    );
    // 3. Genera
    let created = 0, skipped = 0;
    for (let d = 0; d < weeks * 7; d++) {
      const day = addDays(startDay, d);
      const wd = new Date(day + 'T12:00:00Z').getUTCDay();
      if (!days.includes(wd)) continue;
      let t = from;
      while (t < to) {
        const endMin = hhmmToMin(t) + dur;
        const tEnd = minToHhmm(endMin);
        if (tEnd > to) break;
        const startIso = romeIso(day, t);
        if (!existing.has(startIso.slice(0, 16))) {
          await fhirPost({
            resourceType: 'Slot',
            schedule: { reference: 'Schedule/' + sched.id },
            status: 'free',
            start: startIso,
            end: romeIso(day, tEnd),
          });
          created++;
        } else skipped++;
        t = tEnd;
      }
    }
    msg.textContent = `✓ ${created} slot creati (${skipped} già esistenti)`;
    loadDocs();
  } catch (e) { msg.textContent = 'Errore: ' + e.message; }
});

const hhmmToMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const minToHhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

/* ═══ PRIVACY — cancellazione art. 17 GDPR ═══
   Le conversazioni Igea sono Communication con identifier
   urn:firmamento:segretaria:sessione = "sms:{studio|single}:{sha256(telefono)[:16]}"
   (hash calcolato come in services/segretaria/main.py). Le Task di handoff
   aperte portano lo stesso identifier. Per policy: si cancellano SOLO queste;
   Appointment/MedicationRequest/AuditEvent restano (obbligo conservazione). */
const SESSION_SYS = 'urn:firmamento:segretaria:sessione';
let pvFound = { comms: [], tasks: [] };

async function sha256hex16(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function pvSearch() {
  const tel = $('pv-tel').value.trim().replace(/[\s-]/g, '');
  if (!tel) { $('pv-msg').textContent = 'Inserisci il numero in formato internazionale (es. +393331234567).'; return null; }
  const digest = await sha256hex16(tel);
  const sids = ['sms:single:' + digest];
  if (studioOrg?.id) sids.push('sms:' + studioOrg.id + ':' + digest);
  const comms = [], tasks = [];
  for (const sid of sids) {
    const idq = encodeURIComponent(SESSION_SYS + '|' + sid);
    comms.push(...resources(await fhir('Communication?identifier=' + idq + '&_count=1000')));
    tasks.push(...resources(await fhir('Task?identifier=' + idq + '&status=requested&_count=1000')));
  }
  return { comms, tasks };
}

$('pv-find').addEventListener('click', async () => {
  const msg = $('pv-msg');
  msg.textContent = 'ricerca…';
  $('pv-delete').style.display = 'none';
  try {
    pvFound = await pvSearch() || { comms: [], tasks: [] };
    const n = pvFound.comms.length + pvFound.tasks.length;
    if (!n) {
      msg.textContent = 'Nessun dato Igea per questo numero (0 conversazioni, 0 richieste aperte).';
    } else {
      msg.textContent = `Trovati: ${pvFound.comms.length} conversazioni + ${pvFound.tasks.length} richieste di richiamo aperte. La cancellazione è definitiva.`;
      $('pv-delete').style.display = '';
    }
  } catch (e) { msg.textContent = 'Errore: ' + e.message; }
});

$('pv-delete').addEventListener('click', async () => {
  const msg = $('pv-msg');
  if (!confirm('Confermi la cancellazione DEFINITIVA delle conversazioni Igea di questo numero e delle richieste di richiamo aperte? (Appuntamenti e ricette restano, per obbligo di legge)')) return;
  msg.textContent = 'cancellazione…';
  $('pv-delete').style.display = 'none';
  let ok = 0, err = 0;
  try {
    for (const r of [...pvFound.comms, ...pvFound.tasks]) {
      try {
        await fhir(r.resourceType + '/' + r.id, { method: 'DELETE' });
        ok++;
      } catch { err++; }
    }
    msg.textContent = `✓ Cancellati ${ok} record${err ? ` (${err} errori — riprova)` : ''}. Registra l'esito sul registro privacy (data, numero anonimizzato, ${ok} record).`;
    pvFound = { comms: [], tasks: [] };
  } catch (e) { msg.textContent = 'Errore: ' + e.message; }
});

/* ═══ Google Calendar (.ics) ═══ */
$('ics-btn').addEventListener('click', async () => {
  try {
    const day = todayRome();
    const appts = resources(await fhir('Appointment?_tag=' + encodeURIComponent(TAG) + '&date=ge' + day + 'T00:00:00&_sort=date&_count=200'));
    if (!appts.length) { alert('Nessun appuntamento futuro da esportare.'); return; }
    const icsDate = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Igea//Console//IT']
      .concat(appts.flatMap((a) => [
        'BEGIN:VEVENT',
        'UID:' + a.id + '@igea',
        'DTSTART:' + icsDate(a.start),
        'DTEND:' + icsDate(a.end),
        'SUMMARY:' + ('Visita — ' + apptName(a)).replace(/[,;]/g, ' '),
        'DESCRIPTION:' + ('Prenotato via Igea' + (apptPhone(a) ? ' — tel ' + apptPhone(a) : '')).replace(/[,;]/g, ' '),
        'END:VEVENT',
      ]))
      .concat(['END:VCALENDAR']).join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'igea-appuntamenti.ics';
    a.click();
  } catch (e) { alert('Export fallito: ' + e.message); }
});
