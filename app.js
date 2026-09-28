'use strict';

/* ---------- Référentiels ---------- */
const SECTEURS = {
  kamifood: { label: 'KamiFood',      long: 'KamiFood — abonnements restaurants' },
  cee:      { label: 'CEE',           long: "Certificats d'économie d'énergie" },
  energie:  { label: 'Énergie',       long: "Fournisseurs d'énergie" },
  foncier:  { label: 'Taxe foncière', long: 'Récupération de taxe foncière' },
  perso:    { label: 'Perso / Groupe', long: 'Perso / Groupe' },
};
const APPORT = ['cee', 'energie', 'foncier'];
const PRO = ['kamifood', ...APPORT];
const apportOpts = Object.fromEntries(APPORT.map(k => [k, SECTEURS[k]]));

const MODES = { place: 'Sur place', visio: 'Visio', tel: 'Téléphone', tache: 'Tâche' };

const STATUTS = { prospect: 'Prospect', rdv: 'RDV fixé', etude: 'Étude en cours', signe: 'Signé', paye: 'Payé', perdu: 'Perdu' };
const ACTIFS = ['prospect', 'rdv', 'etude', 'signe'];

const STATUTS_AB = { essai: "Période d'essai", actif: 'Actif', resilie: 'Résilié' };

const PERIODES = { semaine: 'Cette semaine', mois: 'Ce mois', annee: 'Cette année' };

/* ---------- Stockage ---------- */
const KEY = 'kami-dashboard-v1';
const blank = () => ({
  nom: 'Kami Groupe',
  dossiers: [], events: [], abonnes: [],
  formules: [
    { id: 'f1', nom: 'Indépendant', prix: 0 },
    { id: 'f2', nom: 'Deux établissements', prix: 0 },
    { id: 'f3', nom: 'Groupe', prix: 0 },
    { id: 'f4', nom: 'Sur mesure', prix: 0 },
  ],
  rdvModele: [
    { titre: 'Installation et reprise des données', jours: 2, duree: 90, mode: 'visio' },
    { titre: "Formation de l'équipe", jours: 7, duree: 60, mode: 'place' },
    { titre: 'Point de suivi', jours: 30, duree: 30, mode: 'visio' },
    { titre: 'Bilan trimestriel', jours: 90, duree: 45, mode: 'visio' },
  ],
  prefs: { periode: 'mois' },
});
let state = load();

