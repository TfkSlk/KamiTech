'use strict';

/* ---------- Référentiels ---------- */
const ACTIVITES = {
  cee:     { label: 'CEE',              long: "Certificats d'économie d'énergie", partenaire: 'Délégataire / obligé' },
  energie: { label: 'Énergie',          long: "Fournisseurs d'énergie",           partenaire: 'Fournisseur / courtier' },
  foncier: { label: 'Taxe foncière',    long: 'Récupération de taxe foncière',    partenaire: 'Cabinet partenaire' },
};
const EVENT_TYPES = { ...ACTIVITES, perso: { label: 'Perso / Groupe', long: 'Perso / Groupe' } };

const STATUTS = {
  prospect: 'Prospect',
  rdv:      'RDV fixé',
  etude:    'Étude en cours',
  signe:    'Signé',
  paye:     'Payé',
  perdu:    'Perdu',
};
const ACTIFS = ['prospect', 'rdv', 'etude', 'signe'];

/* ---------- Stockage ---------- */
const KEY = 'kami-dashboard-v1';
const blank = () => ({ nom: 'Kami Groupe', dossiers: [], events: [] });
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw) };
  } catch (e) { /* stockage indisponible */ }
  return blank();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast("Impossible d'enregistrer dans ce navigateur"); }
}

/* ---------- Utilitaires ---------- */
const $ = (s, el = document) => el.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const eur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
const num = v => Number(String(v ?? '').replace(',', '.')) || 0;
const fmtDate = s => s ? parse(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
const fmtLong = d => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tag = a => `<span class="tag" style="--c:var(--${a})">${esc(EVENT_TYPES[a]?.label || a)}</span>`;
const statusBadge = s => `<span class="status ${s}">${STATUTS[s]}</span>`;
const dossier = id => state.dossiers.find(d => d.id === id);

/* Confirmation intégrée à la page (les boîtes du navigateur ne sont pas toujours disponibles) */
function confirmer(msg, label = 'Confirmer') {
  return new Promise(resolve => {
    const d = $('#confirm');
    $('#confirm-msg').textContent = msg;
    $('#confirm-ok').textContent = label;
    d.onclose = () => resolve(d.returnValue === 'ok');
    d.returnValue = '';
    d.showModal();
  });
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* Relances des dossiers, affichées comme des éléments de planning */
function relances() {
  return state.dossiers
    .filter(d => d.dateRelance && ACTIFS.includes(d.statut))
    .map(d => ({ id: 'r-' + d.id, dossierId: d.id, date: d.dateRelance, heure: '', titre: `Relance · ${d.entreprise}`, activite: d.activite, relance: true }));
}

/* ---------- Routage ---------- */
const views = { dashboard, planning, dossiers, commissions, parametres };
let weekStart = monday(new Date());
let filtre = { activite: 'all', statut: 'actifs', q: '' };

function render() {
  const view = (location.hash.slice(1) || 'dashboard');
  const fn = views[view] || dashboard;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === (views[view] ? view : 'dashboard')));
  $('#brand-name').textContent = state.nom;
  document.title = state.nom;
  $('#main').innerHTML = fn();
}
window.addEventListener('hashchange', render);

