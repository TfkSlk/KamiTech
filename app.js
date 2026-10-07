'use strict';

/* ---------- Référentiels ---------- */
const SECTEURS = {
  kamifood: { label: 'KamiFood',      long: 'KamiFood — abonnements restaurants' },
  kgdpro:   { label: 'KGD Pro',       long: 'KGD Pro — abonnements entreprises (à venir)' },
  cee:      { label: 'CEE',           long: "Certificats d'économie d'énergie" },
  energie:  { label: 'Énergie',       long: 'Négociation des fournitures énergétiques' },
  foncier:  { label: 'Foncier & CFE', long: 'Taxe foncière et CFE' },
  perso:    { label: 'Perso / Groupe', long: 'Perso / Groupe' },
};
const APPORT = ['cee', 'energie', 'foncier'];
const PRO = ['kamifood', 'kgdpro', ...APPORT];
const apportOpts = Object.fromEntries(APPORT.map(k => [k, SECTEURS[k]]));

const MODES = { place: 'Sur place', visio: 'Visio', tel: 'Téléphone', tache: 'Tâche' };

const STATUTS = { prospect: 'Prospect', rdv: 'RDV fixé', etude: 'Étude en cours', signe: 'Signé', paye: 'Payé', perdu: 'Perdu' };
const ACTIFS = ['prospect', 'rdv', 'etude', 'signe'];

/* Contacts : les gens croisés à qui présenter un service. Journal des prises de contact + rappel. */
const STATUTS_AV = { suivi: 'En cours', planifie: 'RDV planifié', clos: 'Clos' };
const AV_OUVERTS = ['suivi'];
const ATTENTES = { '': 'Rien en attente', lui: "J'attends ses informations", moi: 'Je lui dois des informations' };
const PRIORITES = { haute: 'Haute', normale: 'Normale', basse: 'Basse' };
const RAPPELS = [['2', '2 jours'], ['3', '3 jours'], ['7', '1 semaine'], ['14', '2 semaines'], ['', 'Pas de rappel']];

const STATUTS_AB = { essai: "Période d'essai", actif: 'Actif', resilie: 'Résilié' };

const PERIODES = { semaine: 'Cette semaine', mois: 'Ce mois', annee: 'Cette année' };

