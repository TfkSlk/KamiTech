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
const ATTENTES = { '': 'Rien en attente', lui: "J'attends ses informations", moi: 'Je lui dois des informations' };
const PRIORITES = { haute: 'Haute', normale: 'Normale', basse: 'Basse' };
/* Chaque contact a toujours une suite : un rappel (en jours ouvrés), un créneau, ou la clôture explicite */
const RAPPELS = [['2', '2 jours'], ['3', '3 jours'], ['7', '1 semaine'], ['14', '2 semaines'], ['clos', 'Clore le contact']];

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
/* Données illisibles (JSON abîmé) : une copie brute est gardée et rien n'est écrit tant que Toufek n'a pas choisi quoi faire */
let donneesIllisibles = false, copieIllisible = false;
/* Une autre fenêtre a écrit pendant une saisie : on recharge à la fermeture de la fenêtre ou de la Rencontre */
let aRecharger = false;
/* Version des données enregistrées, +1 à chaque enregistrement : une fenêtre en retard n'écrase jamais une plus récente.
   Elle est écrite en tête de la clé, mais ne fait pas partie de l'état (un état restauré est identique à l'original). */
let revCourant = 0;
let state = load();

/* Ici, load(), migrate(), assainir() et ce qu'elles appellent tournent AVANT la définition des const utilitaires
   (zone morte) : seulement du code en ligne et des fonctions déclarées avec function (jourLocal, uid, serialiser). */
/* Jour local AAAA-MM-JJ (aujourd'hui, ou celui d'un horodatage ; un horodatage illisible donne aujourd'hui) */
function jourLocal(ts) { let d = ts == null ? new Date() : new Date(ts); if (isNaN(d)) d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
/* rev en tête du texte stocké : save() le relit sans tout analyser */
function serialiser(s, rev = revCourant) { const o = { rev, ...s }; o.rev = rev; return JSON.stringify(o); }
function revDe(brut) {
  if (!brut) return 0;
  const m = /^\{"rev":(\d+)[,}]/.exec(brut);
  if (m) return Number(m[1]);
  try { const o = JSON.parse(brut); return o && Number.isInteger(o.rev) ? o.rev : 0; } catch (e) { return 0; }
}
function lireCle(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
/* Copie de la veille : au premier enregistrement du jour, la valeur stockée (si elle est lisible) part dans KEY.veille */
function copieVeille(s, brut) {
  const j = jourLocal();
  if (s.prefs.jourCopie === j) return;
  if (brut) {
    let ok = false;
    try { const o = JSON.parse(brut); ok = !!o && typeof o === 'object' && !Array.isArray(o); } catch (e) { /* illisible : on ne remplace pas une bonne copie par une copie abîmée */ }
    if (ok) { try { localStorage.setItem(KEY + '.veille', brut); } catch (e) { /* stockage plein : l'enregistrement principal passe d'abord */ } }
  }
  s.prefs.jourCopie = j;
}
/* Garde le texte illisible sous KEY.corrompu-AAAA-MM-JJ (une seule fois par contenu) */
function garderIllisible(brut) {
  donneesIllisibles = true; copieIllisible = false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KEY + '.corrompu-') && localStorage.getItem(k) === brut) { copieIllisible = true; return; }
    }
    let k = KEY + '.corrompu-' + jourLocal(), n = 1;
    while (localStorage.getItem(k) !== null) k = KEY + '.corrompu-' + jourLocal() + '-' + (++n);
    localStorage.setItem(k, brut);
    copieIllisible = true;
  } catch (e) { /* stockage plein : le texte reste sous KEY, que save() ne touche plus */ }
}

function load() {
  let s = blank(), lu = null, avant = {};
  donneesIllisibles = false; revCourant = 0;
  const brut = lireCle(KEY);
  if (brut) {
    try { lu = JSON.parse(brut); } catch (e) { lu = undefined; }
    if (!lu || typeof lu !== 'object' || Array.isArray(lu)) { garderIllisible(brut); lu = null; }
    else {
      s = { ...s, ...lu };
      revCourant = Number.isInteger(lu.rev) && lu.rev > 0 ? lu.rev : 0;
      /* Copie des drapeaux AVANT migrate : il modifie le même objet prefs.migrations, une nouvelle migration passerait sinon inaperçue */
      const m = lu.prefs && lu.prefs.migrations;
      if (m && typeof m === 'object' && !Array.isArray(m)) avant = { ...m };
    }
  }
  try { s = migrate(s); }
  catch (e) {
    /* Filet : une migration ou une réparation qui plante ne donne jamais un écran blanc. Rien n'est écrit, la copie brute
       est gardée et la carte rouge propose quoi faire (comme pour des données illisibles). */
    console.warn(e);
    if (brut) garderIllisible(brut);
    lu = null;
    s = migrate(blank());
    s.prefs.jourCopie = jourLocal(); // ces données lisibles mais en panne ne remplacent pas la bonne copie de la veille aujourd'hui
  }
  /* Une migration nommée vient de tourner, ou des données ont été réparées : on l'écrit tout de suite pour que ce soit stable
     (save() n'est pas encore utilisable ici). La valeur d'avant part d'abord dans la copie de la veille. */
  if (lu) {
    if (migrate.corrections || Object.keys(s.prefs.migrations).some(k => !avant[k])) {
      try { copieVeille(s, brut); localStorage.setItem(KEY, serialiser(s)); } catch (e) { /* stockage plein ou bloqué : rejouera au prochain chargement, sans dommage */ }
    }
  }
  return s;
}
function migrate(s) {
  delete s.rev; // version d'enregistrement : jamais dans l'état (voir revCourant)
  /* Gardes : une collection absente ou abîmée (null, objet…) redevient un tableau, les éléments vides sont écartés */
  if (!s.prefs || typeof s.prefs !== 'object' || Array.isArray(s.prefs)) s.prefs = {};
  ['dossiers', 'events', 'abonnes', 'aVoir', 'memoire', 'formules', 'rdvModele'].forEach(k => {
    if (!Array.isArray(s[k])) s[k] = blank()[k] || [];
    s[k] = s[k].filter(x => k === 'memoire' ? x != null : !!x && typeof x === 'object' && !Array.isArray(x));
  });
  s.prefs = { periode: 'mois', theme: 'light', planVue: 'semaine', ...s.prefs };
  s.abonnes = s.abonnes || [];
  s.memoire = s.memoire || [];
  s.aVoir = s.aVoir || [];
  s.stripe = s.stripe || null;
  s.aVoir.forEach(v => {
    if (!Array.isArray(v.historique)) v.historique = [];
    if (v.objet) { v.historique.unshift({ date: v.createdAt ? jourLocal(v.createdAt) : jourLocal(), texte: v.objet }); delete v.objet; }
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
    /* Durée absente : 0 pour une période (elle ne compte pas d'heures), 60 min sinon. Une durée 0 choisie reste 0. */
    if (e.duree === undefined || e.duree === null || e.duree === '') e.duree = (e.fin && e.fin > e.date) ? 0 : 60;
    if (!e.mode) e.mode = 'place';
  });
  /* Migrations nommées : chacune ne tourne qu'une fois (drapeau dans prefs.migrations), dans n'importe quel ordre.
     Ici, les utilitaires (today, iso, estPeriode…) ne sont pas encore définis : code en ligne et jourLocal() seulement. */
  if (!s.prefs.migrations || typeof s.prefs.migrations !== 'object' || Array.isArray(s.prefs.migrations)) s.prefs.migrations = {};
  /* Victimes du rappel non enregistré ou du RDV oublié : ils reviennent aujourd'hui. Rien n'est supprimé, les journaux restent. */
  if (!s.prefs.migrations.rappelsRecuperes) {
    const j = jourLocal();
    s.aVoir.forEach(v => {
      if (v.statut === 'suivi' && !v.rappel) v.rappel = j;
      else if (v.statut === 'planifie') {
        const e = v.eventId ? s.events.find(x => x.id === v.eventId) : null;
        const finRdv = e ? (e.fin && e.fin > e.date ? e.fin : e.date) : '';
        if (!e || e.fait || !finRdv || finRdv < j) { v.statut = 'suivi'; v.rappel = j; }
      }
    });
    s.prefs.migrations.rappelsRecuperes = true;
  }
  /* Périodes sans heure : l'ancien chargement leur donnait 60 min à tort ; elles reviennent à 0 */
  if (!s.prefs.migrations.dureesPeriodes) {
    s.events.forEach(e => { if (typeof e.fin === 'string' && e.fin && e.fin > e.date && !e.heure) e.duree = 0; });
    s.prefs.migrations.dureesPeriodes = true;
  }
  /* Résilié sans date de fin : il rapportait encore. Fin posée au jour de la migration, signalée « estimée, à corriger » */
  if (!s.prefs.migrations.resilieSansFin) {
    const j = jourLocal();
    s.abonnes.forEach(a => { if (a.statut === 'resilie' && !a.fin) { a.fin = j; a.finEstimee = true; } });
    s.prefs.migrations.resilieSansFin = true;
  }
  /* Licence éditeur en double (case décochée puis recréée au chargement) : un seul 'moi', toujours interne.
     La licence gardée est une vraie licence : sans Stripe, et gratuite (ou déjà cochée « Licence éditeur »).
     Une autre copie gratuite est retirée en gardant sa note ; un « moi » devenu vrai restaurant (prix ou Stripe)
     reçoit un nouvel id et reste compté (avec ses liens s'il était celui affiché). S'il n'y avait aucune vraie licence,
     une licence neuve est créée juste après (plus bas). Rien d'autre n'est touché. */
  if (!s.prefs.migrations.dedoublonMoi) {
    const prixDe = a => Number(String(a.prix ?? '').replace(',', '.')) || 0;
    const mois = s.abonnes.filter(a => a.id === 'moi');
    const garde = mois.find(a => !prixDe(a) && !a.stripeId) || mois.find(a => a.interne === true && !a.stripeId) || null;
    const retires = new Set();
    mois.forEach((a, i) => {
      if (a === garde) return;
      if (prixDe(a) || a.stripeId) {
        const nv = uid();
        if (i === 0) [...s.events, ...s.aVoir].forEach(x => { if (x.lien === 'a:moi') x.lien = 'a:' + nv; });
        a.id = nv;
      } else {
        const n = typeof a.notes === 'string' ? a.notes.trim() : '';
        if (n && !n.startsWith('Licence éditeur KamiFood :') && !String(garde.notes || '').includes(n)) garde.notes = [garde.notes, n].filter(Boolean).join('\n');
        retires.add(a);
      }
    });
    s.abonnes = s.abonnes.filter(a => !retires.has(a));
    if (garde) garde.interne = true;
    s.prefs.migrations.dedoublonMoi = true;
  }
  /* Toufek est l'éditeur de KamiFood : sa licence (id 'moi') est permanente et jamais facturée. Après dedoublonMoi,
     qui peut avoir rendu son id à un vrai restaurant. */
  if (!s.abonnes.some(a => a.id === 'moi')) s.abonnes.push({ id: 'moi', createdAt: Date.now(), interne: true, restaurant: 'Toufek · licence éditeur', contact: 'Toufek', statut: 'actif', prix: 0, engagement: 0, debut: jourLocal(), formule: (s.formules || []).find(f => f.nom === 'Premium')?.id || '', notes: 'Licence éditeur KamiFood : activée en permanence, jamais facturée.' });
  migrate.corrections = assainir(s);
  return s;
}
/* Assainissement, à chaque chargement, import et réponse de Kami (idempotent : des données saines ne changent pas).
   Ids sûrs (ils finissent dans des onclick), liens recâblés vers les nouveaux ids, secteurs et statuts connus, dates AAAA-MM-JJ.
   Renvoie le nombre de corrections. Code en ligne et fonctions déclarées seulement (voir plus haut). */
function assainir(s) {
  let n = 0;
  const ID = /^[A-Za-z0-9_-]{1,40}$/, JOUR = /^\d{4}-\d{2}-\d{2}$/, LIEN = /^[adc]:[A-Za-z0-9_-]{1,40}$/;
  const connu = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  /* ancien id → nouveau, par collection (a: abonnés, d: dossiers, c: contacts, e: RDV, f: formules) */
  const tables = { a: new Map(), d: new Map(), c: new Map(), e: new Map(), f: new Map() };
  const ids = (liste, t) => {
    const vus = new Set();
    liste.forEach(x => {
      if (typeof x.id === 'number') { x.id = String(x.id); n++; }
      if (typeof x.id === 'string' && ID.test(x.id) && !vus.has(x.id)) { vus.add(x.id); return; }
      let nv; do nv = uid(); while (vus.has(nv));
      if (x.id != null && !vus.has(x.id) && !tables[t].has(String(x.id))) tables[t].set(String(x.id), nv); // un doublon valide garde ses liens vers le premier
      x.id = nv; vus.add(nv); n++;
    });
  };
  ids(s.abonnes, 'a'); ids(s.dossiers, 'd'); ids(s.aVoir, 'c'); ids(s.events, 'e'); ids(s.formules, 'f');
  const relier = l => {
    if (l == null || l === '') return '';
    l = String(l);
    const t = l[0], nv = l[1] === ':' && tables[t] ? tables[t].get(l.slice(2)) : null;
    if (nv && t !== 'e' && t !== 'f') return t + ':' + nv;
    return LIEN.test(l) ? l : '';
  };
  const refId = (v, t) => { if (v == null || v === '') return ''; v = String(v); return tables[t].get(v) || (ID.test(v) ? v : ''); };
  const maj = (x, k, v) => { if (x[k] !== v) { x[k] = v; n++; } };
  /* Dates : AAAA-MM-JJ ; un horodatage ISO est ramené à son jour ; une date française JJ/MM/AAAA est retournée ;
     sinon la date est vidée */
  const DATES = ['date', 'fin', 'rappel', 'debut', 'dateRelance', 'dateSignature', 'datePaiement'];
  const FR = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
  const jourFr = v => {
    const m = FR.exec(v.trim());
    if (!m) return '';
    const [j, mo, a] = [Number(m[1]), Number(m[2]), Number(m[3])], d = new Date(a, mo - 1, j);
    return d.getFullYear() === a && d.getMonth() === mo - 1 && d.getDate() === j ? `${m[3]}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}` : '';
  };
  const jour = v => typeof v !== 'string' ? '' : JOUR.test(v) ? v : JOUR.test(v.slice(0, 10)) && /^T|^ /.test(v.slice(10)) ? v.slice(0, 10) : jourFr(v);
  /* Textes : un nombre devient du texte, un objet son JSON (rien n'est jeté) */
  const TEXTES = ['titre', 'nom', 'entreprise', 'restaurant', 'contact', 'notes', 'heure', 'tel', 'email', 'ville', 'partenaire', 'lieu'];
  const texte = v => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  const nettoyer = x => {
    DATES.forEach(k => { if (k in x && x[k] !== '' && x[k] !== undefined) maj(x, k, jour(x[k])); });
    TEXTES.forEach(k => { if (k in x && x[k] !== undefined && typeof x[k] !== 'string') maj(x, k, texte(x[k])); });
  };
  [s.abonnes, s.dossiers, s.aVoir, s.events].forEach(l => l.forEach(nettoyer));
  s.events.forEach(e => {
    maj(e, 'lien', relier(e.lien));
    if (!connu(SECTEURS, e.activite)) maj(e, 'activite', 'perso');
  });
  s.aVoir.forEach(v => {
    /* Un contact a toujours un nom texte (vide au pire, affiché « Sans nom ») : jamais « undefined » à l'écran */
    if (typeof v.nom !== 'string') maj(v, 'nom', texte(v.nom));
    if ('lien' in v) maj(v, 'lien', relier(v.lien));
    if ('eventId' in v) maj(v, 'eventId', refId(v.eventId, 'e'));
    if (!connu(SECTEURS, v.activite)) maj(v, 'activite', 'perso');
    if (!connu(STATUTS_AV, v.statut)) maj(v, 'statut', 'suivi');
    if (!connu(ATTENTES, v.attente)) maj(v, 'attente', '');
    /* Règle des contacts : un contact en cours a toujours un rappel (une date illisible vidée, une suite oubliée) → aujourd'hui */
    if (v.statut === 'suivi' && !v.rappel) maj(v, 'rappel', jourLocal());
    if (!Array.isArray(v.historique)) { v.historique = []; n++; }
    v.historique = v.historique.filter(h => h != null).map(h => {
      if (typeof h !== 'object' || Array.isArray(h)) { n++; return { date: '', texte: texte(h) }; }
      if ('date' in h && h.date !== '') maj(h, 'date', jour(h.date));
      if (typeof h.texte !== 'string') maj(h, 'texte', texte(h.texte));
      return h;
    });
  });
  s.dossiers.forEach(d => {
    if (!APPORT.includes(d.activite)) maj(d, 'activite', 'cee');
    if (!connu(STATUTS, d.statut)) maj(d, 'statut', 'prospect');
  });
  s.abonnes.forEach(a => {
    if ('formule' in a) maj(a, 'formule', refId(a.formule, 'f'));
    if ('finEstimee' in a && typeof a.finEstimee !== 'boolean') maj(a, 'finEstimee', !!a.finEstimee);
  });
  /* Réglages et petits champs dont dépend l'affichage */
  if (!connu(PERIODES, s.prefs.periode)) maj(s.prefs, 'periode', 'mois');
  if (!['jour', 'semaine', 'mois'].includes(s.prefs.planVue)) maj(s.prefs, 'planVue', 'semaine');
  if (!['light', 'dark'].includes(s.prefs.theme)) maj(s.prefs, 'theme', 'light');
  if ('dernierSecteur' in s.prefs && s.prefs.dernierSecteur !== '' && !connu(SECTEURS, s.prefs.dernierSecteur)) maj(s.prefs, 'dernierSecteur', '');
  if (typeof s.nom !== 'string' || !s.nom.trim()) maj(s, 'nom', s.nom == null || typeof s.nom === 'object' ? 'Kami Groupe' : String(s.nom).trim() || 'Kami Groupe');
  if (s.stripe != null && (typeof s.stripe !== 'object' || Array.isArray(s.stripe))) { s.stripe = null; n++; }
  if (s.stripe) ['factures', 'abonnes'].forEach(k => {
    if (!Array.isArray(s.stripe[k])) { s.stripe[k] = []; n++; }
    else s.stripe[k] = s.stripe[k].filter(x => !!x && typeof x === 'object');
  });
  delete s.rev; // version d'enregistrement : hors de l'état (voir revCourant)
  return n;
}
/* Enregistre. Rien n'est écrit si les données stockées sont illisibles (en attente d'un choix),
   ni si une autre fenêtre a écrit une version plus récente (on recharge plutôt que d'écraser). */
function save() {
  if (donneesIllisibles) {
    /* Après le toast de l'action (« Dossier créé »…), qui sinon le recouvrirait : chaque saisie non enregistrée est signalée */
    setTimeout(() => toastAction('Pas enregistré : tes données illisibles attendent ton choix', 'Choisir', voirCarteIllisible, 8000), 0);
    return false;
  }
  let brut = null;
  try { brut = localStorage.getItem(KEY); } catch (e) { toast("Impossible d'enregistrer dans ce navigateur"); return false; }
  if (revDe(brut) > revCourant) {
    recharger();
    setTimeout(() => toast('Mis à jour depuis une autre fenêtre : refais ta dernière action', 4500), 0); // après le toast de l'action perdue
    return false;
  }
  copieVeille(state, brut);
  const rev = revCourant + 1;
  try { localStorage.setItem(KEY, serialiser(state, rev)); revCourant = rev; return true; }
  catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014)) {
      setTimeout(() => toastAction('Stockage plein : sauvegarde maintenant', 'Exporter', exporter, 15000), 0);
    } else toast("Impossible d'enregistrer dans ce navigateur");
    return false;
  }
}
const revStocke = () => revDe(lireCle(KEY));
/* Relit les données stockées (autre fenêtre, conflit) et redessine */
function recharger() { aRecharger = false; state = load(); render(); }
/* Remplace tout l'état (import, retour à la veille, annulation, effacement) sans perdre le fil des versions.
   La copie de la veille ne suit que le calendrier : le jour de copie reste celui de l'état en mémoire, jamais celui des données
   restaurées ou importées. Sinon un retour à la veille, un import ou une annulation referait la copie dans la journée
   et y mettrait l'état qu'on vient de quitter, à la place de celui d'hier. */
function remplacerEtat(data) {
  const jc = state.prefs.jourCopie;
  revCourant = Math.max(revStocke(), revCourant);
  state = migrate({ ...blank(), ...data });
  if (jc) state.prefs.jourCopie = jc; else delete state.prefs.jourCopie;
  const ok = save(); render();
  return ok;
}
/* Une autre fenêtre (ou l'appli rouverte sur iPhone) a écrit : on suit, sauf pendant une saisie */
const occupe = () => {
  const a = document.activeElement;
  return $('#modal').open || !$('#rencontre').hidden || !!(a && a.closest && a.closest('#main') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
};
function autreFenetre() {
  if (occupe()) { aRecharger = true; return; }
  recharger(); toast('Mis à jour depuis une autre fenêtre');
}
function rechargementDiffere() { if (aRecharger && !occupe()) autreFenetre(); }
window.addEventListener('storage', e => { if (e.key === KEY && revDe(e.newValue) !== revCourant) autreFenetre(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && revStocke() > revCourant) autreFenetre(); });
/* Rechargement mis de côté pendant une frappe : appliqué quand le champ est quitté, jamais au milieu d'un clic
   (le bouton touché serait redessiné sous le doigt et le clic perdu) */
let pointeurBas = false;
document.addEventListener('pointerdown', () => { pointeurBas = true; }, true);
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => { pointeurBas = false; setTimeout(rechargementDiffere, 0); }, true));
document.addEventListener('focusout', () => { if (!pointeurBas) setTimeout(rechargementDiffere, 0); });