/* ---------- Tableau de bord ---------- */
function dashboard() {
  const t = today();
  const year = String(new Date().getFullYear());
  const actifs = state.dossiers.filter(d => ACTIFS.includes(d.statut));
  const pipeline = actifs.filter(d => d.statut !== 'signe').reduce((s, d) => s + num(d.commEstimee), 0);
  const aEncaisser = state.dossiers.filter(d => d.statut === 'signe').reduce((s, d) => s + Math.max(0, num(d.commEstimee) - num(d.commRecue)), 0);
  const encaisseAn = state.dossiers.filter(d => (d.datePaiement || '').startsWith(year)).reduce((s, d) => s + num(d.commRecue), 0);
  const ws = iso(monday(new Date())), we = iso(addDays(monday(new Date()), 6));
  const semaine = state.events.filter(e => e.date >= ws && e.date <= we && !e.fait).length;

  const todayItems = [...state.events.filter(e => e.date === t), ...relances().filter(r => r.date === t)]
    .sort((a, b) => (a.heure || '99').localeCompare(b.heure || '99'));
  const retard = relances().filter(r => r.date < t).sort((a, b) => a.date.localeCompare(b.date));
  const lateTasks = state.events.filter(e => e.date < t && !e.fait);
  const next7 = state.events.filter(e => e.date > t && e.date <= iso(addDays(new Date(), 7)))
    .sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));

  const actCards = Object.entries(ACTIVITES).map(([k, a]) => {
    const ds = state.dossiers.filter(d => d.activite === k);
    const act = ds.filter(d => ACTIFS.includes(d.statut));
    return `<div class="card act-card" style="--c:var(--${k})">
      <div class="title"><span>${a.long}</span>${tag(k)}</div>
      <dl>
        <dt>Dossiers actifs</dt><dd>${act.length}</dd>
        <dt>Signés</dt><dd>${ds.filter(d => d.statut === 'signe' || d.statut === 'paye').length}</dd>
        <dt>Commissions potentielles</dt><dd>${eur(act.reduce((s, d) => s + num(d.commEstimee), 0))}</dd>
        <dt>Encaissé ${year}</dt><dd>${eur(ds.filter(d => (d.datePaiement || '').startsWith(year)).reduce((s, d) => s + num(d.commRecue), 0))}</dd>
      </dl>
    </div>`;
  }).join('');

  return `
  <div class="page-head">
    <div><h1>Bonjour 👋</h1><p style="text-transform:capitalize">${fmtLong(new Date())}</p></div>
    <div class="btn-row">
      <button class="btn" onclick="openEvent()">+ Tâche / RDV</button>
      <button class="btn primary" onclick="openDossier()">+ Dossier</button>
    </div>
  </div>
  ${state.dossiers.length || state.events.length ? '' : `<div class="card" style="margin-bottom:16px">
    <h2>Bienvenue dans ton tableau de bord</h2>
    <p class="empty">Ajoute ton premier dossier ou ton premier RDV, ou charge un exemple pour voir à quoi ça ressemble.</p>
    <button class="btn" onclick="loadDemo()">Charger un exemple</button></div>`}
  <div class="grid kpis">
    <div class="card kpi"><div class="label">Dossiers actifs</div><div class="value">${actifs.length}</div><div class="sub">prospects → signés</div></div>
    <div class="card kpi"><div class="label">Commissions potentielles</div><div class="value">${eur(pipeline)}</div><div class="sub">dossiers pas encore signés</div></div>
    <div class="card kpi"><div class="label">Signé, à encaisser</div><div class="value">${eur(aEncaisser)}</div><div class="sub">en attente de paiement</div></div>
    <div class="card kpi"><div class="label">Encaissé ${year}</div><div class="value">${eur(encaisseAn)}</div><div class="sub">${semaine} tâche(s) cette semaine</div></div>
  </div>
  <div class="grid cols-3">${actCards}</div>
  <div class="grid cols-2">
    <div class="card"><h2>Aujourd'hui</h2>${itemList(todayItems, false) || '<div class="empty">Rien de prévu aujourd\'hui.</div>'}</div>
    <div class="card"><h2>En retard</h2>${itemList([...retard, ...lateTasks], true) || '<div class="empty">Tout est à jour ✔</div>'}</div>
    <div class="card"><h2>7 prochains jours</h2>${itemList(next7, true) || '<div class="empty">Aucune tâche planifiée.</div>'}</div>
    <div class="card"><h2>Derniers dossiers</h2>${dossierList([...state.dossiers].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6)) || '<div class="empty">Aucun dossier.</div>'}</div>
  </div>`;
}

