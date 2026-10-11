/* C1 — Rappels fiables : plus aucun contact ne disparaît.
   Horloge figée au samedi 2026-10-10 09:00 (Paris) : 3 jours ouvrés plus tard = mardi 13 oct. */
import { ouvrir, verifier, bilan, sansDefilement } from './outil.mjs';

const AUJ = '2026-10-10';
const titre = p => p.$eval('#rencontre h2', e => e.textContent.trim());
/* Depuis N2, l'écran 0 est « Noter » : son bouton principal enregistre tout de suite ; « Ajuster… » mène aux étapes */
const continuer = async p => { await p.click((await titre(p)) === 'Noter' ? '#r-ajuster' : '#rencontre .r-foot .btn.primary'); await p.waitForTimeout(60); };
const sansScrollHorizontal = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
/* Avance dans la Rencontre jusqu'au récapitulatif ; renvoie les étapes vues et si chacune tenait sans défiler */
async function jusquAuRecap(p, surEtape) {
  const vues = [];
  for (let i = 0; i < 6; i++) {
    const t = await titre(p);
    vues.push({ t, ok: await sansDefilement(p, '#rencontre .r-body') });
    if (surEtape) await surEtape(t);
    if (t === 'On enregistre ?') break;
    await continuer(p);
  }
  return vues;
}
const enregistrer = async p => { await p.click('#rencontre .r-foot .btn.primary'); await p.waitForTimeout(80); };