/* ---------- Utilitaires ---------- */
const $ = (s, el = document) => el.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/* Un rappel ou un RDV automatique ne tombe jamais un week-end : samedi et dimanche glissent au lundi */
const jourOuvre = d => { const x = new Date(d); const j = x.getDay(); if (j === 6) x.setDate(x.getDate() + 2); else if (j === 0) x.setDate(x.getDate() + 1); return x; };
const rappelDans = n => iso(jourOuvre(addDays(new Date(), n)));
/* + n mois, le jour borné au dernier jour du mois visé (31 janv. + 1 mois = 28 ou 29 févr., jamais début mars) */
const addMonths = (d, n) => {
  const x = new Date(d), j = x.getDate();
  x.setDate(1); x.setMonth(x.getMonth() + n);
  x.setDate(Math.min(j, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  return x;
};
const monday = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const eur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
const num = v => Number(String(v ?? '').replace(',', '.')) || 0;
const hrs = min => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} h${m ? ' ' + pad(m) : ''}` : `${m} min`; };
const fmtDate = s => s ? parse(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
const fmtLong = d => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const secteurConnu = a => typeof a === 'string' && Object.prototype.hasOwnProperty.call(SECTEURS, a);
const tag = a => `<span class="tag" style="--c:var(--${secteurConnu(a) ? a : 'perso'})">${esc(secteurConnu(a) ? SECTEURS[a].label : a)}</span>`;
const statusBadge = s => `<span class="status ${esc(s)}">${esc(STATUTS[s] || s)}</span>`;
const abBadge = s => `<span class="status ${s === 'actif' ? 'paye' : s === 'resilie' ? 'perdu' : 'signe'}">${STATUTS_AB[s]}</span>`;
const dossier = id => state.dossiers.find(d => d.id === id);
/* Un RDV avec une date de fin est une période (bandeau sur plusieurs jours) ; important = alerte */
const estPeriode = e => !!(e.fin && e.fin > e.date);
const surJour = (e, ds) => estPeriode(e) ? (e.date <= ds && ds <= e.fin) : e.date === ds;
const abonne = id => state.abonnes.find(a => a.id === id);
const aVoir = id => state.aVoir.find(v => v.id === id);
const dernierContact = v => { const h = v.historique || []; return h[h.length - 1]; };
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
function toast(msg, ms = 2400) {
  placerToast();
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), ms);
}
/* Toast avec un bouton d'action (ex. « Noter la suite ») : reste affiché plus longtemps, seul le bouton est cliquable */
function toastAction(msg, label, fn, ms = 8000) {
  placerToast();
  const t = $('#toast');
  t.textContent = msg;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'toast-action'; b.textContent = label;
  b.onclick = () => { clearTimeout(toast.t); t.classList.remove('show'); fn(); };
  t.appendChild(b);
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- Calculs : périodes, gains, temps ---------- */
function range(p) {
  const n = new Date();
  if (p === 'semaine') { const m = monday(n); return [iso(m), iso(addDays(m, 6))]; }
  if (p === 'annee') return [`${n.getFullYear()}-01-01`, `${n.getFullYear()}-12-31`];
  return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(new Date(n.getFullYear(), n.getMonth() + 1, 0))];
}

/* Revenu d'un abonné entre deux dates incluses, au prorata des jours : pour chaque mois couvert par
   [from, to] ∩ [début, fin], prix × jours couverts ÷ jours du mois. Un mois entier vaut donc exactement le prix.
   Rien pour la licence éditeur (interne), une période d'essai ou un abonné sans date de début ; un résilié s'arrête à sa fin. */
function revenuAbonne(a, from, to) {
  if (!a || a.interne || a.statut === 'essai' || !a.debut) return 0;
  const stop = a.statut === 'resilie' ? (a.fin || a.debut) : '9999-12-31';
  const lo = from > a.debut ? from : a.debut, hi = to < stop ? to : stop;
  if (lo > hi) return 0;
  const prix = num(a.prix);
  let total = 0;
  for (let m = new Date(parse(lo).getFullYear(), parse(lo).getMonth(), 1); iso(m) <= hi; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const dernier = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    const d1 = lo > iso(m) ? lo : iso(m), d2 = hi < iso(dernier) ? hi : iso(dernier);
    const jours = Math.round((parse(d2) - parse(d1)) / 864e5) + 1; // arrondi : un changement d'heure ne fausse pas le compte
    total += prix * jours / dernier.getDate();
  }
  return total;
}
const mrr = () => state.abonnes.filter(a => a.statut === 'actif' && !a.interne).reduce((s, a) => s + num(a.prix), 0);
/* Encaissements KamiFood réels : des factures Stripe ont été synchronisées */
const stripeReel = () => !!state.stripe?.factures?.length;

/* Une seule règle de gains, pour toute période [from, to] (KPI, cartes, graphiques, Kami).
   Gagné = encaissé sur la période jusqu'à aujourd'hui. Prévu = ce qui reste attendu sur la période. */
function gainsPeriode(secteur, from, to) {
  const t = today();
  if (secteur === 'kamifood') {
    const upTo = to < t ? to : t;
    const total = state.abonnes.reduce((s, a) => s + revenuAbonne(a, from, to), 0);
    /* Si Stripe est synchronisé, l'encaissé est le vrai : les factures payées sur la période ; sinon l'estimation au prorata.
       L'attendu est ce qui manque pour atteindre le total de la période : avec Stripe, une facture déjà payée (Stripe facture
       en début de mois) n'est donc pas attendue une seconde fois. */
    if (stripeReel()) {
      const gagne = state.stripe.factures.filter(f => f.date >= from && f.date <= upTo).reduce((s, f) => s + num(f.ht), 0);
      return { gagne, prevu: Math.max(0, total - gagne) };
    }
    const estime = state.abonnes.reduce((s, a) => s + revenuAbonne(a, from, upTo), 0);
    return { gagne: estime, prevu: Math.max(0, total - estime) };
  }
  const ds = state.dossiers.filter(d => d.activite === secteur);
  const gagne = ds.filter(d => d.datePaiement >= from && d.datePaiement <= to).reduce((s, d) => s + num(d.commRecue), 0);
  const prevu = ds.filter(d => d.statut === 'signe').reduce((s, d) => s + Math.max(0, num(d.commEstimee) - num(d.commRecue)), 0);
  return { gagne, prevu };
}
function gains(secteur, p) { return gainsPeriode(secteur, ...range(p)); }
/* Temps planifié : la durée des RDV et tâches. Une période (plusieurs jours) et une relance ne comptent pas d'heures. */
const compteHeures = e => !estPeriode(e) && !e.relance;
function temps(secteur, p) {
  const [from, to] = range(p);
  const evs = state.events.filter(e => e.activite === secteur && e.date >= from && e.date <= to && compteHeures(e));
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
/* Gain par heure : « — » tant que rien n'est encaissé ou planifié (jamais « 0 € / h ») */
const parHeure = (g, min) => min && g ? eur(g / (min / 60)) : '—';
/* Premier lancement : rien de saisi, à part la licence éditeur (et les autres licences internes) */
const estVide = () => !state.dossiers.length && !state.events.length && !state.aVoir.length && !state.abonnes.some(a => !a.interne);

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
  /* #noter (raccourci de l'appli installée, lien) : l'accueil, et l'écran Noter par-dessus ; le retour revient à l'accueil */
  if (location.hash === '#noter') {
    try { history.replaceState(null, '', '#dashboard'); } catch (e) { location.hash = '#dashboard'; return; }
    render(); openContact(); focusNote();
    return;
  }
  if (aRecharger && !occupe()) { aRecharger = false; state = load(); setTimeout(() => toast('Mis à jour depuis une autre fenêtre'), 0); }
  document.documentElement.dataset.theme = state.prefs.theme === 'dark' ? 'dark' : 'light';
  const h = location.hash.slice(1);
  const view = Object.prototype.hasOwnProperty.call(views, h) ? h : 'dashboard';
  majFab(view);
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  $('#brand-name').textContent = state.nom;
  document.title = state.nom;
  const nj = document.querySelector('#nav a[data-view="jarvis"]'); if (nj) nj.querySelector('span').textContent = jarvis.nom || 'Kami';
  /* Filet de sécurité : une vue qui plante affiche une carte au lieu d'un écran blanc */
  let html;
  try { html = views[view](); }
  catch (e) {
    console.error(e);
    html = `<div class="card alerte-donnees"><div><h2>Cette page n'a pas pu s'afficher</h2><p>Tes données ne sont pas touchées. Exporte une sauvegarde par précaution.</p></div>
      <div class="btn-row">${view !== 'dashboard' ? '<a class="btn" href="#dashboard">Retour à l\'accueil</a>' : ''}<button class="btn primary" onclick="exporter()">Exporter (.json)</button></div></div>`;
  }
  $('#main').innerHTML = (donneesIllisibles ? carteIllisible() : '') + html;
  dernierRendu = { jour: today(), t: Date.now() };
  majPastille();
}
window.addEventListener('hashchange', render);

/* ---------- Toujours à jour : l'appli reprise au matin (gardée en mémoire, onglet en arrière-plan) se redessine seule ----------
   Au retour au premier plan, au retour arrière du navigateur (pageshow persisted) et chaque minute : si le jour a changé ou si
   le dernier affichage a plus de 5 min, on redessine. Jamais pendant une saisie (fiche, Noter, menu, champ modifié non enregistré). */
let dernierRendu = { jour: '', t: 0 };
/* Un champ de la page a été modifié sans être enregistré (recherche, réglages, message à Kami…) */
function saisieEnCours() {
  return [...document.querySelectorAll('#main input, #main textarea, #main select')].some(el => {
    if (el.tagName === 'SELECT') { const d = [...el.options].findIndex(o => o.defaultSelected); return el.selectedIndex !== (d < 0 ? 0 : d); }
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked !== el.defaultChecked;
    return el.type !== 'file' && el.value !== el.defaultValue;
  });
}
const menuOuvert = () => !!($('#menu-plus') && !$('#menu-plus').hidden) || !!($('#menu-ajout') && !$('#menu-ajout').hidden);
function rafraichir() {
  if (document.visibilityState !== 'visible') return;
  majDatesRdv(); // une fiche RDV ouverte : ses puces « Aujourd'hui », « Demain » suivent le jour (la fiche n'est jamais redessinée)
  const jour = today(), nouveauJour = jour !== dernierRendu.jour;
  if (!nouveauJour && Date.now() - dernierRendu.t <= 5 * 60e3) return;
  /* La conversation avec Kami ne dépend pas de l'heure : seul un nouveau jour la redessine, jamais pendant une réponse */
  if (!nouveauJour && location.hash === '#jarvis') return;
  if (occupe() || couches.length || $('#confirm').open || menuOuvert() || saisieEnCours() || jarvisOccupe) return;
  if (nouveauJour) {
    /* Le planning affichait « aujourd'hui » : il suit le nouveau jour ; les listes de l'accueil se replient */
    if (typeof planDate === 'string' && planDate === dernierRendu.jour) planDate = jour;
    accueilDeplie.alertes = accueilDeplie.jour = false;
  }
  const defil = defilementsInternes();
  render();
  defil.remettre();
}
/* Défilements internes de la page (grille horaire du planning, tableaux qui glissent de côté) : un redessin automatique les garde
   là où Toufek les a laissés. Chaque zone est retrouvée par sa balise, ses classes et son rang ; une zone disparue est ignorée. */
function defilementsInternes() {
  const zones = () => { const rang = {}; return [...document.querySelectorAll('#main *')].map(el => { const k = el.tagName + '.' + (el.getAttribute('class') || ''); rang[k] = (rang[k] || 0) + 1; return { el, cle: k + '#' + rang[k] }; }); };
  const notes = new Map(zones().filter(z => z.el.scrollTop || z.el.scrollLeft).map(z => [z.cle, [z.el.scrollTop, z.el.scrollLeft]]));
  return { remettre: () => { if (notes.size) zones().forEach(z => { const n = notes.get(z.cle); if (n) { z.el.scrollTop = n[0]; z.el.scrollLeft = n[1]; } }); } };
}
document.addEventListener('visibilitychange', rafraichir);
window.addEventListener('pageshow', e => { if (e.persisted) rafraichir(); });
setInterval(rafraichir, 60e3);

/* Pastille de l'icône (appli installée) : contacts à rappeler, relances en retard et alertes de demain ou du jour */
function pastille() {
  const t = today();
  return rappelsContacts().length + relances().filter(r => r.date < t).length + alertes().filter(a => a.niveau === 'fort').length;
}
function majPastille() {
  try {
    const n = pastille();
    const r = n ? navigator.setAppBadge?.(n) : navigator.clearAppBadge?.();
    if (r && typeof r.catch === 'function') r.catch(() => { /* refusée (appli non installée) : sans conséquence */ });
  } catch (e) { /* API absente : rien à afficher */ }
}

/* Accueil à l'ordinateur : « + Ajouter ▾ » (RDV, dossier, abonné) */
function menuAjout(ouvrir) {
  const m = $('#menu-ajout'), b = $('#btn-ajout');
  if (!m) return false;
  const on = ouvrir ?? m.hidden;
  m.hidden = !on; b?.setAttribute('aria-expanded', String(on));
  if (on) m.querySelector('button')?.focus({ preventScroll: true });
  return true;
}
function fermerMenuAjout() { const m = $('#menu-ajout'); if (!m || m.hidden) return false; menuAjout(false); return true; }
function choixAjout(k) {
  fermerMenuAjout();
  if (k === 'rdv') openEvent(null, today());
  else if (k === 'dossier') openDossier();
  else if (k === 'abonne') openAbonne();
}
document.addEventListener('pointerdown', e => { if (!e.target.closest || !e.target.closest('#menu-ajout, #btn-ajout')) fermerMenuAjout(); }, true);

/* Carte rouge en tête quand les données stockées sont illisibles : rien n'est écrit tant qu'aucun choix n'est fait.
   Sans copie possible (stockage plein), le texte illisible n'existe plus que sous KEY : on propose d'abord de le télécharger. */
function carteIllisible() {
  const veille = lireCle(KEY + '.veille'), sansCopie = !copieIllisible && lireCle(KEY) !== null;
  return `<div class="card alerte-donnees" role="alert" tabindex="-1">
    <div><h2>Tes données n'ont pas pu être lues.${copieIllisible ? ' Une copie est gardée.' : ''}</h2>
    <p>${copieIllisible ? 'Rien n\'est enregistré tant que tu n\'as pas choisi.' : 'Copie impossible (stockage plein) : rien n\'est effacé tant que tu n\'as pas choisi. Télécharge-les d\'abord pour les garder.'}</p></div>
    <div class="btn-row">
      ${sansCopie ? '<button class="btn primary" onclick="telechargerIllisible()">Télécharger les données illisibles</button>' : ''}
      ${veille ? `<button class="btn ${sansCopie ? '' : 'primary'}" onclick="revenirVeille()">Revenir à la veille</button>` : ''}
      <label class="btn ${veille || sansCopie ? '' : 'primary'}">Importer une sauvegarde<input type="file" accept="application/json,.json" hidden onchange="importer(this.files[0]);this.value=''"></label>
      <button class="btn" onclick="repartirDeZero()">Repartir de zéro</button>
    </div>
  </div>`;
}
/* « Choisir » du toast « Pas enregistré » : amène la carte rouge (en tête de chaque page) sous les yeux */
function voirCarteIllisible() {
  const c = $('.alerte-donnees[role="alert"]');
  if (!c) return;
  c.scrollIntoView({ block: 'start', behavior: 'smooth' });
  c.focus({ preventScroll: true });
}
/* Le texte illisible tel quel, en .txt : rien ne se perd même si le navigateur n'a pas pu en garder une copie */
function telechargerIllisible() {
  const brut = lireCle(KEY);
  if (brut === null) { toast('Plus rien à télécharger : les données illisibles ont déjà été remplacées'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([brut], { type: 'text/plain' }));
  a.download = `kami-donnees-illisibles-${today()}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
/* Données illisibles sans copie : les remplacer les perd pour de bon, on demande d'abord */
const perteIllisible = () => donneesIllisibles && !copieIllisible && lireCle(KEY) !== null;
const MSG_PERTE = 'Tes données illisibles n\'ont pas pu être copiées : elles seront définitivement remplacées. Télécharge-les d\'abord si tu veux les garder.';
async function repartirDeZero() {
  if (!await confirmer(copieIllisible ? 'Repartir de zéro ? La copie des données illisibles reste gardée dans ce navigateur.' : 'Repartir de zéro ? Les données illisibles seront remplacées.', 'Repartir de zéro')) return;
  donneesIllisibles = false;
  save(); render();
  toast('Nouveau départ : tes données sont de nouveau enregistrées');
}
/* Revenir à la copie automatique de la veille (Réglages ou carte rouge) ; « Annuler » rétablit l'état d'avant */
async function revenirVeille() {
  let data = null;
  try { data = JSON.parse(lireCle(KEY + '.veille')); } catch (e) { /* abîmée */ }
  if (!data || typeof data !== 'object' || Array.isArray(data)) { toast('La copie de la veille est introuvable ou illisible'); return; }
  if (donneesIllisibles) {
    if (perteIllisible() && !await confirmer('Revenir à la veille ? ' + MSG_PERTE, 'Remplacer')) return;
    donneesIllisibles = false; remplacerEtat(data); toast('Version de la veille restaurée'); return;
  }
  if (!await confirmer('Revenir à la copie automatique ? Les changements faits depuis seront remplacés (tu pourras annuler).', 'Revenir')) return;
  const avant = JSON.stringify(state);
  remplacerEtat(data);
  toastAction('Version d\'hier restaurée', 'Annuler', () => { remplacerEtat(JSON.parse(avant)); toast('Retour annulé'); }, 15000);
}


/* ---------- Tableau de bord ---------- */


function itemList(items, showDate) {
  if (!items.length) return '';
  const t = today();
  return `<ul class="list">${items.map(e => {
    const late = !e.fait && !e.contact && (estPeriode(e) ? e.fin < t : e.date < t);
    const when = estPeriode(e) ? `${showDate ? fmtDate(e.date) + ' → ' : 'Jusqu\'au '}${fmtDate(e.fin)}` : showDate ? fmtDate(e.date) + (e.heure ? ' · ' + e.heure : '') : (e.heure || (e.contact ? (e.rdvPasse ? (e.rdvDate ? `RDV du ${fmtDate(e.rdvDate)}` : 'RDV retiré') : e.date < t ? `Rappel du ${fmtDate(e.date)}` : 'Rappel') : e.relance ? 'Relance' : 'Dans la journée'));
    const click = e.contact ? `openAVoir('${e.contact}')` : e.relance ? `openDossier('${e.lien.slice(2)}')` : `openEvent('${e.id}')`;
    const client = lienNom(e.lien);
    const meta = e.contact ? esc(e.sousTitre || '') : e.relance ? (late ? `Relance prévue le ${fmtDate(e.date)}` : 'Relance à faire') : estPeriode(e) ? [e.aPrevoir ? 'Date à prévoir dans la période' : 'Période', client, e.notes].filter(Boolean).map(esc).join(' · ') : [MODES[e.mode], e.duree ? hrs(num(e.duree)) : '', client, e.lieu && e.lieu !== client ? e.lieu : ''].filter(Boolean).map(esc).join(' · ');
    return `<li class="${e.fait ? 'done' : ''} ${e.retard || late ? 'retard' : ''} ${e.important ? 'alerte' : ''}">
      ${e.contact ? `<button class="btn small" onclick="openContact('${e.contact}')" title="Noter la prise de contact">Contacté</button>` : e.relance ? '<span class="relance-ico" title="Relance">↻</span>' : `<input type="checkbox" ${e.fait ? 'checked' : ''} onchange="toggleEvent('${e.id}')" aria-label="Fait">`}
      <div class="grow clickable" onclick="${click}">
        <div class="when ${late || (e.contact && e.retard) ? 'late' : ''}">${esc(when)}${late ? ' · en retard' : ''}</div>
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
  const clients = state.abonnes.some(a => !a.interne);
  const licence = state.abonnes.find(a => a.id === 'moi');
  const prochain = id => state.events.filter(e => e.lien === 'a:' + id && e.date >= t && !e.fait).sort((a, c) => (a.date + a.heure).localeCompare(c.date + c.heure))[0];
  const g = gains('kamifood', 'annee');
  /* Aucun client (la licence éditeur seule) : une explication d'abord, plutôt qu'une page de zéros */
  const vide = clients ? '' : `<div class="card vide-kf">
      <div><h2>Aucun abonné pour l'instant</h2><p class="empty">Ajoute ton premier restaurant avec « + Abonné » : ses RDV inclus seront planifiés automatiquement.</p></div>
      ${licence ? `<button type="button" class="vide-licence" onclick="openAbonne('moi')"><span class="status paye">Éditeur</span><span>Ta licence éditeur : active, hors des gains</span></button>` : ''}
    </div>`;

  return `
  <div class="page-head">
    <div><h1>KamiFood</h1><p>Abonnements restaurants et RDV inclus dans la souscription</p></div>
    <div class="btn-row"><button class="btn" onclick="synchroniserStripe()" id="btn-stripe">${state.stripe?.sync ? 'Synchroniser Stripe' : 'Connecter Stripe'}</button><button class="btn primary" onclick="openAbonne()">+ Abonné</button></div>
  </div>
  ${vide}
  ${stripeCarte()}
  <div class="grid kpis">
    <div class="card kpi"><div class="label">Abonnés actifs</div><div class="value">${actifs.length}</div><div class="sub">${state.abonnes.filter(a => a.statut === 'essai').length} en période d'essai</div></div>
    <div class="card kpi"><div class="label">Récurrent mensuel</div><div class="value">${eur(mrr())}</div><div class="sub">HT par mois</div></div>
    <div class="card kpi"><div class="label">Encaissé cette année</div><div class="value">${eur(g.gagne)}</div><div class="sub">+ ${eur(g.prevu)} d'ici décembre</div></div>
    <div class="card kpi"><div class="label">RDV clients à venir</div><div class="value">${state.events.filter(e => e.activite === 'kamifood' && e.date >= t && !e.fait).length}</div><div class="sub">installations, formations, suivis</div></div>
  </div>
  ${clients ? `<div class="card table-wrap">
    <table class="tab-tel">
      <thead><tr><th>Restaurant</th><th>Formule</th><th class="num">Prix / mois</th><th>Statut</th><th class="num hide-sm">Fin d'engagement</th><th class="hide-sm">Prochain RDV</th></tr></thead>
      <tbody>${ab.map(a => {
        const n = prochain(a.id);
        const finEng = a.debut ? iso(addMonths(parse(a.debut), num(a.engagement) || 12)) : '';
        return `<tr class="clickable" onclick="openAbonne('${a.id}')">
        <td class="c-nom"><strong>${esc(a.restaurant)}</strong>${a.interne ? ' <span class="status paye">Éditeur</span>' : ''}${a.impaye ? ' <span class="status perdu">Impayé</span>' : ''}<div class="meta">${esc([a.contact, a.ville, a.stripeId ? 'Stripe' : '', a.statut === 'resilie' && a.finEstimee ? 'fin estimée, à corriger' : ''].filter(Boolean).join(' · '))}</div></td>
        <td class="c-sous">${esc(a.formuleNom || formule(a.formule)?.nom || '—')}</td>
        <td class="num c-montant" ${a.interne ? '' : 'data-s="/ mois"'}>${a.interne ? '<span class="meta">licence</span>' : eur(a.prix)}</td>
        <td class="c-sous c-droite">${abBadge(a.statut)}</td>
        <td class="num hide-sm">${fmtDate(finEng)}</td>
        <td class="hide-sm">${n ? `${fmtDate(n.date)} · ${esc(n.titre)}` : '<span class="meta">—</span>'}</td>
      </tr>`; }).join('')}</tbody>
    </table></div>` : ''}`;
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
    if (sa.fin) delete a.finEstimee;
    else if (a.statut === 'resilie' && !a.fin) { a.fin = today(); a.finEstimee = true; } // résilié sans date : arrêté aujourd'hui, à corriger
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
    <table class="tab-tel">
      <thead><tr><th>Entreprise</th><th>Secteur</th><th>Statut</th><th class="hide-sm">Partenaire</th><th class="num">Commission</th><th class="num">Relance</th></tr></thead>
      <tbody>${rows.map(d => `<tr class="clickable" onclick="openDossier('${d.id}')">
        <td class="c-nom"><strong>${esc(d.entreprise)}</strong><div class="meta">${esc([d.contact, d.tel].filter(Boolean).join(' · '))}</div></td>
        <td class="c-sous">${tag(d.activite)}</td>
        <td class="c-sous">${statusBadge(d.statut)}</td>
        <td class="hide-sm">${esc(d.partenaire || '')}</td>
        <td class="num c-montant">${eur(d.commEstimee)}</td>
        <td class="num c-sous c-droite ${late(d) ? 'late' : ''}" ${d.dateRelance ? 'data-l="Relance"' : ''}>${fmtDate(d.dateRelance)}</td>
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
  <div class="card table-wrap"><table class="tab-tel">
    <thead><tr><th>Entreprise</th><th>Secteur</th><th class="num hide-sm">Signé le</th><th class="num">Prévue</th><th class="num">Reçue</th><th></th></tr></thead>
    <tbody>${rows.map(d => `<tr>
      <td class="clickable c-nom" onclick="openDossier('${d.id}')"><strong>${esc(d.entreprise)}</strong></td>
      <td class="c-sous">${tag(d.activite)}</td>
      <td class="num hide-sm">${fmtDate(d.dateSignature)}</td>
      <td class="num c-sous c-droite" data-l="Prévue">${eur(d.commEstimee)}</td>
      <td class="num c-sous" data-l="Reçue">${eur(d.commRecue)}</td>
      <td class="num c-montant">${d.statut === 'paye' ? statusBadge('paye') : `<button class="btn small" onclick="marquerPaye('${d.id}')">Marquer payé</button>`}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="2" class="c-nom">Total</td><td class="hide-sm"></td><td class="num c-sous c-droite" data-l="Prévue">${eur(tot.e)}</td><td class="num c-sous" data-l="Reçue">${eur(tot.r)}</td><td></td></tr></tfoot>
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
      <h2>${esc(jarvis.nom || 'Kami')}</h2>
      <p>Le cerveau tourne sur Vercel (<code>/api/jarvis</code>). Le jeton doit être le même que <code>JARVIS_TOKEN</code> dans les variables d'environnement Vercel. Il est enregistré uniquement dans ce navigateur.</p>
      <div class="rows">
        <div class="row"><label for="j-nom" class="meta" style="min-width:90px">Son nom</label><input id="j-nom" type="text" value="${esc(jarvis.nom)}" placeholder="Kami" class="short"><span class="meta">= le mot d'activation en mains libres</span></div>
        <div class="row"><label for="j-token" class="meta" style="min-width:90px">Jeton</label><input id="j-token" type="password" value="${esc(jarvis.token)}" autocomplete="off" placeholder="colle le jeton ici"></div>
        <div class="row"><label for="j-endpoint" class="meta" style="min-width:90px">Adresse</label><input id="j-endpoint" type="text" value="${esc(jarvis.endpoint)}"></div>
        <div class="row"><label for="j-voice" class="meta" style="min-width:90px">Voix</label><select id="j-voice">${voixOptions()}</select></div>
      </div>
      <div class="btn-row">
        <button class="btn primary" onclick="jarvis.nom=$('#j-nom').value.trim()||'Kami';jarvis.token=$('#j-token').value.trim();jarvis.endpoint=$('#j-endpoint').value.trim()||'/api/jarvis';jarvis.voixNom=$('#j-voice').value;saveJarvis();toast('Réglages de '+jarvis.nom+' enregistrés')">Enregistrer</button>
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
        <label class="btn">Importer…<input type="file" accept="application/json,.json" hidden onchange="importer(this.files[0]);this.value=''"></label>
      </div>
      ${etatStockage()}
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
/* Import : l'état d'avant est gardé (KEY.avant-import et en mémoire) et « Annuler l'import » le rétablit */
function importer(file) {
  if (!file) return;
  file.text().then(txt => {
    const data = JSON.parse(txt);
    if (!data || typeof data !== 'object' || !Array.isArray(data.dossiers) || !Array.isArray(data.events)) throw new Error();
    return confirmer(perteIllisible() ? 'Remplacer par les données du fichier ? ' + MSG_PERTE : 'Remplacer les données actuelles par celles du fichier ?', 'Remplacer').then(ok => {
      if (!ok) return;
      const illisible = donneesIllisibles, avant = JSON.stringify(state);
      if (!illisible) { try { localStorage.setItem(KEY + '.avant-import', avant); } catch (e) { /* stockage plein : la copie en mémoire suffit pour annuler */ } }
      donneesIllisibles = false;
      remplacerEtat(data);
      /* Depuis des données illisibles, il n'y a rien à rétablir : leur copie brute reste gardée */
      if (illisible) toast('Sauvegarde importée');
      else toastAction('Sauvegarde importée', 'Annuler l\'import', () => { remplacerEtat(JSON.parse(avant)); toast('Import annulé'); }, 15000);
    });
  }).catch(() => toast("Ce fichier n'est pas une sauvegarde valide"));
}
async function toutEffacer() {
  if (!await confirmer('Effacer tous les abonnés, dossiers et RDV ? Pense à exporter avant.', 'Tout effacer')) return;
  const avant = JSON.stringify(state), historique = jarvis.historique;
  remplacerEtat({ ...blank(), nom: state.nom, formules: state.formules, rdvModele: state.rdvModele, prefs: { ...state.prefs } });
  jarvis.historique = []; saveJarvis();
  toastAction('Données effacées', 'Annuler', () => { remplacerEtat(JSON.parse(avant)); jarvis.historique = historique; saveJarvis(); toast('Données rétablies'); }, 15000);
}
/* Réglages > Sauvegarde : protection du stockage, place utilisée, copie automatique de la veille */
const ko = octets => `${Math.max(1, Math.round(octets / 1024)).toLocaleString('fr-FR')} Ko`;
function etatStockage() {
  const brutVeille = lireCle(KEY + '.veille');
  let jourVeille = '';
  if (brutVeille) { try { jourVeille = JSON.parse(brutVeille)?.prefs?.jourCopie || ''; } catch (e) { /* copie abîmée */ } }
  const p = state.prefs.persist;
  setTimeout(majStockage, 0);
  return `<dl class="etat-stockage">
      <dt>Données protégées sur cet appareil</dt><dd id="persist-etat">${p === true ? 'oui' : p === false ? 'non' : '…'}</dd>
      <dt>Place utilisée</dt><dd id="place-etat">${esc(ko(new Blob([lireCle(KEY) || '']).size))} de données</dd>
      <dt>Copie automatique</dt><dd>${brutVeille ? esc(jourVeille ? 'état du ' + jourLong(jourVeille) : 'disponible') : 'demain, au premier changement'}</dd>
    </dl>
    ${brutVeille ? `<div class="btn-row"><button class="btn" onclick="revenirVeille()">${jourVeille && jourVeille >= today() ? 'Revenir à la version d\'avant' : 'Revenir à la version d\'hier'}</button></div>` : ''}`;
}
function majStockage() {
  const st = navigator.storage, persist = $('#persist-etat');
  if (!persist) return;
  /* Sans l'API (anciens navigateurs), rien ne garantit que les données restent : on l'affiche tel quel */
  if (!st || !st.persisted) { persist.textContent = state.prefs.persist === true ? 'oui' : 'non'; return; }
  const donnees = new Blob([lireCle(KEY) || '']).size;
  try {
    st.persisted?.().then(ok => {
      if (!$('#persist-etat')) return;
      $('#persist-etat').innerHTML = ok ? 'oui' : `non <button class="btn small" onclick="protegerDonnees()">Protéger</button>`;
      state.prefs.persist = ok; // affichage seulement : enregistré avec le prochain changement
    }).catch(() => {});
    st.estimate?.().then(e => { if ($('#place-etat') && e && e.usage != null) $('#place-etat').textContent = `${ko(donnees)} de données · ${ko(e.usage)} pour l'appli`; }).catch(() => {});
  } catch (e) { /* API absente : on garde le texte affiché */ }
}
/* Demande au navigateur de ne jamais effacer les données de lui-même (stockage persistant) */
function protegerDonnees() {
  try {
    const r = navigator.storage?.persist?.();
    if (!r || !r.then) { toast('Ce navigateur ne propose pas la protection : exporte régulièrement'); return; }
    r.then(ok => { state.prefs.persist = !!ok; save(); render(); toast(ok ? 'Données protégées sur cet appareil' : 'Refusé par le navigateur : installe l\'appli et exporte régulièrement'); }).catch(() => {});
  } catch (e) { /* API absente */ }
}

/* ---------- Feuilles (#modal) : RDV, dossier, abonné, contact ----------
   Au téléphone, une feuille plein écran ; à l'ordinateur, une fenêtre. Jamais d'ascenseur : l'essentiel dans le premier volet,
   le reste dans « Plus d'options ». Les volets sont dans le même <form> : FormData lit tous les champs. */
const modal = () => $('#modal');
const coarse = () => !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
/* cls : true ou 'full' (toute la largeur), '' (une colonne sur deux), ou d'autres classes */
const field = (name, label, input, cls = '') => `<div class="field ${cls === true ? 'full' : cls}"><label for="f-${name}">${label}</label>${input}</div>`;
const inp = (name, val, type = 'text', extra = '') => `<input id="f-${name}" name="${name}" type="${type}" value="${esc(val ?? '')}" ${extra}>`;
const sel = (name, opts, val) => `<select id="f-${name}" name="${name}">${Object.entries(opts).map(([k, o]) => `<option value="${esc(k)}" ${k === val ? 'selected' : ''}>${esc(typeof o === 'string' ? o : o.long)}</option>`).join('')}</select>`;
/* Une zone de texte fait au plus 3 lignes (au-delà, elle défile en elle-même, jamais la feuille) */
const zoneTexte = (name, val) => `<textarea id="f-${name}" name="${name}" rows="3">${esc(val || '')}</textarea>`;
/* Puces à choix unique : un input caché (name) porte la valeur ; seg = segment plein largeur, couleur = pastille du secteur.
   Un libellé [nom, suffixe] (formule et son prix) : un nom trop long se termine par « … », le suffixe reste toujours lisible */
const libellePuce = l => Array.isArray(l) ? `<span class="chip-nom">${esc(l[0])}</span><span class="chip-suf"> · ${esc(l[1])}</span>` : `<span class="chip-nom">${esc(l)}</span>`;
function puces(name, opts, val, { label = '', cls = 'full', seg = false, couleur = false, apres = '' } = {}) {
  const v = val == null ? '' : String(val);
  const items = Object.entries(opts).map(([k, l]) => `<button type="button" class="${seg ? '' : 'chip'} ${k === v ? 'on' : ''}" role="radio" aria-checked="${k === v}" data-v="${esc(k)}"${Array.isArray(l) ? ` title="${esc(l.join(' · '))}"` : ''} onclick="puce(this)">${couleur ? `<i style="background:var(--${secteurConnu(k) ? k : 'perso'})"></i>` : ''}${seg ? esc(l) : libellePuce(l)}</button>`).join('');
  return `<div class="field ${cls}"><span class="lab" id="lab-${name}">${label}</span><div class="${seg ? 'seg plein' : 'puces'}" role="radiogroup" aria-labelledby="lab-${name}" data-puces><input type="hidden" id="f-${name}" name="${name}" value="${esc(v)}"${apres ? ` onchange="${apres}"` : ''}>${items}</div></div>`;
}
function puce(b) {
  const g = b && b.closest('[data-puces]');
  if (!g) return;
  g.querySelectorAll('[data-v]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
  b.closest('.field')?.classList.remove('manque');
  const h = g.querySelector('input[type="hidden"]');
  if (h) { h.value = b.dataset.v; h.dispatchEvent(new Event('change')); }
}
/* Choix fait par le code (client lié → secteur) */
function choisirPuce(name, v) {
  const g = $('#f-' + name)?.closest('[data-puces]');
  const b = g && [...g.querySelectorAll('[data-v]')].find(x => x.dataset.v === v);
  if (b) puce(b);
}
/* Volets : un segment d'onglets en tête, une <section class="pane"> par volet, un seul visible à la fois */
function volets(liste) {
  return `<div class="seg plein volets" role="tablist">${liste.map((v, i) => `<button type="button" role="tab" id="volet-${i}" aria-controls="pane-${i}" aria-selected="${!i}" class="${i ? '' : 'on'}" onclick="voletAller(${i})">${esc(v.titre)}</button>`).join('')}</div>
    <div class="panes">${liste.map((v, i) => `<section class="pane" id="pane-${i}" role="tabpanel" aria-labelledby="volet-${i}"${i ? ' hidden' : ''}>${v.html}</section>`).join('')}</div>`;
}
function voletAller(i) {
  document.querySelectorAll('#modal .volets [role="tab"]').forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-selected', String(k === i)); });
  document.querySelectorAll('#modal .pane').forEach((p, k) => { p.hidden = k !== i; });
  fermerMenuFeuille();
  verifierSansAscenseur();
}
/* Un champ à montrer (invalide, manquant) : son volet passe devant */
function montrerChamp(el) {
  const p = el && el.closest('.pane');
  if (p && p.hidden) voletAller([...document.querySelectorAll('#modal .pane')].indexOf(p));
  if (el && el.id === 'f-date') $('#f-dates')?.classList.add('autre'); // date vidée : le champ revient à la place des puces
}
/* En-tête (titre, menu ⋯, ✕), corps sans ascenseur, actions collées en bas */
function feuille({ titre, sous = '', menu = '', corps, pied }) {
  return `<header class="sheet-head">
      <div class="sheet-titre"><h2 id="modal-titre">${titre}</h2>${sous ? `<div class="meta">${sous}</div>` : ''}</div>
      ${menu ? `<button type="button" class="btn icon sheet-plus" aria-label="Plus d'actions" aria-haspopup="menu" aria-expanded="false" onclick="menuFeuille()">⋯</button><div class="sheet-menu" role="menu" hidden>${menu}</div>` : ''}
      <button type="button" class="btn icon sheet-fermer" aria-label="Fermer" onclick="modal().close()">✕</button>
    </header>
    <div class="sheet-body">${corps}</div>
    ${pied || piedFeuille()}`;
}
const piedFeuille = (annuler = 'Annuler') => `<div class="modal-actions"><button type="button" class="btn" onclick="modal().close()">${annuler}</button><button class="btn primary" value="ok">Enregistrer</button></div>`;
const itemMenu = (label, action, danger) => `<button type="button" role="menuitem" class="${danger ? 'danger' : ''}" onclick="fermerMenuFeuille();${action}">${label}</button>`;
function menuFeuille(ouvrir) {
  const m = $('#modal .sheet-menu'), b = $('#modal .sheet-plus');
  if (!m) return;
  const on = ouvrir ?? m.hidden;
  m.hidden = !on; b?.setAttribute('aria-expanded', String(on));
  if (on) m.querySelector('button')?.focus({ preventScroll: true });
}
function fermerMenuFeuille() { const m = $('#modal .sheet-menu'); if (!m || m.hidden) return false; menuFeuille(false); return true; }

function showModal(html, onSubmit) {
  if (modal().open) modal().close();
  modalQuitte(); // la fiche précédente (fermée par le code) rend son entrée d'historique
  const form = $('#modal-form');
  form.innerHTML = html;
  form.noValidate = true; // validation faite ici : un champ requis dans un volet caché passe d'abord devant
  form.onsubmit = e => {
    e.preventDefault();
    const bad = form.querySelector('input:invalid, select:invalid, textarea:invalid');
    if (bad) { montrerChamp(bad); bad.reportValidity(); return; }
    onSubmit(Object.fromEntries(new FormData(form)));
    fermeeSousLeDoigt(); // fiche enregistrée et fermée d'un toucher : un second toucher au même endroit ne tombe pas sur la page
  };
  modal().showModal();
  /* Au téléphone, pas de clavier (ni de zoom) à l'ouverture : on lit d'abord, on touche le champ voulu ensuite.
     À l'ordinateur, le premier champ d'une nouvelle fiche a le focus (autofocus) ; sinon la fiche elle-même (pas le menu ⋯) */
  if (coarse()) document.activeElement?.blur?.();
  else if (!form.querySelector('[autofocus]')) modal().focus({ preventScroll: true });
  coucheOuvrir('modal', () => modal().close());
  placerToast();
  verifierSansAscenseur();
}
/* La fiche se ferme (✕, Annuler, Échap, enregistrement) : son entrée d'historique est retirée */
function modalQuitte() { if (couches.some(c => c.nom === 'modal')) coucheQuittee('modal'); }
function fermerModal() { if (modal().open) modal().close(); modalQuitte(); }
/* Un toast pendant qu'une fiche est ouverte est affiché dans la fiche (sinon il resterait sous la fenêtre, invisible) */
function placerToast() {
  const t = $('#toast'), dest = modal().open ? modal() : document.body;
  if (t && t.parentElement !== dest) dest.appendChild(t);
}
/* Outil de contrôle (localStorage['kgd-debug'] = '1') : rien ne doit défiler dans une feuille ni dans la Rencontre.
   En cas d'échec : console.warn et contour rouge. */
function verifierSansAscenseur() {
  if (lireCle('kgd-debug') !== '1') return true;
  const cibles = [];
  if (modal().open) cibles.push(['#modal', modal()], ['.sheet-body', $('#modal .sheet-body')]);
  if (!$('#rencontre').hidden) cibles.push(['#rencontre .r-body', $('#rencontre .r-body')]);
  let ok = true;
  for (const [nom, el] of cibles) {
    if (!el) continue;
    const trop = el.scrollHeight > el.clientHeight + 1;
    el.style.outline = trop ? '3px solid red' : '';
    el.style.outlineOffset = trop ? '-3px' : '';
    if (trop) { ok = false; console.warn(`verifierSansAscenseur : ${nom} défile (${el.scrollHeight} > ${el.clientHeight})`); }
  }
  return ok;
}

/* Libellés courts pour les puces */
const SECTEURS_PUCES = () => Object.fromEntries(Object.entries(SECTEURS).map(([k, s]) => [k, s.label]));
const MODES_COURTS = { place: 'Sur place', visio: 'Visio', tel: 'Tél.', tache: 'Tâche' };
const DUREES = { 30: '30 min', 60: '1 h', 90: '1 h 30', 120: '2 h' };

/* ---------- Abonné KamiFood ---------- */
function openAbonne(id) {
  const ex = id ? abonne(id) : null;
  if (id && !ex) return;
  const a = ex || { statut: 'actif', debut: today(), formule: state.formules[0]?.id, prix: state.formules[0]?.prix || '', engagement: 12 };
  /* La licence éditeur (id 'moi') reste toujours interne, active et gratuite, comme Kami l'impose : ni case à décocher,
     ni statut, ni prix, ni date de résiliation, ni suppression (elle reviendrait) */
  const estMoi = id === 'moi';
  const estimee = a.statut === 'resilie' && !!a.finEstimee;
  const fOpts = Object.fromEntries(state.formules.map(f => [f.id, num(f.prix) ? [String(f.nom || 'Formule'), eur(f.prix)] : String(f.nom || 'Formule')]));
  /* Un résilié : sa date de résiliation est essentielle (à côté du début) ; sinon elle attend dans « Plus d'options » */
  const fin = field('fin', estimee ? 'Date de résiliation <b class="estimee">estimée, à corriger</b>' : 'Date de résiliation', inp('fin', a.fin, 'date', estimee ? 'oninput="this.dataset.touche=1"' : ''));
  const essentiel = `<div class="fields">
      ${field('restaurant', 'Restaurant *', inp('restaurant', a.restaurant, 'text', `required autocomplete="off"${id ? '' : ' autofocus'}`), 'full')}
      ${field('contact', 'Contact', inp('contact', a.contact, 'text', 'autocomplete="off"'))}
      ${field('tel', 'Téléphone', inp('tel', a.tel, 'tel'))}
      ${puces('formule', fOpts, a.formule, { label: 'Formule', apres: 'prixFormule(this.value)' })}
      ${estMoi ? '<p class="meta full licence-regle">Ta licence éditeur : toujours active, jamais facturée, hors des gains.</p>'
        : `${field('prix', 'Prix HT / mois (€)', inp('prix', a.prix, 'number', 'min="0" step="1" inputmode="decimal"'))}
      ${puces('statut', { essai: 'Essai', actif: 'Actif', resilie: 'Résilié' }, a.statut, { label: 'Statut', seg: true, cls: '' })}`}
      ${field('debut', estMoi ? 'Active depuis' : 'Début de facturation', inp('debut', a.debut, 'date', 'required'), a.statut === 'resilie' && !estMoi ? '' : 'full')}
      ${a.statut === 'resilie' && !estMoi ? fin : ''}
      ${!id && state.rdvModele.length ? `<label class="check full" title="${esc(state.rdvModele.map(r => r.titre).join(', '))}"><input type="checkbox" name="planifier" checked><span>Planifier les ${state.rdvModele.length} RDV inclus<small>installation, formation, suivis : à partir du début</small></span></label>` : ''}
    </div>`;
  const plus = `<div class="fields">
      ${field('email', 'E-mail', inp('email', a.email, 'email'))}
      ${field('ville', 'Ville', inp('ville', a.ville))}
      ${field('engagement', 'Engagement (mois)', inp('engagement', a.engagement, 'number', 'min="0" step="1" inputmode="numeric"'), a.statut === 'resilie' || estMoi ? 'full' : '')}
      ${a.statut === 'resilie' || estMoi ? '' : fin}
      ${field('notes', 'Notes', zoneTexte('notes', a.notes), 'full')}
      ${estMoi ? '' : `<label class="check full"><input type="checkbox" name="interne" ${a.interne ? 'checked' : ''}><span>Licence éditeur (moi)<small>activée en permanence, jamais facturée, hors des gains</small></span></label>`}
      ${a.stripeId ? `<p class="meta full">Synchronisé avec Stripe (${esc(a.stripeStatut || '')}, ${esc(a.formuleNom || '')}) : prix et statut repris à chaque synchronisation.</p>` : ''}
    </div>`;
  const menu = id ? itemMenu('Planifier un RDV', `openEvent(null,null,'a:${id}')`) + (estMoi ? '' : itemMenu('Supprimer', `supprimerAbonne('${id}')`, true)) : '';
  showModal(feuille({ titre: id ? esc(a.restaurant || 'Abonné') : 'Nouvel abonné KamiFood', sous: id ? esc([a.contact, a.ville].filter(Boolean).join(' · ') || 'KamiFood') : '', menu, corps: volets([{ titre: 'Essentiel', html: essentiel }, { titre: 'Plus d\'options', html: plus }]) }),
  f => {
    const planifier = f.planifier; delete f.planifier;
    f.interne = estMoi || !!f.interne;
    if (estMoi) Object.assign(f, { statut: 'actif', prix: 0, fin: '' }); // la licence : active et gratuite, même règle que Kami
    /* Résilié sans date : arrêté aujourd'hui (sinon il rapporterait encore) */
    if (f.statut === 'resilie' && !f.fin) f.fin = today();
    /* Une date estimée touchée ou changée devient la vraie date */
    const corrigee = !!a.finEstimee && (f.statut !== 'resilie' || f.fin !== a.fin || !!$('#f-fin')?.dataset.touche);
    const target = id ? a : { id: uid(), createdAt: Date.now() };
    Object.assign(target, f);
    if (corrigee) delete target.finEstimee;
    if (!id) {
      state.abonnes.push(target);
      if (planifier) planifierInclus(target);
    }
    save(); modal().close(); render();
    toast(estMoi ? 'Licence mise à jour' : id ? 'Abonné mis à jour' : planifier ? `Abonné créé, ${state.rdvModele.length} RDV planifiés` : 'Abonné créé');
  });
}
/* Une formule touchée reprend son prix (s'il en a un) */
function prixFormule(fid) { const f = state.formules.find(x => x.id === fid); const p = $('#f-prix'); if (f && num(f.prix) && p) p.value = f.prix; }
function planifierInclus(a) {
  const start = parse(a.debut || today());
  state.rdvModele.forEach(r => {
    const d = jourOuvre(addDays(start, num(r.jours)));
    state.events.push({ id: uid(), date: iso(d), heure: '10:00', duree: num(r.duree) || 60, mode: r.mode, titre: r.titre, activite: 'kamifood', lien: 'a:' + a.id, fait: false, notes: '' });
  });
}
/* Abonné supprimé : ses RDV à venir non faits partent avec lui ; ses RDV passés ou faits restent (sans lien) */
function supprimerAbonne(id) {
  if (id === 'moi' || !abonne(id)) return;
  suppression(() => {
    const t = today(), aVenir = e => e.lien === 'a:' + id && !e.fait && e.date >= t;
    const n = state.events.filter(aVenir).length;
    state.abonnes = state.abonnes.filter(a => a.id !== id);
    state.events = state.events.filter(e => !aVenir(e));
    state.events.forEach(e => { if (e.lien === 'a:' + id) e.lien = ''; });
    state.aVoir.forEach(v => { if (v.lien === 'a:' + id) v.lien = ''; });
    return n ? `Supprimé avec ${n} RDV à venir` : 'Supprimé';
  });
}

/* ---------- Dossier d'apport ---------- */
function openDossier(id, prefill) {
  const ex = id ? dossier(id) : null;
  if (id && !ex) return;
  const d = ex || { activite: APPORT.includes(filtre.activite) ? filtre.activite : 'cee', statut: 'prospect', ...(prefill || {}) };
  const nombre = 'min="0" step="1" inputmode="decimal"';
  const essentiel = `<div class="fields">
      ${field('entreprise', 'Entreprise *', inp('entreprise', d.entreprise, 'text', `required autocomplete="off"${id ? '' : ' autofocus'}`), 'full')}
      ${puces('activite', Object.fromEntries(APPORT.map(k => [k, SECTEURS[k].label])), d.activite, { label: 'Secteur', couleur: true })}
      ${puces('statut', STATUTS, d.statut, { label: 'Statut' })}
      ${field('contact', 'Contact', inp('contact', d.contact, 'text', 'autocomplete="off"'), 'half')}
      ${field('tel', 'Téléphone', inp('tel', d.tel, 'tel'), 'half')}
      ${field('commEstimee', 'Commission prévue (€)', inp('commEstimee', d.commEstimee, 'number', nombre), 'half')}
      ${field('dateRelance', 'Prochaine relance', inp('dateRelance', d.dateRelance, 'date'), 'half')}
    </div>`;
  const plus = `<div class="fields">
      ${field('email', 'E-mail', inp('email', d.email, 'email'))}
      ${field('ville', 'Ville', inp('ville', d.ville))}
      ${field('partenaire', 'Partenaire (fournisseur, délégataire, cabinet)', inp('partenaire', d.partenaire), 'full')}
      ${field('commRecue', 'Commission reçue (€)', inp('commRecue', d.commRecue, 'number', nombre), 'full')}
      ${field('dateSignature', 'Signé le', inp('dateSignature', d.dateSignature, 'date'))}
      ${field('datePaiement', 'Payé le', inp('datePaiement', d.datePaiement, 'date'))}
      ${field('notes', 'Notes', zoneTexte('notes', d.notes), 'full')}
    </div>`;
  const menu = id ? itemMenu('Planifier un RDV / visio', `openEvent(null,null,'d:${id}')`) + itemMenu('Supprimer', `supprimerDossier('${id}')`, true) : '';
  showModal(feuille({ titre: id ? esc(d.entreprise || 'Dossier') : "Nouveau dossier d'apport", sous: id ? esc([SECTEURS[d.activite]?.label, d.contact].filter(Boolean).join(' · ')) : '', menu, corps: volets([{ titre: 'Essentiel', html: essentiel }, { titre: 'Plus d\'options', html: plus }]) }),
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
function supprimerDossier(id) {
  if (!dossier(id)) return;
  suppression(() => {
    state.dossiers = state.dossiers.filter(d => d.id !== id);
    state.events.forEach(e => { if (e.lien === 'd:' + id) e.lien = ''; });
    state.aVoir.forEach(v => { if (v.lien === 'd:' + id) v.lien = ''; });
    return 'Supprimé';
  });
}

/* ---------- RDV et tâches ---------- */
const secteurDe = l => l ? (l[0] === 'a' ? 'kamifood' : l[0] === 'c' ? aVoir(l.slice(2))?.activite : dossier(l.slice(2))?.activite) : null;
/* Ville du client lié (abonné, dossier ou contact) : le lieu proposé pour un RDV */
const villeDe = l => {
  if (!l || l[1] !== ':') return '';
  const id = l.slice(2), x = l[0] === 'a' ? abonne(id) : l[0] === 'd' ? dossier(id) : l[0] === 'c' ? aVoir(id) : null;
  return x && typeof x.ville === 'string' ? x.ville : '';
};
/* Puces de date : Aujourd'hui · Demain · J+2 · le lundi d'après · Autre… (Autre montre le champ date à la place des puces).
   « Aujourd'hui » et « Demain » portent un décalage (data-j) : ils valent le jour du toucher, même si la fiche est restée ouverte passé minuit. */
function raccourcisDates() {
  const t = new Date(), j2 = addDays(t, 2);
  let lun = addDays(j2, 1);
  while (lun.getDay() !== 1) lun = addDays(lun, 1);
  const court = d => cap(d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }));
  return [[today(), 'Aujourd\'hui', 0], [iso(addDays(t, 1)), 'Demain', 1], [iso(j2), court(j2)], [iso(lun), court(lun)]];
}
const pucesDates = val => raccourcisDates().map(([d, l, j]) => `<button type="button" class="chip ${d === val ? 'on' : ''}" data-v="${d}"${j == null ? '' : ` data-j="${j}"`} aria-pressed="${d === val}" onclick="toucherDate(this)">${esc(l)}</button>`).join('')
  + '<button type="button" class="chip" id="f-date-autre" onclick="dateAutre(true)">Autre…</button>';
function datesRdv(val) {
  const connue = raccourcisDates().some(([d]) => d === val);
  return `<div class="field full"><span class="lab" id="lab-date">Date</span>
    <div class="dates ${connue ? '' : 'autre'}" id="f-dates" role="group" aria-labelledby="lab-date" data-jour="${today()}">
      <div class="puces">${pucesDates(val)}</div>
      <div class="date-autre"><input id="f-date" name="date" type="date" value="${esc(val)}" required onchange="choisirDate(this.value, true)"><button type="button" class="chip" onclick="dateAutre(false)">Raccourcis</button></div>
    </div></div>`;
}
/* Le jour a changé depuis l'affichage des puces (minuit passé, appli reprise le lendemain) : libellés et dates refaits, la date choisie reste */
function majDatesRdv() {
  const box = $('#f-dates'), i = $('#f-date');
  if (!box || !i || box.dataset.jour === today()) return;
  box.dataset.jour = today();
  box.querySelector('.puces').innerHTML = pucesDates(i.value);
  choisirDate(i.value, true);
}
/* Une puce de date touchée : « Aujourd'hui », « Demain » au jour du toucher ; les autres, la date affichée */
function toucherDate(b) {
  const d = b.dataset.j != null ? iso(addDays(new Date(), Number(b.dataset.j))) : b.dataset.v;
  majDatesRdv();
  choisirDate(d);
}
/* Une puce touchée (ou le champ changé) : la date et les puces suivent */
function choisirDate(d, depuisChamp) {
  const i = $('#f-date'), box = $('#f-dates');
  if (!i || !box) return;
  if (!depuisChamp) { i.value = d; box.classList.remove('autre'); }
  let trouvee = false;
  box.querySelectorAll('.puces [data-v]').forEach(b => { const on = b.dataset.v === i.value; trouvee = trouvee || on; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  /* Une date hors des raccourcis s'affiche sur la puce « Autre » */
  const autre = $('#f-date-autre');
  if (autre) { autre.textContent = trouvee || !i.value ? 'Autre…' : fmtDate(i.value); autre.classList.toggle('on', !trouvee && !!i.value); }
}
function dateAutre(on) {
  const box = $('#f-dates'), i = $('#f-date');
  if (!box || !i) return;
  box.classList.toggle('autre', on);
  if (on) {
    if (!coarse()) i.focus();
    else { try { i.showPicker?.(); } catch (e) { /* sélecteur indisponible : le champ reste là */ } }
  } else choisirDate(i.value, true);
  verifierSansAscenseur();
}
/* Client lié changé : son secteur et sa ville (si le lieu n'a pas été tapé à la main) */
function lienChange(l) {
  const s = secteurDe(l);
  if (secteurConnu(s)) choisirPuce('activite', s);
  const lieu = $('#f-lieu');
  if (!lieu) return;
  if (!lieu.value.trim() || lieu.value === lieu.dataset.auto) lieu.value = villeDe(l);
  lieu.dataset.auto = villeDe(l);
}
function openEvent(id, date, lien, heure, apres, prefill) {
  const ex = id ? state.events.find(x => x.id === id) : null;
  if (id && !ex) return;
  const l = lien || '';
  /* Secteur proposé : celui du client lié, du filtre du planning, ou le dernier choisi ; sinon aucun (Toufek choisit) */
  const propose = [secteurDe(l), planFiltre, state.prefs.dernierSecteur].find(secteurConnu) || '';
  const e = ex || { date: date || today(), heure: heure || '', duree: 60, mode: 'visio', activite: propose, lien: l, lieu: villeDe(l), titre: l ? `RDV ${lienNom(l)}` : '', ...(prefill || {}) };
  const d = num(e.duree), durees = { ...DUREES, ...(d && !DUREES[d] ? { [d]: hrs(d) } : {}) };
  const essentiel = `<div class="fields">
      ${field('titre', 'Titre *', inp('titre', e.titre, 'text', `required autocomplete="off"${id ? '' : ' autofocus'}`), 'full')}
      ${puces('activite', SECTEURS_PUCES(), e.activite || '', { label: 'Secteur', couleur: true })}
      ${datesRdv(e.date || today())}
      <div class="rang full">
        ${field('heure', 'Heure', inp('heure', e.heure, 'time'), 'heure')}
        ${puces('duree', durees, String(d), { label: 'Durée', cls: 'duree' })}
      </div>
      ${puces('mode', MODES_COURTS, e.mode, { label: 'Type', seg: true })}
      <label class="chip bascule alerte"><input type="checkbox" name="important" ${e.important ? 'checked' : ''}><span>⚠ Alerte : à ne pas manquer</span></label>
    </div>`;
  const plus = `<div class="fields">
      ${field('fin', 'Jusqu\'au (période)', inp('fin', e.fin, 'date'))}
      <label class="check prevoir"><input type="checkbox" name="aPrevoir" ${e.aPrevoir ? 'checked' : ''}><span>Date à prévoir<small>dans la période, en pointillé</small></span></label>
      ${field('lien', 'Client lié', sel('lien', liensOpts(e.lien), e.lien || '').replace('<select', '<select onchange="lienChange(this.value)"'), 'full')}
      ${field('lieu', 'Lieu', inp('lieu', e.lieu, 'text', `autocomplete="off" placeholder="Adresse ou ville" data-auto="${esc(villeDe(e.lien))}"`), 'full')}
      ${field('notes', 'Notes', zoneTexte('notes', e.notes), 'full')}
    </div>`;
  showModal(feuille({ titre: id ? 'Modifier le RDV' : 'Nouveau RDV / tâche', sous: id ? esc(jourLong(e.date) + (e.heure ? ' · ' + e.heure : '')) : '', menu: id ? itemMenu('Supprimer', `supprimerEvent('${id}')`, true) : '', corps: volets([{ titre: 'Essentiel', html: essentiel }, { titre: 'Plus d\'options', html: plus }]) }),
  f => {
    /* Pas de secteur par défaut : sans choix, rien n'est créé */
    if (!secteurConnu(f.activite)) { voletAller(0); $('#f-activite')?.closest('.field')?.classList.add('manque'); toast('Choisis le secteur'); return; }
    f.duree = num(f.duree);
    f.important = !!f.important;
    f.lieu = String(f.lieu || '').trim();
    if (f.fin && f.fin <= f.date) f.fin = '';
    f.aPrevoir = !!f.aPrevoir && !!f.fin;
    if (f.fin && !f.heure) { f.mode = 'tache'; f.duree = 0; }
    state.prefs.dernierSecteur = f.activite;
    let ev = e;
    if (id) Object.assign(e, f);
    else { ev = { id: uid(), fait: false, ...f }; state.events.push(ev); }
    if (apres) apres(ev);
    save(); modal().close(); render(); toast(id ? 'RDV mis à jour' : 'Ajouté au planning');
  });
}

/* ---------- Suppressions : tout de suite, sans « Êtes-vous sûr ? », avec « Annuler » ----------
   Ce qui est retiré ou changé par la suppression est noté ; « Annuler » le remet à sa place, sans défaire ce qui a été fait entre-temps. */
function suppression(muter) {
  fermerModal();
  const avant = JSON.parse(JSON.stringify(state));
  const msg = muter();
  const diff = COLLECTIONS_KAMI.map(col => {
    const apres = new Map(state[col].map(x => [x.id, x]));
    const retires = [], modifies = [];
    avant[col].forEach((x, i) => {
      const y = apres.get(x.id);
      if (!y) retires.push({ i, x });
      else { const b = JSON.stringify(y); if (JSON.stringify(x) !== b) modifies.push({ id: x.id, avant: x, apres: JSON.parse(b) }); }
    });
    return { col, retires, modifies };
  });
  if (!save()) { render(); return; } // conflit avec une autre fenêtre (rechargée) ou stockage plein : save() a prévenu
  render();
  toastAction(msg, 'Annuler', () => retablir(diff));
}
function retablir(diff) {
  diff.forEach(({ col, retires, modifies }) => {
    retires.forEach(({ i, x }) => { if (!state[col].some(y => y.id === x.id)) state[col].splice(Math.min(i, state[col].length), 0, x); });
    modifies.forEach(({ id, avant, apres }) => {
      const y = state[col].find(z => z.id === id);
      if (!y) return;
      new Set([...Object.keys(avant), ...Object.keys(apres)]).forEach(k => {
        const b = JSON.stringify(apres[k]);
        if (JSON.stringify(avant[k]) !== b && JSON.stringify(y[k]) === b) { if (k in avant) y[k] = avant[k]; else delete y[k]; }
      });
    });
  });
  if (save()) { render(); toast('Rétabli'); }
}

/* ---------- Contacts : prises de contact et rappels ---------- */
/* Nom affiché d'un contact : « Sans nom » (ou le repli donné) pour une fiche ancienne ou importée sans nom */
const nomDe = (v, repli = 'Sans nom') => String((v && v.nom) || '').trim() || repli;
/* Un contact sans nom (ancien stockage, saisie rapide) se lit par son entreprise */
const libelleContact = (v, repli = 'Sans nom') => nomDe(v, String((v && v.entreprise) || '').trim() || repli);
/* Options « Client lié » : le lien actuel reste toujours proposé (même vers un contact clos ou disparu),
   pour qu'un enregistrement sans modification ne le perde jamais ; exclure retire la fiche elle-même. */
const liensOpts = (courant = '', exclure = '') => {
  const nomContact = v => `${nomDe(v)}${v.entreprise ? ' · ' + v.entreprise : ''}`;
  const o = {
    '': '— Aucun —',
    ...Object.fromEntries(state.abonnes.map(a => ['a:' + a.id, `${a.restaurant} (KamiFood)`])),
    ...Object.fromEntries(state.dossiers.map(d => ['d:' + d.id, `${d.entreprise} (${SECTEURS[d.activite]?.label || d.activite})`])),
    ...Object.fromEntries(state.aVoir.filter(v => v.statut !== 'clos').map(v => ['c:' + v.id, `${nomContact(v)} (contact)`])),
  };
  if (courant && !(courant in o)) {
    const v = courant.startsWith('c:') ? aVoir(courant.slice(2)) : null;
    o[courant] = v ? `${nomContact(v)} (clos)` : `${lienNom(courant) || 'Lien actuel'} (introuvable)`;
  }
  if (exclure) delete o[exclure];
  return o;
};
/* Fin d'un RDV (dernier jour pour une période) */
const finRdv = e => e.fin && e.fin > e.date ? e.fin : e.date;
/* Un contact « RDV planifié » dont le RDV a disparu, est fait ou est passé doit revenir : quelle suite ? */
function rdvPasse(v) {
  if (v.statut !== 'planifie') return false;
  const ev = v.eventId && state.events.find(e => e.id === v.eventId);
  return !ev || !!ev.fait || finRdv(ev) < today();
}
/* Jour où la suite d'un RDV passé est due : le lendemain de sa fin, au plus tard aujourd'hui (RDV fait ce matin ou hier, RDV retiré :
   aujourd'hui, à faire, pas en retard). Une date avant aujourd'hui = suite en retard (rouge). */
function suiteRdvDue(v) {
  const t = today();
  const ev = v.eventId && state.events.find(e => e.id === v.eventId);
  const lendemain = ev?.date ? iso(addDays(parse(finRdv(ev)), 1)) : t;
  return lendemain < t ? lendemain : t;
}
/* Rappels dus et RDV passés sans suite : affichés dans « Aujourd'hui » (ou en retard) ; alerte rouge si je dois quelque chose */
function rappelsContacts() {
  const t = today();
  const ligne = (v, date, sousTitre, extra) => ({ id: 'c-' + v.id, contact: v.id, lien: v.lien || '', date, heure: '', activite: v.activite || 'perso', important: v.attente === 'moi',
    titre: `${nomDe(v)}${v.entreprise ? ' · ' + v.entreprise : ''}${ATTENTES[v.attente] && v.attente ? ' · ' + ATTENTES[v.attente].toLowerCase() : ''}`, sousTitre, ...extra });
  const dus = state.aVoir.filter(v => v.statut === 'suivi' && v.rappel && v.rappel <= t).map(v => {
    const d = dernierContact(v);
    return ligne(v, v.rappel, d ? `Dernier contact le ${fmtDate(d.date)} : ${d.texte}` : 'À recontacter');
  });
  const passes = state.aVoir.filter(rdvPasse).map(v => {
    const ev = v.eventId && state.events.find(e => e.id === v.eventId);
    return ligne(v, suiteRdvDue(v), 'RDV passé · quelle suite ?', { rdvPasse: true, rdvDate: ev?.date || '' });
  });
  return [...dus, ...passes];
}
/* Alertes de l'accueil, triées par date, avec un compte à rebours (Aujourd'hui, Demain, J-N) :
   - un RDV important non fait dans les 30 jours (une période importante déjà commencée compte jusqu'à sa fin) ;
   - une période « à prévoir » non faite qui finit dans 7 jours ou moins, sans aucun RDV (hors période) du même client dedans.
     Pour un contact (lien c:<id>), son RDV posé compte aussi, quel que soit le client lié du RDV (bouton « Planifier un RDV »
     de sa fiche) : le RDV de son eventId tombé dans la période, ou à venir. Un contact clos n'a plus de créneau à caler : pas d'alerte.
   niveau 'fort' à J-1 ou moins, 'clair' sinon. action : le code à lancer au toucher (ids assainis). G1 y ajoutera l'argent en retard. */
const contactDe = e => e.lien && e.lien.startsWith('c:') ? aVoir(e.lien.slice(2)) || null : null;
function creneauCale(e) {
  if (!e.lien) return false;
  const fin = finRdv(e), v = contactDe(e);
  const sien = x => x.lien === e.lien || (!!v && (x.id === v.eventId || (!!v.lien && x.lien === v.lien)));
  if (state.events.some(x => x !== e && !estPeriode(x) && x.date >= e.date && x.date <= fin && sien(x))) return true;
  return !!v && v.statut === 'planifie' && !rdvPasse(v) && state.events.some(x => x.id === v.eventId && !estPeriode(x));
}
function alertes() {
  const t = today(), j30 = iso(addDays(parse(t), 30));
  const dans = d => Math.round((parse(d) - parse(t)) / 864e5);
  const ligne = (e, date, sous) => {
    const n = dans(date);
    return { date, heure: date === e.date ? e.heure || '' : '', jours: n, compte: n <= 0 ? 'Aujourd\'hui' : n === 1 ? 'Demain' : `J-${n}`,
      titre: e.titre || 'Sans titre', sous, niveau: n <= 1 ? 'fort' : 'clair', id: e.id, action: `openEvent('${e.id}')` };
  };
  const out = [];
  state.events.forEach(e => {
    if (e.fait || !e.date) return;
    if (e.aPrevoir && estPeriode(e) && contactDe(e)?.statut === 'clos') return; // « pas intéressé » : plus rien à caler
    const fin = finRdv(e);
    if (e.aPrevoir && estPeriode(e) && fin >= t && dans(fin) <= 7 && !creneauCale(e)) {
      const n = dans(fin);
      out.push(ligne(e, fin, `Créneau toujours pas calé, ${n <= 0 ? 'c\'est le dernier jour' : `il reste ${n} j`}`));
    } else if (e.important) {
      const d = estPeriode(e) && e.date < t ? fin : e.date;
      if (d < t || d > j30) return;
      const quand = d === e.date ? jourLong(d) + (e.heure ? ' à ' + e.heure : '') : `en cours jusqu'au ${jourLong(fin)}`;
      out.push(ligne(e, d, [quand.charAt(0).toUpperCase() + quand.slice(1), lienNom(e.lien) || e.lieu || ''].filter(Boolean).join(' · ')));
    }
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.heure || '99').localeCompare(b.heure || '99'));
}
/* Dates lisibles : « mardi 13 oct. » et « jeu. 15 oct. » */
const jourLong = s => s ? parse(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }) : '';
const jourCourt = s => s ? parse(s).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
/* ---------- Couches (Noter, et plus tard les autres écrans plein cadre) : le geste retour du téléphone ferme la couche du dessus ----------
   coucheOuvrir pousse une entrée d'historique (même adresse, le # ne change pas) ; un seul écouteur popstate ferme la couche du dessus.
   Le ✕, Annuler et Échap passent par history.back() (coucheFermer) ; une couche fermée par le code (enregistrement) appelle coucheQuittee,
   qui retire son entrée. Pendant ce retrait (asynchrone), une nouvelle couche attend pour pousser la sienne : l'historique reste propre. */
const couches = [];
let popIgnore = 0;
function pousserCouche(c) { try { history.pushState({ ...c.donnees, couche: c.nom }, ''); c.pousse = true; } catch (e) { /* historique indisponible : ✕, Annuler et Échap ferment quand même */ } }
/* donnees : gardées dans l'entrée d'historique (relues après un rechargement) ; reprise : l'entrée de cette couche est déjà là (rechargement), on ne la pousse pas une seconde fois */
function coucheOuvrir(nom, fermer, donnees = {}, reprise = false) {
  const c = { nom, fermer, pousse: false, donnees };
  couches.push(c);
  if (reprise && history.state && history.state.couche === nom) c.pousse = true;
  else if (!popIgnore) pousserCouche(c);
}
function coucheFermer() {
  const c = couches[couches.length - 1];
  if (!c) return;
  if (c.pousse && !popIgnore) history.back();
  else { couches.pop(); c.fermer(); }
}
function coucheQuittee(nom) {
  for (let i = couches.length - 1; i >= 0; i--) {
    if (couches[i].nom !== nom) continue;
    const [c] = couches.splice(i, 1);
    if (c.pousse && i === couches.length && history.state && history.state.couche === nom) { popIgnore++; history.back(); }
    return;
  }
}
window.addEventListener('popstate', () => {
  if (popIgnore > 0) { popIgnore--; if (!popIgnore) couches.filter(c => !c.pousse).forEach(pousserCouche); return; }
  const c = couches.pop();
  if (c) c.fermer();
});
/* Rechargement avec une couche ouverte (onglet tué pendant un appel, mise à jour) : Noter revient avec sa note, sur la même entrée
   d'historique (le retour suivant le ferme, voir reprendreCouche au démarrage). L'entrée d'une autre couche (fiche) ne ferme plus rien. */
const coucheAuChargement = history.state && history.state.couche ? { ...history.state } : null;
if (coucheAuChargement && coucheAuChargement.couche !== 'rencontre') { try { history.replaceState(null, ''); } catch (e) { /* ignore */ } }
function reprendreCouche() {
  const c = coucheAuChargement;
  if (!c || c.couche !== 'rencontre' || renc || !history.state || history.state.couche !== 'rencontre') return;
  const id = typeof c.depuis === 'string' && aVoir(c.depuis) ? c.depuis : null;
  openContact(id, undefined, { reprise: true });
}

/* Icônes (traits, couleur du texte) */
const ICONES = {
  noter: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9.5" cy="8" r="3.6"/><path d="M3 20.5a6.5 6.5 0 0 1 13 0"/><path d="M19 7.5v6M16 10.5h6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  rdv: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  dossier: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/></svg>',
  abonne: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18"/><path d="M17 3c-2 2-3 5-3 8h3v10"/></svg>',
  micro: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  tel: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h2.6l1.4 4-2 1.3a12 12 0 0 0 6.6 6.6l1.3-2 4 1.4v2.6a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/></svg>',
  bulle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.5-4.4a8.4 8.4 0 1 1 15.5-4.5z"/><path d="M9 9.5c.3 2 2.5 4.3 4.8 4.8"/></svg>',
};

/* Bouton rapide : une prise de contact (nouvelle personne, ou nouvelle entrée pour une personne connue) */
/* Rencontre : l'écran « Noter » (une phrase, ce qui est compris, un rappel, Enregistrer), puis au besoin les étapes pour ajuster.
   Chaque écran tient sans défiler (téléphone compris, clavier ouvert aussi). */
let renc = null;
function nouvelleRenc(v, p = {}) {
  /* Un rappel futur déjà posé est gardé ; sinon rappel dans 3 jours ouvrés, choisi d'office et enregistré tel quel */
  const garder = !!(v && v.rappel && v.rappel > today());
  const r = {
    v, etape: 0, note: [p.nom, p.sujet].filter(Boolean).join(' : '),
    nom: v ? v.nom : (p.nom || ''), entreprise: v ? (v.entreprise || '') : (p.entreprise || ''),
    activite: v ? (v.activite || 'perso') : (APPORT.includes(filtre.activite) ? filtre.activite : 'energie'),
    sujet: p.sujet || '', attente: v ? (v.attente || '') : '', rappel: garder ? v.rappel : rappelDans(3), rappelJ: garder ? 'garder' : '3',
    creneau: 'aucun', crDate: today(), crHeure: '', crSemaine: iso(monday(addDays(new Date(), 7))), crDu: today(), crAu: iso(addMonths(new Date(), 1)),
    objet: 'Présentation des services', tel: '', lien: v ? (v.lien || '') : '', date: today(), resume: '', important: false,
    /* Noter : jetons écartés d'un toucher, dernière lecture, champ « Qui ? », contact d'origine et brouillon repris */
    ignores: [], lecture: null, cleLue: null, qui: false, depuis: v ? v.id : null, brouillonT: 0,
    /* noteT : moment où la note a été commencée (un brouillon de la veille se relit par rapport à la veille) ;
       brouillonCle : la place du brouillon repris (s'il venait d'ailleurs, il y est retiré) ; kamiEnCours : « Affiner avec Kami » attend sa réponse */
    noteT: 0, brouillonCle: null, kamiEnCours: false,
  };
  /* Valeurs de départ des champs que la lecture de la note peut remplir (ce qui vient du formulaire d'accueil compte comme saisi) */
  r.defauts = { ...Object.fromEntries(RENC_LUS.map(k => [k, r[k]])), nom: v ? v.nom : '', entreprise: v ? (v.entreprise || '') : '', sujet: '' };
  r.lu = {}; r.noteLue = '';
  return r;
}
/* Même note, rattachée à un contact connu : ses nom, entreprise et service ; les choix faits à la main (rappel, attente…) restent */
function versContact(a, v) {
  const r = nouvelleRenc(v);
  const touche = k => a[k] !== (k in a.lu ? a.lu[k] : a.defauts[k]);
  for (const k of RENC_LUS) if (!['nom', 'entreprise', 'tel', 'activite'].includes(k) && rencGroupe(k).some(touche)) r[k] = a[k];
  Object.assign(r, { note: a.note, ignores: [...a.ignores], depuis: a.depuis, brouillonT: a.brouillonT, noteT: a.noteT, date: a.date, brouillonCle: a.brouillonCle, retourFocus: a.retourFocus, ouverture: a.ouverture });
  return r;
}
/* reprise : Noter rouvert au démarrage après un rechargement, sur l'entrée d'historique qui était déjà là */
function openContact(id, prefill, { reprise = false } = {}) {
  if (renc) fermerRencontre(); // une autre Rencontre ouverte (toast « Noter la suite »…) : son brouillon est déjà gardé
  fermerModal(); // la fiche est au premier plan : elle cacherait la Rencontre (son entrée d'historique est retirée)
  const v = id ? aVoir(id) || null : null;
  const cid = v ? v.id : null;
  renc = nouvelleRenc(v, prefill);
  renc.retourFocus = document.activeElement;
  /* Le toucher qui ouvre Noter (bouton +, « Noter quelqu'un… », « Contacté ») : un second toucher impatient au même endroit est ignoré (voir plus bas) */
  const clic = clicEnCours;
  renc.ouverture = clic && clic.isTrusted && clic.detail !== 0 ? { x: clic.clientX, y: clic.clientY, t: performance.now() } : null;
  /* Brouillon de moins de 24 h pour cette rencontre : le texte revient (et son rattachement à un contact, s'il avait été choisi),
     daté du moment où la note a été commencée (« demain », écrit hier soir, reste aujourd'hui ; le journal garde le jour de la rencontre) */
  const b = renc.note ? null : lireBrouillon(cid);
  if (b) {
    const c = b.contactId && b.contactId !== cid ? aVoir(b.contactId) : null;
    renc.note = b.note; renc.brouillonT = b.t; renc.noteT = b.debut; renc.date = jourLocal(b.debut); renc.brouillonCle = b.cle;
    if (c) { renc.depuis = cid; renc = versContact(renc, c); }
  }
  lireRencontre();
  const el = $('#rencontre');
  rencRender();
  el.hidden = false; document.body.classList.add('no-scroll');
  ['#main', '.sidebar', '#fab'].forEach(s => $(s)?.setAttribute('inert', ''));
  coucheOuvrir('rencontre', () => fermerRencontre(true), { depuis: cid }, reprise);
  suivreClavier(true);
  /* Au téléphone, le clavier ne s'ouvre que sur un geste : l'accueil et le bouton + donnent le focus eux-mêmes, tout de suite */
  if (window.innerWidth > 760) focusNote();
}
function focusNote() {
  const ta = $('#r-note');
  if (!ta) return;
  ta.focus({ preventScroll: true });
  try { ta.selectionStart = ta.selectionEnd = ta.value.length; } catch (e) { /* ignore */ }
}
/* Double toucher impatient : le second toucher tombe sur Noter qui vient de s'ouvrir (sous le bouton +, la puce « Clore »).
   Un toucher au même endroit que celui qui a ouvert Noter, dans la demi-seconde, ne fait rien. */
let clicEnCours = null; // le clic en train d'être traité (Noter ouvert par ce clic, ou par le code : null)
document.addEventListener('click', e => { clicEnCours = e; setTimeout(() => { if (clicEnCours === e) clicEnCours = null; }, 0); }, true);
$('#rencontre').addEventListener('click', e => {
  const o = renc && renc.ouverture;
  if (!o || !e.isTrusted || e.detail === 0) return;
  if (performance.now() - o.t < 500 && Math.hypot(e.clientX - o.x, e.clientY - o.y) < 40) { e.preventDefault(); e.stopPropagation(); }
}, true);
/* Ferme la Rencontre. depuisHistorique : appelée par le retour (popstate) ; sinon l'entrée d'historique de la couche est retirée */
function fermerRencontre(depuisHistorique) {
  const el = $('#rencontre');
  if (!renc && el.hidden) return;
  if (!depuisHistorique) coucheQuittee('rencontre');
  clearTimeout(noteSaisie.t);
  const focus = renc && renc.retourFocus;
  arreterDictee(); renc = null;
  el.hidden = true; el.innerHTML = ''; el.classList.remove('clavier');
  document.body.classList.remove('no-scroll');
  ['#main', '.sidebar', '#fab'].forEach(s => $(s)?.removeAttribute('inert'));
  suivreClavier(false);
  if (focus && focus.isConnected && focus !== document.body && window.innerWidth > 760) { try { focus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  rechargementDiffere();
}
/* ✕, geste retour et Échap : la Rencontre se ferme, le brouillon reste */
function quitterRencontre() {
  if (couches.some(c => c.nom === 'rencontre')) coucheFermer();
  else fermerRencontre();
}
/* Annuler : la note de cette rencontre est effacée (son brouillon seulement, jamais celui d'une autre), avec quelques secondes pour la rétablir.
   « Rétablir » n'écrase jamais une note commencée depuis au même endroit : le toast disparaît dès qu'on en écrit une. */
let noteAnnulee = null;
function annulerRencontre() {
  const r = renc;
  if (!r) return;
  rencLire();
  const note = (r.note || '').trim(), cid = r.v && aVoir(r.v.id) ? r.v.id : null;
  const depuis = r.depuis && aVoir(r.depuis) ? r.depuis : null, cle = depuis || '', debut = r.noteT || Date.now();
  effacerBrouillonDe(r);
  quitterRencontre();
  if (!note) return;
  const a = noteAnnulee = { cle };
  toastAction('Note effacée', 'Rétablir', () => {
    if (noteAnnulee === a) noteAnnulee = null;
    const enCours = renc && cleRenc(renc) === cle ? renc.note : (lireBrouillons().find(b => cleBrouillon(b) === cle) || {}).note;
    if (enCours && enCours.trim() && enCours.trim() !== note) { toast('Une autre note est en cours : elle est gardée'); return; }
    ecrireBrouillon({ note, contactId: cid, depuis, t: Date.now(), debut }); openContact(depuis); if (window.innerWidth <= 760) focusNote();
  }, 6000);
  a.bouton = $('#toast .toast-action');
}
/* Une nouvelle note commence là où une note vient d'être effacée : « Rétablir » n'est plus proposé */
function oublierNoteAnnulee(r) {
  const a = noteAnnulee;
  if (!a || !r || a.cle !== cleRenc(r) || !(r.note || '').trim()) return;
  noteAnnulee = null;
  const t = $('#toast');
  if (a.bouton && a.bouton.isConnected && t && t.contains(a.bouton)) { clearTimeout(toast.t); t.classList.remove('show'); }
}

/* ---------- Brouillons : la note n'est jamais perdue (appel qui coupe, retour, rechargement) ----------
   Un brouillon par rencontre, rangé selon l'endroit d'où Noter a été ouvert (la fiche d'un contact : son id ; une nouvelle personne : '').
   localStorage['kgd-brouillon'] garde le plus récent au premier niveau ({note, contactId, depuis, etape, t, debut}) et ceux des autres
   rencontres dans .autres : une note commencée ailleurs n'est ni écrasée ni effacée. L'ancien format (un seul brouillon) se relit tel quel. */
const BROUILLON = 'kgd-brouillon';
const cleBrouillon = b => String(b.depuis || '');
const cleRenc = r => String(r.depuis || '');
/* Un brouillon appartient à cette rencontre : même endroit d'ouverture, ou c'est celui qu'elle a repris */
const brouillonDe = (b, r) => cleBrouillon(b) === cleRenc(r) || (r.brouillonCle != null && cleBrouillon(b) === r.brouillonCle);
function brouillonPropre(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b) || typeof b.note !== 'string' || !b.note.trim()) return null;
  const t = Number(b.t);
  if (!Number.isFinite(t) || Date.now() - t >= 864e5) return null; // plus de 24 h : oublié
  const contactId = typeof b.contactId === 'string' ? b.contactId : null;
  const depuis = b.depuis === undefined ? contactId : (typeof b.depuis === 'string' ? b.depuis : null);
  const debut = Number(b.debut);
  return { note: b.note, contactId, depuis, etape: Number(b.etape) || 0, t, debut: Number.isFinite(debut) && debut > 0 && debut <= t ? debut : t };
}
/* Tous les brouillons encore valables, le plus récent d'abord */
function lireBrouillons() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(BROUILLON) || 'null'); } catch (e) { return []; }
  if (!s || typeof s !== 'object' || Array.isArray(s)) return [];
  const autres = s.autres && typeof s.autres === 'object' && !Array.isArray(s.autres) ? Object.values(s.autres) : [];
  return [s, ...autres].map(brouillonPropre).filter(Boolean).sort((a, b) => b.t - a.t);
}
/* Un seul brouillon par endroit (le premier de la liste l'emporte) ; plus aucun : la clé est retirée */
function ecrireBrouillons(liste) {
  const vus = new Set(), garde = [];
  for (const b of liste) { const k = cleBrouillon(b); if (!vus.has(k)) { vus.add(k); garde.push(b); } }
  try {
    if (!garde.length) { localStorage.removeItem(BROUILLON); return; }
    const [tete, ...reste] = garde;
    const o = { ...tete };
    if (reste.length) o.autres = Object.fromEntries(reste.map(b => [cleBrouillon(b) || 'nouveau', b]));
    localStorage.setItem(BROUILLON, JSON.stringify(o));
  } catch (e) { /* stockage plein ou bloqué : la note reste à l'écran */ }
}
function ecrireBrouillon(b) { ecrireBrouillons([b, ...lireBrouillons()]); }
/* Efface le brouillon de cette rencontre seulement (Annuler, Enregistrer, « Effacer », note vidée) */
function effacerBrouillonDe(r) { const l = lireBrouillons(); if (l.some(b => brouillonDe(b, r))) ecrireBrouillons(l.filter(b => !brouillonDe(b, r))); }
/* Le brouillon de cette rencontre (ouverte depuis la fiche cid, ou nouvelle personne : null) : celui de cet endroit,
   sinon une note commencée ailleurs et déjà rattachée à ce contact */
function lireBrouillon(cid) {
  const k = cid || '', l = lireBrouillons();
  const b = l.find(x => cleBrouillon(x) === k) || (cid ? l.find(x => x.contactId === cid) : null);
  return b ? { ...b, cle: cleBrouillon(b) } : null;
}
function sauverBrouillon() {
  const r = renc;
  if (!r) return;
  const tous = lireBrouillons(), autres = tous.filter(b => !brouillonDe(b, r));
  if ((r.note || '').trim()) {
    if (!r.noteT) r.noteT = Date.now();
    ecrireBrouillons([{ note: r.note, contactId: r.v ? r.v.id : null, depuis: r.depuis ?? null, etape: r.etape, t: Date.now(), debut: r.noteT }, ...autres]);
    r.brouillonCle = cleRenc(r);
    return;
  }
  /* Note vidée : on n'efface que le brouillon de cette rencontre, jamais celui d'une autre ; la prochaine note repart d'aujourd'hui */
  if (r.noteT) { r.noteT = 0; r.date = today(); }
  if (autres.length !== tous.length) ecrireBrouillons(autres);
}
const brouillonTexte = t => `Brouillon ${jourLocal(t) === today() ? 'de' : 'd\'hier,'} ${new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} repris`;
/* « Effacer » du bandeau : on repart d'une note vide (et du contact d'origine si la note avait été rattachée à un autre) */
function effacerNote() {
  const r = renc;
  if (!r) return;
  effacerBrouillonDe(r);
  if (r.v && r.v.id !== r.depuis) { renc = nouvelleRenc(r.depuis ? aVoir(r.depuis) || null : null); renc.retourFocus = r.retourFocus; rencRender(); }
  else {
    r.note = ''; r.brouillonT = 0; r.noteT = 0; r.date = today();
    const ta = $('#r-note'); if (ta) ta.value = '';
    lireRencontre(); majNoter();
  }
  focusNote();
}

/* ---------- Clavier du téléphone : la Rencontre suit la partie visible de l'écran ---------- */
function majClavier() {
  const vv = window.visualViewport, el = $('#rencontre');
  if (!vv || el.hidden) return;
  el.style.setProperty('--vvh', vv.height + 'px');
  el.style.setProperty('--vvt', vv.offsetTop + 'px');
  document.body.style.setProperty('--vvt', vv.offsetTop + 'px'); // le toast suit aussi la partie visible
  const c = vv.height < 560;
  if (c !== el.classList.contains('clavier')) el.classList.toggle('clavier', c);
  compacterJetons();
}
function suivreClavier(on) {
  const vv = window.visualViewport, el = $('#rencontre');
  if (!vv) return;
  if (on) {
    if (!suivreClavier.f) { suivreClavier.f = majClavier; vv.addEventListener('resize', majClavier); vv.addEventListener('scroll', majClavier); }
    majClavier();
  } else {
    if (suivreClavier.f) { vv.removeEventListener('resize', majClavier); vv.removeEventListener('scroll', majClavier); suivreClavier.f = null; }
    el.style.removeProperty('--vvh'); el.style.removeProperty('--vvt'); el.classList.remove('clavier'); document.body.style.removeProperty('--vvt');
  }
}

const RENC_ETAPES = () => renc.v ? [0, 2, 3, 4] : [0, 1, 2, 3, 4];
function rencAller(delta) {
  const liste = RENC_ETAPES(), i = liste.indexOf(renc.etape);
  rencLire();
  clearTimeout(noteSaisie.t);
  if (delta > 0 && renc.etape === 1 && !renc.nom.trim()) { toast('Le nom de la personne, au moins'); $('#r-nom')?.focus(); return; }
  if (delta > 0 && renc.etape === 0) lireRencontre();
  /* Sans nom lu, le début de la note ; sauf s'il n'est que l'entreprise lue (« Hôtel du Parc : … ») : « Qui ? » demande alors la personne */
  if (delta > 0 && renc.etape === 0 && !renc.v && !renc.nom.trim()) {
    const nom = premierNom(renc.note);
    if (nom !== renc.entreprise.trim()) { renc.nom = nom; renc.lu.nom = renc.nom; }
  }
  const j = Math.min(liste.length - 1, Math.max(0, i + delta));
  renc.etape = liste[j]; rencRender();
}
/* Sans Kami : on devine le nom depuis la note (« croisé Karim de Karim SARL… »), avec le lecteur local (lire.js) */
function premierNom(note) {
  return window.Lire ? Lire.premierNom(note) : String(note || '').split(/[,:.]/)[0].trim().slice(0, 40);
}
/* Les fiches déjà connues, pour que la lecture d'une note reconnaisse quelqu'un (contacts, dossiers, abonnés hors licence) */
const connus = () => [
  ...state.aVoir.map(v => ({ type: 'c', id: v.id, nom: v.nom || '', entreprise: v.entreprise || '', activite: v.activite || '' })),
  ...state.dossiers.map(d => ({ type: 'd', id: d.id, nom: d.contact || '', entreprise: d.entreprise || '', activite: d.activite || '' })),
  ...state.abonnes.filter(a => !a.interne).map(a => ({ type: 'a', id: a.id, nom: a.contact || '', entreprise: a.restaurant || '', activite: 'kamifood' })),
];
/* Lecture d'une note (lecteur local ou Kami) appliquée à la prise de contact.
   Un champ changé à la main n'est jamais remplacé (sauf par Kami quand on le lui demande : force) ; un champ vide de la lecture ne remplace rien ;
   ce qu'une lecture précédente avait rempli et que la note ne dit plus revient à sa valeur de départ. */
const RENC_LUS = ['nom', 'entreprise', 'tel', 'activite', 'attente', 'rappel', 'rappelJ', 'creneau', 'crDate', 'crHeure', 'crSemaine', 'crDu', 'crAu', 'objet', 'sujet', 'important'];
function lectureVersRenc(x, j, force) {
  const o = {}, local = Array.isArray(j.jetons); // le lecteur local donne ses jetons, Kami non
  if (!x.v) { if (j.nom) o.nom = j.nom; if (j.entreprise) o.entreprise = j.entreprise; }
  /* Le numéro : pour un nouveau contact, ou pour un contact connu qui n'en a pas encore */
  if (j.tel && telNeuf(x)) o.tel = j.tel;
  if (j.important) o.important = true;
  /* Contact connu : son service ne change pas sur un mot de la note (l'écran « Qui ? » est sauté), seulement si Kami le dit.
     Nouveau contact : le service d'un contact reconnu (existant) n'est pas repris tant que la note n'est pas ajoutée à sa fiche */
  const secteurLu = !local || j.jetons.some(t => t.cle === 'activite' && !t.ignore) || !(j.existant && j.existant.type === 'c');
  if (j.activite && secteurConnu(j.activite) && (!x.v || force) && secteurLu) o.activite = j.activite;
  if (j.attente === 'lui' || j.attente === 'moi') o.attente = j.attente;
  /* Rappel : seulement une date dite dans la note ; sinon le rappel par défaut (3 jours ouvrés, ou celui déjà posé) reste */
  const dit = Array.isArray(j.jetons) ? j.jetons.some(t => t.cle === 'rappel' && !t.ignore) : !!j.rappel;
  if (dit && /^\d{4}-\d{2}-\d{2}$/.test(j.rappel || '')) {
    o.rappel = j.rappel;
    const puce = RAPPELS.find(([k]) => /^\d+$/.test(k) && rappelDans(Number(k)) === j.rappel); // « dans 3 jours » allume la puce 3 jours
    o.rappelJ = puce ? puce[0] : 'x';
  }
  const c = j.creneau || {};
  if (c.type === 'date' && c.date) { o.creneau = 'date'; o.crDate = c.date; o.crHeure = c.heure || ''; }
  if (c.type === 'semaine' && c.du) { o.creneau = 'semaine'; o.crSemaine = c.du; }
  if (c.type === 'periode' && c.du && c.au) { o.creneau = 'periode'; o.crDu = c.du; o.crAu = c.au; }
  if (o.creneau && j.objet) o.objet = j.objet;
  /* Le journal garde la note entière : seul le résumé de Kami la remplace. Le sujet du lecteur local (dates retirées, 140 caractères) n'y va pas */
  if (j.sujet && !local) o.sujet = j.sujet;
  return o;
}
/* Le rappel et sa puce ne font qu'un : remplacés ou rétablis ensemble, seulement si aucun des deux n'a été changé à la main */
const RENC_GROUPES = [['rappel', 'rappelJ']];
const rencGroupe = k => RENC_GROUPES.find(g => g.includes(k)) || [k];
function appliquerLecture(x, j, force = false) {
  const lu = x.lu || (x.lu = {}), def = x.defauts || {};
  const o = lectureVersRenc(x, j, force);
  const intact = k => x[k] === (k in lu ? lu[k] : def[k]);
  for (const k of RENC_LUS) {
    const g = rencGroupe(k);
    if (g[0] !== k) continue; // un groupe est traité une seule fois, à sa première clé
    if (g.some(c => c in o)) { if (force || g.every(intact)) for (const c of g) if (c in o) { x[c] = o[c]; lu[c] = o[c]; } }
    else if (!force && g.some(c => c in lu) && g.every(intact)) for (const c of g) { x[c] = def[c]; delete lu[c]; }
  }
  x.noteLue = (x.note || '').trim();
}
/* Sans réseau ni clé : le lecteur local lit la note (une fois par version de la note et des jetons écartés) et remplit ce qui n'a pas été touché.
   force : relire même si rien n'a changé (contact rattaché, par exemple). */
function lireRencontre(force) {
  const r = renc;
  if (!r || !window.Lire) return;
  const note = (r.note || '').trim(), cle = note + '\u0000' + r.ignores.join(',');
  if (!force && cle === r.cleLue) return;
  r.cleLue = cle;
  try {
    /* Les dates relatives (« demain », « jeudi ») se lisent par rapport au moment où la note a été commencée (brouillon de la veille repris) */
    r.lecture = Lire.lireNote(note, r.noteT ? new Date(r.noteT) : new Date(), connus().filter(c => !(r.v && c.type === 'c' && c.id === r.v.id)), r.ignores);
    appliquerLecture(r, r.lecture);
  } catch (e) { r.lecture = null; r.noteLue = note; console.warn('Lecture locale impossible', e); }
}

/* ---------- Noter : ce qui a été compris (jetons), le rappel, le doublon ---------- */
const RAPPELS_COURTS = { 2: '2 j', 3: '3 j', 7: '1 sem.', 14: '2 sem.', clos: 'Clore' };
const CLES_JETONS = ['nom', 'entreprise', 'activite', 'attente', 'rappel', 'creneau', 'tel', 'important'];
function jetonTexte(j) {
  const l = String(j.libelle ?? '');
  if (j.cle === 'attente') return j.valeur === 'moi' ? 'Je lui dois' : 'J\'attends son retour';
  if (j.cle === 'rappel') return 'Rappel ' + l.replace(/^rappel\s+/, '');
  if (j.cle === 'creneau') return j.valeur && j.valeur.type === 'periode' ? 'À voir ' + l : l.charAt(0).toUpperCase() + l.slice(1);
  if (j.cle === 'tel') return 'Tél. ' + l;
  if (j.cle === 'important') return 'Important';
  return l;
}
/* Un contact connu n'a pas de numéro, ou c'est un nouveau contact : le numéro lu sera enregistré */
const chiffres = t => String(t || '').replace(/\D/g, '');
function telNeuf(r) { return !r.v || !chiffres(r.v.tel); }
/* Seuls les jetons qui seront vraiment appliqués à l'enregistrement sont montrés comme compris :
   contact connu → ni nom, ni entreprise, ni service (sa fiche les garde) ; un numéro seulement s'il n'en a pas (ou le même) ;
   « Important » seulement avec un créneau (le RDV créé passe en alerte) */
function jetonApplique(r, j) {
  if (!CLES_JETONS.includes(j.cle)) return false;
  if (r.v && ['nom', 'entreprise', 'activite'].includes(j.cle)) return false;
  if (j.cle === 'tel') return telNeuf(r) || chiffres(r.v.tel) === chiffres(j.valeur);
  if (j.cle === 'important') return creneauOk(r) && r.creneau !== 'aucun';
  return true;
}
function jetonsHtml(r) {
  const js = (r.lecture && r.lecture.jetons || []).filter(j => jetonApplique(r, j));
  const reconnu = r.lecture && r.lecture.existant && r.lecture.existant.type === 'c' && !(r.v && r.v.id === r.lecture.existant.id) && aVoir(r.lecture.existant.id);
  if (!js.length) return `<span class="r-jetons-vide">${!(r.note || '').trim() ? 'Nom, service, dates : lus ici, même hors ligne' : reconnu ? 'Contact reconnu au-dessus : ta phrase sera gardée telle quelle' : 'Rien de reconnu pour l\'instant : ta phrase sera gardée telle quelle'}</span>`;
  return js.map(j => {
    const cl = j.cle === 'rappel' || j.cle === 'creneau' ? 'date' : j.cle === 'activite' && secteurConnu(j.valeur) ? 'secteur' : (j.cle === 'attente' && j.valeur === 'moi') || j.cle === 'important' ? 'rouge' : '';
    const style = cl === 'secteur' ? ` style="--c:var(--${j.valeur})"` : '';
    return `<button type="button" class="jeton ${cl} ${j.ignore ? 'ignore' : ''}"${style} data-cle="${esc(j.cle)}" aria-pressed="${j.ignore ? 'false' : 'true'}" title="${j.ignore ? 'Écarté : touche pour le reprendre' : 'Compris : touche pour l\'écarter'}" onpointerdown="event.preventDefault()" onclick="basculerJeton('${esc(j.cle)}')"><span>${esc(jetonTexte(j))}</span></button>`;
  }).join('');
}
/* Un toucher écarte un jeton (barré, son champ revient à sa valeur de départ), un second le reprend */
function basculerJeton(cle) {
  const r = renc;
  if (!r || !CLES_JETONS.includes(cle)) return;
  rencLire();
  const i = r.ignores.indexOf(cle);
  if (i >= 0) r.ignores.splice(i, 1); else r.ignores.push(cle);
  lireRencontre(); majNoter();
}
/* Clavier ouvert : les jetons tiennent sur une ligne, ceux qui débordent sont remplacés par « +N » (un toucher ferme le clavier) */
function compacterJetons() {
  const box = $('#r-jetons');
  if (!box) return;
  box.querySelector('.jeton-plus')?.remove();
  const items = [...box.querySelectorAll('.jeton')];
  items.forEach(x => { x.hidden = false; });
  if (!$('#rencontre').classList.contains('clavier') || !items.length || box.scrollWidth <= box.clientWidth + 1) return;
  const plus = document.createElement('button');
  plus.type = 'button'; plus.className = 'jeton jeton-plus';
  plus.onclick = () => document.activeElement?.blur();
  box.appendChild(plus);
  let n = 0;
  for (let i = items.length - 1; i >= 0 && box.scrollWidth > box.clientWidth + 1; i--) { items[i].hidden = true; n++; plus.textContent = '+' + n; plus.setAttribute('aria-label', `${n} autre(s) : ferme le clavier pour tout voir`); }
}
function bandeauxHtml(r) {
  let h = '';
  if (r.brouillonT) h += `<div class="r-bandeau brouillon" id="r-brouillon"><span>${esc(brouillonTexte(r.brouillonT))}</span><button type="button" onpointerdown="event.preventDefault()" onclick="effacerNote()">Effacer</button></div>`;
  return h + doublonHtml(r);
}
/* Contact déjà connu, reconnu dans la note : « Ajouter à sa fiche » (aucun doublon). Sur « Qui ? », un dossier ou un abonné reconnu est signalé aussi. */
function doublonHtml(r, indice = false) {
  const ex = r.lecture && r.lecture.existant;
  if (!ex) return '';
  const c = ex.type === 'c' && !(r.v && r.v.id === ex.id) ? aVoir(ex.id) : null;
  const avecNom = !!String(c && c.nom || '').trim();
  if (c) return `<div class="r-bandeau doublon" id="r-doublon"><span><b>${esc(libelleContact(c))}</b>${avecNom && c.entreprise ? ` (${esc(c.entreprise)})` : ''} existe déjà</span><button type="button" onclick="rattacherContact('${esc(c.id)}')">Ajouter à sa fiche</button></div>`;
  if (!indice || r.v) return '';
  const d = ex.type === 'd' ? dossier(ex.id) : null, a = ex.type === 'a' ? abonne(ex.id) : null;
  const nom = d ? (d.entreprise || d.contact) : a ? (a.restaurant || a.contact) : '';
  return nom ? `<div class="r-bandeau" id="r-connu"><span><b>${esc(nom)}</b> ${d ? 'a déjà un dossier' : 'est déjà abonné KamiFood'}</span></div>` : '';
}
/* « Ajouter à sa fiche » : la note part dans le journal du contact existant, aucun doublon n'est créé.
   Depuis « Qui ? » (sautée pour un contact connu), on passe à « Et ensuite ? » ; depuis le récapitulatif, on y reste. */
function rattacherContact(id) {
  const v = aVoir(id);
  if (!renc || !v) return;
  rencLire();
  const etape = renc.etape;
  renc = versContact(renc, v);
  lireRencontre(true);
  renc.etape = etape === 1 ? 2 : etape;
  rencRender(); sauverBrouillon();
  toast(`La note ira dans la fiche de ${libelleContact(v, 'ce contact')}`);
}
function pucesHtml(r) {
  const garder = r.v && r.v.rappel && r.v.rappel > today();
  return `<div class="r-zone-tete"><span class="r-label">Me le rappeler</span><span class="r-rappel-txt ${rappelManque(r) ? 'manque' : ''}" id="r-rappel-txt">${esc(rappelTexte(r))}</span></div>
    <div class="chips r-puces" id="r-rappels">${garder ? `<button type="button" class="chip ${r.rappelJ === 'garder' ? 'on' : ''}" data-j="garder" onpointerdown="event.preventDefault()" onclick="rencSet('rappelJ','garder')">Garder</button>` : ''}${RAPPELS.map(([j]) => `<button type="button" class="chip ${j === 'clos' ? 'clore' : ''} ${r.rappelJ === j ? 'on' : ''}" data-j="${j}" onpointerdown="event.preventDefault()" onclick="rencSet('rappelJ','${j}')">${RAPPELS_COURTS[j]}</button>`).join('')}</div>`;
}
/* Aucun nom trouvé pour un nouveau contact : « Qui ? » prend la place des puces, dans le même écran */
const quiHtml = r => `<div class="r-zone-tete"><label class="r-label" for="r-qui">Qui ?</label><span class="r-rappel-txt" id="r-rappel-txt">${esc(rappelTexte(r))}</span></div>
    <input id="r-qui" value="${esc(r.nom)}" placeholder="Prénom, nom" autocomplete="off" autocapitalize="words" enterkeyhint="done" oninput="renc.nom=this.value" onkeydown="if(event.key==='Enter'&&!event.isComposing){event.preventDefault();enregistrerNoter()}">`;
const kamiDispo = () => !!jarvis.token && navigator.onLine !== false;
/* « Affiner avec Kami » : désactivé (« Kami lit… ») tant que sa réponse n'est pas arrivée, même si la note change entre-temps */
const kamiHtml = r => kamiDispo() ? `<button type="button" class="r-affiner" id="r-affiner" onclick="analyserRencontre()"${r.kamiEnCours ? ' disabled' : ''}>${r.kamiEnCours ? 'Kami lit…' : 'Affiner avec Kami'}</button>` : '';
/* Met à jour l'écran Noter sans toucher au champ de saisie (le curseur et le clavier restent) */
function majNoter() {
  const r = renc;
  if (!r || r.etape !== 0 || $('#rencontre').hidden) return;
  const maj = (sel, html) => { const e = $(sel); if (e && e.innerHTML !== html) e.innerHTML = html; return e; };
  maj('#r-bandeaux', bandeauxHtml(r));
  const avant = $('#r-jetons')?.innerHTML;
  maj('#r-jetons', jetonsHtml(r));
  if ($('#r-jetons') && $('#r-jetons').innerHTML !== avant) compacterJetons();
  maj('#r-kami', kamiHtml(r));
  /* « Qui ? » affiché, puis le nom écrit dans la phrase : les puces de rappel reviennent (le champ était resté vide) */
  if (r.qui && r.nom.trim() && r.lu.nom === r.nom && !($('#r-qui')?.value || '').trim() && document.activeElement?.id !== 'r-qui') {
    r.qui = false;
    const z = $('#r-zone'); if (z) z.innerHTML = pucesHtml(r);
  }
  if (r.qui) { const t = $('#r-rappel-txt'); if (t) t.textContent = rappelTexte(r); return; }
  document.querySelectorAll('#r-rappels .chip').forEach(b => b.classList.toggle('on', b.dataset.j === r.rappelJ));
  const t = $('#r-rappel-txt');
  if (t) { t.textContent = rappelTexte(r); t.classList.toggle('manque', rappelManque(r)); }
}
/* Frappe dans la note : brouillon tout de suite, lecture 120 ms après la dernière touche */
function noteSaisie(val) {
  if (!renc) return;
  renc.note = val;
  sauverBrouillon();
  oublierNoteAnnulee(renc);
  clearTimeout(noteSaisie.t);
  noteSaisie.t = setTimeout(() => { if (!renc || renc.etape !== 0) return; lireRencontre(); majNoter(); }, 120);
}
/* Entrée (« OK » du clavier du téléphone) ferme le clavier ; Ctrl ou Cmd + Entrée enregistre (raccourci global) */
function noteTouche(e) {
  if (e.key !== 'Enter' || e.isComposing || e.shiftKey || e.ctrlKey || e.metaKey) return;
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) { e.preventDefault(); e.target.blur(); }
}
/* Enregistrer depuis Noter : la lecture finale est appliquée, puis la prise de contact est enregistrée d'un seul toucher */
function enregistrerNoter() {
  const r = renc;
  if (!r) return;
  clearTimeout(noteSaisie.t);
  rencLire();
  if (!r.v && !r.note.trim() && !r.nom.trim()) { toast('Écris d\'abord une phrase'); focusNote(); return; }
  lireRencontre();
  if (!r.v && !r.nom.trim()) {
    if (!window.Lire) { r.nom = premierNom(r.note); r.lu.nom = r.nom; }
    else {
      if (r.qui) toast('Le nom de la personne, au moins');
      r.qui = true;
      const z = $('#r-zone'); if (z && !$('#r-qui')) z.innerHTML = quiHtml(r);
      majNoter();
      $('#r-qui')?.focus();
      return;
    }
  }
  enregistrerRencontre();
}
/* Lit les champs de l'étape affichée dans renc */
function rencLire() {
  const g = id => $('#r-' + id)?.value;
  const r = renc;
  /* « Qui ? » vide ne retire pas le nom lu entre-temps dans la phrase */
  if (r.etape === 0) { r.note = g('note') ?? r.note; const q = r.qui ? g('qui') : undefined; if (q && q.trim()) r.nom = q; }
  if (r.etape === 1) { r.nom = g('nom') ?? r.nom; r.entreprise = g('entreprise') ?? r.entreprise; }
  if (r.etape === 2) { const d = g('rappel'); if (d !== undefined && d !== r.rappel) { r.rappel = d; r.rappelJ = 'x'; } }
  if (r.etape === 3) { r.crDate = g('crDate') ?? r.crDate; r.crHeure = g('crHeure') ?? r.crHeure; r.crSemaine = g('crSemaine') ?? r.crSemaine; r.crDu = g('crDu') ?? r.crDu; r.crAu = g('crAu') ?? r.crAu; r.objet = g('objet') ?? r.objet; }
  if (r.etape === 4) { r.sujet = g('sujet') ?? r.sujet; r.tel = g('tel') ?? r.tel; }
}
function rencSet(k, val) {
  rencLire(); renc[k] = val;
  if (k === 'rappelJ') renc.rappel = val === 'clos' ? '' : val === 'garder' ? (renc.v?.rappel || '') : rappelDans(Number(val));
  /* Sur Noter, le champ de saisie n'est pas redessiné : le clavier reste ouvert */
  if (renc.etape === 0) majNoter(); else rencRender();
}
/* Date de rappel choisie à la main : aucune puce ne reste allumée, la date en clair suit (sans redessiner l'écran) */
function rencDate(val) {
  renc.rappel = val; renc.rappelJ = 'x';
  document.querySelectorAll('#r-rappels .chip').forEach(b => b.classList.remove('on'));
  const p = $('#r-rappel-txt'); if (p) { p.textContent = rappelTexte(renc); p.classList.toggle('manque', rappelManque(renc)); }
}
/* Le texte sous les puces suit ce qui sera vraiment enregistré : un créneau choisi garde le contact ouvert, même avec « Clore » */
const rappelTexte = r => {
  const cr = creneauOk(r);
  if (r.rappelJ === 'clos') return cr ? '→ pas clos : un créneau est prévu' : '→ contact clos, plus de rappel';
  if (r.rappel) return `→ ${jourLong(r.rappel)}`;
  if (cr) return r.creneau === 'date' ? '→ pas de rappel : le RDV suffit' : `→ ${jourLong(rappelFinal(r))}, après le créneau`;
  return '→ aucune date : choisis une durée, une date, ou clos le contact';
};
/* Rien de prévu (ni rappel, ni créneau, ni clôture) : le texte passe en rouge */
const rappelManque = r => !r.rappel && r.rappelJ !== 'clos' && !creneauOk(r);
/* Le créneau de l'étape 3 est-il complet ? */
const creneauOk = r => r.creneau === 'date' ? !!r.crDate : r.creneau === 'semaine' ? !!r.crSemaine : r.creneau === 'periode' ? !!(r.crDu && r.crAu) : false;
/* Dernier jour d'un créneau « à prévoir » (semaine, période) ; '' pour un jour précis ou sans créneau */
const finCreneau = r => !creneauOk(r) ? '' : r.creneau === 'semaine' ? iso(addDays(monday(parse(r.crSemaine)), 6)) : r.creneau === 'periode' ? (r.crAu < r.crDu ? r.crDu : r.crAu) : '';
/* Jour ouvré qui suit une date : un contact au créneau « à prévoir » sans rappel revient ce jour-là si rien n'a été calé */
const lendemainOuvre = d => iso(jourOuvre(addDays(parse(d), 1)));
/* Le rappel qui sera enregistré : celui choisi ; sinon, avec un créneau à prévoir, le jour ouvré qui suit sa fin */
const rappelFinal = r => r.rappelJ !== 'clos' && r.rappel ? r.rappel : finCreneau(r) ? lendemainOuvre(finCreneau(r)) : '';
/* La suite de la prise de contact pour le récapitulatif : une ligne par élément (deux au plus) ; ok = false si rien n'est prévu.
   Un créneau l'emporte sur « Clore » : le contact reste ouvert, et le récapitulatif le dit. */
function rencSuite(r) {
  const cr = creneauOk(r);
  const quand = r.creneau === 'date' ? `RDV le ${jourCourt(r.crDate)}${r.crHeure ? ' à ' + r.crHeure : ''}` : r.creneau === 'semaine' ? `à prévoir la semaine du ${fmtDate(iso(monday(parse(r.crSemaine))))}` : r.creneau === 'periode' ? `à prévoir du ${fmtDate(r.crDu)} au ${fmtDate(r.crAu)}` : '';
  const parts = [];
  const choisi = r.rappelJ !== 'clos' && r.rappel, apres = !choisi && finCreneau(r) ? rappelFinal(r) : '';
  if (choisi) parts.push(`Rappel ${jourLong(r.rappel)}`);
  if (cr) parts.push(`${quand} · ${(r.objet || '').trim() || 'Présentation des services'}`);
  if (apres) parts.push(`${r.rappelJ === 'clos' ? 'Pas clos : rappel' : 'Rappel'} ${jourLong(apres)} si rien n'est calé`);
  else if (cr && r.rappelJ === 'clos') parts.push('Pas clos : il reste ouvert jusqu\'au RDV');
  if (parts.length) return { ok: true, lignes: parts.map(x => x.replace(/^à/, 'À')) };
  if (r.rappelJ === 'clos') return { ok: true, lignes: ['Contact clos : il sort des rappels'] };
  return { ok: false, lignes: ['Aucune suite : choisis un rappel, un créneau ou clos le contact'] };
}
function rencRender() {
  const r = renc, liste = RENC_ETAPES(), pos = liste.indexOf(r.etape);
  const opt = (k, val, label, sub) => `<button type="button" class="opt ${r[k] === val ? 'on' : ''}" onclick="rencSet('${k}','${val}')"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</button>`;
  const titres = ['Noter', 'Qui ?', 'Et ensuite ?', 'Dans le planning ?', 'On enregistre ?'];
  let corps = '';
  if (r.etape === 0) corps = `
    <div class="r-bandeaux" id="r-bandeaux">${bandeauxHtml(r)}</div>
    <div class="r-saisie ${SR ? 'micro' : ''}">
      <textarea id="r-note" rows="3" enterkeyhint="done" autocomplete="off" autocapitalize="sentences" aria-label="Ta note" placeholder="${r.v ? 'Ex. : il m\'envoie ses factures, rappelle-moi jeudi' : 'Ex. : croisé Karim de Karim SARL pour les CEE, je lui envoie le devis, rappelle-moi jeudi'}" oninput="noteSaisie(this.value)" onkeydown="noteTouche(event)">${esc(r.note)}</textarea>
      ${SR ? `<button type="button" class="r-mic ${recNote ? 'on' : ''}" id="r-mic" onclick="dicteeRencontre()" aria-label="${recNote ? 'Arrêter la dictée' : 'Dicter'}" title="Dicter">${ICONES.micro}</button>` : ''}
    </div>
    <div class="r-compris"><div class="r-jetons" id="r-jetons" aria-label="Ce qui a été compris">${jetonsHtml(r)}</div><div id="r-kami">${kamiHtml(r)}</div></div>
    <div class="r-zone" id="r-zone">${r.qui ? quiHtml(r) : pucesHtml(r)}</div>`;
  if (r.etape === 1) corps = `
    ${doublonHtml(r, true)}
    <label class="r-label" for="r-nom">Personne</label><input id="r-nom" value="${esc(r.nom)}" placeholder="Prénom, nom" autocomplete="off">
    <label class="r-label" for="r-entreprise">Entreprise</label><input id="r-entreprise" value="${esc(r.entreprise)}" placeholder="Facultatif" autocomplete="off">
    <label class="r-label">Service à présenter</label>
    <div class="chips">${Object.entries(SECTEURS).map(([k, s]) => `<button type="button" class="chip ${r.activite === k ? 'on' : ''}" onclick="rencSet('activite','${k}')"><i style="background:var(--${k})"></i>${esc(s.label)}</button>`).join('')}</div>`;
  if (r.etape === 2) corps = `
    <label class="r-label">Qui attend quoi ?</label>
    <div class="opts">${opt('attente', '', 'Rien en attente')}${opt('attente', 'lui', "J'attends ses informations", 'Il doit me revenir')}${opt('attente', 'moi', 'Je lui dois des informations', 'Je dois lui envoyer quelque chose')}</div>
    <label class="r-label">Me le rappeler</label>
    <div class="chips" id="r-rappels">${r.v && r.v.rappel && r.v.rappel > today() ? `<button type="button" class="chip ${r.rappelJ === 'garder' ? 'on' : ''}" onclick="rencSet('rappelJ','garder')">Garder · ${esc(jourCourt(r.v.rappel))}</button>` : ''}${RAPPELS.map(([j, l]) => `<button type="button" class="chip ${j === 'clos' ? 'clore' : ''} ${r.rappelJ === j ? 'on' : ''}" onclick="rencSet('rappelJ','${j}')">${l}</button>`).join('')}</div>
    <p class="meta r-rappel-txt ${rappelManque(r) ? 'manque' : ''}" id="r-rappel-txt">${esc(rappelTexte(r))}</p>
    <input id="r-rappel" type="date" value="${esc(r.rappel)}" onchange="rencDate(this.value)" aria-label="Date du rappel">`;
  if (r.etape === 3) corps = `
    <div class="opts quatre">${opt('creneau', 'aucun', 'Rien', 'Juste le rappel')}${opt('creneau', 'date', 'Un jour', 'Date précise')}${opt('creneau', 'semaine', 'Une semaine', 'À caler dedans')}${opt('creneau', 'periode', 'Une période', 'Quelques semaines ou mois')}</div>
    ${r.creneau === 'date' ? `<div class="r-ligne"><span class="meta">Le</span><input id="r-crDate" type="date" value="${esc(r.crDate)}"><span class="meta">à</span><input id="r-crHeure" type="time" value="${esc(r.crHeure)}"></div>` : ''}
    ${r.creneau === 'semaine' ? `<div class="r-ligne"><span class="meta">Semaine du</span><input id="r-crSemaine" type="date" value="${esc(r.crSemaine)}"></div>` : ''}
    ${r.creneau === 'periode' ? `<div class="r-ligne"><span class="meta">Du</span><input id="r-crDu" type="date" value="${esc(r.crDu)}"><span class="meta">au</span><input id="r-crAu" type="date" value="${esc(r.crAu)}"></div>` : ''}
    ${r.creneau !== 'aucun' ? `<label class="r-label" for="r-objet">Objet</label><input id="r-objet" value="${esc(r.objet)}">` : ''}`;
  if (r.etape === 4) {
    const suite = rencSuite(r);
    corps = `
    ${doublonHtml(r)}
    <div class="recap">
      <div class="recap-nom">${esc(r.nom || '?')}${r.entreprise ? ` <span class="meta">· ${esc(r.entreprise)}</span>` : ''} ${tag(r.activite)}</div>
      <label class="r-label" for="r-sujet">De quoi vous avez parlé</label><input id="r-sujet" value="${esc(r.sujet || r.note)}">
      <ul class="recap-list"><li>${esc(r.rappelJ === 'clos' && !creneauOk(r) ? 'Rien en attente' : ATTENTES[r.attente] || 'Rien en attente')}</li></ul>
      <div class="recap-suite ${suite.ok ? '' : 'manque'}" id="r-suite"><span class="r-label">La suite</span>${suite.lignes.map(l => `<b>${esc(l)}</b>`).join('')}</div>
      ${r.resume ? `<p class="meta recap-resume" title="${esc(r.resume)}">${esc(r.resume)}</p>` : ''}
      ${r.v ? '' : `<label class="r-label" for="r-tel">Téléphone (facultatif)</label><input id="r-tel" type="tel" value="${esc(r.tel)}">`}
    </div>`;
  }
  const pied = r.etape === 0
    ? `<button type="button" class="btn r-annuler" onclick="annulerRencontre()">Annuler</button>
        <div class="r-pied-droite"><button type="button" class="btn" id="r-ajuster" onclick="rencAller(1)">Ajuster…</button><button type="button" class="btn primary" id="r-enregistrer" onclick="enregistrerNoter()" title="Ctrl ou Cmd + Entrée" aria-keyshortcuts="Control+Enter Meta+Enter">Enregistrer</button></div>`
    : `<button type="button" class="btn" onclick="rencAller(-1)">Retour</button>
        ${r.etape === 4 ? `<button type="button" class="btn primary" onclick="enregistrerRencontre()" aria-keyshortcuts="Control+Enter Meta+Enter">Enregistrer</button>` : `<button type="button" class="btn primary" onclick="rencAller(1)">Continuer</button>`}`;
  $('#rencontre').innerHTML = `
    <div class="r-card">
      <div class="r-head">
        <div><div class="meta">${r.v ? 'Prise de contact · ' + esc(libelleContact(r.v)) : 'Prise de contact'}</div><h2 id="r-titre">${titres[r.etape]}</h2></div>
        <div class="r-dots" aria-hidden="true">${liste.map((e, i) => `<i class="${i <= pos ? 'on' : ''}"></i>`).join('')}</div>
        <button type="button" class="btn icon" onclick="quitterRencontre()" aria-label="Fermer">✕</button>
      </div>
      <div class="r-body ${r.etape === 0 ? 'noter' : ''}">${corps}</div>
      <div class="r-foot ${r.etape === 0 ? 'noter' : ''}">${pied}</div>
    </div>`;
  if (r.etape === 0) compacterJetons();
  sauverBrouillon();
  verifierSansAscenseur();
}
/* Ctrl ou Cmd + Entrée : Enregistrer (Noter ou récapitulatif) ; Échap ferme la Rencontre, le brouillon reste */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && fermerMenuPlus()) { e.preventDefault(); return; }
  if (e.key === 'Escape' && fermerMenuAjout()) { e.preventDefault(); $('#btn-ajout')?.focus({ preventScroll: true }); return; }
  if (!renc || $('#rencontre').hidden || document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape') { e.preventDefault(); quitterRencontre(); }
  else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) {
    e.preventDefault();
    if (renc.etape === 0) enregistrerNoter(); else if (renc.etape === 4) enregistrerRencontre();
  }
});
['online', 'offline'].forEach(t => window.addEventListener(t, () => majNoter()));
/* Enregistre la prise de contact. Jamais sans suite : un rappel, un créneau, ou la clôture explicite.
   Toutes les vérifications passent avant la moindre modification des données. */