function itemList(items, showDate) {
  if (!items.length) return '';
  const t = today();
  return `<ul class="list">${items.map(e => {
    const d = e.dossierId && dossier(e.dossierId);
    const when = showDate ? fmtDate(e.date) + (e.heure ? ' ' + e.heure : '') : (e.heure || '—');
    const click = e.relance ? `openDossier('${e.dossierId}')` : `openEvent('${e.id}')`;
    return `<li class="${e.fait ? 'done' : ''}">
      ${e.relance ? '<span style="width:18px;text-align:center">↻</span>' : `<input type="checkbox" ${e.fait ? 'checked' : ''} onchange="toggleEvent('${e.id}')" aria-label="Fait">`}
      <span class="when ${e.date < t && !e.fait ? 'late' : ''}">${esc(when)}</span>
      <div class="grow clickable" onclick="${click}"><div class="title-txt">${esc(e.titre)}</div>${d && !e.relance ? `<div class="meta">${esc(d.entreprise)}</div>` : ''}</div>
      ${tag(e.activite)}
    </li>`;
  }).join('')}</ul>`;
}

function dossierList(ds) {
  if (!ds.length) return '';
  return `<ul class="list">${ds.map(d => `<li class="clickable" onclick="openDossier('${d.id}')">
    <div class="grow"><div class="title-txt">${esc(d.entreprise)}</div><div class="meta">${esc(d.contact || '')}${d.ville ? ' · ' + esc(d.ville) : ''}</div></div>
    ${tag(d.activite)} ${statusBadge(d.statut)}
  </li>`).join('')}</ul>`;
}