function load() {
  let s = blank();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = { ...s, ...JSON.parse(raw) };
  } catch (e) { /* stockage indisponible */ }
  return migrate(s);
}
function migrate(s) {
  s.prefs = { periode: 'mois', ...(s.prefs || {}) };
  s.abonnes = s.abonnes || [];
  s.events.forEach(e => {
    if (e.lien === undefined) e.lien = e.dossierId ? 'd:' + e.dossierId : '';
    delete e.dossierId;
    if (!e.duree) e.duree = 60;
    if (!e.mode) e.mode = 'place';
  });
  return s;
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
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const monday = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const eur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
const num = v => Number(String(v ?? '').replace(',', '.')) || 0;
const hrs = min => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} h${m ? ' ' + pad(m) : ''}` : `${m} min`; };
const fmtDate = s => s ? parse(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
const fmtLong = d => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tag = a => `<span class="tag" style="--c:var(--${a})">${esc(SECTEURS[a]?.label || a)}</span>`;
const statusBadge = s => `<span class="status ${s}">${STATUTS[s]}</span>`;
const abBadge = s => `<span class="status ${s === 'actif' ? 'paye' : s === 'resilie' ? 'perdu' : 'signe'}">${STATUTS_AB[s]}</span>`;
const dossier = id => state.dossiers.find(d => d.id === id);
const abonne = id => state.abonnes.find(a => a.id === id);
const formule = id => state.formules.find(f => f.id === id);
const lienNom = l => {
  if (!l) return '';
  const [t, id] = l.split(':');
  const x = t === 'd' ? dossier(id) : abonne(id);
  return x ? (x.entreprise || x.restaurant) : '';
};

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
  toast.t = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------- Calculs : périodes, gains, temps ---------- */
function range(p) {
  const n = new Date();
  if (p === 'semaine') { const m = monday(n); return [iso(m), iso(addDays(m, 6))]; }
  if (p === 'annee') return [`${n.getFullYear()}-01-01`, `${n.getFullYear()}-12-31`];
  return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(new Date(n.getFullYear(), n.getMonth() + 1, 0))];
}

/* Mois facturés d'un abonné entre deux dates (un mois compte dès que l'abonnement est actif ce mois-là) */
function moisFactures(a, from, to) {
  if (a.statut === 'essai' || !a.debut) return 0;
  const start = parse(a.debut);
  const stop = a.statut === 'resilie' && a.fin ? a.fin : '9999-12-31';
  let n = 0;
  for (let m = new Date(start.getFullYear(), start.getMonth(), 1); iso(m) <= to; m = addMonths(m, 1)) {
    const mEnd = iso(new Date(m.getFullYear(), m.getMonth() + 1, 0));
    if (mEnd >= from && iso(m) <= stop) n++;
  }
  return n;
}
const mrr = () => state.abonnes.filter(a => a.statut === 'actif').reduce((s, a) => s + num(a.prix), 0);

/* Gagné = encaissé sur la période, jusqu'à aujourd'hui. Prévu = ce qui reste attendu sur la période. */
function gains(secteur, p) {
  const [from, to] = range(p);
  const t = today();
  if (secteur === 'kamifood') {
    const upTo = to < t ? to : t;
    const gagne = state.abonnes.reduce((s, a) => s + moisFactures(a, from, upTo) * num(a.prix), 0);
    const total = state.abonnes.reduce((s, a) => s + moisFactures(a, from, to) * num(a.prix), 0);
    return { gagne, prevu: Math.max(0, total - gagne) };
  }
  const ds = state.dossiers.filter(d => d.activite === secteur);
  const gagne = ds.filter(d => d.datePaiement >= from && d.datePaiement <= to).reduce((s, d) => s + num(d.commRecue), 0);
  const prevu = ds.filter(d => d.statut === 'signe').reduce((s, d) => s + Math.max(0, num(d.commEstimee) - num(d.commRecue)), 0);
  return { gagne, prevu };
}
function temps(secteur, p) {
  const [from, to] = range(p);
  const evs = state.events.filter(e => e.activite === secteur && e.date >= from && e.date <= to);
  return {
    total: evs.reduce((s, e) => s + num(e.duree), 0),
    fait: evs.filter(e => e.fait).reduce((s, e) => s + num(e.duree), 0),
    rdv: evs.filter(e => e.mode !== 'tache').length,
  };
}
function bilan(p) {
  const rows = PRO.map(k => ({ k, ...gains(k, p), ...temps(k, p) }));
  const perso = temps('perso', p);
  const tot = rows.reduce((s, r) => ({ gagne: s.gagne + r.gagne, prevu: s.prevu + r.prevu, total: s.total + r.total, fait: s.fait + r.fait, rdv: s.rdv + r.rdv }),
    { gagne: 0, prevu: 0, total: 0, fait: 0, rdv: 0 });
  return { rows, tot, perso };
}
const parHeure = (g, min) => min ? eur(g / (min / 60)) : '—';

/* Relances des dossiers, affichées dans le planning */
function relances() {
  return state.dossiers
    .filter(d => d.dateRelance && ACTIFS.includes(d.statut))
    .map(d => ({ id: 'r-' + d.id, lien: 'd:' + d.id, date: d.dateRelance, heure: '', titre: `Relance · ${d.entreprise}`, activite: d.activite, relance: true }));
}

/* ---------- Routage ---------- */
const views = { dashboard, planning, kamifood, dossiers, gains: gainsView, parametres };
let weekStart = monday(new Date());
let filtre = { activite: 'all', statut: 'actifs', q: '' };
let planFiltre = 'all';

function render() {
  const view = views[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  $('#brand-name').textContent = state.nom;
  document.title = state.nom;
  $('#main').innerHTML = views[view]();
}
window.addEventListener('hashchange', render);

function periodeSwitch() {
  return `<div class="seg" role="group" aria-label="Période">${Object.entries(PERIODES).map(([k, l]) =>
    `<button class="${state.prefs.periode === k ? 'on' : ''}" onclick="state.prefs.periode='${k}';save();render()">${l}</button>`).join('')}</div>`;
}

/* ---------- Tableau de bord ---------- */
function dashboard() {
  const t = today();
  const p = state.prefs.periode;
  const b = bilan(p);
  const annee = bilan('annee');
  const semaine = bilan('semaine');
  const maxG = Math.max(1, ...b.rows.map(r => r.gagne + r.prevu));

  const todayItems = [...state.events.filter(e => e.date === t), ...relances().filter(r => r.date === t)]
    .sort((a, c) => (a.heure || '99').localeCompare(c.heure || '99'));
  const retard = [...relances().filter(r => r.date < t), ...state.events.filter(e => e.date < t && !e.fait)]
    .sort((a, c) => a.date.localeCompare(c.date));
  const next7 = state.events.filter(e => e.date > t && e.date <= iso(addDays(new Date(), 7)))
    .sort((a, c) => (a.date + a.heure).localeCompare(c.date + c.heure));
  const empty = !state.dossiers.length && !state.events.length && !state.abonnes.length;

  const secteurCards = b.rows.map(r => {
    const extra = r.k === 'kamifood'
      ? `<dt>Abonnés actifs</dt><dd>${state.abonnes.filter(a => a.statut === 'actif').length}</dd>`
      : `<dt>Dossiers en cours</dt><dd>${state.dossiers.filter(d => d.activite === r.k && ACTIFS.includes(d.statut)).length}</dd>`;
    return `<div class="card act-card" style="--c:var(--${r.k})">
      <div class="title"><span>${SECTEURS[r.k].label}</span><a class="link" href="#${r.k === 'kamifood' ? 'kamifood' : 'dossiers'}" onclick="filtre.activite='${r.k === 'kamifood' ? 'all' : r.k}'">Voir</a></div>
      <div class="big">${eur(r.gagne)}</div>
      <div class="bar"><span style="width:${(r.gagne / maxG) * 100}%"></span><span class="ghost" style="width:${(r.prevu / maxG) * 100}%"></span></div>
      <dl>
        <dt>Encore attendu</dt><dd>${eur(r.prevu)}</dd>
        <dt>Temps passé</dt><dd>${hrs(r.total)}</dd>
        <dt>Gain par heure</dt><dd>${parHeure(r.gagne, r.total)}</dd>
        ${extra}
      </dl>
    </div>`;
  }).join('');

  return `
  <div class="page-head">
    <div><h1>Bonjour</h1><p style="text-transform:capitalize">${fmtLong(new Date())}</p></div>
    <div class="btn-row">
      <button class="btn" onclick="openEvent()">+ RDV / tâche</button>
      <button class="btn" onclick="openAbonne()">+ Abonné KamiFood</button>
      <button class="btn primary" onclick="openDossier()">+ Dossier apport</button>
    </div>
  </div>
  ${empty ? `<div class="card notice">
    <div><h2>Ton tableau de bord est vide</h2><p class="empty">Ajoute un abonné, un dossier ou un RDV, ou charge un exemple pour voir comment tout se calcule.</p></div>
    <button class="btn" onclick="loadDemo()">Charger un exemple</button></div>` : ''}
  <div class="grid kpis">
    <div class="card kpi"><div class="label">Gagné · ${PERIODES[p].toLowerCase()}</div><div class="value">${eur(b.tot.gagne)}</div><div class="sub">+ ${eur(b.tot.prevu)} encore attendu</div></div>
    <div class="card kpi"><div class="label">Gagné cette année</div><div class="value">${eur(annee.tot.gagne)}</div><div class="sub">tous secteurs</div></div>
    <div class="card kpi"><div class="label">KamiFood · récurrent mensuel</div><div class="value">${eur(mrr())}</div><div class="sub">${state.abonnes.filter(a => a.statut === 'actif').length} abonné(s) actif(s)</div></div>
    <div class="card kpi"><div class="label">Temps planifié cette semaine</div><div class="value">${hrs(semaine.tot.total + semaine.perso.total)}</div><div class="sub">${semaine.tot.rdv} RDV · ${parHeure(annee.tot.gagne, annee.tot.total)} / h sur l'année</div></div>
  </div>
  <div class="section-head"><h2>Par secteur</h2>${periodeSwitch()}</div>
  <div class="grid cols-4">${secteurCards}</div>
  <div class="grid cols-2">
    <div class="card"><h2>Aujourd'hui</h2>${itemList(todayItems, false) || '<div class="empty">Rien de prévu aujourd\'hui.</div>'}</div>
    <div class="card"><h2>En retard</h2>${itemList(retard, true) || '<div class="empty">Tout est à jour.</div>'}</div>
    <div class="card"><h2>7 prochains jours</h2>${itemList(next7, true) || '<div class="empty">Aucun RDV planifié.</div>'}</div>
    <div class="card"><h2>Temps par secteur · cette semaine</h2>${chargeBars(semaine)}</div>
  </div>`;
}

function chargeBars(b) {
  const rows = [...b.rows.map(r => ({ k: r.k, total: r.total })), { k: 'perso', total: b.perso.total }];
  const max = Math.max(1, ...rows.map(r => r.total));
  if (!rows.some(r => r.total)) return '<div class="empty">Aucun RDV cette semaine.</div>';
  return `<ul class="list bars">${rows.map(r => `<li>
    <span class="bar-label">${esc(SECTEURS[r.k].label)}</span>
    <span class="bar grow"><span style="width:${(r.total / max) * 100}%;background:var(--${r.k})"></span></span>
    <span class="when">${r.total ? hrs(r.total) : '—'}</span></li>`).join('')}</ul>`;
}

function itemList(items, showDate) {
  if (!items.length) return '';
  const t = today();
  return `<ul class="list">${items.map(e => {
    const when = showDate ? fmtDate(e.date) + (e.heure ? ' ' + e.heure : '') : (e.heure || '—');
    const click = e.relance ? `openDossier('${e.lien.slice(2)}')` : `openEvent('${e.id}')`;
    const client = lienNom(e.lien);
    const meta = e.relance ? '' : [MODES[e.mode], e.duree ? hrs(num(e.duree)) : '', client].filter(Boolean).map(esc).join(' · ');
    return `<li class="${e.fait ? 'done' : ''}">
      ${e.relance ? '<span class="relance-ico" title="Relance">↻</span>' : `<input type="checkbox" ${e.fait ? 'checked' : ''} onchange="toggleEvent('${e.id}')" aria-label="Fait">`}
      <span class="when ${e.date < t && !e.fait ? 'late' : ''}">${esc(when)}</span>
      <div class="grow clickable" onclick="${click}"><div class="title-txt">${esc(e.titre)}</div>${meta ? `<div class="meta">${meta}</div>` : ''}</div>
      ${tag(e.activite)}
    </li>`;
  }).join('')}</ul>`;
}

/* ---------- Planning ---------- */
function planning() {
  const t = today();
  const end = addDays(weekStart, 6);
  const [from, to] = [iso(weekStart), iso(end)];
  const all = [...state.events, ...relances()].filter(e => planFiltre === 'all' || e.activite === planFiltre);
  const label = `${weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const semaine = state.events.filter(e => e.date >= from && e.date <= to);
  const charge = Object.keys(SECTEURS).map(k => [k, semaine.filter(e => e.activite === k).reduce((s, e) => s + num(e.duree), 0)]).filter(([, m]) => m);
  const totalMin = charge.reduce((s, [, m]) => s + m, 0);

  const days = [...Array(7)].map((_, i) => {
    const d = addDays(weekStart, i), ds = iso(d);
    const evs = all.filter(e => e.date === ds).sort((a, c) => (a.heure || '99').localeCompare(c.heure || '99'));
    const dayMin = evs.filter(e => !e.relance).reduce((s, e) => s + num(e.duree), 0);
    return `<div class="day ${ds === t ? 'today' : ''}">
      <div class="day-head"><span>${d.toLocaleDateString('fr-FR', { weekday: 'long' })}</span><b>${d.getDate()}</b></div>
      ${dayMin ? `<div class="day-load">${hrs(dayMin)}</div>` : ''}
      ${evs.map(e => `<div class="ev ${e.fait ? 'done' : ''} ${e.relance ? 'relance' : ''}" style="--c:var(--${e.activite})"
          onclick="${e.relance ? `openDossier('${e.lien.slice(2)}')` : `openEvent('${e.id}')`}">
        <div class="t">${[e.heure, e.relance ? 'Relance' : MODES[e.mode], e.relance ? '' : hrs(num(e.duree))].filter(Boolean).map(esc).join(' · ')}</div>
        ${esc(e.titre)}${lienNom(e.lien) && !e.relance ? `<div class="t">${esc(lienNom(e.lien))}</div>` : ''}</div>`).join('')}
      <button class="add" onclick="openEvent(null,'${ds}')">+ Ajouter</button>
    </div>`;
  }).join('');

  const chips = [['all', 'Tout'], ...Object.entries(SECTEURS).map(([k, s]) => [k, s.label])]
    .map(([k, l]) => `<button class="chip ${planFiltre === k ? 'on' : ''}" onclick="planFiltre='${k}';render()">${l}</button>`).join('');

  return `
  <div class="page-head">
    <div><h1>Planning</h1><p>Tous tes RDV : KamiFood, apport d'affaires et perso</p></div>
    <div class="week-nav">
      <button class="btn" onclick="shiftWeek(-7)" aria-label="Semaine précédente">‹</button>
      <strong>${label}</strong>
      <button class="btn" onclick="shiftWeek(7)" aria-label="Semaine suivante">›</button>
      <button class="btn" onclick="shiftWeek(0)">Aujourd'hui</button>
    </div>
  </div>
  <div class="card load-card">
    <div class="load-head"><strong>Charge de la semaine : ${hrs(totalMin)}</strong><span class="meta">${semaine.filter(e => e.mode !== 'tache').length} RDV · ${semaine.filter(e => e.mode === 'visio').length} en visio</span></div>
    <div class="stack">${charge.map(([k, m]) => `<span style="flex:${m};background:var(--${k})" title="${esc(SECTEURS[k].label)} : ${hrs(m)}"></span>`).join('') || '<span class="stack-empty"></span>'}</div>
    <div class="legend">${charge.map(([k, m]) => `<span><i style="background:var(--${k})"></i>${esc(SECTEURS[k].label)} ${hrs(m)}</span>`).join('')}</div>
  </div>
  <div class="toolbar">${chips}</div>
  <div class="week">${days}</div>`;
}
function shiftWeek(n) { weekStart = n ? addDays(weekStart, n) : monday(new Date()); render(); }