function enregistrerRencontre() {
  rencLire();
  /* Une autre fenêtre a écrit pendant la saisie : on repart de ses données (rien de ce qui est saisi ici n'est perdu) */
  if (aRecharger || revStocke() > revCourant) {
    const id = renc.v && renc.v.id;
    aRecharger = false; state = load();
    if (id) { renc.v = aVoir(id); if (!renc.v) { fermerRencontre(); render(); toast('Ce contact a été supprimé dans une autre fenêtre'); return; } }
  }
  const r = renc, v = r.v;
  if (!v && !r.nom.trim()) { toast('Il manque le nom'); r.etape = 1; rencRender(); return; }
  const cr = creneauOk(r);
  const clore = r.rappelJ === 'clos' && !cr; // un créneau choisi l'emporte : le contact reste ouvert
  if (!clore && !r.rappel && !cr) { toast('Choisis une suite : un rappel, un créneau ou clore'); r.etape = 2; rencRender(); return; }
  const target = v || { id: uid(), createdAt: Date.now(), statut: 'suivi', priorite: 'normale', historique: [], nom: r.nom.trim(), entreprise: r.entreprise.trim(), tel: r.tel.trim(), lien: r.lien };
  target.activite = r.activite;
  /* Contact connu : le numéro lu dans la note va dans sa fiche s'il n'en avait pas (un numéro déjà connu n'est jamais remplacé ; la note le garde) */
  if (v && (r.tel || '').trim() && !String(v.tel || '').trim()) v.tel = r.tel.trim();
  if (clore) { target.statut = 'clos'; target.rappel = ''; target.attente = ''; }
  else { target.attente = r.attente; target.rappel = r.rappelJ === 'clos' ? '' : (r.rappel || ''); if (target.statut === 'clos') target.statut = 'suivi'; }
  const sujet = (r.sujet || r.note || '').trim();
  if (!Array.isArray(target.historique)) target.historique = [];
  target.historique.push({ date: r.date || today(), texte: sujet || 'Prise de contact' });
  if (!v) state.aVoir.push(target);
  const ev = cr ? creneauContact(target, { creneau: r.creneau, crDate: r.crDate, crHeure: r.crHeure, crSemaine: r.crSemaine, crDu: r.crDu, crAu: r.crAu, objet: r.objet, important: r.important }) : null;
  /* « RDV planifié » seulement s'il y a vraiment un nouveau RDV daté ; sinon le contact repart en suivi avec sa suite */
  if (target.statut === 'planifie' && !(ev && !estPeriode(ev))) target.statut = 'suivi';
  /* Jamais en cours sans rappel : un créneau à prévoir (semaine, période) sans rappel fait revenir le contact
     le jour ouvré qui suit sa fin, si rien n'a été calé (c'est aussi ce qu'annonce le récapitulatif) */
  if (target.statut === 'suivi' && !target.rappel) target.rappel = ev ? lendemainOuvre(finRdv(ev)) : today();
  /* Le brouillon de cette rencontre n'est effacé que si l'enregistrement a vraiment eu lieu ; celui d'une autre rencontre reste */
  if (save()) effacerBrouillonDe(r);
  fermerRencontre(); render(); toast(messageRencontre(target, clore, ev), 4000);
}
/* Ce qui a été créé, en une ligne : « Karim · Karim SARL · rappel mar. 13 oct. · RDV jeu. 15 à 14:00 » */
function messageRencontre(v, clore, ev) {
  const parts = String(v.nom || '').trim() ? [nomDe(v), v.entreprise].filter(Boolean) : [libelleContact(v)];
  if (clore) parts.push('contact clos');
  else if (v.rappel) parts.push('rappel ' + jourCourt(v.rappel));
  if (ev) {
    const jour = parse(ev.date).getMonth() === new Date().getMonth() && parse(ev.date).getFullYear() === new Date().getFullYear()
      ? parse(ev.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }) : jourCourt(ev.date);
    parts.push(estPeriode(ev) ? `à prévoir du ${fmtDate(ev.date)} au ${fmtDate(ev.fin)}` : `RDV ${jour}${ev.heure ? ' à ' + ev.heure : ''}`);
  }
  if (parts.length === 1) parts.push('enregistré');
  return parts.join(' · ');
}
/* Dictée de la note (reconnaissance vocale du navigateur, en français) */
let recNote = null;
function dicteeRencontre() {
  if (!SR) return;
  if (recNote) { arreterDictee(); return; }
  recNote = new SR(); recNote.lang = 'fr-FR'; recNote.continuous = true; recNote.interimResults = false;
  recNote.onresult = e => { const t = Array.from(e.results).slice(e.resultIndex).map(x => x[0].transcript).join(' ').trim(); const ta = $('#r-note'); if (ta && t && renc) { ta.value = (ta.value ? ta.value.trim() + ' ' : '') + t; noteSaisie(ta.value); } };
  /* Fin de la dictée : la note est relue tout de suite */
  recNote.onend = () => { recNote = null; majMicNote(); if (renc && renc.etape === 0) { clearTimeout(noteSaisie.t); lireRencontre(); majNoter(); } };
  recNote.onerror = () => { arreterDictee(); toast('Micro indisponible'); };
  try { recNote.start(); majMicNote(); } catch (e) { recNote = null; }
}
function majMicNote() { const b = $('#r-mic'); if (b) { b.classList.toggle('on', !!recNote); b.setAttribute('aria-label', recNote ? 'Arrêter la dictée' : 'Dicter'); } }
function arreterDictee() { if (recNote) { try { recNote.stop(); } catch (e) { /* ignore */ } recNote = null; majMicNote(); } }
/* Kami lit la note et remplit toutes les étapes ; on saute au récapitulatif */
async function analyserRencontre() {
  if (!renc || renc.kamiEnCours) return; // une seule demande à la fois
  rencLire();
  const texte = (renc.note || '').trim();
  if (!texte) { toast('Écris ou dicte d\'abord une phrase'); return; }
  if (!jarvis.token) { toast('Colle ton jeton Kami dans Réglages'); return; }
  clearTimeout(noteSaisie.t);
  lireRencontre(); // le lecteur local d'abord : si Kami ne répond pas, ce qu'il a lu reste
  const x = renc;
  x.kamiEnCours = true;
  const b = $('#r-affiner'); if (b) { b.disabled = true; b.textContent = 'Kami lit…'; }
  try {
    /* Kami lit aussi les dates par rapport au jour où la note a été commencée (brouillon de la veille repris) */
    const r = await fetch('/api/analyser', { method: 'POST', headers: { 'content-type': 'application/json', 'x-jarvis-token': jarvis.token }, body: JSON.stringify({ texte, aujourdhui: x.noteT ? jourLocal(x.noteT) : today() }) });
    const j = await r.json();
    x.kamiEnCours = false;
    if (!r.ok) throw new Error(j.erreur || `Erreur ${r.status}`);
    if (renc !== x) return; // Rencontre fermée entre-temps
    /* Kami complète : ce qu'il lit remplace, ce qu'il laisse vide ne retire rien au lecteur local */
    appliquerLecture(x, j, true);
    x.resume = j.resume || '';
    x.etape = 4; rencRender();
  } catch (e) {
    x.kamiEnCours = false;
    if (renc !== x) return;
    toast(e.message || 'Analyse impossible'); rencRender();
  }
}
/* Le créneau choisi dans la prise de contact devient une entrée du planning liée au contact */
function creneauContact(v, f) {
  const k = f.creneau || 'aucun';
  if (k === 'aucun') return null;
  const objet = (f.objet || '').trim() || 'Présentation des services';
  const titre = `${nomDe(v)}${v.entreprise ? ' · ' + v.entreprise : ''} · ${objet}`;
  /* important : « signature ! », « annonce des prix » lus dans la note → RDV en alerte (rouge, à ne pas manquer) */
  const base = { id: uid(), fait: false, titre, activite: v.activite || 'perso', lien: 'c:' + v.id, notes: dernierContact(v)?.texte || '', important: !!f.important, mode: 'visio', duree: 30, heure: '' };
  let ev;
  if (k === 'date') { if (!f.crDate) return null; ev = { ...base, date: f.crDate, heure: f.crHeure || '', mode: f.crHeure ? 'visio' : 'tache' }; v.statut = 'planifie'; }
  else if (k === 'semaine') { if (!f.crSemaine) return null; const l = monday(parse(f.crSemaine)); ev = { ...base, date: iso(l), fin: iso(addDays(l, 6)), mode: 'tache', duree: 0, aPrevoir: true }; }
  else { if (!f.crDu || !f.crAu) return null; const du = f.crDu, au = f.crAu < f.crDu ? f.crDu : f.crAu; ev = { ...base, date: du, fin: au, mode: 'tache', duree: 0, aPrevoir: true }; }
  if (ev.fin && ev.fin <= ev.date) { delete ev.fin; delete ev.aPrevoir; }
  state.events.push(ev);
  v.eventId = ev.id;
  return ev;
}
/* Fiche contact : s'ouvre en lecture (« où on en est », appeler, noter), puis Coordonnées et Suivi à modifier */
let ficheId = null;
const estElle = v => /^(mme|madame|mlle|mademoiselle)\b/i.test(String(v.nom || '').trim());
const telHref = t => { const s = String(t || '').trim().replace(/[^\d+]/g, '').replace(/(?!^)\+/g, ''); return s.replace(/\D/g, '').length >= 4 ? s : ''; };
/* WhatsApp attend le numéro international sans + : 06 12 34 56 78 → 33612345678 */
const waNumero = t => { let d = String(t || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); else if (/^0\d{9}$/.test(d)) d = '33' + d.slice(1); return d.length >= 8 ? d : ''; };
const ilYa = ds => { if (!ds) return ''; const n = Math.round((parse(today()) - parse(ds)) / 864e5); return n <= 0 ? 'aujourd\'hui' : n === 1 ? 'hier' : `il y a ${n} j`; };
/* Ce qui est attendu, repris d'un des derniers échanges par le lecteur local (« je lui envoie le devis » → « le devis ») ; sinon '' */
function ceQuiEstDu(v) {
  if (!window.Lire || !v.attente) return '';
  const h = v.historique || [];
  for (let i = h.length - 1; i >= Math.max(0, h.length - 3); i--) {
    const txt = String(h[i].texte || '');
    try {
      const jetons = Lire.lireNote(txt, today(), [], []).jetons || [];
      const j = jetons.find(x => x.cle === 'attente' && x.valeur === v.attente);
      if (!j) continue;
      const art = /\b(?:une|un|ma|mon|mes|le|la|les|des|notre|nos)\s*$/i.exec(txt.slice(j.debut, j.fin)); // « il attend une réponse » → « une réponse »
      /* Le jour promis n'est pas l'objet : « je lui envoie le devis lundi » → « le devis » (coupé au premier rappel ou créneau lu après) */
      const quand = jetons.filter(x => (x.cle === 'rappel' || x.cle === 'creneau') && x.debut >= j.fin).sort((a, b) => a.debut - b.debut)[0];
      let reste = txt.slice(art ? j.fin - art[0].length : j.fin, quand ? quand.debut : txt.length)
        .split(/[,.;:!?\n]|\set\s|\srappel|\s(?=(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|apr[eè]s-demain|ce soir|cette semaine|la semaine prochaine)(?![\wàâçéèêëîïôûùüÿ-]))/i)[0].trim()
        .replace(/\s+(?:pour|avant|d['’]ici(?:\s+à)?|dès|au plus tard|sous|vers|à partir d[eu']?|de|du)$/i, '').trim();
      /* « elle doit m'envoyer ses avis » → « ses avis » : pronom et verbe d'envoi retirés */
      reste = reste.replace(/^(?:(?:lui|leur|me|nous|vous)\s+|[mt]['’]\s*)/i, '').replace(/^(?:envoyer|renvoyer|transmettre|faire parvenir|faire|donner|passer|confirmer|pr[ée]parer|proposer|redire|dire)\s+/i, '').trim();
      if (reste.length >= 3) return reste.length > 60 ? reste.slice(0, 59).trim() + '…' : reste;
    } catch (e) { return ''; }
  }
  return '';
}
/* Résumé en 3 lignes, sans IA : la rencontre et le dernier échange, la prochaine étape, qui doit quoi */
function ficheResume(v) {
  const h = (v.historique || []).filter(x => x && (x.texte || x.date)), n = h.length, t = today();
  const premier = h.map(x => x.date).filter(Boolean).sort()[0] || (v.createdAt ? jourLocal(v.createdAt) : '');
  const der = h[n - 1];
  const l1 = n ? `${estElle(v) ? 'Rencontrée' : 'Rencontré'} le ${fmtDate(premier) || '?'} · ${n} échange${n > 1 ? 's' : ''}${der.date ? ` · dernier ${ilYa(der.date)}` : ''} : ${der.texte || '…'}` : 'Aucun échange noté pour l\'instant';
  const ev = v.eventId && state.events.find(e => e.id === v.eventId);
  let l2, retard = false;
  if (v.statut === 'clos') l2 = 'Contact clos : plus de rappel';
  else if (rdvPasse(v)) { l2 = 'RDV passé : quelle suite ?'; retard = suiteRdvDue(v) < t; }
  else if (v.statut === 'planifie' && ev) l2 = `RDV ${jourCourt(ev.date)}${ev.heure ? ' à ' + ev.heure : ''}`;
  else if (v.rappel) {
    retard = v.rappel < t;
    l2 = (v.rappel === t ? 'rappel aujourd\'hui' : `rappel ${jourCourt(v.rappel)}${retard ? ', en retard' : ''}`)
      + (ev && estPeriode(ev) && !ev.fait ? ` · à prévoir du ${fmtDate(ev.date)} au ${fmtDate(ev.fin)}` : '');
  } else l2 = 'Aucune suite';
  const quoi = ceQuiEstDu(v) || 'des informations';
  const l3 = v.attente === 'moi' ? `Tu lui dois : ${quoi}` : v.attente === 'lui' ? `${estElle(v) ? 'Elle' : 'Il'} te doit : ${quoi}` : 'Rien en attente';
  return `<div class="fiche-resume" id="fiche-resume">
      <p class="r1">${esc(l1)}</p>
      <p class="r2 ${retard ? 'late' : ''}"><span class="meta">Prochaine étape :</span> ${esc(l2)}</p>
      <p class="r3 ${v.attente === 'moi' ? 'doit' : ''}">${esc(l3)}</p>
    </div>`;
}
/* Une ligne du journal : 2 lignes de texte ; un toucher ouvre l'échange en entier, à la place du bloc.
   i : rang de l'échange (0 = le plus récent) ; page : la page de « Tout le journal » d'où il est ouvert (-1 : depuis la fiche) */
const ligneJournal = (x, i, page = -1) => `<li role="button" tabindex="0" onclick="echangeVue(${i}, ${page})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();echangeVue(${i}, ${page})}"><span class="when">${esc(fmtDate(x.date)) || '—'}</span><div class="grow">${esc(x.texte)}</div></li>`;
/* Un échange en entier : tout son texte, sans coupe. Très long, il défile dans sa propre zone (comme les Notes), jamais la fiche.
   ‹ › passent à l'échange plus récent ou plus ancien ; « ‹ Fiche » ou « ‹ Journal » ramène d'où l'on vient. */
function echangeVue(i, page = -1) {
  const v = aVoir(ficheId), box = $('#fiche-vue');
  if (!v || !box) return;
  const h = [...(v.historique || [])].reverse(), n = h.length;
  if (!n) return ficheVue();
  i = Math.min(Math.max(0, Number(i) || 0), n - 1);
  const x = h[i] || {};
  const depuisJournal = page >= 0;
  box.innerHTML = `<div class="journal-tete">
      <button type="button" class="btn small" onclick="${depuisJournal ? `journalPage(${Math.floor(i / 8)})` : 'ficheVue()'}">‹ ${depuisJournal ? 'Journal' : 'Fiche'}</button>
      <span class="meta">${esc(x.date ? jourLong(x.date) : 'Sans date')}</span>
      <div class="pager"><button type="button" class="btn small" ${i ? '' : 'disabled'} onclick="echangeVue(${i - 1}, ${page})" aria-label="Plus récent">‹</button><span>${i + 1} / ${n}</span><button type="button" class="btn small" ${i < n - 1 ? '' : 'disabled'} onclick="echangeVue(${i + 1}, ${page})" aria-label="Plus ancien">›</button></div>
    </div>
    <div class="echange" id="echange" tabindex="0" aria-label="Échange en entier">${esc(x.texte || '')}</div>`;
  verifierSansAscenseur();
}
function ficheHtml(v) {
  const tel = telHref(v.tel), wa = waNumero(v.tel), h = v.historique || [], n = h.length;
  return `${ficheResume(v)}
    <div class="fiche-actions">
      ${tel ? `<a class="btn" href="tel:${esc(tel)}">${ICONES.tel}<span>Appeler</span></a>` : ''}
      ${wa ? `<a class="btn" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">${ICONES.bulle}<span>WhatsApp</span></a>` : ''}
      <button type="button" class="btn" onclick="openContact('${v.id}')">${ICONES.noter}<span>+ Prise de contact</span></button>
      <button type="button" class="btn" onclick="planifierAVoir('${v.id}')">${ICONES.rdv}<span>Planifier un RDV</span></button>
    </div>
    <div class="fiche-journal">
      <span class="lab">Journal</span>
      <ul class="list journal">${n ? [...h].reverse().slice(0, 5).map((x, i) => ligneJournal(x, i)).join('') : '<li class="meta">Aucune prise de contact notée.</li>'}</ul>
      ${n > 5 ? `<button type="button" class="lien-btn" onclick="journalPage(0)">Tout le journal (${n})</button>` : ''}
    </div>`;
}
/* « Tout le journal » : remplace la fiche par le journal complet, 8 échanges par page (‹ plus récents · plus anciens ›) */
function journalPage(p) {
  const v = aVoir(ficheId), box = $('#fiche-vue');
  if (!v || !box) return;
  const h = [...(v.historique || [])].reverse(), pages = Math.max(1, Math.ceil(h.length / 8));
  p = Math.min(Math.max(0, p), pages - 1);
  box.innerHTML = `<div class="journal-tete">
      <button type="button" class="btn small" onclick="ficheVue()">‹ Fiche</button>
      <span class="meta">${h.length} échange${h.length > 1 ? 's' : ''}</span>
      <div class="pager"><button type="button" class="btn small" ${p ? '' : 'disabled'} onclick="journalPage(${p - 1})" aria-label="Plus récents">‹</button><span>${p + 1} / ${pages}</span><button type="button" class="btn small" ${p < pages - 1 ? '' : 'disabled'} onclick="journalPage(${p + 1})" aria-label="Plus anciens">›</button></div>
    </div>
    <ul class="list journal complet">${h.slice(p * 8, p * 8 + 8).map((x, k) => ligneJournal(x, p * 8 + k, p)).join('')}</ul>`;
  verifierSansAscenseur();
}
function ficheVue() { const v = aVoir(ficheId), box = $('#fiche-vue'); if (v && box) { box.innerHTML = ficheHtml(v); verifierSansAscenseur(); } }
function openAVoir(id) {
  const v = id ? aVoir(id) : null;
  if (!v) return openContact();
  ficheId = v.id;
  const coord = `<div class="fields">
      ${field('nom', 'Personne *', inp('nom', v.nom, 'text', 'required autocomplete="off"'), 'full')}
      ${field('entreprise', 'Entreprise', inp('entreprise', v.entreprise, 'text', 'autocomplete="off"'), 'full')}
      ${field('tel', 'Téléphone', inp('tel', v.tel, 'tel'))}
      ${field('email', 'E-mail', inp('email', v.email, 'email'))}
      ${field('ville', 'Ville', inp('ville', v.ville), 'full')}
      ${puces('activite', SECTEURS_PUCES(), v.activite || 'perso', { label: 'Service à présenter', couleur: true })}
    </div>`;
  const suivi = `<div class="fields">
      ${puces('attente', { '': 'Rien', lui: 'J\'attends', moi: 'Je lui dois' }, v.attente || '', { label: 'En attente', seg: true })}
      ${field('rappel', 'Prochain rappel', inp('rappel', v.rappel, 'date'), 'full')}
      ${puces('statut', STATUTS_AV, v.statut, { label: 'Statut', seg: true })}
      ${puces('priorite', PRIORITES, v.priorite || 'normale', { label: 'Priorité', seg: true })}
      ${field('lien', 'Client lié', sel('lien', liensOpts(v.lien, 'c:' + v.id), v.lien || ''), 'full')}
      ${field('notes', 'Notes', zoneTexte('notes', v.notes), 'full')}
    </div>`;
  const sous = [v.entreprise, SECTEURS[v.activite]?.label].filter(Boolean).map(esc).join(' · ');
  showModal(feuille({ titre: esc(nomDe(v)), sous, menu: itemMenu('Supprimer', `supprimerAVoir('${v.id}')`, true),
    corps: volets([{ titre: 'Fiche', html: `<div id="fiche-vue">${ficheHtml(v)}</div>` }, { titre: 'Coordonnées', html: coord }, { titre: 'Suivi', html: suivi }]), pied: piedFeuille('Fermer') }),
  f => {
    /* Clore à la main : plus de rappel ni d'attente, le contact sort des alertes */
    if (f.statut === 'clos' && v.statut !== 'clos') { f.rappel = ''; f.attente = ''; }
    /* Un contact en cours garde toujours un rappel (même règle que Kami) : vider la date d'un contact en cours est refusé, rien n'est modifié.
       Repris en cours (clos, RDV planifié) sans date, ou ancien contact resté sans rappel : rappel aujourd'hui, jamais sans suite */
    if (f.statut === 'suivi' && !f.rappel) {
      if (v.statut === 'suivi' && v.rappel) {
        const champ = $('#f-rappel');
        montrerChamp(champ);
        if (champ && !coarse()) champ.focus({ preventScroll: true });
        toast('Un contact en cours garde toujours un rappel : choisis une date ou clos-le', 4000);
        return;
      }
      f.rappel = today();
    }
    Object.assign(v, f);
    save(); modal().close(); render(); toast('Fiche mise à jour');
  });
}
function supprimerAVoir(id) {
  if (!aVoir(id)) return;
  suppression(() => {
    state.aVoir = state.aVoir.filter(v => v.id !== id);
    /* Plus de lien orphelin vers ce contact (RDV du planning, autres fiches) */
    state.events.forEach(e => { if (e.lien === 'c:' + id) e.lien = ''; });
    state.aVoir.forEach(x => { if (x.lien === 'c:' + id) x.lien = ''; });
    return 'Supprimé';
  });
}
/* Ouvre le formulaire de RDV pré-rempli ; à l'enregistrement le contact passe en « RDV planifié » */
function planifierAVoir(id) {
  const v = aVoir(id); if (!v) return;
  const d = dernierContact(v);
  const qui = [v.nom, v.entreprise].filter(Boolean).join(' · ');
  fermerModal();
  openEvent(null, today(), v.lien || '', '', ev => { v.statut = 'planifie'; v.eventId = ev.id; },
    { titre: `RDV ${qui}`, activite: v.activite || 'perso', notes: d ? d.texte : '', lieu: villeDe(v.lien) || v.ville || '' });
}
function aVoirTri(a, b) {
  const t = today();
  const due = v => (v.statut === 'suivi' && v.rappel && v.rappel <= t) || rdvPasse(v) ? 0 : 1;
  const pr = { haute: 0, normale: 1, basse: 2 };
  return due(a) - due(b) || (a.rappel || '9999').localeCompare(b.rappel || '9999') || (pr[a.priorite] ?? 1) - (pr[b.priorite] ?? 1)
    || ((dernierContact(b) || {}).date || '').localeCompare((dernierContact(a) || {}).date || '');
}
function aVoirItem(v, compact) {
  const t = today();
  const ouvert = v.statut === 'suivi';
  const passe = rdvPasse(v);
  const d = dernierContact(v);
  const ev = v.eventId && state.events.find(e => e.id === v.eventId);
  const jours = v.rappel ? Math.round((parse(v.rappel) - parse(t)) / 864e5) : null;
  /* En retard (rouge) : un rappel dépassé, ou la suite d'un RDV passé depuis plus d'un jour ; un RDV fait ce matin attend sa suite aujourd'hui */
  const late = (ouvert && jours !== null && jours < 0) || (passe && suiteRdvDue(v) < t);
  const when = passe ? `${ev && !ev.fait ? 'RDV du ' + fmtDate(ev.date) + ' passé' : ev ? 'RDV fait' : 'RDV retiré'} · quelle suite ?`
    : ev && estPeriode(ev) && !ev.fait ? `À prévoir du ${fmtDate(ev.date)} au ${fmtDate(ev.fin)}${jours !== null && ouvert ? ' · rappel ' + (jours < 0 ? 'dépassé' : jours === 0 ? 'aujourd\'hui' : 'dans ' + jours + ' j') : ''}`
    : v.statut === 'planifie' && ev ? `RDV le ${fmtDate(ev.date)}${ev.heure ? ' à ' + ev.heure : ''}`
    : v.statut === 'clos' ? 'Clos'
    : jours === null ? 'Pas de rappel'
    : jours < 0 ? `Rappel dépassé de ${-jours} j`
    : jours === 0 ? 'Rappel aujourd\'hui'
    : jours === 1 ? 'Rappel demain' : `Rappel dans ${jours} j`;
  /* Le rouge est réservé à l'urgent : un rappel dépassé, ou une information que je dois et dont le rappel est arrivé.
     Qui attend quoi reste visible, en gris argent (neutre). */
  const alerte = ouvert && jours !== null && (jours < 0 || (v.attente === 'moi' && jours <= 0));
  const attente = v.attente === 'lui' ? `<span class="status att-lui" title="${esc(ATTENTES.lui)}">↩ ${estElle(v) ? 'Elle' : 'Il'} te doit</span>`
    : v.attente === 'moi' ? `<span class="status att-moi" title="${esc(ATTENTES.moi)}">↪ Tu lui dois</span>` : '';
  const boutons = `${ouvert || passe ? `<button class="btn small" onclick="openContact('${v.id}')" title="Noter une nouvelle prise de contact">Contacté</button>` : ''}
    ${ouvert && !compact ? `<button class="btn small" onclick="planifierAVoir('${v.id}')">RDV</button>` : ''}`;
  /* Liste complète : au téléphone, les deux boutons passent sous le texte (le nom et « Il te doit » ne sont plus coupés) */
  return `<li class="${late ? 'retard' : ''} ${v.statut === 'clos' ? 'done' : ''} ${alerte ? 'alerte' : ''} ${compact ? '' : 'av-plein'}">
    <div class="grow clickable" onclick="openAVoir('${v.id}')">
      <div class="when ${late ? 'late' : passe || (ouvert && jours === 0) ? 'du' : ''}">${esc(when)}</div>
      <div class="title-txt">${alerte ? '<span class="warn-ico" title="À traiter">⚠</span> ' : ''}${esc(nomDe(v))}${v.entreprise ? ` <span class="meta">· ${esc(v.entreprise)}</span>` : ''} ${attente}</div>
      <div class="meta">${d ? `${esc(fmtDate(d.date))} : ${esc(d.texte)}` : 'Aucune prise de contact notée'}</div>
    </div>
    ${compact ? boutons : boutons.trim() ? `<div class="av-actions">${boutons}</div>` : ''}
    <i class="dot" style="background:var(--${v.activite || 'perso'})" data-tip="${esc(SECTEURS[v.activite]?.label || '')}" aria-label="${esc(SECTEURS[v.activite]?.label || '')}"></i>
  </li>`;
}
function aVoirView() {
  tipInit();
  const t = today();
  const suivis = state.aVoir.filter(v => v.statut === 'suivi');
  const dus = rappelsContacts();
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
/* Le RDV d'un contact est fait ou supprimé : le contact repart en suivi, avec un rappel au plus tard aujourd'hui */
function libererContact(e) {
  if (!e || !String(e.lien || '').startsWith('c:')) return null;
  const v = aVoir(e.lien.slice(2));
  if (!v || v.eventId !== e.id || v.statut === 'clos') return null;
  v.statut = 'suivi'; v.eventId = '';
  v.rappel = v.rappel && v.rappel > today() ? v.rappel : today();
  return v;
}
function toggleEvent(id) {
  const e = state.events.find(x => x.id === id);
  if (!e) return;
  e.fait = !e.fait;
  const v = e.fait ? libererContact(e) : null;
  save(); render();
  if (v) toastAction('RDV fait avec ' + nomDe(v, 'ce contact'), 'Noter la suite', () => openContact(v.id));
}
function supprimerEvent(id) {
  if (!state.events.some(e => e.id === id)) return;
  suppression(() => {
    const v = libererContact(state.events.find(e => e.id === id));
    state.events = state.events.filter(e => e.id !== id);
    return v ? `Supprimé · ${nomDe(v)} revient dans tes rappels` : 'Supprimé';
  });
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
      recurrentMensuelKamiFood: mrr(), stripe: state.stripe ? { sync: state.stripe.sync, mrr: state.stripe.mrr, encaisse30j: state.stripe.factures.filter(f => f.date >= iso(addDays(new Date(), -30))).reduce((s, f) => s + num(f.ht), 0), impayes: state.stripe.abonnes.filter(a => a.impaye).length } : null, abonnesActifs: state.abonnes.filter(a => a.statut === 'actif' && !a.interne).length,
      kamifoodGains: stripeReel() ? 'factures Stripe payées' : 'estimation au prorata des jours d\'abonnement',
      dossiersEnCours: state.dossiers.filter(d => ACTIFS.includes(d.statut)).length,
      contactsARappeler: rappelsContacts().length, contactsEnAttente: state.aVoir.filter(v => v.statut === 'suivi' && v.attente).length,
      alertes: alertes().map(({ date, compte, titre, sous, niveau }) => ({ date, compte, titre, sous, niveau })),
      enRetard: relances().filter(r => r.date < t).length + state.events.filter(e => !e.fait && (estPeriode(e) ? e.fin < t : e.date < t)).length + rappelsContacts().filter(r => r.date < t).length,
    },
    formules: state.formules, rdvModele: state.rdvModele, memoire: state.memoire,
    abonnes: state.abonnes, dossiers: state.dossiers, events: state.events, aVoir: state.aVoir,
  };
}

/* Rejoue sur nos données ce que le cerveau a fait sur sa copie */
/* Seules les collections que Kami modifie sont acceptées ; ce qui est appliqué est assaini puis enregistré, même si une action échoue.
   Renvoie vrai si c'est enregistré (ou s'il n'y avait rien à faire). */
const COLLECTIONS_KAMI = ['events', 'dossiers', 'abonnes', 'aVoir'];
function appliquer(actions) {
  let nav = null, ok = true;
  const liste = Array.isArray(actions) ? actions : [];
  /* Une autre fenêtre a écrit pendant la requête : on repart de ses données (les ids de Kami restent valables), rien n'est jeté */
  if (liste.length && (aRecharger || revStocke() > revCourant)) { aRecharger = false; state = load(); }
  try {
    for (const a of liste) {
      if (!a || typeof a !== 'object') continue;
      const col = COLLECTIONS_KAMI.includes(a.collection) && Array.isArray(state[a.collection]) ? a.collection : null;
      if (a.op === 'add' && col) { if (a.item && typeof a.item === 'object' && !Array.isArray(a.item)) state[col].push(a.item); }
      else if (a.op === 'update' && col) { const x = state[col].find(i => i.id === a.id); if (x && a.fields && typeof a.fields === 'object') Object.assign(x, a.fields); }
      else if (a.op === 'delete' && col) state[col] = state[col].filter(i => i.id !== a.id);
      else if (a.op === 'memoire') state.memoire.push(a.note && typeof a.note === 'object' ? JSON.stringify(a.note) : String(a.note ?? ''));
      else if (a.op === 'navigate') nav = a.vue;
    }
  } finally {
    if (liste.length) { assainir(state); ok = save(); }
  }
  if (ok && nav && nav !== 'jarvis' && Object.prototype.hasOwnProperty.call(views, nav)) setTimeout(() => { location.hash = '#' + nav; }, 1200);
  return ok;
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
  if (!jarvis.token) { toast(`Colle d'abord ton jeton ${jarvis.nom || 'Kami'} dans Réglages`); location.hash = '#parametres'; return; }
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
    /* Kami n'annonce « ✓ appliqué » que si c'est vraiment enregistré ; sinon sa réponse n'est pas gardée (il ne s'en souviendra pas) */
    if (!appliquer(j.actions)) throw Object.assign(new Error('Pas enregistré : ce que je viens de faire n\'a pas pu être gardé. Redemande-moi.'), { vocal: 'Désolé, ce n\'est pas enregistré. Redemande-moi.' });
    jarvis.historique.push({ role: 'assistant', content: j.texte, actions: Array.isArray(j.actions) ? j.actions.length : 0 });
    if (jarvis.voix && viaVoix) parler(j.texte);
  } catch (e) {
    jarvis.historique.push({ role: 'assistant', content: e.message || String(e), erreur: true });
    if (viaVoix && jarvis.voix) parler(e.vocal || 'Désolé, je n\'ai pas pu répondre.');
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
  /* Sans jeton, rien à vérifier : un texte calme, jamais d'erreur rouge (Noter et le reste marchent sans Kami) */
  const sansJeton = !jarvis.token, nom = jarvis.nom || 'Kami';
  if (!sansJeton) setTimeout(testerJarvis, 0);
  setTimeout(majChat, 0);
  return `
  <div class="page-head">
    <div><h1>${esc(nom)}</h1><p id="jarvis-etat" class="${sansJeton ? '' : jarvisEtat.ok ? 'ok' : jarvisEtat.ok === false ? 'ko' : ''}">${esc(sansJeton ? `${nom} arrive bientôt. En attendant, Noter comprend déjà tes phrases.` : jarvisEtat.texte)}</p></div>
    <div class="btn-row">
      <button class="btn ${jarvis.voix ? 'on' : ''}" onclick="jarvis.voix=!jarvis.voix;saveJarvis();render()" title="${esc(nom)} répond à voix haute quand tu lui parles à la voix">🔊 Voix ${jarvis.voix ? 'on' : 'off'}</button>
      ${SR ? `<button class="btn ${jarvis.mainsLibres ? 'primary' : ''}" onclick="mainsLibres(!jarvis.mainsLibres)" title="Il n'écoute que quand tu dis « ${esc(nom)} »">${jarvis.mainsLibres ? '● Mains libres actif' : '○ Mains libres'}</button>` : ''}
      <button class="btn" onclick="parler('Bonjour Toufek, je suis prêt.')" title="Tester la voix">Test voix</button>
    </div>
  </div>
  <div class="card chat">
    <div id="chat-log"></div>
    <form id="chat-form" onsubmit="event.preventDefault();const i=$('#chat-in');jarvisEnvoyer(i.value,false);i.value=''">
      ${SR ? `<button type="button" class="btn mic" id="chat-mic" onclick="dicter()" aria-label="Parler">🎤</button>` : ''}
      <input id="chat-in" type="text" placeholder="${SR ? 'Écris, ou appuie sur le micro et parle…' : `Écris à ${esc(nom)}…`}" autocomplete="off">
      <button class="btn primary" id="chat-send" ${jarvisOccupe ? 'disabled' : ''}>Envoyer</button>
    </form>
    ${SR ? '' : `<p class="note">Ton navigateur ne gère pas la reconnaissance vocale. Utilise Chrome ou Edge pour parler à ${esc(nom)}.</p>`}
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
  if (on) { dicteeSeule = false; demarrerEcoute(); toast(`Mains libres : dis « ${jarvis.nom || 'Kami'}, … »`); } else arreterEcoute();
  render();
}
function dicter() {
  if (ecoute && dicteeSeule) { dicteeSeule = false; arreterEcoute(); return; }
  if (jarvis.mainsLibres) { toast(`Mains libres déjà actif : dis « ${jarvis.nom || 'Kami'}, … »`); return; }
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
/* Double toucher sur « Voir un exemple » ou « Charger un exemple » : l'exemple s'affiche aussitôt et le second toucher
   tomberait sur ce qui vient d'apparaître (une fiche, « Retirer l'exemple »). Pendant 1 s, ce second toucher est ignoré
   et « Retirer l'exemple » ne fait rien. */
let exempleCharge = 0;
const exempleJusteCharge = () => Date.now() - exempleCharge < 1000;
document.addEventListener('click', e => { if (e.detail > 1 && exempleJusteCharge()) { e.preventDefault(); e.stopPropagation(); } }, true);
async function loadDemo() {
  if (!estVide() && !await confirmer("Ajouter les données d'exemple à tes données actuelles ?", 'Ajouter')) return;
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
  exempleCharge = Date.now();
}
/* Les données d'exemple sont marquées demo:true ; les anciens exemples sont reconnus à leur nom */
const DEMO_NOMS = ['Le Petit Zinc', 'Brasserie du Port', 'Sushi Kaze', 'Boulangerie Martin', 'Garage Central', 'SCI Les Tilleuls', 'Hôtel du Parc', 'Entrepôt Logistik'];
const estDemo = x => !!x.demo || DEMO_NOMS.includes(x.restaurant || x.entreprise || '');
const aDemo = () => [...state.abonnes, ...state.dossiers, ...state.events, ...state.aVoir].some(estDemo);
async function retirerExemple() {
  if (exempleJusteCharge()) return; // second toucher d'un double toucher sur « Charger un exemple »
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

/* ---------- Bouton + (téléphone) : l'action de la vue ; ailleurs, Noter. Appui long : les 4 actions ---------- */
const FAB_VUES = { planning: ['Nouveau RDV', 'plus'], kamifood: ['Nouvel abonné', 'plus'], dossiers: ['Nouveau dossier', 'plus'] };
function majFab(view) {
  const b = $('#fab');
  if (!b) return;
  const [label, ico] = FAB_VUES[view] || ['Noter une rencontre', 'noter'];
  if (b.getAttribute('aria-label') === label && b.firstElementChild) return;
  b.setAttribute('aria-label', label); b.title = label; b.innerHTML = ICONES[ico];
}
function actionPlus() {
  if (actionPlus.long) { actionPlus.long = false; return; } // le clic qui suit un appui long a déjà ouvert le menu
  fermerMenuPlus();
  const h = location.hash;
  if (h === '#planning') openEvent(null, (typeof planDate === 'string' && planDate) || today());
  else if (h === '#kamifood') openAbonne();
  else if (h === '#dossiers') openDossier();
  else { openContact(); focusNote(); }
}
const MENU_PLUS = [['noter', 'Noter quelqu\'un', 'noter'], ['rdv', 'Nouveau RDV', 'rdv'], ['dossier', 'Nouveau dossier', 'dossier'], ['abonne', 'Nouvel abonné', 'abonne']];
function ouvrirMenuPlus() {
  const m = $('#menu-plus');
  if (!m) return;
  m.innerHTML = MENU_PLUS.map(([k, l, i]) => `<button type="button" role="menuitem" data-action="${k}" onclick="choixPlus('${k}')"><span class="mp-ico">${ICONES[i]}</span>${esc(l)}</button>`).join('');
  m.hidden = false;
  $('#fab')?.setAttribute('aria-expanded', 'true');
  try { navigator.vibrate?.(12); } catch (e) { /* ignore */ }
  m.querySelector('button')?.focus({ preventScroll: true });
}
/* Ferme le menu s'il est ouvert ; renvoie vrai s'il l'était */
function fermerMenuPlus() {
  const m = $('#menu-plus');
  if (!m || m.hidden) return false;
  m.hidden = true;
  $('#fab')?.setAttribute('aria-expanded', 'false');
  return true;
}
function choixPlus(k) {
  fermerMenuPlus();
  if (k === 'noter') { openContact(); focusNote(); }
  else if (k === 'rdv') openEvent(null, (typeof planDate === 'string' && planDate) || today());
  else if (k === 'dossier') openDossier();
  else if (k === 'abonne') openAbonne();
}
(function appuiLongPlus() {
  const b = $('#fab');
  if (!b) return;
  let t = null;
  b.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    if (fermerMenuPlus()) { actionPlus.long = true; return; } // menu ouvert : ce toucher le referme seulement
    actionPlus.long = false;
    clearTimeout(t);
    t = setTimeout(() => { actionPlus.long = true; ouvrirMenuPlus(); }, 500);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(k => b.addEventListener(k, () => clearTimeout(t)));
  b.addEventListener('contextmenu', e => e.preventDefault());
  /* Un toucher ailleurs, un changement de vue : le menu se referme */
  document.addEventListener('pointerdown', e => { if (!e.target.closest || !e.target.closest('#menu-plus, #fab')) fermerMenuPlus(); }, true);
  window.addEventListener('hashchange', fermerMenuPlus);
})();

/* Une fiche fermée (✕, Annuler, Échap, enregistrement, geste retour) : menu ⋯ refermé, entrée d'historique retirée,
   toast rendu à la page, puis le rechargement mis de côté s'applique */
$('#modal').addEventListener('close', () => {
  if (modal().open) return; // une autre fiche s'est ouverte entre-temps
  fermerMenuFeuille(); modalQuitte(); placerToast();
  setTimeout(rechargementDiffere, 0);
});
/* Double clic ou double toucher sur ce qui ferme une fiche (Supprimer du menu ⋯, Enregistrer, ✕, Annuler) : la fiche part tout de suite
   et le second clic tomberait sur la page dessous (une autre fiche s'ouvrirait, un onglet changerait). Pendant 400 ms, un clic au même
   endroit (à 40 px près) ne fait rien ; ailleurs, et sur le toast (« Annuler »), tout répond aussitôt. */
let clicFiche = null, clicsAbsorbes = null;
function fermeeSousLeDoigt() {
  const e = clicFiche;
  if (!e || e !== clicEnCours || modal().open) return;
  clicFiche = null;
  clicsAbsorbes = { t: performance.now(), x: e.clientX, y: e.clientY };
}
document.addEventListener('click', e => {
  const a = clicsAbsorbes;
  if (a && e.isTrusted && performance.now() - a.t < 400 && Math.hypot(e.clientX - a.x, e.clientY - a.y) < 40 && !(e.target.closest && e.target.closest('#toast'))) {
    e.preventDefault(); e.stopPropagation(); return;
  }
  clicFiche = e.isTrusted && e.detail > 0 && modal().open && modal().contains(e.target) ? e : null;
}, true);
/* Après les gestionnaires du clic (✕, Annuler, Supprimer) : la fiche s'est-elle fermée ? (Enregistrer : vu à l'envoi du formulaire) */
window.addEventListener('click', e => { if (e === clicFiche) fermeeSousLeDoigt(); });
/* Menu ⋯ : refermé par un toucher ailleurs dans la fiche, ou par Échap (sans fermer la fiche) */
$('#modal').addEventListener('pointerdown', e => { if (!e.target.closest('.sheet-menu, .sheet-plus')) fermerMenuFeuille(); });
$('#modal').addEventListener('keydown', e => { if (e.key === 'Escape' && fermerMenuFeuille()) { e.preventDefault(); e.stopPropagation(); } });
$('#modal').addEventListener('cancel', e => { if (fermerMenuFeuille()) e.preventDefault(); });
/* Premier lancement : on demande au navigateur de protéger les données (il ne les videra pas pour faire de la place) */
function demanderProtection() {
  if (donneesIllisibles || state.prefs.persistDemande) return;
  state.prefs.persistDemande = true;
  try {
    const r = navigator.storage && navigator.storage.persist ? navigator.storage.persist() : null;
    if (r && r.then) r.then(ok => { state.prefs.persist = !!ok; save(); }).catch(() => {});
  } catch (e) { /* API absente */ }
  save();
}

render();
reprendreCouche();
demanderProtection();