/* ---------- Planning ---------- */
function planning() {
  const t = today();
  const end = addDays(weekStart, 6);
  const all = [...state.events, ...relances()];
  const label = `${weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const days = [...Array(7)].map((_, i) => {
    const d = addDays(weekStart, i), ds = iso(d);
    const evs = all.filter(e => e.date === ds).sort((a, b) => (a.heure || '99').localeCompare(b.heure || '99'));
    return `<div class="day ${ds === t ? 'today' : ''}">
      <div class="day-head"><span>${d.toLocaleDateString('fr-FR', { weekday: 'long' })}</span><b>${d.getDate()}</b></div>
      ${evs.map(e => `<div class="ev ${e.fait ? 'done' : ''} ${e.relance ? 'relance' : ''}" style="--c:var(--${e.activite})"
          onclick="${e.relance ? `openDossier('${e.dossierId}')` : `openEvent('${e.id}')`}">
        ${e.heure ? `<div class="t">${esc(e.heure)}</div>` : ''}${esc(e.titre)}</div>`).join('')}
      <button class="add" onclick="openEvent(null,'${ds}')">+ Ajouter</button>
    </div>`;
  }).join('');

  return `
  <div class="page-head">
    <div><h1>Planning</h1><p>Tes RDV, tâches et relances de dossiers</p></div>
    <div class="week-nav">
      <button class="btn" onclick="shiftWeek(-7)" aria-label="Semaine précédente">‹</button>
      <strong>${label}</strong>
      <button class="btn" onclick="shiftWeek(7)" aria-label="Semaine suivante">›</button>
      <button class="btn" onclick="shiftWeek(0)">Aujourd'hui</button>
    </div>
  </div>
  <div class="week">${days}</div>`;
}
function shiftWeek(n) { weekStart = n ? addDays(weekStart, n) : monday(new Date()); render(); }

/* ---------- Dossiers ---------- */
function dossiers() {
  const q = filtre.q.toLowerCase();
  const rows = state.dossiers.filter(d =>
    (filtre.activite === 'all' || d.activite === filtre.activite) &&
    (filtre.statut === 'all' || (filtre.statut === 'actifs' ? ACTIFS.includes(d.statut) : d.statut === filtre.statut)) &&
    (!q || [d.entreprise, d.contact, d.ville, d.partenaire, d.notes].join(' ').toLowerCase().includes(q))
  ).sort((a, b) => (a.dateRelance || '9999').localeCompare(b.dateRelance || '9999'));
  const t = today();

  const chips = [['all', 'Toutes'], ...Object.entries(ACTIVITES).map(([k, a]) => [k, a.label])]
    .map(([k, l]) => `<button class="chip ${filtre.activite === k ? 'on' : ''}" onclick="setFiltre('activite','${k}')">${l}</button>`).join('');

  return `
  <div class="page-head">
    <div><h1>Dossiers</h1><p>${state.dossiers.length} dossier(s) au total</p></div>
    <button class="btn primary" onclick="openDossier()">+ Dossier</button>
  </div>
  <div class="toolbar">
    ${chips}
    <select onchange="setFiltre('statut',this.value)" aria-label="Statut">
      <option value="actifs" ${filtre.statut === 'actifs' ? 'selected' : ''}>En cours</option>
      <option value="all" ${filtre.statut === 'all' ? 'selected' : ''}>Tous les statuts</option>
      ${Object.entries(STATUTS).map(([k, l]) => `<option value="${k}" ${filtre.statut === k ? 'selected' : ''}>${l}</option>`).join('')}
    </select>
    <input type="search" placeholder="Rechercher une entreprise, un contact…" value="${esc(filtre.q)}" oninput="filtre.q=this.value;refreshTable()">
  </div>
  <div class="card table-wrap" id="dossiers-table">${rows.length ? `
    <table>
      <thead><tr><th>Entreprise</th><th>Activité</th><th>Statut</th><th class="hide-sm">Partenaire</th><th class="num">Commission</th><th class="num">Relance</th></tr></thead>
      <tbody>${rows.map(d => `<tr class="clickable" onclick="openDossier('${d.id}')">
        <td><strong>${esc(d.entreprise)}</strong><div class="list meta">${esc(d.contact || '')}${d.tel ? ' · ' + esc(d.tel) : ''}</div></td>
        <td>${tag(d.activite)}</td>
        <td>${statusBadge(d.statut)}</td>
        <td class="hide-sm">${esc(d.partenaire || '')}</td>
        <td class="num">${eur(d.commEstimee)}</td>
        <td class="num ${d.dateRelance && d.dateRelance < t && ACTIFS.includes(d.statut) ? 'late' : ''}" style="${d.dateRelance && d.dateRelance < t && ACTIFS.includes(d.statut) ? 'color:var(--danger);font-weight:600' : ''}">${fmtDate(d.dateRelance)}</td>
      </tr>`).join('')}</tbody>
    </table>` : '<div class="empty">Aucun dossier ne correspond.</div>'}
  </div>`;
}
function setFiltre(k, v) { filtre[k] = v; render(); }
function refreshTable() {
  const html = dossiers();
  const tmp = document.createElement('div'); tmp.innerHTML = html;
  $('#dossiers-table').replaceWith($('#dossiers-table', tmp));
}

/* ---------- Commissions ---------- */
function commissions() {
  const rows = state.dossiers.filter(d => d.statut === 'signe' || d.statut === 'paye')
    .sort((a, b) => (a.statut === 'paye') - (b.statut === 'paye') || (b.dateSignature || '').localeCompare(a.dateSignature || ''));
  const tot = rows.reduce((s, d) => ({ e: s.e + num(d.commEstimee), r: s.r + num(d.commRecue) }), { e: 0, r: 0 });

  return `
  <div class="page-head">
    <div><h1>Commissions</h1><p>Dossiers signés et paiements reçus</p></div>
  </div>
  <div class="grid kpis">
    <div class="card kpi"><div class="label">Total signé</div><div class="value">${eur(tot.e)}</div></div>
    <div class="card kpi"><div class="label">Encaissé</div><div class="value">${eur(tot.r)}</div></div>
    <div class="card kpi"><div class="label">Reste à encaisser</div><div class="value">${eur(Math.max(0, tot.e - tot.r))}</div></div>
    <div class="card kpi"><div class="label">Dossiers signés</div><div class="value">${rows.length}</div></div>
  </div>
  <div class="card table-wrap">${rows.length ? `
    <table>
      <thead><tr><th>Entreprise</th><th>Activité</th><th class="hide-sm">Partenaire</th><th class="num hide-sm">Signé le</th><th class="num">Prévue</th><th class="num">Reçue</th><th></th></tr></thead>
      <tbody>${rows.map(d => `<tr>
        <td class="clickable" onclick="openDossier('${d.id}')"><strong class="title-txt">${esc(d.entreprise)}</strong></td>
        <td>${tag(d.activite)}</td>
        <td class="hide-sm">${esc(d.partenaire || '')}</td>
        <td class="num hide-sm">${fmtDate(d.dateSignature)}</td>
        <td class="num">${eur(d.commEstimee)}</td>
        <td class="num">${eur(d.commRecue)}</td>
        <td class="num">${d.statut === 'paye' ? statusBadge('paye') : `<button class="btn small" onclick="marquerPaye('${d.id}')">Marquer payé</button>`}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">Total</td><td class="hide-sm"></td><td class="hide-sm"></td><td class="num">${eur(tot.e)}</td><td class="num">${eur(tot.r)}</td><td></td></tr></tfoot>
    </table>` : '<div class="empty">Aucun dossier signé pour le moment. Passe un dossier au statut « Signé » pour le voir ici.</div>'}
  </div>`;
}
function marquerPaye(id) {
  const d = dossier(id);
  d.statut = 'paye';
  if (!num(d.commRecue)) d.commRecue = d.commEstimee;
  d.datePaiement = d.datePaiement || today();
  save(); render(); toast('Commission marquée comme payée');
}

/* ---------- Paramètres ---------- */
function parametres() {
  return `
  <div class="page-head"><div><h1>Paramètres</h1><p>Nom, sauvegarde et données</p></div></div>
  <div class="settings">
    <div class="card">
      <h2>Nom affiché</h2>
      <div class="toolbar" style="margin:0"><input type="search" id="nom" value="${esc(state.nom)}" style="max-width:320px">
      <button class="btn primary" onclick="state.nom=$('#nom').value.trim()||'Kami Groupe';save();render();toast('Nom mis à jour')">Enregistrer</button></div>
    </div>
    <div class="card">
      <h2>Sauvegarde</h2>
      <p>Tes données sont enregistrées uniquement dans ce navigateur. Exporte-les régulièrement pour ne rien perdre, ou pour les transférer sur un autre appareil.</p>
      <div class="btn-row">
        <button class="btn primary" onclick="exporter()">Exporter (.json)</button>
        <button class="btn" onclick="copier()">Copier la sauvegarde</button>
        <label class="btn">Importer…<input type="file" accept="application/json" hidden onchange="importer(this.files[0])"></label>
      </div>
    </div>
    <div class="card">
      <h2>Données</h2>
      <p>${state.dossiers.length} dossier(s), ${state.events.length} tâche(s) / RDV.</p>
      <div class="btn-row">
        <button class="btn" onclick="loadDemo()">Charger un exemple</button>
        <button class="btn danger" onclick="toutEffacer()">Tout effacer</button>
      </div>
    </div>
  </div>`;
}
function exporter() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kami-sauvegarde-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function copier() {
  const txt = JSON.stringify(state);
  navigator.clipboard.writeText(txt).then(() => toast('Sauvegarde copiée : colle-la dans une note ou un e-mail'))
    .catch(() => toast('Copie impossible ici, utilise Exporter'));
}
function importer(file) {
  if (!file) return;
  file.text().then(txt => {
    const data = JSON.parse(txt);
    if (!Array.isArray(data.dossiers) || !Array.isArray(data.events)) throw new Error();
    return confirmer('Remplacer les données actuelles par celles du fichier ?', 'Remplacer').then(ok => {
      if (!ok) return;
      state = { ...blank(), ...data };
      save(); render(); toast('Sauvegarde importée');
    });
  }).catch(() => toast("Ce fichier n'est pas une sauvegarde valide"));
}
async function toutEffacer() {
  if (!await confirmer('Effacer tous les dossiers et tâches ? Pense à exporter avant.', 'Tout effacer')) return;
  state = { ...blank(), nom: state.nom };
  save(); render(); toast('Données effacées');
}

/* ---------- Formulaires ---------- */
const modal = () => $('#modal');
const field = (name, label, input, full) => `<div class="field ${full ? 'full' : ''}"><label for="f-${name}">${label}</label>${input}</div>`;
const inp = (name, val, type = 'text', extra = '') => `<input id="f-${name}" name="${name}" type="${type}" value="${esc(val ?? '')}" ${extra}>`;
const sel = (name, opts, val) => `<select id="f-${name}" name="${name}">${Object.entries(opts).map(([k, o]) => `<option value="${k}" ${k === val ? 'selected' : ''}>${esc(typeof o === 'string' ? o : o.long)}</option>`).join('')}</select>`;

function openDossier(id) {
  const d = id ? dossier(id) : { activite: filtre.activite !== 'all' ? filtre.activite : 'cee', statut: 'prospect' };
  $('#modal-form').innerHTML = `
    <h2>${id ? 'Modifier le dossier' : 'Nouveau dossier'}</h2>
    <div class="fields">
      ${field('entreprise', 'Entreprise *', inp('entreprise', d.entreprise, 'text', 'required'), true)}
      ${field('activite', 'Activité', sel('activite', ACTIVITES, d.activite))}
      ${field('statut', 'Statut', sel('statut', STATUTS, d.statut))}
      ${field('contact', 'Contact', inp('contact', d.contact))}
      ${field('tel', 'Téléphone', inp('tel', d.tel, 'tel'))}
      ${field('email', 'E-mail', inp('email', d.email, 'email'))}
      ${field('ville', 'Ville', inp('ville', d.ville))}
      ${field('partenaire', 'Partenaire (fournisseur, délégataire, cabinet)', inp('partenaire', d.partenaire), true)}
      ${field('commEstimee', 'Commission prévue (€)', inp('commEstimee', d.commEstimee, 'number', 'min="0" step="1" inputmode="decimal"'))}
      ${field('commRecue', 'Commission reçue (€)', inp('commRecue', d.commRecue, 'number', 'min="0" step="1" inputmode="decimal"'))}
      ${field('dateRelance', 'Prochaine relance', inp('dateRelance', d.dateRelance, 'date'))}
      ${field('dateSignature', 'Date de signature', inp('dateSignature', d.dateSignature, 'date'))}
      ${field('notes', 'Notes', `<textarea id="f-notes" name="notes">${esc(d.notes || '')}</textarea>`, true)}
    </div>
    <div class="modal-actions">
      <div>${id ? `<button type="button" class="btn danger" onclick="supprimerDossier('${id}')">Supprimer</button>` : ''}</div>
      <div class="btn-row">
        ${id ? `<button type="button" class="btn" onclick="openEvent(null,null,'${id}')">+ RDV lié</button>` : ''}
        <button type="button" class="btn" onclick="modal().close()">Annuler</button>
        <button class="btn primary" value="ok">Enregistrer</button>
      </div>
    </div>`;
  $('#modal-form').onsubmit = e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const target = id ? d : { id: uid(), createdAt: Date.now() };
    Object.assign(target, f);
    if (f.statut === 'signe' && !target.dateSignature) target.dateSignature = today();
    if (f.statut === 'paye') {
      if (!target.dateSignature) target.dateSignature = today();
      if (!target.datePaiement) target.datePaiement = today();
      if (!num(target.commRecue)) target.commRecue = target.commEstimee;
    }
    if (!id) state.dossiers.push(target);
    save(); modal().close(); render(); toast(id ? 'Dossier mis à jour' : 'Dossier créé');
  };
  modal().showModal();
}
async function supprimerDossier(id) {
  modal().close();
  if (!await confirmer('Supprimer ce dossier ?', 'Supprimer')) return;
  state.dossiers = state.dossiers.filter(d => d.id !== id);
  state.events.forEach(e => { if (e.dossierId === id) e.dossierId = ''; });
  save(); modal().close(); render(); toast('Dossier supprimé');
}