/* ---------- KamiFood ---------- */
function kamifood() {
  const t = today();
  const ab = [...state.abonnes].sort((a, c) => (a.statut === 'resilie') - (c.statut === 'resilie') || (a.restaurant || '').localeCompare(c.restaurant || ''));
  const actifs = state.abonnes.filter(a => a.statut === 'actif');
  const prochain = id => state.events.filter(e => e.lien === 'a:' + id && e.date >= t && !e.fait).sort((a, c) => (a.date + a.heure).localeCompare(c.date + c.heure))[0];
  const g = gains('kamifood', 'annee');

  return `
  <div class="page-head">
    <div><h1>KamiFood</h1><p>Abonnements restaurants et RDV inclus dans la souscription</p></div>
    <button class="btn primary" onclick="openAbonne()">+ Abonné</button>
  </div>
  <div class="grid kpis">
    <div class="card kpi"><div class="label">Abonnés actifs</div><div class="value">${actifs.length}</div><div class="sub">${state.abonnes.filter(a => a.statut === 'essai').length} en période d'essai</div></div>
    <div class="card kpi"><div class="label">Récurrent mensuel</div><div class="value">${eur(mrr())}</div><div class="sub">HT par mois</div></div>
    <div class="card kpi"><div class="label">Encaissé cette année</div><div class="value">${eur(g.gagne)}</div><div class="sub">+ ${eur(g.prevu)} d'ici décembre</div></div>
    <div class="card kpi"><div class="label">RDV clients à venir</div><div class="value">${state.events.filter(e => e.activite === 'kamifood' && e.date >= t && !e.fait).length}</div><div class="sub">installations, formations, suivis</div></div>
  </div>
  <div class="card table-wrap">${ab.length ? `
    <table>
      <thead><tr><th>Restaurant</th><th>Formule</th><th class="num">Prix / mois</th><th>Statut</th><th class="num hide-sm">Fin d'engagement</th><th class="hide-sm">Prochain RDV</th></tr></thead>
      <tbody>${ab.map(a => {
        const n = prochain(a.id);
        const finEng = a.debut ? iso(addMonths(parse(a.debut), num(a.engagement) || 12)) : '';
        return `<tr class="clickable" onclick="openAbonne('${a.id}')">
        <td><strong>${esc(a.restaurant)}</strong><div class="meta">${esc([a.contact, a.ville].filter(Boolean).join(' · '))}</div></td>
        <td>${esc(formule(a.formule)?.nom || '—')}</td>
        <td class="num">${eur(a.prix)}</td>
        <td>${abBadge(a.statut)}</td>
        <td class="num hide-sm">${fmtDate(finEng)}</td>
        <td class="hide-sm">${n ? `${fmtDate(n.date)} · ${esc(n.titre)}` : '<span class="meta">—</span>'}</td>
      </tr>`; }).join('')}</tbody>
    </table>` : '<div class="empty">Aucun abonné pour le moment. Ajoute ton premier restaurant : ses RDV inclus seront planifiés automatiquement.</div>'}
  </div>`;
}

