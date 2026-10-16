/* C3 — Chiffres justes : KamiFood proratisé, durées réelles, résiliés arrêtés, licence unique, états vides.
   Horloge figée au samedi 2026-10-10 09:00 (Paris). Les critères vus à l'écran sont vérifiés au téléphone (390x844)
   et à l'ordinateur (1366x800) ; api/stripe.js et api/jarvis.js sont vérifiés en Node avec de faux services. */
import { ouvrir, verifier, bilan, sansDefilement } from './outil.mjs';
import { lireStripe } from '../../api/stripe.js';
import { runJarvis } from '../../api/jarvis.js';
import path from 'node:path';

const KEY = 'kami-dashboard-v1';
const CAPTURES = process.env.CAPTURES || '';
const capture = async (p, nom) => { if (CAPTURES) await p.screenshot({ path: path.join(CAPTURES, nom + '.png') }); };
const sansScrollHorizontal = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const pause = (p, ms = 150) => p.waitForTimeout(ms);
const proche = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const MOI = { id: 'moi', createdAt: 1, interne: true, restaurant: 'Toufek · licence éditeur', contact: 'Toufek', statut: 'actif', prix: 0, engagement: 0, debut: '2026-01-01', formule: 'f3', notes: 'Licence éditeur KamiFood : activée en permanence, jamais facturée.' };
const etat = (extra = {}) => ({
  nom: 'Kami Groupe', dossiers: [], events: [], memoire: [], aVoir: [],
  abonnes: [MOI],
  formules: [{ id: 'f1', nom: 'Essentiel', prix: 79 }, { id: 'f2', nom: 'Pro', prix: 149 }, { id: 'f3', nom: 'Premium', prix: 249 }],
  rdvModele: [{ titre: 'Installation', jours: 7, duree: 60, mode: 'place' }],
  prefs: { periode: 'mois', theme: 'light', planVue: 'semaine', migrations: { rappelsRecuperes: true }, persistDemande: true, jourCopie: '2026-10-10' },
  stripe: null, rev: 3,
  ...extra,
});
const abonneActif = { id: 'a1', createdAt: 1, restaurant: 'Brasserie Test', contact: 'Paul', statut: 'actif', prix: 149, engagement: 12, debut: '2026-01-01', formule: 'f2', notes: '' };
const evenement = (id, extra = {}) => ({ id, titre: 'RDV ' + id, date: '2026-10-07', heure: '10:00', duree: 60, mode: 'visio', activite: 'cee', lien: '', fait: false, notes: '', important: false, ...extra });
/* Enregistre la fenêtre ouverte (bouton « Enregistrer ») */
const enregistrer = async p => { await p.click('#modal-form button[value="ok"]'); await pause(p, 200); };
/* Depuis F1 : volets (Essentiel / Plus d'options), date en puces (« Autre… » montre le champ), secteur en puces */
const volet = async (p, i) => { await p.click(`#modal #volet-${i}`); await pause(p, 60); };
const dateAutre = async (p, val) => { await p.click('#modal #f-date-autre'); await p.fill('#f-date', val); };
const secteur = async (p, k) => { await p.click(`#modal [aria-labelledby="lab-activite"] [data-v="${k}"]`); };