function openEvent(id, date, dossierId) {
  const linked = dossierId && dossier(dossierId);
  const e = id ? state.events.find(x => x.id === id)
    : { date: date || today(), heure: '', activite: linked ? linked.activite : 'perso', dossierId: dossierId || '', titre: linked ? `RDV ${linked.entreprise}` : '' };
  const opts = { '': '— Aucun —', ...Object.fromEntries(state.dossiers.map(d => [d.id, `${d.entreprise} (${ACTIVITES[d.activite].label})`])) };
  $('#modal-form').innerHTML = `
    <h2>${id ? 'Modifier' : 'Nouvelle tâche / RDV'}</h2>
    <div class="fields">
      ${field('titre', 'Titre *', inp('titre', e.titre, 'text', 'required'), true)}
      ${field('date', 'Date', inp('date', e.date, 'date', 'required'))}
      ${field('heure', 'Heure', inp('heure', e.heure, 'time'))}
      ${field('activite', 'Activité', sel('activite', EVENT_TYPES, e.activite))}
      ${field('dossierId', 'Dossier lié', sel('dossierId', opts, e.dossierId || ''))}
      ${field('notes', 'Notes', `<textarea id="f-notes" name="notes">${esc(e.notes || '')}</textarea>`, true)}
    </div>
    <div class="modal-actions">
      <div>${id ? `<button type="button" class="btn danger" onclick="supprimerEvent('${id}')">Supprimer</button>` : ''}</div>
      <div class="btn-row">
        <button type="button" class="btn" onclick="modal().close()">Annuler</button>
        <button class="btn primary" value="ok">Enregistrer</button>
      </div>
    </div>`;
  $('#modal-form').onsubmit = ev => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.target));
    if (id) Object.assign(e, f);
    else state.events.push({ id: uid(), fait: false, ...f });
    save(); modal().close(); render(); toast(id ? 'Tâche mise à jour' : 'Ajouté au planning');
  };
  if (modal().open) modal().close();
  modal().showModal();
}
function toggleEvent(id) {
  const e = state.events.find(x => x.id === id);
  e.fait = !e.fait;
  save(); render();
}
function supprimerEvent(id) {
  state.events = state.events.filter(e => e.id !== id);
  save(); modal().close(); render(); toast('Supprimé');
}