/* ---------- Stockage ---------- */
const KEY = 'kami-dashboard-v1';
const blank = () => ({
  nom: 'Kami Groupe',
  dossiers: [], events: [], abonnes: [], aVoir: [], memoire: [],
  /* Formules KamiFood : prix HT par site et par mois (stratégie du 17/07/2026) */
  formules: [
    { id: 'f1', nom: 'Essentiel', prix: 79 },
    { id: 'f2', nom: 'Pro', prix: 149 },
    { id: 'f3', nom: 'Premium', prix: 249 },
    { id: 'f4', nom: 'Pro — tarif fondateur', prix: 99 },
  ],
  /* RDV inclus dans la souscription, d'après le process d'installation client */
  rdvModele: [
    { titre: 'Création de l\'espace et des comptes', jours: 1, duree: 45, mode: 'visio' },
    { titre: 'Installation sur site (tablette, sondes, étiquettes)', jours: 7, duree: 120, mode: 'place' },
    { titre: 'Formation équipe (1 h)', jours: 7, duree: 60, mode: 'place' },
    { titre: 'Activation : test, bot Telegram, 1er récap', jours: 10, duree: 45, mode: 'visio' },
    { titre: 'Point de suivi à 1 mois', jours: 30, duree: 30, mode: 'visio' },
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
  const jourLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }; // today() n'est pas encore défini ici
  s.prefs = { periode: 'mois', theme: 'light', planVue: 'semaine', ...(s.prefs || {}) };
  s.abonnes = s.abonnes || [];
  s.memoire = s.memoire || [];
  s.aVoir = s.aVoir || [];
  /* Toufek est l'éditeur de KamiFood : sa licence est permanente et jamais facturée */
  if (!s.abonnes.some(a => a.interne)) s.abonnes.push({ id: 'moi', createdAt: Date.now(), interne: true, restaurant: 'Toufek · licence éditeur', contact: 'Toufek', statut: 'actif', prix: 0, engagement: 0, debut: jourLocal(), formule: (s.formules || []).find(f => f.nom === 'Premium')?.id || '', notes: 'Licence éditeur KamiFood : activée en permanence, jamais facturée.' });
  s.stripe = s.stripe || null;
  s.aVoir.forEach(v => {
    if (!Array.isArray(v.historique)) v.historique = [];
    if (v.objet) { v.historique.unshift({ date: v.createdAt ? new Date(v.createdAt).toISOString().slice(0, 10) : jourLocal(), texte: v.objet }); delete v.objet; }
    if (v.relance) { v.rappel = v.rappel || v.relance; delete v.relance; }
    if (v.statut === 'attente') v.attente = v.attente || 'lui';
    if (['contacter', 'attente', 'planifier'].includes(v.statut)) v.statut = 'suivi';
    if (v.statut === 'vu') v.statut = 'clos';
    if (!v.statut) v.statut = 'suivi';
    if (v.attente === undefined) v.attente = '';
  });
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
/* Un RDV avec une date de fin est une période (bandeau sur plusieurs jours) ; important = alerte */
const estPeriode = e => !!(e.fin && e.fin > e.date);
const surJour = (e, ds) => estPeriode(e) ? (e.date <= ds && ds <= e.fin) : e.date === ds;
const abonne = id => state.abonnes.find(a => a.id === id);
const aVoir = id => state.aVoir.find(v => v.id === id);
const dernierContact = v => (v.historique || [])[v.historique.length - 1];
const formule = id => state.formules.find(f => f.id === id);
const lienNom = l => {
  if (!l) return '';
  const [t, id] = l.split(':');
  const x = t === 'd' ? dossier(id) : t === 'c' ? aVoir(id) : abonne(id);
  return x ? (x.entreprise || x.restaurant || x.nom) : '';
};
/* Nature d'une période : courte (≤ 7 jours, bandeau plein) ou longue (trait fin) ; aPrevoir = date encore à caler dedans */
const joursPeriode = e => estPeriode(e) ? Math.round((parse(e.fin) - parse(e.date)) / 864e5) + 1 : 1;
const periodeLongue = e => estPeriode(e) && joursPeriode(e) > 7;

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
  if (a.interne || a.statut === 'essai' || !a.debut) return 0;
  const start = parse(a.debut);
  const stop = a.statut === 'resilie' && a.fin ? a.fin : '9999-12-31';
  let n = 0;
  for (let m = new Date(start.getFullYear(), start.getMonth(), 1); iso(m) <= to; m = addMonths(m, 1)) {
    const mEnd = iso(new Date(m.getFullYear(), m.getMonth() + 1, 0));
    if (mEnd >= from && iso(m) <= stop) n++;
  }
  return n;
}
const mrr = () => state.abonnes.filter(a => a.statut === 'actif' && !a.interne).reduce((s, a) => s + num(a.prix), 0);

/* Gagné = encaissé sur la période, jusqu'à aujourd'hui. Prévu = ce qui reste attendu sur la période. */
function gains(secteur, p) {
  const [from, to] = range(p);
  const t = today();
  if (secteur === 'kamifood') {
    const upTo = to < t ? to : t;
    const total = state.abonnes.reduce((s, a) => s + moisFactures(a, from, to) * num(a.prix), 0);
    const estime = state.abonnes.reduce((s, a) => s + moisFactures(a, from, upTo) * num(a.prix), 0);
    /* Si Stripe est synchronisé, l'encaissé est le vrai : les factures payées sur la période */
    const gagne = state.stripe?.factures?.length ? state.stripe.factures.filter(f => f.date >= from && f.date <= upTo).reduce((s, f) => s + num(f.ht), 0) : estime;
    return { gagne, prevu: Math.max(0, total - estime) };
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
const views = { dashboard, planning, contacts: aVoirView, avoir: aVoirView, kamifood, dossiers, gains: gainsView, jarvis: jarvisView, parametres };
let avFiltre = 'suivi';
let filtre = { activite: 'all', statut: 'actifs', q: '' };
let planFiltre = 'all';

function render() {
  document.documentElement.dataset.theme = state.prefs.theme === 'dark' ? 'dark' : 'light';
  const view = views[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  $('#brand-name').textContent = state.nom;
  document.title = state.nom;
  const nj = document.querySelector('#nav a[data-view="jarvis"]'); if (nj) nj.querySelector('span').textContent = jarvis.nom || 'Kami';
  $('#main').innerHTML = views[view]();
}
window.addEventListener('hashchange', render);


/* ---------- Tableau de bord ---------- */


function itemList(items, showDate) {
  if (!items.length) return '';
  const t = today();
  return `<ul class="list">${items.map(e => {
    const late = !e.fait && !e.contact && (estPeriode(e) ? e.fin < t : e.date < t);
    const when = estPeriode(e) ? `${showDate ? fmtDate(e.date) + ' → ' : 'Jusqu\'au '}${fmtDate(e.fin)}` : showDate ? fmtDate(e.date) + (e.heure ? ' · ' + e.heure : '') : (e.heure || (e.contact ? (e.date < t ? `Rappel du ${fmtDate(e.date)}` : 'Rappel') : e.relance ? 'Relance' : 'Dans la journée'));
    const click = e.contact ? `openAVoir('${e.contact}')` : e.relance ? `openDossier('${e.lien.slice(2)}')` : `openEvent('${e.id}')`;
    const client = lienNom(e.lien);
    const meta = e.contact ? esc(e.sousTitre || '') : e.relance ? (late ? `Relance prévue le ${fmtDate(e.date)}` : 'Relance à faire') : estPeriode(e) ? [e.aPrevoir ? 'Date à prévoir dans la période' : 'Période', client, e.notes].filter(Boolean).map(esc).join(' · ') : [MODES[e.mode], e.duree ? hrs(num(e.duree)) : '', client].filter(Boolean).map(esc).join(' · ');
    return `<li class="${e.fait ? 'done' : ''} ${e.retard || late ? 'retard' : ''} ${e.important ? 'alerte' : ''}">
      ${e.contact ? `<button class="btn small" onclick="openContact('${e.contact}')" title="Noter la prise de contact">Contacté</button>` : e.relance ? '<span class="relance-ico" title="Relance">↻</span>' : `<input type="checkbox" ${e.fait ? 'checked' : ''} onchange="toggleEvent('${e.id}')" aria-label="Fait">`}
      <div class="grow clickable" onclick="${click}">
        <div class="when ${late ? 'late' : ''}">${esc(when)}${late ? ' · en retard' : ''}</div>
        <div class="title-txt">${e.important ? '<span class="warn-ico" title="Alerte">⚠</span> ' : ''}${esc(e.titre)}</div>${meta ? `<div class="meta">${meta}</div>` : ''}
      </div>
      <i class="dot" style="background:var(--${e.activite})" data-tip="${esc(SECTEURS[e.activite]?.label || '')}" aria-label="${esc(SECTEURS[e.activite]?.label || '')}"></i>
    </li>`;
  }).join('')}</ul>`;
}

/* ---------- KamiFood ---------- */
function kamifood() {
  const t = today();
  const ab = [...state.abonnes].sort((a, c) => (a.statut === 'resilie') - (c.statut === 'resilie') || (a.restaurant || '').localeCompare(c.restaurant || ''));
  const actifs = state.abonnes.filter(a => a.statut === 'actif' && !a.interne);
  const prochain = id => state.events.filter(e => e.lien === 'a:' + id && e.date >= t && !e.fait).sort((a, c) => (a.date + a.heure).localeCompare(c.date + c.heure))[0];
  const g = gains('kamifood', 'annee');

  return `
  <div class="page-head">
    <div><h1>KamiFood</h1><p>Abonnements restaurants et RDV inclus dans la souscription</p></div>
    <div class="btn-row"><button class="btn" onclick="synchroniserStripe()" id="btn-stripe">${state.stripe?.sync ? 'Synchroniser Stripe' : 'Connecter Stripe'}</button><button class="btn primary" onclick="openAbonne()">+ Abonné</button></div>
  </div>
  ${stripeCarte()}
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
        <td><strong>${esc(a.restaurant)}</strong>${a.interne ? ' <span class="status paye">Éditeur</span>' : ''}${a.impaye ? ' <span class="status perdu">Impayé</span>' : ''}<div class="meta">${esc([a.contact, a.ville, a.stripeId ? 'Stripe' : ''].filter(Boolean).join(' · '))}</div></td>
        <td>${esc(a.formuleNom || formule(a.formule)?.nom || '—')}</td>
        <td class="num">${a.interne ? '<span class="meta">licence</span>' : eur(a.prix)}</td>
        <td>${abBadge(a.statut)}</td>
        <td class="num hide-sm">${fmtDate(finEng)}</td>
        <td class="hide-sm">${n ? `${fmtDate(n.date)} · ${esc(n.titre)}` : '<span class="meta">—</span>'}</td>
      </tr>`; }).join('')}</tbody>
    </table>` : '<div class="empty">Aucun abonné pour le moment. Ajoute ton premier restaurant : ses RDV inclus seront planifiés automatiquement.</div>'}
  </div>`;
}

/* ---------- Stripe : lecture des abonnements KamiFood (facturation séparée de KGD Pro) ---------- */
function stripeCarte() {
  const st = state.stripe;
  if (!st?.sync) return `<div class="card notice"><div><h2>Stripe</h2><p class="empty">Branche la lecture seule de Stripe pour voir les vrais abonnements et encaissements KamiFood. Clé restreinte à poser sur Vercel (STRIPE_LECTURE_KEY), puis « Connecter Stripe ».</p></div></div>`;
  const t = today(), m30 = iso(addDays(new Date(), -30)), a12 = iso(addMonths(new Date(), -12));
  const enc = (du) => st.factures.filter(f => f.date >= du && f.date <= t).reduce((s, f) => s + num(f.ht), 0);
  const quand = new Date(st.sync).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `<div class="card stripe-card"><div class="card-head"><div><h2>Stripe · réel</h2><p class="meta">Synchronisé le ${esc(quand)}${st.filtre ? ` · produit « ${esc(st.filtre)} »` : ''} · ${st.factures.length} facture(s) payée(s) sur 13 mois</p></div></div>
    <div class="grid kpis">
      <div class="kpi"><div class="label">Récurrent mensuel Stripe</div><div class="value">${esc(eur(st.mrr))}</div><div class="sub">${st.abonnes.filter(a => a.statut === 'actif').length} abonnement(s) actif(s)</div></div>
      <div class="kpi"><div class="label">Encaissé 30 jours</div><div class="value">${esc(eur(enc(m30)))}</div><div class="sub">HT, factures payées</div></div>
      <div class="kpi"><div class="label">Encaissé 12 mois</div><div class="value">${esc(eur(enc(a12)))}</div><div class="sub">HT, factures payées</div></div>
      <div class="kpi"><div class="label">Impayés</div><div class="value">${st.abonnes.filter(a => a.impaye).length}</div><div class="sub">abonnement(s) en retard de paiement</div></div>
    </div></div>`;
}
async function synchroniserStripe() {
  if (!jarvis.token) { toast('Colle d\'abord ton jeton dans Réglages (le même que pour Kami)'); location.hash = '#parametres'; return; }
  const b = $('#btn-stripe'); if (b) { b.disabled = true; b.textContent = 'Lecture de Stripe…'; }
  try {
    const r = await fetch('/api/stripe', { method: 'POST', headers: { 'content-type': 'application/json', 'x-jarvis-token': jarvis.token }, body: '{}' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erreur || `Erreur ${r.status}`);
    const n = fusionnerStripe(j);
    save(); render(); toast(`Stripe synchronisé : ${j.abonnes.length} abonnement(s), ${n.nouveaux} nouveau(x), ${j.factures.length} facture(s)`);
  } catch (e) {
    toast(e.message || 'Synchronisation impossible'); render();
  }
}
/* Fusionne la photo Stripe avec nos abonnés : par id Stripe, sinon par nom de restaurant ; ne supprime rien */
function fusionnerStripe(j) {
  const cle = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  let nouveaux = 0;
  for (const sa of j.abonnes) {
    let a = state.abonnes.find(x => x.stripeId === sa.stripeId) || state.abonnes.find(x => !x.stripeId && !x.interne && cle(x.restaurant) === cle(sa.restaurant));
    if (!a) { a = { id: uid(), createdAt: Date.now(), restaurant: sa.restaurant, engagement: 12, notes: '' }; state.abonnes.push(a); nouveaux++; }
    Object.assign(a, { stripeId: sa.stripeId, stripeClient: sa.stripeClient, stripeStatut: sa.stripeStatut, formuleNom: sa.formuleNom, prix: sa.prix, statut: sa.statut, impaye: sa.impaye, debut: sa.debut || a.debut, fin: sa.fin || a.fin });
    if (sa.email && !a.email) a.email = sa.email;
    if (sa.tel && !a.tel) a.tel = sa.tel;
    if (!a.formule) { const f = state.formules.find(x => cle(sa.formuleNom).includes(cle(x.nom))); if (f) a.formule = f.id; }
  }
  state.stripe = { sync: j.sync, mrr: j.mrr, filtre: j.filtre, factures: j.factures, abonnes: j.abonnes.map(a => ({ stripeId: a.stripeId, statut: a.statut, impaye: a.impaye })) };
  return { nouveaux };
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

/* ---------- Paramètres ---------- */
function parametres() {
  return `
  <div class="page-head"><div><h1>Paramètres</h1><p>Nom, formules KamiFood, RDV inclus et sauvegarde</p></div></div>
  <div class="settings">
    <div class="card">
      <h2>Apparence</h2>
      <p>Clair par défaut. Le mode sombre reste disponible.</p>
      <div class="theme-pick">
        <button class="${state.prefs.theme !== 'dark' ? 'on' : ''}" onclick="state.prefs.theme='light';save();render()"><i style="background:#f3f4f7"></i>Clair</button>
        <button class="${state.prefs.theme === 'dark' ? 'on' : ''}" onclick="state.prefs.theme='dark';save();render()"><i style="background:#191c23"></i>Sombre</button>
      </div>
    </div>
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
      <h2>Jarvis</h2>
      <p>Le cerveau tourne sur Vercel (<code>/api/jarvis</code>). Le jeton doit être le même que <code>JARVIS_TOKEN</code> dans les variables d'environnement Vercel. Il est enregistré uniquement dans ce navigateur.</p>
      <div class="rows">
        <div class="row"><label for="j-nom" class="meta" style="min-width:90px">Son nom</label><input id="j-nom" type="text" value="${esc(jarvis.nom)}" placeholder="Kami" class="short"><span class="meta">= le mot d'activation en mains libres</span></div>
        <div class="row"><label for="j-token" class="meta" style="min-width:90px">Jeton</label><input id="j-token" type="password" value="${esc(jarvis.token)}" autocomplete="off" placeholder="colle le jeton ici"></div>
        <div class="row"><label for="j-endpoint" class="meta" style="min-width:90px">Adresse</label><input id="j-endpoint" type="text" value="${esc(jarvis.endpoint)}"></div>
        <div class="row"><label for="j-voice" class="meta" style="min-width:90px">Voix</label><select id="j-voice">${voixOptions()}</select></div>
      </div>
      <div class="btn-row">
        <button class="btn primary" onclick="jarvis.nom=$('#j-nom').value.trim()||'Kami';jarvis.token=$('#j-token').value.trim();jarvis.endpoint=$('#j-endpoint').value.trim()||'/api/jarvis';jarvis.voixNom=$('#j-voice').value;saveJarvis();toast('Réglages Jarvis enregistrés')">Enregistrer</button>
        <button class="btn" onclick="testerJarvis()">Tester la connexion</button>
        <button class="btn" onclick="parler('Bonjour Toufek, je suis prêt.')">Tester la voix</button>
        <button class="btn danger" onclick="jarvis.historique=[];saveJarvis();toast('Conversation effacée')">Effacer la conversation</button>
      </div>
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
      <h2>Sur ton téléphone</h2>
      <p>Le KGD s'installe comme une appli : icône sur l'écran d'accueil, plein écran, et il s'ouvre même sans réseau.</p>
      ${installPrompt ? `<div class="btn-row"><button class="btn primary" onclick="installerAppli()">Installer sur cet appareil</button></div>`
        : estInstalle() ? '<p class="meta">Déjà installé sur cet appareil.</p>'
        : /iphone|ipad|ipod/i.test(navigator.userAgent) ? '<p class="meta">Sur iPhone : ouvre cette page dans Safari, touche le bouton Partager (le carré avec la flèche), puis « Sur l\'écran d\'accueil ».</p>'
        : '<p class="meta">Sur Android : menu ⋮ de Chrome, puis « Installer l\'application » ou « Ajouter à l\'écran d\'accueil ». Sur ordinateur : l\'icône d\'installation à droite de la barre d\'adresse.</p>'}
    </div>
    <div class="card">
      <h2>Stripe (KamiFood)</h2>
      <p>Lecture seule des abonnements et des factures payées. La facturation de KamiFood et celle du futur KGD Pro restent séparées : ici, seul le produit KamiFood est lu.</p>
      <p class="meta">Sur Vercel, projet kami-groupe-dashboard : STRIPE_LECTURE_KEY = clé restreinte Stripe (lecture : Customers, Subscriptions, Invoices, Products) et, si le compte Stripe sert à plusieurs produits, STRIPE_PRODUIT = « kamifood » ou l'id du produit. Le jeton Kami protège l'accès.</p>
      <p>${state.stripe?.sync ? `Dernière synchronisation : ${esc(new Date(state.stripe.sync).toLocaleString('fr-FR'))}.` : 'Pas encore synchronisé.'}</p>
      <div class="btn-row"><button class="btn" id="btn-stripe" onclick="synchroniserStripe()">Synchroniser maintenant</button></div>
    </div>
    <div class="card">
      <h2>Données</h2>
      <p>${state.abonnes.length} abonné(s), ${state.dossiers.length} dossier(s), ${state.events.length} RDV / tâche(s), ${state.aVoir.length} personne(s) à voir.</p>
      ${aDemo() ? '<p class="meta">Des données d\'exemple sont chargées. « Retirer l\'exemple » ne touche qu\'à elles : tes vraies données restent.</p>' : ''}
      <div class="btn-row">
        ${aDemo() ? '<button class="btn primary" onclick="retirerExemple()">Retirer l\'exemple</button>' : ''}
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
      <label class="check full"><input type="checkbox" name="interne" ${a.interne ? 'checked' : ''}> Licence éditeur (moi) : activée en permanence, jamais facturée, hors des gains</label>
      ${a.stripeId ? `<p class="meta full">Synchronisé avec Stripe (${esc(a.stripeStatut || '')}, ${esc(a.formuleNom || '')}). Le prix et le statut sont repris de Stripe à chaque synchronisation.</p>` : ''}
      ${!id && state.rdvModele.length ? `<label class="check full"><input type="checkbox" name="planifier" checked> Planifier les ${state.rdvModele.length} RDV inclus dans la souscription (${state.rdvModele.map(r => esc(r.titre)).join(', ')})</label>` : ''}
    </div>
    ${actions(id ? `<button type="button" class="btn danger" onclick="supprimerAbonne('${id}')">Supprimer</button>` : '',
      id ? `<button type="button" class="btn" onclick="openEvent(null,null,'a:${id}')">+ RDV</button>` : '')}`,
  f => {
    const planifier = f.planifier; delete f.planifier;
    f.interne = !!f.interne;
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

const secteurDe = l => l ? (l[0] === 'a' ? 'kamifood' : l[0] === 'c' ? aVoir(l.slice(2))?.activite : dossier(l.slice(2))?.activite) : null;
function openEvent(id, date, lien, heure, apres, prefill) {
  const e = id ? state.events.find(x => x.id === id)
    : { date: date || today(), heure: heure || '', duree: 60, mode: 'visio', activite: secteurDe(lien) || (planFiltre !== 'all' ? planFiltre : 'perso'), lien: lien || '', titre: lien ? `RDV ${lienNom(lien)}` : '', ...(prefill || {}) };
  const opts = liensOpts();
  showModal(`
    <h2>${id ? 'Modifier le RDV' : 'Nouveau RDV / tâche'}</h2>
    <div class="fields">
      ${field('titre', 'Titre *', inp('titre', e.titre, 'text', 'required'), true)}
      ${field('date', 'Date', inp('date', e.date, 'date', 'required'))}
      ${field('fin', 'Jusqu\'au (pour une période)', inp('fin', e.fin, 'date'))}
      ${field('heure', 'Heure', inp('heure', e.heure, 'time'))}
      ${field('mode', 'Type', sel('mode', MODES, e.mode))}
      ${field('duree', 'Durée (minutes)', inp('duree', e.duree, 'number', 'min="0" step="5"'))}
      ${field('lien', 'Client lié', sel('lien', opts, e.lien || '').replace('<select', `<select onchange="const s=secteurDe(this.value);if(s)$('#f-activite').value=s"`))}
      ${field('activite', 'Secteur', sel('activite', SECTEURS, e.activite))}
      ${field('notes', 'Notes', `<textarea id="f-notes" name="notes">${esc(e.notes || '')}</textarea>`, true)}
      <label class="check full"><input type="checkbox" name="important" ${e.important ? 'checked' : ''}> ⚠ Alerte : à ne pas manquer (affichée en rouge, ex. « signature requise le jour de l'annonce des prix »)</label>
      <label class="check full"><input type="checkbox" name="aPrevoir" ${e.aPrevoir ? 'checked' : ''}> Date à prévoir dans cette période (créneau pas encore calé, affiché en pointillé)</label>
    </div>
    ${actions(id ? `<button type="button" class="btn danger" onclick="supprimerEvent('${id}')">Supprimer</button>` : '')}`,
  f => {
    f.duree = num(f.duree);
    f.important = !!f.important;
    f.aPrevoir = !!f.aPrevoir && !!f.fin;
    if (f.fin && f.fin <= f.date) f.fin = '';
    if (f.fin && !f.heure) { f.mode = 'tache'; f.duree = 0; }
    let ev = e;
    if (id) Object.assign(e, f);
    else { ev = { id: uid(), fait: false, ...f }; state.events.push(ev); }
    if (apres) apres(ev);
    save(); modal().close(); render(); toast(id ? 'RDV mis à jour' : 'Ajouté au planning');
  });
}

/* ---------- Contacts : prises de contact et rappels ---------- */
const liensOpts = () => ({
  '': '— Aucun —',
  ...Object.fromEntries(state.abonnes.map(a => ['a:' + a.id, `${a.restaurant} (KamiFood)`])),
  ...Object.fromEntries(state.dossiers.map(d => ['d:' + d.id, `${d.entreprise} (${SECTEURS[d.activite].label})`])),
  ...Object.fromEntries(state.aVoir.filter(v => v.statut !== 'clos').map(v => ['c:' + v.id, `${v.nom}${v.entreprise ? ' · ' + v.entreprise : ''} (contact)`])),
});
/* Rappels dus : affichés dans « Aujourd'hui » comme des alertes */
function rappelsContacts() {
  const t = today();
  return state.aVoir.filter(v => v.statut === 'suivi' && v.rappel && v.rappel <= t).map(v => {
    const d = dernierContact(v);
    return { id: 'c-' + v.id, contact: v.id, lien: v.lien || '', date: v.rappel, heure: '', activite: v.activite || 'perso', important: !!v.attente,
      titre: `${v.nom}${v.entreprise ? ' · ' + v.entreprise : ''}${v.attente ? ' · ' + ATTENTES[v.attente].toLowerCase() : ''}`,
      sousTitre: d ? `Dernier contact le ${fmtDate(d.date)} : ${d.texte}` : 'À recontacter' };
  });
}
/* Bouton rapide : une prise de contact (nouvelle personne, ou nouvelle entrée pour une personne connue) */
/* Rencontre : saisie en étapes, chaque écran tient sans défiler (téléphone compris) */
let renc = null;
function openContact(id, prefill) {
  const v = id ? aVoir(id) : null;
  const p = prefill || {};
  renc = {
    v, etape: 0, note: [p.nom, p.sujet].filter(Boolean).join(' : '),
    nom: v ? v.nom : (p.nom || ''), entreprise: v ? (v.entreprise || '') : (p.entreprise || ''),
    activite: v ? (v.activite || 'perso') : (APPORT.includes(filtre.activite) ? filtre.activite : 'energie'),
    sujet: p.sujet || '', attente: v ? (v.attente || '') : '', rappel: '', rappelJ: '3',
    creneau: 'aucun', crDate: today(), crHeure: '', crSemaine: iso(monday(addDays(new Date(), 7))), crDu: today(), crAu: iso(addMonths(new Date(), 1)),
    objet: 'Présentation des services', tel: '', lien: v ? (v.lien || '') : '', date: today(), resume: '',
  };
  rencRender();
  $('#rencontre').hidden = false; document.body.classList.add('no-scroll');
  setTimeout(() => $('#r-note')?.focus(), 50);
}
function fermerRencontre() { $('#rencontre').hidden = true; document.body.classList.remove('no-scroll'); arreterDictee(); renc = null; }
const RENC_ETAPES = () => renc.v ? [0, 2, 3, 4] : [0, 1, 2, 3, 4];
function rencAller(delta) {
  const liste = RENC_ETAPES(), i = liste.indexOf(renc.etape);
  rencLire();
  if (delta > 0 && renc.etape === 1 && !renc.nom.trim()) { toast('Le nom de la personne, au moins'); $('#r-nom')?.focus(); return; }
  if (delta > 0 && renc.etape === 0 && !renc.v && !renc.nom.trim()) { renc.nom = premierNom(renc.note); }
  const j = Math.min(liste.length - 1, Math.max(0, i + delta));
  renc.etape = liste[j]; rencRender();
}
/* Sans Kami : on devine le nom depuis la note (« croisé Karim de Karim SARL… ») */
function premierNom(note) {
  const m = note.match(/(?:crois[ée]|vu|appel[ée]|rencontr[ée]|avec|chez)\s+([A-ZÀ-Ý][\wÀ-ÿ'-]+(?:\s+[A-ZÀ-Ý][\wÀ-ÿ'-]+)?)/);
  return m ? m[1] : note.split(/[,:.]/)[0].trim().slice(0, 40);
}
/* Lit les champs de l'étape affichée dans renc */
function rencLire() {
  const g = id => $('#r-' + id)?.value;
  const r = renc;
  if (r.etape === 0) r.note = g('note') ?? r.note;
  if (r.etape === 1) { r.nom = g('nom') ?? r.nom; r.entreprise = g('entreprise') ?? r.entreprise; }
  if (r.etape === 2) r.rappel = g('rappel') ?? r.rappel;
  if (r.etape === 3) { r.crDate = g('crDate') ?? r.crDate; r.crHeure = g('crHeure') ?? r.crHeure; r.crSemaine = g('crSemaine') ?? r.crSemaine; r.crDu = g('crDu') ?? r.crDu; r.crAu = g('crAu') ?? r.crAu; r.objet = g('objet') ?? r.objet; }
  if (r.etape === 4) { r.sujet = g('sujet') ?? r.sujet; r.tel = g('tel') ?? r.tel; }
}
function rencSet(k, val) { rencLire(); renc[k] = val; if (k === 'rappelJ') renc.rappel = val ? iso(addDays(new Date(), Number(val))) : ''; rencRender(); }
function rencRender() {
  const r = renc, liste = RENC_ETAPES(), pos = liste.indexOf(r.etape);
  const opt = (k, val, label, sub) => `<button type="button" class="opt ${r[k] === val ? 'on' : ''}" onclick="rencSet('${k}','${val}')"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</button>`;
  const titres = ['Raconte', 'Qui ?', 'Et ensuite ?', 'Dans le planning ?', 'On enregistre ?'];
  let corps = '';
  if (r.etape === 0) corps = `
    <textarea id="r-note" placeholder="Ex. : croisé Karim de Karim SARL, on a parlé du KGD Pro, je lui envoie le dossier, rappelle-moi dans 3 jours, à voir début 2027">${esc(r.note)}</textarea>
    <div class="r-tools">
      ${SR ? `<button type="button" class="btn" id="r-mic" onclick="dicteeRencontre()">🎤 Dicter</button>` : ''}
      <button type="button" class="btn primary" onclick="analyserRencontre()" ${jarvis.token ? '' : 'disabled title="Jeton Kami requis (Réglages)"'}>Kami remplit tout</button>
    </div>
    <p class="meta">${jarvis.token ? 'Une phrase suffit : Kami remplit les écrans suivants, tu vérifies, tu enregistres.' : 'Sans jeton Kami, tu remplis les écrans suivants à la main.'}</p>`;
  if (r.etape === 1) corps = `
    <label class="r-label" for="r-nom">Personne</label><input id="r-nom" value="${esc(r.nom)}" placeholder="Prénom, nom" autocomplete="off">
    <label class="r-label" for="r-entreprise">Entreprise</label><input id="r-entreprise" value="${esc(r.entreprise)}" placeholder="Facultatif" autocomplete="off">
    <label class="r-label">Service à présenter</label>
    <div class="chips">${Object.entries(SECTEURS).map(([k, s]) => `<button type="button" class="chip ${r.activite === k ? 'on' : ''}" onclick="rencSet('activite','${k}')"><i style="background:var(--${k})"></i>${esc(s.label)}</button>`).join('')}</div>`;
  if (r.etape === 2) corps = `
    <label class="r-label">Qui attend quoi ?</label>
    <div class="opts">${opt('attente', '', 'Rien en attente')}${opt('attente', 'lui', "J'attends ses informations", 'Il doit me revenir')}${opt('attente', 'moi', 'Je lui dois des informations', 'Je dois lui envoyer quelque chose')}</div>
    <label class="r-label">Me le rappeler</label>
    <div class="chips">${RAPPELS.map(([j, l]) => `<button type="button" class="chip ${r.rappelJ === j ? 'on' : ''}" onclick="rencSet('rappelJ','${j}')">${l}</button>`).join('')}</div>
    <input id="r-rappel" type="date" value="${esc(r.rappel)}" onchange="renc.rappelJ='x'">`;
  if (r.etape === 3) corps = `
    <div class="opts quatre">${opt('creneau', 'aucun', 'Rien', 'Juste le rappel')}${opt('creneau', 'date', 'Un jour', 'Date précise')}${opt('creneau', 'semaine', 'Une semaine', 'À caler dedans')}${opt('creneau', 'periode', 'Une période', 'Quelques semaines ou mois')}</div>
    ${r.creneau === 'date' ? `<div class="r-ligne"><span class="meta">Le</span><input id="r-crDate" type="date" value="${esc(r.crDate)}"><span class="meta">à</span><input id="r-crHeure" type="time" value="${esc(r.crHeure)}"></div>` : ''}
    ${r.creneau === 'semaine' ? `<div class="r-ligne"><span class="meta">Semaine du</span><input id="r-crSemaine" type="date" value="${esc(r.crSemaine)}"></div>` : ''}
    ${r.creneau === 'periode' ? `<div class="r-ligne"><span class="meta">Du</span><input id="r-crDu" type="date" value="${esc(r.crDu)}"><span class="meta">au</span><input id="r-crAu" type="date" value="${esc(r.crAu)}"></div>` : ''}
    ${r.creneau !== 'aucun' ? `<label class="r-label" for="r-objet">Objet</label><input id="r-objet" value="${esc(r.objet)}">` : ''}`;
  if (r.etape === 4) {
    const quand = r.creneau === 'date' ? `RDV le ${fmtDate(r.crDate)}${r.crHeure ? ' à ' + r.crHeure : ''}` : r.creneau === 'semaine' ? `À prévoir la semaine du ${fmtDate(iso(monday(parse(r.crSemaine))))}` : r.creneau === 'periode' ? `À prévoir du ${fmtDate(r.crDu)} au ${fmtDate(r.crAu)}` : 'Rien dans le planning';
    corps = `
    <div class="recap">
      <div class="recap-nom">${esc(r.nom || '?')}${r.entreprise ? ` <span class="meta">· ${esc(r.entreprise)}</span>` : ''} ${tag(r.activite)}</div>
      <label class="r-label" for="r-sujet">De quoi vous avez parlé</label><input id="r-sujet" value="${esc(r.sujet || r.note)}">
      <ul class="recap-list">
        <li>${esc(ATTENTES[r.attente] || 'Rien en attente')}</li>
        <li>${r.rappel ? `Rappel le ${esc(fmtDate(r.rappel))}` : 'Pas de rappel'}</li>
        <li>${esc(quand)}${r.creneau !== 'aucun' ? ` · ${esc(r.objet)}` : ''}</li>
      </ul>
      ${r.resume ? `<p class="meta">${esc(r.resume)}</p>` : ''}
      ${r.v ? '' : `<label class="r-label" for="r-tel">Téléphone (facultatif)</label><input id="r-tel" type="tel" value="${esc(r.tel)}">`}
    </div>`;
  }
  $('#rencontre').innerHTML = `
    <div class="r-card">
      <div class="r-head">
        <div><div class="meta">${r.v ? 'Prise de contact · ' + esc(r.v.nom) : 'Prise de contact'}</div><h2>${titres[r.etape]}</h2></div>
        <div class="r-dots">${liste.map((e, i) => `<i class="${i <= pos ? 'on' : ''}"></i>`).join('')}</div>
        <button type="button" class="btn icon" onclick="fermerRencontre()" aria-label="Fermer">✕</button>
      </div>
      <div class="r-body">${corps}</div>
      <div class="r-foot">
        <button type="button" class="btn" onclick="${pos === 0 ? 'fermerRencontre()' : 'rencAller(-1)'}">${pos === 0 ? 'Annuler' : 'Retour'}</button>
        ${r.etape === 4 ? `<button type="button" class="btn primary" onclick="enregistrerRencontre()">Enregistrer</button>` : `<button type="button" class="btn primary" onclick="rencAller(1)">Continuer</button>`}
      </div>
    </div>`;
}
function enregistrerRencontre() {
  rencLire();
  const r = renc, v = r.v;
  if (!v && !r.nom.trim()) { toast('Il manque le nom'); r.etape = 1; rencRender(); return; }
  const target = v || { id: uid(), createdAt: Date.now(), statut: 'suivi', priorite: 'normale', historique: [], nom: r.nom.trim(), entreprise: r.entreprise.trim(), tel: r.tel.trim(), lien: r.lien };
  target.activite = r.activite; target.attente = r.attente; target.rappel = r.rappel || '';
  const sujet = (r.sujet || r.note || '').trim();
  target.historique.push({ date: r.date || today(), texte: sujet || 'Prise de contact' });
  if (target.statut === 'clos') target.statut = 'suivi';
  if (!v) state.aVoir.push(target);
  let msg = target.rappel ? `${target.nom} · rappel le ${fmtDate(target.rappel)}` : `${target.nom} enregistré`;
  const ev = creneauContact(target, { creneau: r.creneau, crDate: r.crDate, crHeure: r.crHeure, crSemaine: r.crSemaine, crDu: r.crDu, crAu: r.crAu, objet: r.objet });
  if (ev) msg = estPeriode(ev) ? `${target.nom} · à prévoir du ${fmtDate(ev.date)} au ${fmtDate(ev.fin)}` : `${target.nom} · RDV le ${fmtDate(ev.date)}${ev.heure ? ' à ' + ev.heure : ''}`;
  save(); fermerRencontre(); render(); toast(msg);
}
/* Dictée de la note (reconnaissance vocale du navigateur, en français) */
let recNote = null;
function dicteeRencontre() {
  if (!SR) return;
  if (recNote) { arreterDictee(); return; }
  recNote = new SR(); recNote.lang = 'fr-FR'; recNote.continuous = true; recNote.interimResults = false;
  recNote.onresult = e => { const t = Array.from(e.results).slice(e.resultIndex).map(x => x[0].transcript).join(' ').trim(); const ta = $('#r-note'); if (ta && t) { ta.value = (ta.value ? ta.value.trim() + ' ' : '') + t; renc.note = ta.value; } };
  recNote.onend = () => { recNote = null; const b = $('#r-mic'); if (b) b.textContent = '🎤 Dicter'; };
  recNote.onerror = () => { arreterDictee(); toast('Micro indisponible'); };
  try { recNote.start(); const b = $('#r-mic'); if (b) b.textContent = '⏹ Stop'; } catch (e) { recNote = null; }
}
function arreterDictee() { if (recNote) { try { recNote.stop(); } catch (e) { /* ignore */ } recNote = null; } }
/* Kami lit la note et remplit toutes les étapes ; on saute au récapitulatif */
async function analyserRencontre() {
  rencLire();
  const texte = (renc.note || '').trim();
  if (!texte) { toast('Écris ou dicte d\'abord une phrase'); return; }
  if (!jarvis.token) { toast('Colle ton jeton Kami dans Réglages'); return; }
  const b = $('#rencontre .btn.primary'); if (b) { b.disabled = true; b.textContent = 'Kami lit…'; }
  try {
    const r = await fetch('/api/analyser', { method: 'POST', headers: { 'content-type': 'application/json', 'x-jarvis-token': jarvis.token }, body: JSON.stringify({ texte, aujourdhui: today() }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erreur || `Erreur ${r.status}`);
    const x = renc;
    if (!x.v) { if (j.nom) x.nom = j.nom; if (j.entreprise) x.entreprise = j.entreprise; if (j.tel) x.tel = j.tel; }
    if (j.activite) x.activite = j.activite;
    x.attente = j.attente || ''; x.sujet = j.sujet || texte; x.rappel = j.rappel || ''; x.rappelJ = j.rappel ? 'x' : '';
    const c = j.creneau || { type: 'aucun' };
    x.creneau = c.type || 'aucun';
    if (c.type === 'date') { x.crDate = c.date || x.crDate; x.crHeure = c.heure || ''; }
    if (c.type === 'semaine') x.crSemaine = c.du || x.crSemaine;
    if (c.type === 'periode') { x.crDu = c.du || x.crDu; x.crAu = c.au || x.crAu; }
    if (c.type !== 'aucun' && j.objet) x.objet = j.objet;
    x.resume = j.resume || '';
    x.etape = 4; rencRender();
  } catch (e) {
    toast(e.message || 'Analyse impossible'); rencRender();
  }
}
/* Le créneau choisi dans la prise de contact devient une entrée du planning liée au contact */
function creneauContact(v, f) {
  const k = f.creneau || 'aucun';
  if (k === 'aucun') return null;
  const objet = (f.objet || '').trim() || 'Présentation des services';
  const titre = `${v.nom}${v.entreprise ? ' · ' + v.entreprise : ''} · ${objet}`;
  const base = { id: uid(), fait: false, titre, activite: v.activite || 'perso', lien: 'c:' + v.id, notes: dernierContact(v)?.texte || '', important: false, mode: 'visio', duree: 30, heure: '' };
  let ev;
  if (k === 'date') { if (!f.crDate) return null; ev = { ...base, date: f.crDate, heure: f.crHeure || '', mode: f.crHeure ? 'visio' : 'tache' }; v.statut = 'planifie'; }
  else if (k === 'semaine') { if (!f.crSemaine) return null; const l = monday(parse(f.crSemaine)); ev = { ...base, date: iso(l), fin: iso(addDays(l, 6)), mode: 'tache', duree: 0, aPrevoir: true }; }
  else { if (!f.crDu || !f.crAu) return null; const du = f.crDu, au = f.crAu < f.crDu ? f.crDu : f.crAu; ev = { ...base, date: du, fin: au, mode: 'tache', duree: 0, aPrevoir: true }; }
  if (ev.fin && ev.fin <= ev.date) { delete ev.fin; delete ev.aPrevoir; }
  state.events.push(ev);
  v.eventId = ev.id;
  return ev;
}
function choisirCreneau(btn) {
  btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
  const k = btn.dataset.k; $('#f-creneau').value = k;
  ['date', 'semaine', 'periode'].forEach(x => { $('#cr-' + x).hidden = x !== k; });
  $('#cr-objet').hidden = k === 'aucun';
}
function choisirRappel(btn) {
  if (!btn) return;
  document.querySelectorAll('.rappel-chip').forEach(b => b.classList.toggle('on', b === btn));
  const j = btn.dataset.j;
  $('#f-rappel').value = j ? iso(addDays(new Date(), Number(j))) : '';
}
/* Fiche complète : coordonnées, journal, statut */
function openAVoir(id) {
  const v = id ? aVoir(id) : null;
  if (!v) return openContact();
  const journal = [...v.historique].reverse().map(h => `<li><span class="when">${esc(fmtDate(h.date))}</span><div class="grow">${esc(h.texte)}</div></li>`).join('');
  showModal(`
    <h2>${esc(v.nom)}</h2>
    <div class="fields">
      ${field('nom', 'Personne *', inp('nom', v.nom, 'text', 'required'))}
      ${field('entreprise', 'Entreprise', inp('entreprise', v.entreprise))}
      ${field('activite', 'Service à présenter', sel('activite', SECTEURS, v.activite))}
      ${field('priorite', 'Priorité', sel('priorite', PRIORITES, v.priorite || 'normale'))}
      ${field('attente', 'En attente', sel('attente', ATTENTES, v.attente || ''))}
      ${field('rappel', 'Prochain rappel', inp('rappel', v.rappel, 'date'))}
      ${field('statut', 'Statut', sel('statut', STATUTS_AV, v.statut))}
      ${field('tel', 'Téléphone', inp('tel', v.tel, 'tel'))}
      ${field('email', 'E-mail', inp('email', v.email, 'email'))}
      ${field('ville', 'Ville', inp('ville', v.ville))}
      ${field('lien', 'Client lié (facultatif)', sel('lien', liensOpts(), v.lien || ''))}
      ${field('notes', 'Notes', `<textarea id="f-notes" name="notes">${esc(v.notes || '')}</textarea>`, true)}
      <div class="field full"><label>Journal des contacts</label><ul class="list journal">${journal || '<li class="meta">Aucune prise de contact notée.</li>'}</ul></div>
    </div>
    ${actions(`<button type="button" class="btn danger" onclick="supprimerAVoir('${id}')">Supprimer</button>`,
      `<button type="button" class="btn" onclick="openContact('${id}')">+ Prise de contact</button><button type="button" class="btn" onclick="planifierAVoir('${id}')">Planifier un RDV</button>`)}`,
  f => {
    Object.assign(v, f);
    save(); modal().close(); render(); toast('Fiche mise à jour');
  });
}
async function supprimerAVoir(id) {
  modal().close();
  if (!await confirmer('Supprimer ce contact et son journal ?', 'Supprimer')) return;
  state.aVoir = state.aVoir.filter(v => v.id !== id);
  save(); render(); toast('Supprimé');
}
function marquerAVoir(id, statut) {
  const v = aVoir(id); if (!v) return;
  v.statut = statut; if (statut === 'clos') { v.rappel = ''; v.attente = ''; }
  save(); render();
}
/* Ouvre le formulaire de RDV pré-rempli ; à l'enregistrement le contact passe en « RDV planifié » */
function planifierAVoir(id) {
  const v = aVoir(id); if (!v) return;
  const d = dernierContact(v);
  const qui = [v.nom, v.entreprise].filter(Boolean).join(' · ');
  modal().close();
  openEvent(null, today(), v.lien || '', '', ev => { v.statut = 'planifie'; v.eventId = ev.id; v.rappel = ''; },
    { titre: `RDV ${qui}`, activite: v.activite || 'perso', notes: d ? d.texte : '' });
}
function aVoirTri(a, b) {
  const t = today();
  const due = v => v.statut === 'suivi' && v.rappel && v.rappel <= t ? 0 : 1;
  const pr = { haute: 0, normale: 1, basse: 2 };
  return due(a) - due(b) || (a.rappel || '9999').localeCompare(b.rappel || '9999') || (pr[a.priorite] ?? 1) - (pr[b.priorite] ?? 1)
    || ((dernierContact(b) || {}).date || '').localeCompare((dernierContact(a) || {}).date || '');
}
function aVoirItem(v, compact) {
  const t = today();
  const ouvert = v.statut === 'suivi';
  const d = dernierContact(v);
  const ev = v.eventId && state.events.find(e => e.id === v.eventId);
  const jours = v.rappel ? Math.round((parse(v.rappel) - parse(t)) / 864e5) : null;
  const late = ouvert && jours !== null && jours < 0;
  const when = ev && estPeriode(ev) && !ev.fait ? `À prévoir du ${fmtDate(ev.date)} au ${fmtDate(ev.fin)}${jours !== null && ouvert ? ' · rappel ' + (jours < 0 ? 'dépassé' : jours === 0 ? 'aujourd\'hui' : 'dans ' + jours + ' j') : ''}`
    : v.statut === 'planifie' && ev ? `RDV le ${fmtDate(ev.date)}${ev.heure ? ' à ' + ev.heure : ''}`
    : v.statut === 'clos' ? 'Clos'
    : jours === null ? 'Pas de rappel'
    : jours < 0 ? `Rappel dépassé de ${-jours} j`
    : jours === 0 ? 'Rappel aujourd\'hui'
    : jours === 1 ? 'Rappel demain' : `Rappel dans ${jours} j`;
  const attente = v.attente ? `<span class="status ${v.attente === 'lui' ? 'signe' : 'perdu'}">${ATTENTES[v.attente]}</span>` : '';
  return `<li class="${late || (ouvert && jours === 0) ? 'retard' : ''} ${v.statut === 'clos' ? 'done' : ''} ${ouvert && v.attente ? 'alerte' : ''}">
    <div class="grow clickable" onclick="openAVoir('${v.id}')">
      <div class="when ${late ? 'late' : ''}">${esc(when)}</div>
      <div class="title-txt">${ouvert && v.attente ? '<span class="warn-ico" title="En attente">⚠</span> ' : ''}${esc(v.nom)}${v.entreprise ? ` <span class="meta">· ${esc(v.entreprise)}</span>` : ''} ${attente}</div>
      <div class="meta">${d ? `${esc(fmtDate(d.date))} : ${esc(d.texte)}` : 'Aucune prise de contact notée'}</div>
    </div>
    ${ouvert ? `<button class="btn small" onclick="openContact('${v.id}')" title="Noter une nouvelle prise de contact">Contacté</button>` : ''}
    ${ouvert && !compact ? `<button class="btn small" onclick="planifierAVoir('${v.id}')">RDV</button>` : ''}
    <i class="dot" style="background:var(--${v.activite || 'perso'})" data-tip="${esc(SECTEURS[v.activite]?.label || '')}" aria-label="${esc(SECTEURS[v.activite]?.label || '')}"></i>
  </li>`;
}
function aVoirView() {
  tipInit();
  const t = today();
  const suivis = state.aVoir.filter(v => v.statut === 'suivi');
  const dus = suivis.filter(v => v.rappel && v.rappel <= t);
  const attente = suivis.filter(v => v.attente);
  const rows = state.aVoir.filter(v => avFiltre === 'tous' || (avFiltre === 'attente' ? v.statut === 'suivi' && v.attente : v.statut === avFiltre)).sort(aVoirTri);
  const chips = [['suivi', `En cours (${suivis.length})`], ['attente', `En attente d'infos (${attente.length})`], ['planifie', `RDV planifié (${state.aVoir.filter(v => v.statut === 'planifie').length})`], ['clos', `Clos (${state.aVoir.filter(v => v.statut === 'clos').length})`], ['tous', 'Tous']]
    .map(([k, l]) => `<button class="chip ${avFiltre === k ? 'on' : ''}" onclick="avFiltre='${k}';render()">${l}</button>`).join('');
  return `
  <div class="page-head">
    <div><h1>Contacts</h1><p>Les gens croisés à qui présenter un service · ${dus.length ? `${dus.length} à rappeler aujourd'hui` : 'rien à rappeler aujourd\'hui'}${attente.length ? ` · ${attente.length} en attente d'informations` : ''}</p></div>
    <button class="btn primary" onclick="openContact()">+ Prise de contact</button>
  </div>
  <div class="toolbar">${chips}</div>
  <div class="card">
    ${rows.length ? `<ul class="list">${rows.map(v => aVoirItem(v)).join('')}</ul>`
      : `<div class="empty">${state.aVoir.length ? 'Personne dans ce filtre.' : 'Tu croises quelqu\'un, vous parlez d\'un service : note-le ici en 10 secondes avec un rappel dans 2 ou 3 jours. Le jour venu, il apparaît en alerte sur l\'accueil.'}</div>`}
  </div>`;
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

/* ---------- Jarvis : le cerveau (API) + la voix (navigateur) ---------- */
const JKEY = 'kami-jarvis';
let jarvis = loadJarvis();
function loadJarvis() {
  const base = { endpoint: '/api/jarvis', token: '', nom: 'Kami', voix: true, mainsLibres: false, voixNom: '', historique: [] };
  try { return { ...base, ...JSON.parse(localStorage.getItem(JKEY) || '{}') }; } catch (e) { return base; }
}
function saveJarvis() {
  try { localStorage.setItem(JKEY, JSON.stringify({ ...jarvis, historique: jarvis.historique.slice(-40) })); } catch (e) { /* stockage indisponible */ }
}
let jarvisEtat = { texte: 'Vérification du cerveau…', ok: null };
let jarvisOccupe = false;

/* Ce que le cerveau reçoit : les données du tableau de bord + un résumé chiffré */
function projection() {
  const mois = bilan('mois'), annee = bilan('annee');
  const t = today();
  return {
    resume: {
      gagneMois: mois.tot.gagne, attenduMois: mois.tot.prevu, tempsMoisMin: mois.tot.total,
      gagneAnnee: annee.tot.gagne, parSecteurAnnee: Object.fromEntries(annee.rows.map(r => [r.k, { gagne: r.gagne, tempsMin: r.total }])),
      recurrentMensuelKamiFood: mrr(), stripe: state.stripe ? { sync: state.stripe.sync, mrr: state.stripe.mrr, encaisse30j: state.stripe.factures.filter(f => f.date >= iso(addDays(new Date(), -30))).reduce((s, f) => s + num(f.ht), 0), impayes: state.stripe.abonnes.filter(a => a.impaye).length } : null, abonnesActifs: state.abonnes.filter(a => a.statut === 'actif').length,
      dossiersEnCours: state.dossiers.filter(d => ACTIFS.includes(d.statut)).length,
      contactsARappeler: rappelsContacts().length, contactsEnAttente: state.aVoir.filter(v => v.statut === 'suivi' && v.attente).length,
      enRetard: relances().filter(r => r.date < t).length + state.events.filter(e => !e.fait && (estPeriode(e) ? e.fin < t : e.date < t)).length + rappelsContacts().filter(r => r.date < t).length,
    },
    formules: state.formules, rdvModele: state.rdvModele, memoire: state.memoire,
    abonnes: state.abonnes, dossiers: state.dossiers, events: state.events, aVoir: state.aVoir,
  };
}

/* Rejoue sur nos données ce que le cerveau a fait sur sa copie */
function appliquer(actions) {
  let nav = null;
  for (const a of actions || []) {
    if (a.op === 'add' && state[a.collection]) state[a.collection].push(a.item);
    else if (a.op === 'update' && state[a.collection]) { const x = state[a.collection].find(i => i.id === a.id); if (x) Object.assign(x, a.fields); }
    else if (a.op === 'delete' && state[a.collection]) state[a.collection] = state[a.collection].filter(i => i.id !== a.id);
    else if (a.op === 'memoire') state.memoire.push(a.note);
    else if (a.op === 'navigate') nav = a.vue;
  }
  if (actions && actions.length) save();
  if (nav && nav !== 'jarvis') setTimeout(() => { location.hash = '#' + nav; }, 1200);
}

async function testerJarvis() {
  jarvisEtat = { texte: 'Vérification…', ok: null };
  try {
    const r = await fetch(jarvis.endpoint, { cache: 'no-store' });
    const j = await r.json();
    if (!j.cleApi) jarvisEtat = { texte: 'Le cerveau répond, mais la clé API Anthropic manque sur Vercel.', ok: false };
    else if (!j.tokenDefini) jarvisEtat = { texte: 'Le cerveau répond, mais JARVIS_TOKEN manque sur Vercel.', ok: false };
    else if (!jarvis.token) jarvisEtat = { texte: `Cerveau prêt (${j.modele}). Colle ton jeton dans Réglages pour lui parler.`, ok: false };
    else jarvisEtat = { texte: `Cerveau prêt · ${j.modele} · effort ${j.effort}`, ok: true };
  } catch (e) {
    jarvisEtat = { texte: location.protocol === 'file:' ? 'Le cerveau n\'est joignable qu\'en ligne (Vercel), pas depuis un fichier local.' : 'Le cerveau ne répond pas à cette adresse.', ok: false };
  }
  const el = $('#jarvis-etat'); if (el) { el.textContent = jarvisEtat.texte; el.className = jarvisEtat.ok ? 'ok' : (jarvisEtat.ok === false ? 'ko' : ''); }
  if (location.hash === '#parametres') toast(jarvisEtat.texte);
}

async function jarvisEnvoyer(texte, viaVoix) {
  texte = String(texte || '').trim();
  if (!texte || jarvisOccupe) return;
  if (!jarvis.token) { toast('Colle d\'abord ton jeton Jarvis dans Réglages'); location.hash = '#parametres'; return; }
  jarvisOccupe = true;
  jarvis.historique.push({ role: 'user', content: texte, voix: !!viaVoix });
  majChat();
  const now = new Date();
  try {
    const r = await fetch(jarvis.endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-jarvis-token': jarvis.token },
      body: JSON.stringify({
        messages: jarvis.historique.filter(m => !m.erreur).slice(-20).map(m => ({ role: m.role, content: m.content })),
        state: projection(), mode: viaVoix ? 'voice' : 'text', nom: jarvis.nom,
        aujourdhui: today(), heure: `${pad(now.getHours())}:${pad(now.getMinutes())}`, now: now.toISOString(),
      }),
    });
    const j = await r.json().catch(() => ({ erreur: `Réponse illisible (${r.status})` }));
    if (!r.ok || j.erreur) throw new Error(j.erreur || `Erreur ${r.status}`);
    appliquer(j.actions);
    jarvis.historique.push({ role: 'assistant', content: j.texte, actions: (j.actions || []).length });
    if (jarvis.voix && viaVoix) parler(j.texte);
  } catch (e) {
    jarvis.historique.push({ role: 'assistant', content: e.message || String(e), erreur: true });
    if (viaVoix && jarvis.voix) parler('Désolé, je n\'ai pas pu répondre.');
  }
  jarvisOccupe = false;
  saveJarvis(); majChat();
}

function bulles() {
  if (!jarvis.historique.length) return `<div class="empty">Dis-moi ce que tu veux : « Qu'est-ce que j'ai demain ? », « Mets une visio avec Garage Central mardi à 14h », « Combien j'ai gagné ce mois en CEE ? »</div>`;
  return jarvis.historique.slice(-40).map(m => `<div class="bulle ${m.role} ${m.erreur ? 'erreur' : ''}">${md(m.content)}${m.actions ? `<div class="meta">✓ ${m.actions} action(s) appliquée(s)</div>` : ''}</div>`).join('')
    + (jarvisOccupe ? '<div class="bulle assistant pense">…</div>' : '');
}
function md(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^(?:- |• )(.*)$/gm, '<div class="li">• $1</div>').replace(/\n/g, '<br>');
}
function majChat() {
  const log = $('#chat-log'); if (!log) return;
  log.innerHTML = bulles(); log.scrollTop = log.scrollHeight;
  const b = $('#chat-send'); if (b) b.disabled = jarvisOccupe;
}

function jarvisView() {
  setTimeout(testerJarvis, 0);
  setTimeout(majChat, 0);
  return `
  <div class="page-head">
    <div><h1>${esc(jarvis.nom)}</h1><p id="jarvis-etat" class="${jarvisEtat.ok ? 'ok' : jarvisEtat.ok === false ? 'ko' : ''}">${esc(jarvisEtat.texte)}</p></div>
    <div class="btn-row">
      <button class="btn ${jarvis.voix ? 'on' : ''}" onclick="jarvis.voix=!jarvis.voix;saveJarvis();render()" title="Jarvis répond à voix haute quand tu lui parles à la voix">🔊 Voix ${jarvis.voix ? 'on' : 'off'}</button>
      ${SR ? `<button class="btn ${jarvis.mainsLibres ? 'primary' : ''}" onclick="mainsLibres(!jarvis.mainsLibres)" title="Il n'écoute que quand tu dis « Jarvis »">${jarvis.mainsLibres ? '● Mains libres actif' : '○ Mains libres'}</button>` : ''}
      <button class="btn" onclick="parler('Bonjour Toufek, je suis prêt.')" title="Tester la voix">Test voix</button>
    </div>
  </div>
  <div class="card chat">
    <div id="chat-log"></div>
    <form id="chat-form" onsubmit="event.preventDefault();const i=$('#chat-in');jarvisEnvoyer(i.value,false);i.value=''">
      ${SR ? `<button type="button" class="btn mic" id="chat-mic" onclick="dicter()" aria-label="Parler">🎤</button>` : ''}
      <input id="chat-in" type="text" placeholder="${SR ? 'Écris, ou appuie sur le micro et parle…' : 'Écris à Jarvis…'}" autocomplete="off">
      <button class="btn primary" id="chat-send" ${jarvisOccupe ? 'disabled' : ''}>Envoyer</button>
    </form>
    ${SR ? '' : '<p class="note">Ton navigateur ne gère pas la reconnaissance vocale. Utilise Chrome ou Edge pour parler à Jarvis.</p>'}
  </div>`;
}

/* --- Voix : reconnaissance (mot d'activation « Jarvis ») et synthèse --- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
let rec = null, ecoute = false, enTrainDeParler = false, dicteeSeule = false;

function creerRec() {
  const r = new SR();
  r.lang = 'fr-FR'; r.continuous = true; r.interimResults = false; r.maxAlternatives = 1;
  r.onresult = e => {
    const t = e.results[e.results.length - 1][0].transcript.trim();
    if (!t || enTrainDeParler) return;
    if (dicteeSeule) { dicteeSeule = false; arreterEcoute(); jarvisEnvoyer(t, true); return; }
    const texte = apresMotCle(t);
    if (texte === null) return; // il n'écoute que si le mot d'activation ouvre la phrase
    if (!texte) { parler('Oui ?'); return; }
    jarvisEnvoyer(texte, true);
  };
  r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { toast('Micro refusé : autorise-le dans le navigateur'); mainsLibres(false); } };
  r.onend = () => { if (ecoute && !enTrainDeParler) { try { r.start(); } catch (e) { /* déjà lancé */ } } };
  return r;
}
/* Renvoie ce qui suit le mot d'activation (« Jarvis », « Kami »…) s'il ouvre la phrase, sinon null.
   Mot entier uniquement : « KamiFood » ne déclenche pas « Kami ». */