for (const [largeur, hauteur] of [[390, 844], [1366, 800]]) {
  const ecran = `${largeur}px`;

  /* 1, 2, 5, 9 : revenu au prorata, une seule règle de gains, addMonths borné, graphique = KPI */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, stockage: { [KEY]: etat({ abonnes: [MOI, abonneActif] }) } });
    const r = await p.evaluate(() => {
      const somme = g => g.gagne + g.prevu;
      return {
        semaine: somme(gainsPeriode('kamifood', '2026-10-05', '2026-10-11')),
        octobre: somme(gainsPeriode('kamifood', '2026-10-01', '2026-10-31')),
        annee: somme(gainsPeriode('kamifood', '2026-01-01', '2026-12-31')),
        passee: gainsPeriode('kamifood', '2026-09-28', '2026-10-04'),
        moisEntier: revenuAbonne(state.abonnes.find(a => a.id === 'a1'), '2026-02-01', '2026-02-28'),
        licence: revenuAbonne(state.abonnes.find(a => a.id === 'moi'), '2026-01-01', '2026-12-31'),
        addMonths: iso(addMonths(new Date(2027, 0, 31), 1)), bissextile: iso(addMonths(new Date(2028, 0, 31), 1)), recul: iso(addMonths(new Date(2026, 2, 31), -1)),
        serie: serieMois(6).at(-1).parts.find(x => x.k === 'kamifood').value, kpiMois: gains('kamifood', 'mois').gagne,
        gainsEntre: gainsEntre('kamifood', '2026-10-01', '2026-10-31'), moisFactures: typeof moisFactures,
      };
    });
    verifier(`${ecran} 1. semaine du 5 au 11 oct. : gagné + prévu ≈ 149 × 7 / 31 (33,65)`, proche(r.semaine, 149 * 7 / 31), String(r.semaine));
    verifier(`${ecran} 1. octobre entier : 149 ; année 2026 : 149 × 12`, proche(r.octobre, 149) && proche(r.annee, 149 * 12), `${r.octobre} · ${r.annee}`);
    verifier(`${ecran} 1. un mois entier vaut le prix (février), la licence éditeur ne rapporte rien`, proche(r.moisEntier, 149) && r.licence === 0, `${r.moisEntier} · ${r.licence}`);
    const attendu = 149 * 3 / 30 + 149 * 4 / 31;
    verifier(`${ecran} 2. semaine du 28 sept. au 4 oct. : ≈ 149×3/30 + 149×4/31 (34,13), et non 298`, proche(r.passee.gagne + r.passee.prevu, attendu) && r.passee.prevu === 0 && Math.round(r.passee.gagne * 100) === 3413, JSON.stringify(r.passee));
    verifier(`${ecran} 5. addMonths(31 janv. 2027, +1) = 28 févr. 2027 (et 29 en 2028, 28 févr. en reculant d'un mois depuis le 31 mars)`, r.addMonths === '2027-02-28' && r.bissextile === '2028-02-29' && r.recul === '2026-02-28', `${r.addMonths} · ${r.bissextile} · ${r.recul}`);
    verifier(`${ecran} 9. Stripe non synchronisé : dernière colonne de serieMois(6) = gains('kamifood', 'mois').gagne`, r.serie === r.kpiMois && r.gainsEntre === r.kpiMois && r.serie > 0, `${r.serie} · ${r.kpiMois}`);
    verifier(`${ecran} 1. moisFactures n'existe plus`, r.moisFactures === 'undefined', r.moisFactures);

    /* À l'écran : vue « Cette semaine », la carte KamiFood montre 6 jours encaissés (29 €) et 1 jour attendu (5 €) */
    await p.click('.seg button:has-text("Cette semaine")'); await pause(p);
    const carte = await p.evaluate(() => {
      const c = [...document.querySelectorAll('.act-card')].find(x => x.querySelector('.title span').textContent === 'KamiFood');
      const dd = [...c.querySelectorAll('dt')].find(x => x.textContent === 'Attendu').nextElementSibling;
      return { big: c.querySelector('.big').textContent, attendu: dd.textContent };
    });
    const eurTxt = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
    verifier(`${ecran} 1. accueil, cette semaine : KamiFood ${eurTxt(149 * 6 / 31)} encaissés + ${eurTxt(149 / 31)} attendus (plus un mois entier)`, carte.big === eurTxt(149 * 6 / 31) && carte.attendu === eurTxt(149 / 31), JSON.stringify(carte));
    const anneau = await p.evaluate(() => { const c = document.querySelector('.donut path'); const b = c && c.getBBox(); return b ? Math.round(b.width) : 0; });
    verifier(`${ecran} 1. donut à un seul secteur (KamiFood) : l'anneau complet est dessiné`, anneau >= 160, String(anneau));
    verifier(`${ecran} 1. accueil sans défilement horizontal`, await sansScrollHorizontal(p));
    await capture(p, `c3-accueil-semaine-${largeur}`);

    /* Gains : la note dit « KamiFood : estimation » ; avec Stripe, elle dit les factures et le graphique suit toujours le KPI */
    await p.evaluate(() => { location.hash = '#gains'; }); await pause(p);
    const note = await p.evaluate(() => document.querySelector('.note').textContent.replace(/\s+/g, ' '));
    verifier(`${ecran} 2. Gains, Stripe non synchronisé : la note précise « KamiFood : estimation »`, note.includes('KamiFood : estimation'), note.slice(0, 120));
    verifier(`${ecran} 2. Gains sans défilement horizontal`, await sansScrollHorizontal(p));
    await p.evaluate(() => { document.querySelector('.note').scrollIntoView({ block: 'center' }); });
    await capture(p, `c3-gains-note-${largeur}`);
    const s = await p.evaluate(() => {
      state.stripe = { sync: '2026-10-09T10:00:00Z', mrr: 149, filtre: '', factures: [{ id: 'in1', date: '2026-10-02', ht: 149 }, { id: 'in0', date: '2026-09-02', ht: 149 }], abonnes: [] };
      render();
      return { note: document.querySelector('.note').textContent, serie: serieMois(6).at(-1).parts.find(x => x.k === 'kamifood').value, kpi: gains('kamifood', 'mois').gagne };
    });
    verifier(`${ecran} 9. Stripe synchronisé : la note parle des factures Stripe, graphique = KPI = factures du mois`, !s.note.includes('estimation') && s.note.includes('factures Stripe') && s.serie === s.kpi && s.kpi === 149, `${s.serie} · ${s.kpi}`);
    verifier(`${ecran} 1-9. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* 1 bis (recette). Stripe synchronisé, factures payées le 1er de chaque mois (comme Stripe facture) : la facture du mois
     déjà payée n'est pas attendue une seconde fois. Octobre = 149 + 0, année = 1490 + 298, semaine sans facture = 0 + 149×7/31. */
  {
    const factures = Array.from({ length: 10 }, (_, i) => ({ id: 'in' + i, client: 'cus_a', abonnement: 'sub_a', date: `2026-${String(i + 1).padStart(2, '0')}-01`, ht: 149, ttc: 178.8 }));
    const stripeAbonne = { ...abonneActif, stripeId: 'sub_a', stripeClient: 'cus_a', stripeStatut: 'active' };
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, stockage: { [KEY]: etat({ abonnes: [MOI, stripeAbonne], stripe: { sync: '2026-10-09T10:00:00Z', mrr: 149, abonnes: [], factures, filtre: '' } }) } });
    const r = await p.evaluate(() => ({
      mois: gains('kamifood', 'mois'), annee: gains('kamifood', 'annee'), semaine: gainsPeriode('kamifood', '2026-10-05', '2026-10-11'),
      septembre: gainsPeriode('kamifood', '2026-09-01', '2026-09-30'),
      kpi: [...document.querySelectorAll('.kpis .kpi')].map(x => x.textContent.replace(/\s+/g, ' ').trim()).find(t => /^Gagné/.test(t)) || '',
    }));
    verifier(`${ecran} 1 bis. Stripe, factures au 1er : octobre = 149 encaissés + 0 attendu (et non + 101)`, r.mois.gagne === 149 && r.mois.prevu === 0 && /\+ 0 € attendus d'ici fin octobre/.test(r.kpi.replace(/\u202f|\u00a0/g, ' ')), JSON.stringify(r.mois) + ' · ' + r.kpi);
    verifier(`${ecran} 1 bis. Stripe, factures au 1er : année = 1490 + 298 (12 mois, pas 13)`, r.annee.gagne === 1490 && proche(r.annee.prevu, 298), JSON.stringify(r.annee));
    verifier(`${ecran} 1 bis. Stripe : une semaine sans facture = 0 + 149 × 7 / 31 ; un mois passé payé = 149 + 0`, r.semaine.gagne === 0 && proche(r.semaine.prevu, 149 * 7 / 31) && r.septembre.gagne === 149 && r.septembre.prevu === 0, JSON.stringify([r.semaine, r.septembre]));
    await p.evaluate(() => { location.hash = '#kamifood'; }); await pause(p);
    const kf = await p.evaluate(() => [...document.querySelectorAll('.kpis .kpi')].map(x => x.textContent.replace(/\s+/g, ' ').trim()).find(t => /Encaissé (cette année|\d{4})/.test(t)) || '');
    verifier(`${ecran} 1 bis. KamiFood : « + 298 € d'ici décembre »`, /\+ 298 € d'ici décembre/.test(kf.replace(/\u202f|\u00a0/g, ' ')), kf);
    verifier(`${ecran} 1 bis. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* 3 et 6 : une période « à prévoir » ne compte pas d'heures et garde sa durée 0 ; « à prévoir » exige une vraie période */
  {
    const donnees = etat({
      events: [
        evenement('rdv1'),
        evenement('ancienne', { titre: 'Fenêtre fournisseurs', date: '2026-10-06', heure: '', fin: '2026-10-20', duree: 60, mode: 'tache', activite: 'energie' }), // victime de l'ancien chargement
        evenement('zero', { titre: 'Tâche éclair', date: '2026-10-08', heure: '', duree: 0, mode: 'tache', activite: 'perso' }),
        evenement('sansduree', { titre: 'Sans durée', date: '2026-10-09', heure: '15:00', duree: '', activite: 'perso' }),
        evenement('periodeheure', { titre: 'Salon pro', date: '2026-10-07', fin: '2026-10-09', heure: '09:00', duree: 480, mode: 'place' }),
      ],
    });
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, stockage: { [KEY]: donnees } });
    const mesure = () => p.evaluate(() => {
      const sem = bilan('semaine');
      return {
        mois: temps('cee', 'mois').total, semaine: sem.tot.total + sem.perso.total,
        charge: serieSemaine(monday(new Date())).reduce((s, d) => s + d.parts.reduce((t, x) => t + x.value, 0), 0),
        tempsEntre: tempsEntre('cee', '2026-10-05', '2026-10-11'),
      };
    });
    const m0 = await p.evaluate(() => Object.fromEntries(state.events.map(e => [e.id, e.duree])));
    verifier(`${ecran} 3. migration dureesPeriodes : une période sans heure enregistrée à 60 min revient à 0`, m0.ancienne === 0, JSON.stringify(m0));
    verifier(`${ecran} 3. une durée 0 choisie reste 0, une durée absente devient 60 min`, m0.zero === 0 && m0.sansduree === 60, JSON.stringify(m0));
    const avant = await mesure();
    verifier(`${ecran} 3. les périodes (avec ou sans heure) ne comptent aucune heure : 1 h de CEE cette semaine`, avant.mois === 60 && avant.tempsEntre === 60 && avant.semaine === 60 + 60 && avant.charge === avant.semaine, JSON.stringify(avant));

    /* Saisie à l'écran : « Voir Karim », du lundi 5 oct. au 15 nov. (6 semaines), sans heure, à prévoir, CEE */
    await p.evaluate(() => openEvent()); await pause(p);
    await p.fill('#f-titre', 'Voir Karim');
    await dateAutre(p, '2026-10-05');
    await secteur(p, 'cee');
    await volet(p, 1);
    await p.fill('#f-fin', '2026-11-15');
    await p.check('#modal-form input[name="aPrevoir"]');
    await enregistrer(p);
    const lire = () => p.evaluate(() => { const e = state.events.find(x => x.titre === 'Voir Karim'); return e ? { duree: e.duree, aPrevoir: e.aPrevoir, fin: e.fin } : null; });
    const e1 = await lire(), apres = await mesure();
    await p.reload({ waitUntil: 'domcontentloaded' }); await pause(p, 300);
    await p.reload({ waitUntil: 'domcontentloaded' }); await pause(p, 300);
    const e3 = await lire(), recharge = await mesure();
    verifier(`${ecran} 3. période « à prévoir » de 6 semaines enregistrée avec duree 0`, e1 && e1.duree === 0 && e1.aPrevoir === true && e1.fin === '2026-11-15', JSON.stringify(e1));
    verifier(`${ecran} 3. duree toujours 0 après 2 rechargements`, e3 && e3.duree === 0 && e3.aPrevoir === true, JSON.stringify(e3));
    verifier(`${ecran} 3. temps('cee', 'mois').total et la charge de la semaine n'augmentent pas`, JSON.stringify(apres) === JSON.stringify(avant) && JSON.stringify(recharge) === JSON.stringify(avant), JSON.stringify({ avant, apres, recharge }));

    /* Planning, vue Semaine : l'en-tête de charge et (à l'ordinateur) les en-têtes de jours ignorent les périodes */
    await p.evaluate(() => { planDate = '2026-10-10'; location.hash = '#planning'; setPlanVue('semaine'); }); await pause(p);
    const plan = await p.evaluate(() => ({
      charge: document.querySelector('.load-head strong').textContent,
      jours: [...document.querySelectorAll('.tg-day em')].map(x => x.textContent),
      blocsPeriode: [...document.querySelectorAll('.tev')].filter(x => x.textContent.includes('Salon pro')).length,
      bandeaux: [...document.querySelectorAll('.bandeau, .day-card .title-txt, .periodes-card .title-txt')].filter(x => x.textContent.includes('Salon pro')).length,
    }));
    verifier(`${ecran} 3. Planning semaine : « 2 h planifiées » (1 h CEE + 1 h le 9 oct.), aucune période comptée`, plan.charge === '2 h planifiées' && (largeur <= 760 || JSON.stringify(plan.jours) === JSON.stringify(['1 h', '1 h'])), JSON.stringify(plan));
    verifier(`${ecran} 3. une période avec heure n'est plus dessinée en bloc horaire (seulement en bandeau)`, plan.blocsPeriode === 0 && plan.bandeaux >= 1, JSON.stringify(plan));
    await capture(p, `c3-planning-${largeur}`);

    /* 6. Jusqu'au = même date et « à prévoir » coché : ce n'est pas une période, donc pas « à prévoir » */
    await p.evaluate(() => openEvent()); await pause(p);
    await p.fill('#f-titre', 'Signature');
    await dateAutre(p, '2026-10-12');
    await p.fill('#f-heure', '11:00');
    await volet(p, 1);
    await p.fill('#f-fin', '2026-10-12');
    await p.check('#modal-form input[name="aPrevoir"]');
    await enregistrer(p);
    const sig = await p.evaluate(() => { const e = state.events.find(x => x.titre === 'Signature'); return e && { aPrevoir: e.aPrevoir, fin: e.fin, duree: e.duree }; });
    verifier(`${ecran} 6. RDV avec Jusqu'au = même date et « à prévoir » coché : aPrevoir === false`, sig && sig.aPrevoir === false && sig.fin === '' && sig.duree === 60, JSON.stringify(sig));
    verifier(`${ecran} 3-6. sans défilement horizontal`, await sansScrollHorizontal(p));
    verifier(`${ecran} 3-6. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* 4. Résilié sans date de fin : arrêté à la date de migration, signalé, corrigeable */
  {
    const resilie = { id: 'r1', createdAt: 1, restaurant: 'Pizzeria Fermée', contact: 'Luigi', statut: 'resilie', prix: 149, engagement: 12, debut: '2026-01-01', formule: 'f2', notes: '' };
    const actif2 = { ...abonneActif, id: 'a2', restaurant: 'Bistrot Partant' };
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, vue: 'kamifood', stockage: { [KEY]: etat({ abonnes: [MOI, resilie, actif2] }) } });
    const r = await p.evaluate(() => {
      const a = state.abonnes.find(x => x.id === 'r1');
      return { fin: a.fin, finEstimee: a.finEstimee, novembre: revenuAbonne(a, '2026-11-01', '2026-11-30'), decembre: revenuAbonne(a, '2026-12-01', '2026-12-31'),
        octobre: revenuAbonne(a, '2026-10-01', '2026-10-31'), stocke: JSON.parse(localStorage.getItem('kami-dashboard-v1')).abonnes.find(x => x.id === 'r1'),
        meta: [...document.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('Pizzeria Fermée'))?.querySelector('.meta')?.textContent || '' };
    });
    verifier(`${ecran} 4. résilié sans fin : fin = date de migration (2026-10-10), finEstimee true, écrit tout de suite`, r.fin === '2026-10-10' && r.finEstimee === true && r.stocke.fin === '2026-10-10' && r.stocke.finEstimee === true, JSON.stringify(r.stocke));
    verifier(`${ecran} 4. 0 € les mois suivants (novembre, décembre), octobre compté jusqu'au 10`, r.novembre === 0 && r.decembre === 0 && proche(r.octobre, 149 * 10 / 31), `${r.novembre} · ${r.decembre} · ${r.octobre}`);
    verifier(`${ecran} 4. KamiFood signale « fin estimée, à corriger »`, r.meta.includes('fin estimée, à corriger'), r.meta);
    await p.evaluate(() => openAbonne('r1')); await pause(p);
    const lab = await p.evaluate(() => { const l = document.querySelector('label[for="f-fin"]'); const b = l.querySelector('.estimee'); return { txt: l.textContent, couleur: b && getComputedStyle(b).color, h: l.getBoundingClientRect().height }; });
    verifier(`${ecran} 4. la fiche affiche « date de résiliation estimée, à corriger »`, /date de résiliation estimée, à corriger/i.test(lab.txt) && lab.h > 0, JSON.stringify(lab));
    const vue = await p.evaluate(() => { const r = document.querySelector('label[for="f-fin"]').getBoundingClientRect(), d = document.querySelector('#f-fin').getBoundingClientRect(); return { haut: r.top, bas: d.bottom, h: innerHeight }; });
    verifier(`${ecran} 4. (recette) la mention « estimée, à corriger » et la date se voient sans défiler, la fiche ne défile pas`, vue.haut >= 0 && vue.bas <= vue.h && await sansDefilement(p, '#modal') && await sansDefilement(p, '#modal .sheet-body'), JSON.stringify(vue));
    await capture(p, `c3-abonne-fin-estimee-${largeur}`);
    await p.fill('#f-fin', '2026-09-15');
    await enregistrer(p);
    const corr = await p.evaluate(() => { const a = state.abonnes.find(x => x.id === 'r1'); return { fin: a.fin, estimee: 'finEstimee' in a, octobre: revenuAbonne(a, '2026-10-01', '2026-10-31') }; });
    verifier(`${ecran} 4. une date corrigée n'est plus « estimée » et arrête le revenu à cette date`, corr.fin === '2026-09-15' && !corr.estimee && corr.octobre === 0, JSON.stringify(corr));
    /* Résilier dans la fiche sans donner de date : fin = aujourd'hui */
    await p.evaluate(() => openAbonne('a2')); await pause(p);
    await p.click('#modal [aria-labelledby="lab-statut"] [data-v="resilie"]');
    await enregistrer(p);
    const a2 = await p.evaluate(() => { const a = state.abonnes.find(x => x.id === 'a2'); return { statut: a.statut, fin: a.fin, novembre: revenuAbonne(a, '2026-11-01', '2026-11-30') }; });
    verifier(`${ecran} 4. résilié dans la fiche sans date : fin = aujourd'hui, plus rien ensuite`, a2.statut === 'resilie' && a2.fin === '2026-10-10' && a2.novembre === 0, JSON.stringify(a2));
    verifier(`${ecran} 4. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* 7. Licence éditeur unique et toujours interne */
  {
    const moiDecoche = { ...MOI, interne: false, notes: 'Ma note perso sur la licence' };
    const reel = { id: 'a3', createdAt: 1, restaurant: 'Autre labo', statut: 'actif', prix: 79, debut: '2026-01-01', interne: false, notes: '' };
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, vue: 'kamifood', stockage: { [KEY]: etat({ abonnes: [moiDecoche, reel, { ...MOI }] }) } });
    const compte = () => p.evaluate(() => { const m = state.abonnes.filter(a => a.id === 'moi'); return { n: m.length, interne: m.every(a => a.interne === true), notes: m[0]?.notes || '', total: state.abonnes.length, stocke: JSON.parse(localStorage.getItem('kami-dashboard-v1')).abonnes.filter(a => a.id === 'moi').length }; });
    const c1 = await compte();
    await p.reload({ waitUntil: 'domcontentloaded' }); await pause(p, 300);
    const c2 = await compte();
    verifier(`${ecran} 7. après rechargement, un seul abonné d'id 'moi', interne, sa note gardée`, c1.n === 1 && c1.interne && c1.stocke === 1 && c2.n === 1 && c2.interne && c2.total === 2 && c1.notes.includes('Ma note perso'), JSON.stringify({ c1, c2 }));
    await p.evaluate(() => openAbonne('moi')); await pause(p);
    const fiche = await p.evaluate(() => ({ caseInterne: !!document.querySelector('#modal-form input[name="interne"]'), supprimer: !![...document.querySelectorAll('#modal-form .btn.danger')].length }));
    verifier(`${ecran} 7. fiche de 'moi' : pas de case Licence éditeur à décocher, pas de Supprimer`, !fiche.caseInterne && !fiche.supprimer, JSON.stringify(fiche));
    await enregistrer(p);
    const apres = await p.evaluate(() => state.abonnes.find(a => a.id === 'moi').interne);
    verifier(`${ecran} 7. enregistrer la fiche de 'moi' garde interne = true`, apres === true, String(apres));
    await p.evaluate(() => openAbonne('a3')); await pause(p);
    const autre = await p.evaluate(() => !!document.querySelector('#modal-form input[name="interne"]'));
    verifier(`${ecran} 7. un autre abonné garde la case Licence éditeur`, autre);
    await p.evaluate(() => document.querySelector('#modal').close());
    verifier(`${ecran} 7. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }
  /* 7. Un « moi » devenu vrai restaurant (prix) n'est pas perdu : nouvel id, ses RDV le suivent ; la licence reste seule en 'moi' */
  {
    const moiReel = { ...MOI, interne: false, restaurant: 'Chez Toufek', prix: 149 };
    const ev = evenement('evm', { lien: 'a:moi', activite: 'kamifood' });
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, vue: 'kamifood', stockage: { [KEY]: etat({ abonnes: [moiReel, { ...MOI }], events: [ev] }) } });
    const r = await p.evaluate(() => {
      const moi = state.abonnes.filter(a => a.id === 'moi'), reel = state.abonnes.find(a => a.restaurant === 'Chez Toufek');
      return { n: moi.length, licence: moi[0]?.restaurant, interne: moi[0]?.interne, reelId: reel?.id, reelPrix: reel?.prix, lien: state.events.find(e => e.id === 'evm').lien };
    });
    verifier(`${ecran} 7. doublon 'moi' facturé : gardé sous un nouvel id avec son RDV, la licence reste seule en 'moi'`, r.n === 1 && r.licence === 'Toufek · licence éditeur' && r.interne === true && r.reelId && r.reelId !== 'moi' && r.reelPrix === 149 && r.lien === 'a:' + r.reelId, JSON.stringify(r));
    verifier(`${ecran} 7. (bis) aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* 7 ter (recette). Le seul « moi » est devenu un vrai restaurant facturé (la licence était portée par une autre fiche cochée) :
     il garde son revenu sous un nouvel id avec ses liens, et une licence 'moi' neuve est créée. Stable au rechargement. */
  {
    const moiFacture = { id: 'moi', createdAt: 1, interne: false, prix: 99, statut: 'actif', debut: '2026-01-01', restaurant: 'Mon resto', formule: 'f4', notes: '' };
    const autreLicence = { id: 'x9', createdAt: 2, interne: true, prix: 0, statut: 'actif', debut: '2026-01-01', restaurant: 'Toufek · ma licence', notes: '' };
    const ev = evenement('evr', { lien: 'a:moi', activite: 'kamifood' });
    const contact = { id: 'c1', createdAt: 1, nom: 'Paul', activite: 'kamifood', statut: 'suivi', attente: '', rappel: '2026-10-12', lien: 'a:moi', historique: [] };
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, vue: 'kamifood', stockage: { [KEY]: etat({ abonnes: [moiFacture, autreLicence], events: [ev], aVoir: [contact] }) } });
    const lire = () => p.evaluate(() => {
      const resto = state.abonnes.find(a => a.restaurant === 'Mon resto'), moi = state.abonnes.filter(a => a.id === 'moi');
      const g = gains('kamifood', 'mois'), stocke = JSON.parse(localStorage.getItem('kami-dashboard-v1'));
      return { restoId: resto?.id, interne: resto?.interne, prix: resto?.prix, mois: g.gagne + g.prevu, mrr: mrr(), nMoi: moi.length, licence: moi[0] && { interne: moi[0].interne, prix: moi[0].prix, statut: moi[0].statut },
        lienRdv: state.events.find(e => e.id === 'evr').lien, lienContact: state.aVoir.find(v => v.id === 'c1').lien, stockeMoi: stocke.abonnes.filter(a => a.id === 'moi').length, stockeResto: stocke.abonnes.find(a => a.restaurant === 'Mon resto')?.id };
    });
    const r1 = await lire();
    verifier(`${ecran} 7 ter. « moi » unique facturé : nouvel id, pas interne, 99 € ce mois, MRR 99`, r1.restoId && r1.restoId !== 'moi' && r1.interne === false && r1.prix === 99 && proche(r1.mois, 99) && r1.mrr === 99, JSON.stringify(r1));
    verifier(`${ecran} 7 ter. ses RDV et contacts le suivent ; une licence 'moi' neuve (interne, gratuite, active), écrite tout de suite`, r1.lienRdv === 'a:' + r1.restoId && r1.lienContact === 'a:' + r1.restoId && r1.nMoi === 1 && JSON.stringify(r1.licence) === '{"interne":true,"prix":0,"statut":"actif"}' && r1.stockeMoi === 1 && r1.stockeResto === r1.restoId, JSON.stringify(r1));
    await p.reload({ waitUntil: 'domcontentloaded' }); await pause(p, 300);
    const r2 = await lire();
    verifier(`${ecran} 7 ter. après rechargement, rien ne bouge (même id, une seule licence)`, JSON.stringify(r2) === JSON.stringify(r1), JSON.stringify(r2));
    await p.evaluate(id => openAbonne(id), r1.restoId); await pause(p);
    const fiche = await p.evaluate(() => ({ caseInterne: !!document.querySelector('#modal-form input[name="interne"]'), supprimer: [...document.querySelectorAll('#modal .sheet-menu button')].some(b => b.textContent === 'Supprimer'), prix: document.querySelector('#f-prix')?.value }));
    verifier(`${ecran} 7 ter. sa fiche reste corrigeable : case Licence éditeur, prix, Supprimer`, fiche.caseInterne && fiche.supprimer && fiche.prix === '99', JSON.stringify(fiche));
    await p.evaluate(() => document.querySelector('#modal').close());
    verifier(`${ecran} 7 ter. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }
  /* 7 quater (recette). Fiche de la licence : ni statut, ni prix, ni date de résiliation ; Enregistrer la remet active et gratuite,
     comme Kami l'impose (même une ancienne licence résiliée avec un prix). Une licence cochée avec un prix reste la licence. */
  {
    const licenceAbimee = { ...MOI, statut: 'resilie', prix: 249, fin: '2026-09-01', finEstimee: true };
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, vue: 'kamifood', stockage: { [KEY]: etat({ abonnes: [licenceAbimee] }) } });
    const avant = await p.evaluate(() => ({ n: state.abonnes.length, ids: state.abonnes.map(a => a.id) }));
    verifier(`${ecran} 7 quater. une licence cochée « éditeur » avec un prix reste la licence 'moi' (pas de seconde licence)`, avant.n === 1 && avant.ids[0] === 'moi', JSON.stringify(avant));
    await p.evaluate(() => openAbonne('moi')); await pause(p);
    const fiche = await p.evaluate(() => ({ statut: !!document.querySelector('#modal [aria-labelledby="lab-statut"]'), prix: !!document.querySelector('#f-prix'), fin: !!document.querySelector('#f-fin'),
      regle: document.querySelector('#modal .licence-regle')?.textContent || '', visible: (() => { const r = document.querySelector('#modal .licence-regle')?.getBoundingClientRect(); return !!r && r.height > 0 && r.bottom <= innerHeight; })() }));
    verifier(`${ecran} 7 quater. fiche de la licence : pas de Statut, pas de Prix, pas de date de résiliation ; la règle est écrite`, !fiche.statut && !fiche.prix && !fiche.fin && /toujours active, jamais facturée/.test(fiche.regle) && fiche.visible, JSON.stringify(fiche));
    verifier(`${ecran} 7 quater. fiche de la licence sans défilement`, await sansDefilement(p, '#modal') && await sansDefilement(p, '#modal .sheet-body'));
    await capture(p, `c3-fiche-licence-${largeur}`);
    await enregistrer(p);
    const apres = await p.evaluate(() => { const a = state.abonnes.find(x => x.id === 'moi'); return { statut: a.statut, prix: a.prix, fin: a.fin, estimee: 'finEstimee' in a, interne: a.interne, mois: gains('kamifood', 'mois').gagne }; });
    verifier(`${ecran} 7 quater. Enregistrer : licence active, gratuite, sans fin, interne, hors des gains`, apres.statut === 'actif' && apres.prix === 0 && apres.fin === '' && !apres.estimee && apres.interne === true && apres.mois === 0, JSON.stringify(apres));
    const carte = await p.evaluate(() => document.querySelector('.vide-licence')?.textContent || '');
    verifier(`${ecran} 7 quater. la carte KamiFood dit toujours « active »`, /Ta licence éditeur : active/.test(carte), carte);
    verifier(`${ecran} 7 quater. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* 8 bis (recette). Double toucher sur « Voir un exemple » (accueil) ou « Charger un exemple » (Réglages) : l'exemple se charge,
     le second toucher ne tombe sur rien (ni fiche, ni « Retirer l'exemple ») ; « Retirer » n'agit qu'après 1 s */
  for (const [vue, bouton] of [['dashboard', '.vide-accueil .lien-btn'], ['parametres', 'button:has-text("Charger un exemple")']]) {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, vue });
    const b = p.locator(bouton).first();
    await b.scrollIntoViewIfNeeded();
    const box = await b.boundingBox();
    await p.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    const tout = await p.evaluate(() => { retirerExemple(); return new Promise(ok => setTimeout(() => ok(document.querySelector('#confirm').open), 60)); });
    await pause(p, 300);
    const r = await p.evaluate(() => ({ confirm: document.querySelector('#confirm').open, fiche: document.querySelector('#modal').open, demo: aDemo(), abonnes: state.abonnes.length }));
    verifier(`${ecran} 8 bis. ${vue} : double toucher sur « ${vue === 'dashboard' ? 'Voir' : 'Charger'} un exemple » : chargé, ni fenêtre « Retirer ? » ni fiche ouverte`, !r.confirm && !r.fiche && r.demo && r.abonnes > 1 && !tout, JSON.stringify({ ...r, tout }));
    await pause(p, 900);
    await p.evaluate(() => { retirerExemple(); }); await pause(p, 200);
    const plusTard = await p.evaluate(() => document.querySelector('#confirm').open);
    verifier(`${ecran} 8 bis. ${vue} : une seconde plus tard, « Retirer l'exemple » demande bien confirmation`, plusTard === true);
    await p.evaluate(() => document.querySelector('#confirm').close('cancel')); await pause(p, 100);
    verifier(`${ecran} 8 bis. ${vue} : aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* 8. État neuf : seule la licence existe */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur });
    const accueil = await p.evaluate(() => {
      const n = [...document.querySelectorAll('.vide-accueil, .notice')].find(x => x.textContent.includes('Ton tableau de bord est vide')); // carte .vide-accueil depuis A1
      const r = n && n.getBoundingClientRect();
      return { ids: state.abonnes.map(a => a.id), visible: !!r && r.height > 0 && r.width > 0, vide: estVide() };
    });
    verifier(`${ecran} 8. état neuf (seule la licence) : la carte d'accueil vide est visible`, JSON.stringify(accueil.ids) === '["moi"]' && accueil.vide && accueil.visible, JSON.stringify(accueil));
    await capture(p, `c3-accueil-neuf-${largeur}`);
    await p.evaluate(() => { location.hash = '#kamifood'; }); await pause(p);
    const kf = await p.evaluate(() => {
      const c = document.querySelector('.vide-kf'), r = c && c.getBoundingClientRect();
      return { txt: c ? c.textContent.replace(/\s+/g, ' ') : '', visible: !!r && r.height > 0, table: !!document.querySelector('.table-wrap table'), licence: !!document.querySelector('.vide-licence') };
    });
    verifier(`${ecran} 8. KamiFood affiche « Aucun abonné » (la licence ne compte pas), licence accessible`, kf.txt.includes('Aucun abonné') && kf.visible && !kf.table && kf.licence, JSON.stringify(kf));
    verifier(`${ecran} 8. KamiFood vide sans défilement horizontal`, await sansScrollHorizontal(p));
    await capture(p, `c3-kamifood-vide-${largeur}`);
    await p.click('.vide-licence'); await pause(p);
    const ouverte = await p.evaluate(() => document.querySelector('#modal').open && document.querySelector('#f-restaurant').value);
    verifier(`${ecran} 8. toucher la ligne de licence ouvre sa fiche`, ouverte === 'Toufek · licence éditeur', String(ouverte));
    await p.evaluate(() => document.querySelector('#modal').close());
    await p.evaluate(() => { loadDemo(); }); await pause(p, 250);
    const demo = await p.evaluate(() => ({ confirm: document.querySelector('#confirm').open, abonnes: state.abonnes.length, dossiers: state.dossiers.length }));
    verifier(`${ecran} 8. loadDemo() sur un état neuf ne déclenche pas #confirm et charge l'exemple`, !demo.confirm && demo.abonnes > 1 && demo.dossiers > 0, JSON.stringify(demo));
    await p.evaluate(() => { loadDemo(); }); await pause(p, 250);
    const deux = await p.evaluate(() => document.querySelector('#confirm').open);
    verifier(`${ecran} 8. avec des données, loadDemo() demande toujours confirmation`, deux === true);
    await p.evaluate(() => document.querySelector('#confirm').close('cancel'));
    verifier(`${ecran} 8. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }
}

/* api/stripe.js : abonnements incomplets = essai, dates en heure de Paris, HT remises déduites */
{
  const sub = (id, status, extra = {}) => ({ id, status, start_date: Date.UTC(2026, 0, 1, 12) / 1000, customer: { id: 'cus_' + id, name: 'Resto ' + id }, items: { data: [{ price: { unit_amount: 14900, recurring: { interval: 'month' }, product: 'prod_kf', nickname: 'Pro' }, quantity: 1 }] }, ...extra });
  const reponses = {
    '/subscriptions': { data: [sub('s1', 'active'), sub('s2', 'incomplete'), sub('s3', 'incomplete_expired'), sub('s4', 'canceled', { ended_at: Date.UTC(2026, 8, 30, 22, 30) / 1000 })], has_more: false },
    '/products': { data: [{ id: 'prod_kf', name: 'KamiFood' }], has_more: false },
    '/invoices': { data: [{ id: 'in1', customer: 'cus_s1', subscription: 's1', status_transitions: { paid_at: Date.UTC(2026, 8, 30, 22, 30) / 1000 }, total_excluding_tax: 13410, subtotal_excluding_tax: 14900, subtotal: 14900, amount_paid: 16092, lines: { data: [] } }], has_more: false },
  };
  const fetchImpl = async url => { const chemin = new URL(url).pathname.replace('/v1', ''); return { ok: true, json: async () => reponses[chemin] }; };
  const out = await lireStripe({ key: 'rk_test', filtre: '', fetchImpl });
  const st = Object.fromEntries(out.abonnes.map(a => [a.stripeId, a.statut]));
  verifier('Stripe : incomplete et incomplete_expired deviennent « essai » (rien n\'est compté), active = actif, canceled = resilie', st.s1 === 'actif' && st.s2 === 'essai' && st.s3 === 'essai' && st.s4 === 'resilie' && out.mrr === 149, JSON.stringify(st));
  verifier('Stripe : dates en heure de Paris (payée le 30 sept. à 22 h 30 UTC = 1er oct.)', out.factures[0].date === '2026-10-01' && out.abonnes.find(a => a.stripeId === 's4').fin === '2026-10-01' && out.abonnes[0].debut === '2026-01-01', JSON.stringify([out.factures[0].date, out.abonnes[3].fin]));
  verifier('Stripe : le HT prend total_excluding_tax en premier (remise déduite)', out.factures[0].ht === 134.1, String(out.factures[0].ht));
}

/* api/jarvis.js : Kami suit les mêmes règles (périodes à 0 h, « à prévoir » seulement dans une période, licence intouchable, date estimée corrigée) */
{
  const appels = [
    { name: 'ajouter_rdv', input: { titre: 'Voir Karim', date: '2026-10-12', fin: '2026-11-22', aPrevoir: true, duree: 60, activite: 'cee' } },
    { name: 'ajouter_rdv', input: { titre: 'Signature', date: '2026-10-12', fin: '2026-10-12', heure: '11:00', aPrevoir: true, activite: 'energie' } },
    { name: 'modifier_rdv', input: { id: 'ancienne', titre: 'Fenêtre fournisseurs (prolongée)' } },
    { name: 'modifier_abonne', input: { id: 'moi', statut: 'resilie' } },
    { name: 'modifier_abonne', input: { id: 'r1', fin: '2026-09-15' } },
  ];
  const vus = [];
  let tour = 0;
  const client = { beta: { messages: { create: async params => {
    vus.push(params);
    if (tour++ === 0) return { content: appels.map((a, i) => ({ type: 'tool_use', id: 't' + i, name: a.name, input: a.input })), stop_reason: 'tool_use', usage: {}, model: 'faux' };
    return { content: [{ type: 'text', text: 'Fait.' }], stop_reason: 'end_turn', usage: {}, model: 'faux' };
  } } } };
  const state = {
    abonnes: [MOI, { id: 'r1', restaurant: 'Pizzeria', statut: 'resilie', prix: 149, debut: '2026-01-01', fin: '2026-10-10', finEstimee: true }],
    events: [evenement('ancienne', { titre: 'Fenêtre fournisseurs', date: '2026-10-06', heure: '', fin: '2026-10-20', duree: 60, mode: 'tache' })],
    dossiers: [], aVoir: [], formules: [], rdvModele: [], memoire: [], resume: {},
  };
  const out = await runJarvis({ messages: [{ role: 'user', content: 'test' }], state, aujourdhui: '2026-10-10', mode: 'text' }, client);
  const resultats = vus[1].messages.at(-1).content;
  const ajouts = out.actions.filter(a => a.op === 'add').map(a => a.item);
  const karim = ajouts.find(e => e.titre === 'Voir Karim'), signature = ajouts.find(e => e.titre === 'Signature');
  const modif = out.actions.find(a => a.op === 'update' && a.id === 'ancienne')?.fields || {};
  verifier('Kami : une période sans heure est ajoutée avec duree 0, « à prévoir » refusé sans vraie période', karim.duree === 0 && karim.aPrevoir === true && signature.aPrevoir === false && !signature.fin, JSON.stringify({ karim, signature }));
  verifier('Kami : modifier une ancienne période sans heure la remet à duree 0', modif.duree === 0, JSON.stringify(modif));
  verifier('Kami : la licence éditeur ne peut pas être résiliée', resultats[3].is_error === true && /licence éditeur/.test(resultats[3].content), resultats[3].content);
  const r1 = out.actions.find(a => a.op === 'update' && a.id === 'r1')?.fields || {};
  verifier('Kami : une vraie date de fin remplace la date estimée (finEstimee false)', r1.fin === '2026-09-15' && r1.finEstimee === false, JSON.stringify(r1));
  verifier('Kami : le persona explique le prorata, la licence et finEstimee', /prorata/.test(vus[0].system[0].text) && /finEstimee/.test(vus[0].system[0].text) && /licence éditeur/.test(vus[0].system[0].text));
}

bilan();