/* ---------- Exemple ---------- */
async function loadDemo() {
  if ((state.dossiers.length || state.events.length) && !await confirmer("Ajouter les données d'exemple à tes données actuelles ?", 'Ajouter')) return;
  const d = n => iso(addDays(new Date(), n));
  const ex = [
    { entreprise: 'Boulangerie Martin', activite: 'energie', statut: 'rdv', contact: 'M. Martin', ville: 'Strasbourg', partenaire: 'Fournisseur A', commEstimee: 450, dateRelance: d(2) },
    { entreprise: 'Garage Central', activite: 'cee', statut: 'etude', contact: 'Mme Klein', ville: 'Mundolsheim', partenaire: 'Délégataire B', commEstimee: 1800, dateRelance: d(-1) },
    { entreprise: 'SCI Les Tilleuls', activite: 'foncier', statut: 'signe', contact: 'M. Weber', ville: 'Haguenau', partenaire: 'Cabinet C', commEstimee: 2400, dateSignature: d(-10) },
    { entreprise: 'Hôtel du Parc', activite: 'energie', statut: 'paye', contact: 'Direction', ville: 'Colmar', partenaire: 'Fournisseur A', commEstimee: 900, commRecue: 900, dateSignature: d(-40), datePaiement: d(-5) },
    { entreprise: 'Entrepôt Logistik', activite: 'cee', statut: 'prospect', contact: 'Resp. technique', ville: 'Illkirch', commEstimee: 3500, dateRelance: d(4) },
  ].map(x => ({ id: uid(), createdAt: Date.now(), ...x }));
  state.dossiers.push(...ex);
  state.events.push(
    { id: uid(), date: d(0), heure: '10:00', titre: 'RDV Boulangerie Martin — factures énergie', activite: 'energie', dossierId: ex[0].id, fait: false },
    { id: uid(), date: d(0), heure: '14:30', titre: 'Envoyer devis CEE Garage Central', activite: 'cee', dossierId: ex[1].id, fait: false },
    { id: uid(), date: d(1), heure: '09:00', titre: 'Point comptable holding', activite: 'perso', dossierId: '', fait: false },
    { id: uid(), date: d(3), heure: '11:00', titre: 'Visite Entrepôt Logistik', activite: 'cee', dossierId: ex[4].id, fait: false },
  );
  save(); render(); toast('Exemple chargé');
}

render();