for (const [largeur, hauteur] of [[390, 844], [1366, 800]]) {
  const ecran = `${largeur}px`;
  const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, exemple: true });

  /* 1. Nouveau contact, rien touché aux puces : rappel enregistré au mardi 13 oct., affiché en clair à l'étape 2 */
  await p.evaluate(() => openContact());
  await p.waitForTimeout(80);
  await p.fill('#r-note', 'croisé Karim de Karim SARL, on a parlé du KGD Pro');
  let texteEtape2 = '';
  const vues1 = await jusquAuRecap(p, async t => { if (t === 'Et ensuite ?') texteEtape2 = await p.$eval('#r-rappel-txt', e => e.textContent.trim()); });
  const recap1 = await p.$eval('#r-suite', e => ({ texte: e.textContent.trim(), gras: !!e.querySelector('b') }));
  await enregistrer(p);
  const dernier = await p.evaluate(() => ({ nom: state.aVoir.at(-1).nom, rappel: state.aVoir.at(-1).rappel, statut: state.aVoir.at(-1).statut }));
  verifier(`${ecran} 1. rappel par défaut enregistré au 2026-10-13`, dernier.rappel === '2026-10-13' && dernier.statut === 'suivi', JSON.stringify(dernier));
  verifier(`${ecran} 1. l'étape 2 affichait « → mardi 13 oct. »`, texteEtape2 === '→ mardi 13 oct.', texteEtape2);
  verifier(`${ecran} 1. le récapitulatif affiche la suite en gras`, recap1.gras && /La suite\s*Rappel mardi 13 oct\./.test(recap1.texte), recap1.texte);
  verifier(`${ecran} 10. Rencontre (nouveau contact) : aucune des 5 étapes ne défile`, vues1.length === 5 && vues1.every(v => v.ok), JSON.stringify(vues1));

  /* 2. Contact avec un rappel futur (14 oct.) : « Garder » choisi d'office, le rappel reste */
  const idFutur = await p.evaluate(() => {
    const v = { id: 'futur1', createdAt: Date.now(), nom: 'Claire', entreprise: 'Atelier Nord', activite: 'cee', priorite: 'normale', statut: 'suivi', attente: '', rappel: '2026-10-14', historique: [{ date: '2026-10-05', texte: 'Premier échange' }] };
    state.aVoir.push(v); save(); render(); return v.id;
  });
  await p.evaluate(id => openContact(id), idFutur);
  await p.waitForTimeout(60);
  let garder = null;
  const vues2 = await jusquAuRecap(p, async t => { if (t === 'Et ensuite ?') garder = await p.evaluate(() => ({ on: document.querySelector('#r-rappels .chip.on')?.textContent.trim(), txt: document.querySelector('#r-rappel-txt')?.textContent.trim() })); });
  await enregistrer(p);
  const rappelFutur = await p.evaluate(id => aVoir(id).rappel, idFutur);
  verifier(`${ecran} 2. rappel futur gardé (2026-10-14)`, rappelFutur === '2026-10-14', rappelFutur);
  verifier(`${ecran} 2. puce « Garder · mer. 14 oct. » allumée`, garder?.on === 'Garder · mer. 14 oct.' && garder?.txt === '→ mercredi 14 oct.', JSON.stringify(garder));
  verifier(`${ecran} 10. Rencontre (contact connu, puce Garder) : aucune étape ne défile`, vues2.length === 4 && vues2.every(v => v.ok), JSON.stringify(vues2));

  /* 3. Mme Roth (rappel aujourd'hui, attend ses infos) : « Contacté » puis Enregistrer sans rien changer */
  const roth0 = await p.evaluate(() => { const v = state.aVoir.find(x => x.nom === 'Mme Roth'); return { id: v.id, n: v.historique.length, rappel: v.rappel, attente: v.attente }; });
  await p.evaluate(() => { location.hash = '#dashboard'; });
  await p.waitForTimeout(100);
  await p.locator('li', { hasText: 'Mme Roth' }).first().locator('button', { hasText: 'Contacté' }).click();
  await p.waitForTimeout(80);
  await jusquAuRecap(p);
  await enregistrer(p);
  const roth1 = await p.evaluate(id => { const v = aVoir(id); return { n: v.historique.length, rappel: v.rappel, attente: v.attente, statut: v.statut }; }, roth0.id);
  verifier(`${ecran} 3. Mme Roth : rappel 2026-10-13, attente lui, une entrée de plus au journal`,
    roth0.rappel === AUJ && roth1.rappel === '2026-10-13' && roth1.attente === 'lui' && roth1.n === roth0.n + 1 && roth1.statut === 'suivi', JSON.stringify({ roth0, roth1 }));

  /* 4. « Clore le contact » + créneau « Rien » : contact clos */
  await p.evaluate(() => openContact(null, { nom: 'Paul', sujet: 'pas intéressé par la CEE' }));
  await p.waitForTimeout(60);
  await jusquAuRecap(p, async t => { if (t === 'Et ensuite ?') { await p.click('#r-rappels .chip.clore'); await p.waitForTimeout(40); } });
  const recapClos = await p.$eval('#r-suite', e => e.textContent.trim());
  await enregistrer(p);
  const paul = await p.evaluate(() => { const v = state.aVoir.at(-1); return { nom: v.nom, statut: v.statut, rappel: v.rappel, attente: v.attente }; });
  verifier(`${ecran} 4. « Clore le contact » : statut clos, sans rappel ni attente`, paul.nom === 'Paul' && paul.statut === 'clos' && paul.rappel === '' && paul.attente === '', JSON.stringify(paul) + ' · ' + recapClos);

  /* 5. Aucune suite (date vidée, créneau Rien) : refusé, retour à l'étape 2, données intactes */
  const julienId = await p.evaluate(() => state.aVoir.find(x => x.nom === 'Julien').id);
  const avant = await p.evaluate(() => JSON.stringify(state.aVoir));
  await p.evaluate(id => openContact(id), julienId);
  await p.waitForTimeout(60);
  let rappelJ = '';
  const vues5 = await jusquAuRecap(p, async t => {
    if (t === 'Et ensuite ?') { await p.fill('#r-rappel', ''); await p.dispatchEvent('#r-rappel', 'change'); await p.waitForTimeout(40); rappelJ = await p.evaluate(() => renc.rappelJ + '|' + renc.rappel); }
  });
  const manque = await p.$eval('#r-suite', e => e.classList.contains('manque'));
  await enregistrer(p);
  const apres = await p.evaluate(() => JSON.stringify(state.aVoir));
  const toastTxt = await p.$eval('#toast', e => e.textContent.trim());
  const retour = await titre(p);
  verifier(`${ecran} 5. sans suite : enregistrement refusé, toast, retour à l'étape 2, state.aVoir inchangé`,
    rappelJ === 'x|' && manque && toastTxt === 'Choisis une suite : un rappel, un créneau ou clore' && retour === 'Et ensuite ?' && apres === avant,
    JSON.stringify({ rappelJ, manque, toastTxt, retour, inchange: apres === avant }));
  verifier(`${ecran} 10. Rencontre (récapitulatif sans suite, retour étape 2) : aucune étape ne défile`, vues5.every(v => v.ok) && await sansDefilement(p, '#rencontre .r-body'), JSON.stringify(vues5));
  await p.evaluate(() => fermerRencontre());

  /* 10. Étape 3 avec chaque créneau ouvert : jamais de défilement */
  await p.evaluate(() => openContact(null, { nom: 'Test', sujet: 'créneaux' }));
  await p.waitForTimeout(60);
  await continuer(p); await continuer(p); await continuer(p);
  const creneaux = [];
  for (const c of ['date', 'semaine', 'periode']) {
    await p.evaluate(c => rencSet('creneau', c), c);
    await p.waitForTimeout(30);
    creneaux.push(await sansDefilement(p, '#rencontre .r-body'));
  }
  await continuer(p);
  creneaux.push(await sansDefilement(p, '#rencontre .r-body'));
  verifier(`${ecran} 10. Étape « Dans le planning ? » (jour, semaine, période) et récapitulatif : aucun défilement`, creneaux.every(Boolean), JSON.stringify(creneaux));
  await p.evaluate(() => fermerRencontre());

  /* 6a. Contact « RDV planifié » dont on supprime le RDV (bouton Supprimer de la fiche RDV) : il repasse en suivi et revient aujourd'hui */
  const ids6 = await p.evaluate(() => {
    const v = { id: 'plan1', createdAt: Date.now(), nom: 'Hugo', entreprise: 'Garage Est', activite: 'energie', priorite: 'normale', statut: 'planifie', attente: '', rappel: '', historique: [{ date: '2026-10-01', texte: 'RDV calé' }] };
    const e = { id: 'evplan1', date: '2026-10-15', heure: '10:00', duree: 30, mode: 'visio', titre: 'Hugo · Garage Est · Présentation', activite: 'energie', lien: 'c:plan1', fait: false, notes: '' };
    v.eventId = e.id; state.aVoir.push(v); state.events.push(e); save(); render(); return { v: v.id, e: e.id };
  });
  await p.evaluate(id => openEvent(id), ids6.e);
  await p.waitForTimeout(80);
  await p.click('#modal .sheet-plus'); // depuis F1, Supprimer est dans le menu ⋯ de la fiche
  await p.click('#modal .sheet-menu .danger');
  await p.waitForTimeout(80);
  const hugo = await p.evaluate(id => { const v = aVoir(id); const r = rappelsContacts().find(x => x.contact === id); return { statut: v.statut, eventId: v.eventId, rappel: v.rappel, dansRappels: !!r, date: r?.date }; }, ids6.v);
  verifier(`${ecran} 6. RDV supprimé : contact repassé en suivi et dans rappelsContacts() aujourd'hui`,
    hugo.statut === 'suivi' && hugo.eventId === '' && hugo.rappel === AUJ && hugo.dansRappels && hugo.date === AUJ, JSON.stringify(hugo));

  /* 6b. Contact « RDV planifié » au RDV passé (8 oct.) : « RDV passé · quelle suite ? » */
  const ids6b = await p.evaluate(() => {
    const v = { id: 'plan2', createdAt: Date.now(), nom: 'Inès', entreprise: 'Boulangerie Sud', activite: 'foncier', priorite: 'normale', statut: 'planifie', attente: '', rappel: '', historique: [{ date: '2026-10-01', texte: 'RDV calé' }] };
    const e = { id: 'evplan2', date: '2026-10-08', heure: '11:00', duree: 30, mode: 'place', titre: 'Inès · Boulangerie Sud · Présentation', activite: 'foncier', lien: 'c:plan2', fait: false, notes: '' };
    v.eventId = e.id; state.aVoir.push(v); state.events.push(e); save(); location.hash = '#dashboard'; render(); return v.id;
  });
  await p.waitForTimeout(80);
  const ines = await p.evaluate(id => rappelsContacts().find(x => x.contact === id), ids6b);
  const inesAccueil = (await p.locator('li', { hasText: 'Inès' }).allTextContents()).join(' | ');
  verifier(`${ecran} 6. RDV passé (8 oct.) : dans rappelsContacts() avec « RDV passé · quelle suite ? »`,
    !!ines && ines.sousTitre === 'RDV passé · quelle suite ?' && ines.date === '2026-10-09' && /quelle suite/.test(inesAccueil), JSON.stringify(ines));

  /* 6c. RDV coché « fait » : le contact repasse en suivi et un toast propose « Noter la suite » */
  const ids6c = await p.evaluate(() => {
    const v = { id: 'plan3', createdAt: Date.now(), nom: 'Léa', entreprise: 'Hôtel Rhin', activite: 'kamifood', priorite: 'normale', statut: 'planifie', attente: '', rappel: '', historique: [] };
    const e = { id: 'evplan3', date: '2026-10-10', heure: '15:00', duree: 30, mode: 'visio', titre: 'Léa · démo KamiFood', activite: 'kamifood', lien: 'c:plan3', fait: false, notes: '' };
    v.eventId = e.id; state.aVoir.push(v); state.events.push(e); save(); location.hash = '#dashboard'; render(); return { v: v.id, e: e.id };
  });
  await p.waitForTimeout(80);
  await p.locator('li', { hasText: 'Léa · démo KamiFood' }).first().locator('input[type="checkbox"]').check();
  await p.waitForTimeout(100);
  const lea = await p.evaluate(id => ({ statut: aVoir(id).statut, rappel: aVoir(id).rappel, toast: document.querySelector('#toast').textContent, bouton: !!document.querySelector('#toast.show .toast-action') }), ids6c.v);
  await p.click('#toast .toast-action');
  await p.waitForTimeout(80);
  const ouverte = await p.evaluate(() => !document.querySelector('#rencontre').hidden && renc?.v?.id);
  verifier(`${ecran} 6. RDV fait : contact en suivi, toast « Noter la suite » qui ouvre la prise de contact`,
    lea.statut === 'suivi' && lea.rappel === AUJ && lea.bouton && /RDV fait avec Léa/.test(lea.toast) && ouverte === ids6c.v, JSON.stringify({ lea, ouverte }));
  await p.evaluate(() => fermerRencontre());
  verifier(`${ecran} toast d'action sans défilement horizontal`, await sansScrollHorizontal(p));

  /* 7. Liens : un RDV lié à un contact clos garde son lien ; une fiche contact ne propose pas de se lier à elle-même */
  const ids7 = await p.evaluate(() => {
    const v = { id: 'clos1', createdAt: Date.now(), nom: 'Marc', entreprise: 'Imprimerie', activite: 'cee', priorite: 'normale', statut: 'clos', attente: '', rappel: '', historique: [] };
    const e = { id: 'evclos1', date: '2026-10-20', heure: '09:00', duree: 30, mode: 'visio', titre: 'Marc · point', activite: 'cee', lien: 'c:clos1', fait: false, notes: '' };
    state.aVoir.push(v); state.events.push(e); save(); render(); return { v: v.id, e: e.id };
  });
  await p.evaluate(id => openEvent(id), ids7.e);
  await p.waitForTimeout(80);
  const optClos = await p.$eval('#f-lien', s => ({ val: s.value, label: s.selectedOptions[0]?.textContent }));
  await p.click('#modal button[value="ok"]');
  await p.waitForTimeout(80);
  const lienApres = await p.evaluate(id => state.events.find(e => e.id === id).lien, ids7.e);
  verifier(`${ecran} 7. RDV lié à un contact clos : lien inchangé après enregistrement`, lienApres === 'c:clos1' && optClos.val === 'c:clos1' && /\(clos\)/.test(optClos.label), JSON.stringify({ lienApres, optClos }));
  await p.evaluate(id => openAVoir(id), julienId);
  await p.waitForTimeout(80);
  const optionsJulien = await p.$$eval('#f-lien option', os => os.map(o => o.value));
  await p.evaluate(() => document.querySelector('#modal').close());
  verifier(`${ecran} 7. fiche contact : le select Client lié ne contient pas le contact lui-même`, !optionsJulien.includes('c:' + julienId) && optionsJulien.includes(''), optionsJulien.join(','));
  /* Supprimer un contact libère les RDV qui le citaient */
  await p.evaluate(() => { supprimerAVoir('clos1'); }); // depuis F1 : sans confirmation, avec « Annuler » dans le toast
  await p.waitForTimeout(80);
  const lienOrphelin = await p.evaluate(() => state.events.find(e => e.id === 'evclos1').lien);
  verifier(`${ecran} supprimer un contact remet à vide le lien des RDV qui le citaient`, lienOrphelin === '', lienOrphelin);

  /* 9. Importance : Julien (je lui dois des infos) en alerte, Mme Roth (j'attends ses infos) non */
  const imp = await p.evaluate(() => {
    const j = state.aVoir.find(x => x.nom === 'Julien'); j.rappel = today();
    const r = state.aVoir.find(x => x.nom === 'Mme Roth'); r.rappel = today();
    const l = rappelsContacts();
    return { julien: l.find(x => x.contact === j.id)?.important, roth: l.find(x => x.contact === r.id)?.important };
  });
  verifier(`${ecran} 9. rappelsContacts() : Julien important, Mme Roth non`, imp.julien === true && imp.roth === false, JSON.stringify(imp));

  /* Utilitaires partagés : jourOuvre, rappelDans, RDV inclus jamais un week-end */
  const outils = await p.evaluate(() => ({
    sam: iso(jourOuvre(parse('2026-10-10'))), dim: iso(jourOuvre(parse('2026-10-11'))), lun: iso(jourOuvre(parse('2026-10-12'))),
    r2: rappelDans(2), r3: rappelDans(3), r7: rappelDans(7),
    inclus: (() => { const a = { id: 'x', debut: '2026-10-10' }; const n = state.events.length; planifierInclus(a); const evs = state.events.splice(n); return evs.every(e => ![0, 6].includes(parse(e.date).getDay())); })(),
  }));
  verifier(`${ecran} jourOuvre / rappelDans / planifierInclus : jamais un week-end`,
    outils.sam === '2026-10-12' && outils.dim === '2026-10-12' && outils.lun === '2026-10-12' && outils.r2 === '2026-10-12' && outils.r3 === '2026-10-13' && outils.r7 === '2026-10-19' && outils.inclus, JSON.stringify(outils));
  verifier(`${ecran} code mort retiré (AV_OUVERTS, choisirCreneau, choisirRappel, marquerAVoir)`,
    await p.evaluate(() => ['choisirCreneau', 'choisirRappel', 'marquerAVoir'].every(n => typeof window[n] === 'undefined') && typeof AV_OUVERTS === 'undefined'));

  for (const v of ['dashboard', 'contacts', 'planning']) {
    await p.evaluate(h => { location.hash = '#' + h; }, v);
    await p.waitForTimeout(100);
    verifier(`${ecran} #${v} sans défilement horizontal`, await sansScrollHorizontal(p));
  }
  verifier(`${ecran} aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 8. Migration « rappelsRecuperes » : 3 contacts en suivi sans rappel reviennent aujourd'hui, une seule fois, sans rien perdre */
{
  const contact = (id, nom) => ({ id, createdAt: 1, nom, entreprise: '', activite: 'cee', priorite: 'normale', statut: 'suivi', attente: 'lui', rappel: '', historique: [{ date: '2026-09-01', texte: 'Vu au salon ' + nom }] });
  const donnees = { nom: 'Kami Groupe', dossiers: [], events: [], abonnes: [], memoire: [], aVoir: [contact('m1', 'Anne'), contact('m2', 'Bruno'), contact('m3', 'Chloé')], prefs: { periode: 'mois', theme: 'light' } };
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, stockage: { 'kami-dashboard-v1': donnees } });
  const etat1 = await p.evaluate(() => ({ n: state.aVoir.length, rappels: state.aVoir.map(v => v.rappel), flag: state.prefs.migrations?.rappelsRecuperes, journaux: state.aVoir.map(v => v.historique.length), stocke: localStorage.getItem('kami-dashboard-v1') }));
  verifier('8. migration : 3 contacts, tous avec rappel 2026-10-10, drapeau posé',
    etat1.n === 3 && etat1.rappels.every(r => r === AUJ) && etat1.flag === true && etat1.journaux.every(n => n === 1), JSON.stringify({ ...etat1, stocke: undefined }));
  verifier('8. migration écrite tout de suite dans le stockage', JSON.parse(etat1.stocke).prefs.migrations.rappelsRecuperes === true && JSON.parse(etat1.stocke).aVoir.every(v => v.rappel === AUJ));
  const avant = await p.evaluate(() => JSON.stringify(state));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(250);
  const apres = await p.evaluate(() => JSON.stringify(state));
  const stocke2 = await p.evaluate(() => localStorage.getItem('kami-dashboard-v1'));
  verifier('8. second rechargement : plus rien ne change', apres === avant && stocke2 === etat1.stocke);
  const dash = await p.evaluate(() => rappelsContacts().length);
  verifier('8. les 3 contacts récupérés sont dans les rappels du jour', dash === 3, String(dash));
  verifier('8. aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}
/* 8 bis. Migration des « RDV planifié » sans RDV valable ; un RDV à venir n'est pas touché ; le drapeau existant empêche de rejouer */
{
  const v = (id, nom, eventId) => ({ id, createdAt: 1, nom, entreprise: '', activite: 'cee', priorite: 'normale', statut: 'planifie', attente: '', rappel: '', eventId, historique: [{ date: '2026-09-01', texte: 'RDV' }] });
  const ev = (id, date, fait = false) => ({ id, date, heure: '10:00', duree: 30, mode: 'visio', titre: 'RDV ' + id, activite: 'cee', lien: '', fait, notes: '' });
  const donnees = { nom: 'Kami Groupe', dossiers: [], abonnes: [], memoire: [], prefs: { periode: 'mois' },
    events: [ev('e1', '2026-10-05'), ev('e2', '2026-10-20'), ev('e3', '2026-10-12', true), ev('e4', '2026-10-10')],
    aVoir: [v('p1', 'Passé', 'e1'), v('p2', 'À venir', 'e2'), v('p3', 'Fait', 'e3'), v('p4', 'Aujourd\'hui', 'e4'), v('p5', 'Disparu', 'zzz')] };
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, stockage: { 'kami-dashboard-v1': donnees } });
  const r = await p.evaluate(() => Object.fromEntries(state.aVoir.map(v => [v.id, v.statut + '|' + v.rappel])));
  verifier('8 bis. RDV passé, fait ou disparu → suivi avec rappel aujourd\'hui ; RDV à venir ou du jour inchangé',
    r.p1 === 'suivi|' + AUJ && r.p3 === 'suivi|' + AUJ && r.p5 === 'suivi|' + AUJ && r.p2 === 'planifie|' && r.p4 === 'planifie|', JSON.stringify(r));
  await fermer();
  const deja = { ...donnees, prefs: { periode: 'mois', migrations: { rappelsRecuperes: true } } };
  const o2 = await ouvrir({ largeur: 390, hauteur: 844, stockage: { 'kami-dashboard-v1': deja } });
  const r2 = await o2.p.evaluate(() => state.aVoir.map(v => v.statut).join(','));
  verifier('8 bis. drapeau déjà posé : la migration ne rejoue pas', r2 === 'planifie,planifie,planifie,planifie,planifie', r2);
  verifier('8 bis. aucune erreur JS', erreurs.length === 0 && o2.erreurs.length === 0, [...erreurs, ...o2.erreurs].join(' | '));
  await o2.fermer();
}
bilan();