/* ---------- Dossiers (apport d'affaires) ---------- */
function dossiers() {
  const q = filtre.q.toLowerCase();
  const rows = state.dossiers.filter(d =>
    (filtre.activite === 'all' || d.activite === filtre.activite) &&
    (filtre.statut === 'all' || (filtre.statut === 'actifs' ? ACTIFS.includes(d.statut) : d.statut === filtre.statut)) &&
    (!q || [d.entreprise, d.contact, d.ville, d.partenaire, d.notes].join(' ').toLowerCase().includes(q))
  ).sort((a, b) => (a.dateRelance || '9999').localeCompare(b.dateRelance || '9999'));
  const t = today();
  const chips = [['all', 'Tous'], ...APPORT.map(k => [k, SECTEURS[k].label])]
    .map(([k, l]) => `<button class="chip ${filtre.activite === k ? 'on' : ''}" onclick="filtre.activite='${k}';render()">${l}</button>`).join('');
  const late = d => d.dateRelance && d.dateRelance < t && ACTIFS.includes(d.statut);

  return `
  <div class="page-head">
    <div><h1>Apport d'affaires</h1><p>CEE, fournisseurs d'énergie, taxe foncière · ${state.dossiers.length} dossier(s)</p></div>
    <button class="btn primary" onclick="openDossier()">+ Dossier</button>
  </div>
  <div class="toolbar">
    ${chips}
    <select id="filtre-statut" onchange="filtre.statut=this.value;render()" aria-label="Statut">
      <option value="actifs" ${filtre.statut === 'actifs' ? 'selected' : ''}>En cours</option>
      <option value="all" ${filtre.statut === 'all' ? 'selected' : ''}>Tous les statuts</option>
      ${Object.entries(STATUTS).map(([k, l]) => `<option value="${k}" ${filtre.statut === k ? 'selected' : ''}>${l}</option>`).join('')}
    </select>
    <input id="filtre-q" type="search" placeholder="Rechercher une entreprise, un contact…" value="${esc(filtre.q)}" oninput="filtre.q=this.value;refreshTable()">
  </div>
  <div class="card table-wrap" id="dossiers-table">${rows.length ? `
    <table>
      <thead><tr><th>Entreprise</th><th>Secteur</th><th>Statut</th><th class="hide-sm">Partenaire</th><th class="num">Commission</th><th class="num">Relance</th></tr></thead>
      <tbody>${rows.map(d => `<tr class="clickable" onclick="openDossier('${d.id}')">
        <td><strong>${esc(d.entreprise)}</strong><div class="meta">${esc([d.contact, d.tel].filter(Boolean).join(' · '))}</div></td>
        <td>${tag(d.activite)}</td>
        <td>${statusBadge(d.statut)}</td>
        <td class="hide-sm">${esc(d.partenaire || '')}</td>
        <td class="num">${eur(d.commEstimee)}</td>
        <td class="num ${late(d) ? 'late' : ''}">${fmtDate(d.dateRelance)}</td>
      </tr>`).join('')}</tbody>
    </table>` : '<div class="empty">Aucun dossier ne correspond.</div>'}
  </div>
  ${commissionsTable()}`;
}
function refreshTable() {
  const tmp = document.createElement('div'); tmp.innerHTML = dossiers();
  $('#dossiers-table').replaceWith($('#dossiers-table', tmp));
}
function commissionsTable() {
  const rows = state.dossiers.filter(d => d.statut === 'signe' || d.statut === 'paye')
    .sort((a, b) => (a.statut === 'paye') - (b.statut === 'paye') || (b.dateSignature || '').localeCompare(a.dateSignature || ''));
  if (!rows.length) return '';
  const tot = rows.reduce((s, d) => ({ e: s.e + num(d.commEstimee), r: s.r + num(d.commRecue) }), { e: 0, r: 0 });
  return `<div class="section-head"><h2>Commissions signées</h2></div>
  <div class="card table-wrap"><table>
    <thead><tr><th>Entreprise</th><th>Secteur</th><th class="num hide-sm">Signé le</th><th class="num">Prévue</th><th class="num">Reçue</th><th></th></tr></thead>
    <tbody>${rows.map(d => `<tr>
      <td class="clickable" onclick="openDossier('${d.id}')"><strong>${esc(d.entreprise)}</strong></td>
      <td>${tag(d.activite)}</td>
      <td class="num hide-sm">${fmtDate(d.dateSignature)}</td>
      <td class="num">${eur(d.commEstimee)}</td>
      <td class="num">${eur(d.commRecue)}</td>
      <td class="num">${d.statut === 'paye' ? statusBadge('paye') : `<button class="btn small" onclick="marquerPaye('${d.id}')">Marquer payé</button>`}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="2">Total</td><td class="hide-sm"></td><td class="num">${eur(tot.e)}</td><td class="num">${eur(tot.r)}</td><td></td></tr></tfoot>
  </table></div>`;
}
function marquerPaye(id) {
  const d = dossier(id);
  d.statut = 'paye';
  if (!num(d.commRecue)) d.commRecue = d.commEstimee;
  d.datePaiement = d.datePaiement || today();
  save(); render(); toast('Commission marquée comme payée');
}

/* ---------- Gains et temps ---------- */
function gainsView() {
  const p = state.prefs.periode;
  const b = bilan(p);
  const max = Math.max(1, ...b.rows.map(r => r.gagne));
  return `
  <div class="page-head">
    <div><h1>Gains et temps</h1><p>Ce que tu gagnes par secteur, et ce que ça te coûte en heures</p></div>
    ${periodeSwitch()}
  </div>
  <div class="grid kpis">
    <div class="card kpi"><div class="label">Gagné</div><div class="value">${eur(b.tot.gagne)}</div><div class="sub">${PERIODES[p].toLowerCase()}</div></div>
    <div class="card kpi"><div class="label">Encore attendu</div><div class="value">${eur(b.tot.prevu)}</div><div class="sub">commissions signées + abonnements</div></div>
    <div class="card kpi"><div class="label">Temps pro</div><div class="value">${hrs(b.tot.total)}</div><div class="sub">${b.tot.rdv} RDV · dont ${hrs(b.tot.fait)} réalisé</div></div>
    <div class="card kpi"><div class="label">Gain moyen par heure</div><div class="value">${parHeure(b.tot.gagne, b.tot.total)}</div><div class="sub">tous secteurs</div></div>
  </div>
  <div class="card table-wrap">
    <table>
      <thead><tr><th>Secteur</th><th class="num">Gagné</th><th class="hide-sm"></th><th class="num">Attendu</th><th class="num">Temps</th><th class="num">RDV</th><th class="num">€ / heure</th></tr></thead>
      <tbody>${b.rows.map(r => `<tr>
        <td>${tag(r.k)}</td>
        <td class="num"><strong>${eur(r.gagne)}</strong></td>
        <td class="hide-sm" style="width:30%"><span class="bar"><span style="width:${(r.gagne / max) * 100}%;background:var(--${r.k})"></span></span></td>
        <td class="num">${eur(r.prevu)}</td>
        <td class="num">${hrs(r.total)}</td>
        <td class="num">${r.rdv}</td>
        <td class="num">${parHeure(r.gagne, r.total)}</td>
      </tr>`).join('')}
      <tr class="muted-row"><td>${tag('perso')}</td><td class="num">—</td><td class="hide-sm"></td><td class="num">—</td><td class="num">${hrs(b.perso.total)}</td><td class="num">${b.perso.rdv}</td><td class="num">—</td></tr>
      </tbody>
      <tfoot><tr><td>Ensemble</td><td class="num">${eur(b.tot.gagne)}</td><td class="hide-sm"></td><td class="num">${eur(b.tot.prevu)}</td><td class="num">${hrs(b.tot.total)}</td><td class="num">${b.tot.rdv}</td><td class="num">${parHeure(b.tot.gagne, b.tot.total)}</td></tr></tfoot>
    </table>
  </div>
  <p class="note">Le temps compte la durée de chaque RDV et tâche du planning sur la période. KamiFood compte un mois d'abonnement par mois actif (hors période d'essai). L'apport d'affaires compte les commissions reçues à leur date de paiement.</p>`;
}

/* ---------- Paramètres ---------- */
function parametres() {
  return `
  <div class="page-head"><div><h1>Paramètres</h1><p>Nom, formules KamiFood, RDV inclus et sauvegarde</p></div></div>
  <div class="settings">
    <div class="card">
      <h2>Nom affiché</h2>
      <div class="toolbar" style="margin:0"><input type="text" id="nom" value="${esc(state.nom)}" style="max-width:320px">
      <button class="btn primary" onclick="state.nom=$('#nom').value.trim()||'Kami Groupe';save();render();toast('Nom enregistré')">Enregistrer</button></div>
    </div>
    <div class="card">
      <h2>Formules KamiFood</h2>
      <p>Prix HT par mois, repris par défaut quand tu ajoutes un abonné.</p>
      <div class="rows" id="formules">${state.formules.map((f, i) => `<div class="row">
        <input id="fn-${i}" type="text" value="${esc(f.nom)}" aria-label="Nom de la formule">
        <input id="fp-${i}" type="number" min="0" step="1" value="${esc(f.prix)}" aria-label="Prix mensuel HT" class="short"><span class="meta">€ HT / mois</span>
      </div>`).join('')}</div>
      <div class="btn-row"><button class="btn" onclick="ajoutFormule()">+ Formule</button><button class="btn primary" onclick="saveFormules()">Enregistrer les formules</button></div>
    </div>
    <div class="card">
      <h2>RDV inclus dans la souscription KamiFood</h2>
      <p>Planifiés automatiquement à la création d'un abonné, à partir de sa date de début.</p>
      <div class="rows">${state.rdvModele.map((r, i) => `<div class="row">
        <input id="rt-${i}" type="text" value="${esc(r.titre)}" aria-label="Titre du RDV">
        <span class="meta">J +</span><input id="rj-${i}" type="number" min="0" value="${esc(r.jours)}" class="tiny" aria-label="Jours après le début">
        <input id="rd-${i}" type="number" min="0" step="5" value="${esc(r.duree)}" class="tiny" aria-label="Durée en minutes"><span class="meta">min</span>
        <select id="rm-${i}" aria-label="Mode">${Object.entries(MODES).map(([k, l]) => `<option value="${k}" ${r.mode === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn small danger" onclick="state.rdvModele.splice(${i},1);save();render()" aria-label="Retirer">×</button>
      </div>`).join('')}</div>
      <div class="btn-row"><button class="btn" onclick="saveModele();state.rdvModele.push({titre:'Nouveau RDV',jours:0,duree:60,mode:'visio'});save();render()">+ RDV</button><button class="btn primary" onclick="saveModele();toast('RDV inclus enregistrés')">Enregistrer</button></div>
    </div>
    <div class="card">
      <h2>Sauvegarde</h2>
      <p>Tes données restent dans ce navigateur. Exporte-les régulièrement pour ne rien perdre ou pour les passer sur un autre appareil.</p>
      <div class="btn-row">
        <button class="btn primary" onclick="exporter()">Exporter (.json)</button>
        <button class="btn" onclick="copier()">Copier la sauvegarde</button>
        <label class="btn">Importer…<input type="file" accept="application/json" hidden onchange="importer(this.files[0])"></label>
      </div>
    </div>
    <div class="card">
      <h2>Données</h2>
      <p>${state.abonnes.length} abonné(s), ${state.dossiers.length} dossier(s), ${state.events.length} RDV / tâche(s).</p>
      <div class="btn-row">
        <button class="btn" onclick="loadDemo()">Charger un exemple</button>
        <button class="btn danger" onclick="toutEffacer()">Tout effacer</button>
      </div>
    </div>
  </div>`;
}
function saveFormules() {
  state.formules.forEach((f, i) => { f.nom = $('#fn-' + i).value.trim() || f.nom; f.prix = num($('#fp-' + i).value); });
  save(); render(); toast('Formules enregistrées');
}
function ajoutFormule() { saveFormules(); state.formules.push({ id: uid(), nom: 'Nouvelle formule', prix: 0 }); save(); render(); }
function saveModele() {
  state.rdvModele.forEach((r, i) => {
    r.titre = $('#rt-' + i).value.trim() || r.titre; r.jours = num($('#rj-' + i).value);
    r.duree = num($('#rd-' + i).value); r.mode = $('#rm-' + i).value;
  });
  save();
}
function exporter() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kami-sauvegarde-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function copier() {
  navigator.clipboard.writeText(JSON.stringify(state))
    .then(() => toast('Sauvegarde copiée : colle-la dans une note ou un e-mail'))
    .catch(() => toast('Copie impossible ici, utilise Exporter'));
}
function importer(file) {
  if (!file) return;
  file.text().then(txt => {
    const data = JSON.parse(txt);
    if (!Array.isArray(data.dossiers) || !Array.isArray(data.events)) throw new Error();
    return confirmer('Remplacer les données actuelles par celles du fichier ?', 'Remplacer').then(ok => {
      if (!ok) return;
      state = migrate({ ...blank(), ...data });
      save(); render(); toast('Sauvegarde importée');
    });
  }).catch(() => toast("Ce fichier n'est pas une sauvegarde valide"));
}
async function toutEffacer() {
  if (!await confirmer('Effacer tous les abonnés, dossiers et RDV ? Pense à exporter avant.', 'Tout effacer')) return;
  state = { ...blank(), nom: state.nom, formules: state.formules, rdvModele: state.rdvModele };
  save(); render(); toast('Données effacées');
}

/* ---------- Formulaires ---------- */
const modal = () => $('#modal');
const field = (name, label, input, full) => `<div class="field ${full ? 'full' : ''}"><label for="f-${name}">${label}</label>${input}</div>`;
const inp = (name, val, type = 'text', extra = '') => `<input id="f-${name}" name="${name}" type="${type}" value="${esc(val ?? '')}" ${extra}>`;
const sel = (name, opts, val) => `<select id="f-${name}" name="${name}">${Object.entries(opts).map(([k, o]) => `<option value="${k}" ${k === val ? 'selected' : ''}>${esc(typeof o === 'string' ? o : o.long)}</option>`).join('')}</select>`;
function showModal(html, onSubmit) {
  if (modal().open) modal().close();
  $('#modal-form').innerHTML = html;
  $('#modal-form').onsubmit = e => { e.preventDefault(); onSubmit(Object.fromEntries(new FormData(e.target))); };
  modal().showModal();
}
const actions = (delBtn, extra = '') => `<div class="modal-actions">
  <div>${delBtn || ''}</div>
  <div class="btn-row">${extra}<button type="button" class="btn" onclick="modal().close()">Annuler</button><button class="btn primary" value="ok">Enregistrer</button></div>
</div>`;

function openAbonne(id) {
  const a = id ? abonne(id) : { statut: 'actif', debut: today(), formule: state.formules[0]?.id, prix: state.formules[0]?.prix || '', engagement: 12 };
  const fOpts = Object.fromEntries(state.formules.map(f => [f.id, `${f.nom}${num(f.prix) ? ' — ' + eur(f.prix) + ' / mois' : ''}`]));
  showModal(`
    <h2>${id ? "Modifier l'abonné" : 'Nouvel abonné KamiFood'}</h2>
    <div class="fields">
      ${field('restaurant', 'Restaurant *', inp('restaurant', a.restaurant, 'text', 'required'), true)}
      ${field('contact', 'Contact', inp('contact', a.contact))}
      ${field('tel', 'Téléphone', inp('tel', a.tel, 'tel'))}
      ${field('email', 'E-mail', inp('email', a.email, 'email'))}
      ${field('ville', 'Ville', inp('ville', a.ville))}
      ${field('formule', 'Formule', sel('formule', fOpts, a.formule).replace('<select', `<select onchange="const f=state.formules.find(x=>x.id===this.value);if(f&&num(f.prix))$('#f-prix').value=f.prix"`))}
      ${field('prix', 'Prix HT / mois (€)', inp('prix', a.prix, 'number', 'min="0" step="1" inputmode="decimal"'))}
      ${field('statut', 'Statut', sel('statut', STATUTS_AB, a.statut))}
      ${field('debut', 'Début de facturation', inp('debut', a.debut, 'date', 'required'))}
      ${field('engagement', 'Engagement (mois)', inp('engagement', a.engagement, 'number', 'min="0" step="1"'))}
      ${field('fin', 'Date de résiliation', inp('fin', a.fin, 'date'))}
      ${field('notes', 'Notes', `<textarea id="f-notes" name="notes">${esc(a.notes || '')}</textarea>`, true)}
      ${!id && state.rdvModele.length ? `<label class="check full"><input type="checkbox" name="planifier" checked> Planifier les ${state.rdvModele.length} RDV inclus dans la souscription (${state.rdvModele.map(r => esc(r.titre)).join(', ')})</label>` : ''}
    </div>
    ${actions(id ? `<button type="button" class="btn danger" onclick="supprimerAbonne('${id}')">Supprimer</button>` : '',
      id ? `<button type="button" class="btn" onclick="openEvent(null,null,'a:${id}')">+ RDV</button>` : '')}`,
  f => {
    const planifier = f.planifier; delete f.planifier;
    const target = id ? a : { id: uid(), createdAt: Date.now() };
    Object.assign(target, f);
    if (!id) {
      state.abonnes.push(target);
      if (planifier) planifierInclus(target);
    }
    save(); modal().close(); render();
    toast(id ? 'Abonné mis à jour' : planifier ? `Abonné créé, ${state.rdvModele.length} RDV planifiés` : 'Abonné créé');
  });
}
function planifierInclus(a) {
  const start = parse(a.debut || today());
  state.rdvModele.forEach(r => {
    let d = addDays(start, num(r.jours));
    if (d.getDay() === 6) d = addDays(d, 2);
    if (d.getDay() === 0) d = addDays(d, 1);
    state.events.push({ id: uid(), date: iso(d), heure: '10:00', duree: num(r.duree) || 60, mode: r.mode, titre: r.titre, activite: 'kamifood', lien: 'a:' + a.id, fait: false, notes: '' });
  });
}
async function supprimerAbonne(id) {
  modal().close();
  const n = state.events.filter(e => e.lien === 'a:' + id && !e.fait).length;
  if (!await confirmer(`Supprimer cet abonné${n ? ` et ses ${n} RDV à venir` : ''} ?`, 'Supprimer')) return;
  state.abonnes = state.abonnes.filter(a => a.id !== id);
  state.events = state.events.filter(e => !(e.lien === 'a:' + id && !e.fait));
  state.events.forEach(e => { if (e.lien === 'a:' + id) e.lien = ''; });
  save(); render(); toast('Abonné supprimé');
}

function openDossier(id) {
  const d = id ? dossier(id) : { activite: APPORT.includes(filtre.activite) ? filtre.activite : 'cee', statut: 'prospect' };
  showModal(`
    <h2>${id ? 'Modifier le dossier' : "Nouveau dossier d'apport"}</h2>
    <div class="fields">
      ${field('entreprise', 'Entreprise *', inp('entreprise', d.entreprise, 'text', 'required'), true)}
      ${field('activite', 'Secteur', sel('activite', apportOpts, d.activite))}
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
      ${field('datePaiement', 'Date de paiement', inp('datePaiement', d.datePaiement, 'date'))}
      ${field('notes', 'Notes', `<textarea id="f-notes" name="notes">${esc(d.notes || '')}</textarea>`, true)}
    </div>
    ${actions(id ? `<button type="button" class="btn danger" onclick="supprimerDossier('${id}')">Supprimer</button>` : '',
      id ? `<button type="button" class="btn" onclick="openEvent(null,null,'d:${id}')">+ RDV / visio</button>` : '')}`,
  f => {
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
  });
}
async function supprimerDossier(id) {
  modal().close();
  if (!await confirmer('Supprimer ce dossier ?', 'Supprimer')) return;
  state.dossiers = state.dossiers.filter(d => d.id !== id);
  state.events.forEach(e => { if (e.lien === 'd:' + id) e.lien = ''; });
  save(); render(); toast('Dossier supprimé');
}

const secteurDe = l => l ? (l[0] === 'a' ? 'kamifood' : dossier(l.slice(2))?.activite) : null;
function openEvent(id, date, lien) {
  const e = id ? state.events.find(x => x.id === id)
    : { date: date || today(), heure: '', duree: 60, mode: 'visio', activite: secteurDe(lien) || (planFiltre !== 'all' ? planFiltre : 'perso'), lien: lien || '', titre: lien ? `RDV ${lienNom(lien)}` : '' };
  const opts = {
    '': '— Aucun —',
    ...Object.fromEntries(state.abonnes.map(a => ['a:' + a.id, `${a.restaurant} (KamiFood)`])),
    ...Object.fromEntries(state.dossiers.map(d => ['d:' + d.id, `${d.entreprise} (${SECTEURS[d.activite].label})`])),
  };
  showModal(`
    <h2>${id ? 'Modifier le RDV' : 'Nouveau RDV / tâche'}</h2>
    <div class="fields">
      ${field('titre', 'Titre *', inp('titre', e.titre, 'text', 'required'), true)}
      ${field('date', 'Date', inp('date', e.date, 'date', 'required'))}
      ${field('heure', 'Heure', inp('heure', e.heure, 'time'))}
      ${field('mode', 'Type', sel('mode', MODES, e.mode))}
      ${field('duree', 'Durée (minutes)', inp('duree', e.duree, 'number', 'min="0" step="5"'))}
      ${field('lien', 'Client lié', sel('lien', opts, e.lien || '').replace('<select', `<select onchange="const s=secteurDe(this.value);if(s)$('#f-activite').value=s"`))}
      ${field('activite', 'Secteur', sel('activite', SECTEURS, e.activite))}
      ${field('notes', 'Notes', `<textarea id="f-notes" name="notes">${esc(e.notes || '')}</textarea>`, true)}
    </div>
    ${actions(id ? `<button type="button" class="btn danger" onclick="supprimerEvent('${id}')">Supprimer</button>` : '')}`,
  f => {
    f.duree = num(f.duree);
    if (id) Object.assign(e, f);
    else state.events.push({ id: uid(), fait: false, ...f });
    save(); modal().close(); render(); toast(id ? 'RDV mis à jour' : 'Ajouté au planning');
  });
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
  if ((state.dossiers.length || state.events.length || state.abonnes.length) && !await confirmer("Ajouter les données d'exemple à tes données actuelles ?", 'Ajouter')) return;
  const d = n => iso(addDays(new Date(), n));
  const m = n => iso(addMonths(new Date(), n));
  if (!state.formules.some(f => num(f.prix))) {
    [89, 149, 249, 0].forEach((p, i) => { if (state.formules[i]) state.formules[i].prix = p; });
  }
  const f = i => state.formules[i] || state.formules[0];
  const ab = [
    { restaurant: 'Le Petit Zinc', contact: 'Sophie', ville: 'Strasbourg', formule: f(0).id, prix: f(0).prix, statut: 'actif', debut: m(-5), engagement: 12 },
    { restaurant: 'Brasserie du Port', contact: 'Karim', ville: 'Kehl', formule: f(1).id, prix: f(1).prix, statut: 'actif', debut: m(-2), engagement: 12 },
    { restaurant: 'Sushi Kaze', contact: 'M. Tanaka', ville: 'Colmar', formule: f(0).id, prix: f(0).prix, statut: 'essai', debut: d(1), engagement: 12 },
  ].map(x => ({ id: uid(), createdAt: Date.now(), ...x }));
  state.abonnes.push(...ab);
  planifierInclus(ab[2]);
  const ex = [
    { entreprise: 'Boulangerie Martin', activite: 'energie', statut: 'rdv', contact: 'M. Martin', ville: 'Strasbourg', partenaire: 'Fournisseur A', commEstimee: 450, dateRelance: d(2) },
    { entreprise: 'Garage Central', activite: 'cee', statut: 'etude', contact: 'Mme Klein', ville: 'Mundolsheim', partenaire: 'Délégataire B', commEstimee: 1800, dateRelance: d(-1) },
    { entreprise: 'SCI Les Tilleuls', activite: 'foncier', statut: 'signe', contact: 'M. Weber', ville: 'Haguenau', partenaire: 'Cabinet C', commEstimee: 2400, dateSignature: d(-10) },
    { entreprise: 'Hôtel du Parc', activite: 'energie', statut: 'paye', contact: 'Direction', ville: 'Colmar', partenaire: 'Fournisseur A', commEstimee: 900, commRecue: 900, dateSignature: d(-40), datePaiement: d(-3) },
    { entreprise: 'Entrepôt Logistik', activite: 'cee', statut: 'paye', contact: 'Resp. technique', ville: 'Illkirch', partenaire: 'Délégataire B', commEstimee: 3500, commRecue: 3500, dateSignature: d(-60), datePaiement: m(-2) },
  ].map(x => ({ id: uid(), createdAt: Date.now(), ...x }));
  state.dossiers.push(...ex);
  const ev = (n, heure, duree, mode, titre, activite, lien, fait = false) => ({ id: uid(), date: d(n), heure, duree, mode, titre, activite, lien, fait, notes: '' });
  state.events.push(
    ev(0, '10:00', 60, 'place', 'RDV factures énergie', 'energie', 'd:' + ex[0].id),
    ev(0, '14:30', 30, 'visio', 'Visio devis CEE', 'cee', 'd:' + ex[1].id),
    ev(0, '17:00', 45, 'visio', 'Point de suivi mensuel', 'kamifood', 'a:' + ab[1].id),
    ev(-2, '09:30', 90, 'place', 'Formation équipe salle', 'kamifood', 'a:' + ab[0].id, true),
    ev(-1, '11:00', 60, 'visio', 'Visio dossier taxe foncière', 'foncier', 'd:' + ex[2].id, true),
    ev(1, '09:00', 60, 'tache', 'Compta holding', 'perso', ''),
    ev(3, '11:00', 90, 'place', 'Visite entrepôt : audit éclairage', 'cee', 'd:' + ex[1].id),
  );
  save(); render(); toast('Exemple chargé');
}

render();