const sansAccents = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function apresMotCle(transcription) {
  const nom = sansAccents(jarvis.nom || 'Kami').trim();
  if (!nom) return transcription.trim();
  const mots = sansAccents(transcription).replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/);
  const n = nom.split(/\s+/);
  const debut = mots.slice(0, 3 + n.length);
  for (let i = 0; i <= Math.min(2, debut.length - n.length); i++) {
    if (n.every((m, k) => debut[i + k] === m)) {
      const originaux = transcription.trim().split(/\s+/);
      return originaux.slice(i + n.length).join(' ').replace(/^[\s,.!?:]+/, '').trim();
    }
  }
  return null;
}
function demarrerEcoute() { if (!SR) return; rec = rec || creerRec(); ecoute = true; try { rec.start(); } catch (e) { /* déjà lancé */ } majMic(); }
function arreterEcoute() { ecoute = false; if (rec) { try { rec.stop(); } catch (e) { /* ignore */ } } majMic(); }
function majMic() { const b = $('#chat-mic'); if (b) b.classList.toggle('on', ecoute); }
function mainsLibres(on) {
  jarvis.mainsLibres = !!on; saveJarvis();
  if (on) { dicteeSeule = false; demarrerEcoute(); toast('Mains libres : dis « Jarvis, … »'); } else arreterEcoute();
  render();
}
function dicter() {
  if (ecoute && dicteeSeule) { dicteeSeule = false; arreterEcoute(); return; }
  if (jarvis.mainsLibres) { toast('Mains libres déjà actif : dis « Jarvis, … »'); return; }
  dicteeSeule = true; demarrerEcoute(); toast('Je t\'écoute…');
}
function voixDispo() {
  try { return speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith('fr')); } catch (e) { return []; }
}
function voixOptions() {
  const vs = voixDispo();
  if (!vs.length) return '<option value="">Voix française du système</option>';
  return `<option value="">Automatique</option>` + vs.map(v => `<option value="${esc(v.name)}" ${v.name === jarvis.voixNom ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
}
function parler(texte) {
  if (!('speechSynthesis' in window) || !texte) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texte.replace(/[*_#`>]/g, ''));
  u.lang = 'fr-FR'; u.rate = 1.02;
  const vs = voixDispo();
  const pref = vs.find(v => v.name === jarvis.voixNom) || vs.find(v => /google|microsoft|siri|premium|enhanced|neural/i.test(v.name)) || vs[0];
  if (pref) u.voice = pref;
  enTrainDeParler = true;
  if (rec && ecoute) { try { rec.stop(); } catch (e) { /* ignore */ } }
  u.onend = u.onerror = () => { enTrainDeParler = false; if (ecoute && rec) { try { rec.start(); } catch (e) { /* ignore */ } } };
  speechSynthesis.speak(u);
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { const s = $('#j-voice'); if (s) s.innerHTML = voixOptions(); };
if (jarvis.mainsLibres && SR) setTimeout(() => demarrerEcoute(), 500);

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
  ].map(x => ({ id: uid(), createdAt: Date.now(), demo: true, ...x }));
  state.abonnes.push(...ab);
  planifierInclus(ab[2]);
  const ex = [
    { entreprise: 'Boulangerie Martin', activite: 'energie', statut: 'rdv', contact: 'M. Martin', ville: 'Strasbourg', partenaire: 'Fournisseur A', commEstimee: 450, dateRelance: d(2) },
    { entreprise: 'Garage Central', activite: 'cee', statut: 'etude', contact: 'Mme Klein', ville: 'Mundolsheim', partenaire: 'Délégataire B', commEstimee: 1800, dateRelance: d(-1) },
    { entreprise: 'SCI Les Tilleuls', activite: 'foncier', statut: 'signe', contact: 'M. Weber', ville: 'Haguenau', partenaire: 'Cabinet C', commEstimee: 2400, dateSignature: d(-10) },
    { entreprise: 'Hôtel du Parc', activite: 'energie', statut: 'paye', contact: 'Direction', ville: 'Colmar', partenaire: 'Fournisseur A', commEstimee: 900, commRecue: 900, dateSignature: d(-40), datePaiement: d(-3) },
    { entreprise: 'Entrepôt Logistik', activite: 'cee', statut: 'paye', contact: 'Resp. technique', ville: 'Illkirch', partenaire: 'Délégataire B', commEstimee: 3500, commRecue: 3500, dateSignature: d(-60), datePaiement: m(-2) },
  ].map(x => ({ id: uid(), createdAt: Date.now(), demo: true, ...x }));
  state.dossiers.push(...ex);
  const ev = (n, heure, duree, mode, titre, activite, lien, fait = false) => ({ id: uid(), demo: true, date: d(n), heure, duree, mode, titre, activite, lien, fait, notes: '' });
  state.events.push(
    ev(0, '10:00', 60, 'place', 'RDV factures énergie', 'energie', 'd:' + ex[0].id),
    ev(0, '14:30', 30, 'visio', 'Visio devis CEE', 'cee', 'd:' + ex[1].id),
    ev(0, '17:00', 45, 'visio', 'Point de suivi mensuel', 'kamifood', 'a:' + ab[1].id),
    ev(-2, '09:30', 90, 'place', 'Formation équipe salle', 'kamifood', 'a:' + ab[0].id, true),
    ev(-1, '11:00', 60, 'visio', 'Visio dossier taxe foncière', 'foncier', 'd:' + ex[2].id, true),
    ev(1, '09:00', 60, 'tache', 'Compta holding', 'perso', ''),
    ev(3, '11:00', 90, 'place', 'Visite entrepôt : audit éclairage', 'cee', 'd:' + ex[1].id),
  );
  state.aVoir.push(
    { id: uid(), createdAt: Date.now(), demo: true, nom: 'Mme Roth', entreprise: 'Pharmacie de la Gare', activite: 'foncier', priorite: 'normale', statut: 'suivi', attente: 'lui', rappel: d(0), historique: [{ date: d(-3), texte: 'Croisée au marché : intéressée par la taxe foncière, doit m\'envoyer ses avis 2024-2025' }] },
    { id: uid(), createdAt: Date.now(), demo: true, nom: 'Julien', entreprise: 'Pizzeria Nova', activite: 'kamifood', priorite: 'normale', statut: 'suivi', attente: 'moi', rappel: d(2), historique: [{ date: d(-1), texte: 'Veut une démo KamiFood, je lui envoie le lien' }] },
  );
  save(); render(); toast('Exemple chargé');
}
/* Les données d'exemple sont marquées demo:true ; les anciens exemples sont reconnus à leur nom */
const DEMO_NOMS = ['Le Petit Zinc', 'Brasserie du Port', 'Sushi Kaze', 'Boulangerie Martin', 'Garage Central', 'SCI Les Tilleuls', 'Hôtel du Parc', 'Entrepôt Logistik'];
const estDemo = x => !!x.demo || DEMO_NOMS.includes(x.restaurant || x.entreprise || '');
const aDemo = () => [...state.abonnes, ...state.dossiers, ...state.events, ...state.aVoir].some(estDemo);
async function retirerExemple() {
  if (!await confirmer("Retirer les données d'exemple ? Tes vraies données restent.", 'Retirer')) return;
  const ids = new Set([...state.abonnes.filter(estDemo).map(a => 'a:' + a.id), ...state.dossiers.filter(estDemo).map(d => 'd:' + d.id)]);
  const n = state.abonnes.length + state.dossiers.length + state.events.length + state.aVoir.length;
  state.abonnes = state.abonnes.filter(a => !estDemo(a));
  state.dossiers = state.dossiers.filter(d => !estDemo(d));
  state.events = state.events.filter(e => !(e.demo || (e.lien && ids.has(e.lien)) || (e.titre === 'Compta holding' && e.activite === 'perso' && !e.lien && !e.notes)));
  state.aVoir = state.aVoir.filter(v => !v.demo);
  save(); render(); toast(`${n - (state.abonnes.length + state.dossiers.length + state.events.length + state.aVoir.length)} élément(s) d'exemple retiré(s)`);
}

/* ---------- Installation (PWA) ---------- */
let installPrompt = null;
const estInstalle = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (location.hash === '#parametres') render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast('KGD installé'); if (location.hash === '#parametres') render(); });
async function installerAppli() {
  if (!installPrompt) return;
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  if (outcome !== 'accepted') toast('Installation annulée');
  installPrompt = null; render();
}
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* hors ligne indisponible */ }); });
}

render();
