/* F1 — Fiches RDV, Dossier, Abonné et Contact sans aucun défilement, l'essentiel d'abord, « Annuler » au lieu de « Êtes-vous sûr ? ».
   Horloge figée au samedi 2026-10-10 (Paris). Chaque critère est vérifié au téléphone (390x844, tactile) et à l'ordinateur (1366x800).
   Captures : CAPTURES=<dossier> node tests/e2e/F1.mjs */
import { ouvrir, verifier, bilan } from './outil.mjs';
import path from 'node:path';

const CAPTURES = process.env.CAPTURES || '';
const capture = async (p, nom) => { if (CAPTURES) await p.screenshot({ path: path.join(CAPTURES, nom + '.png') }); };
const pause = (p, ms = 120) => p.waitForTimeout(ms);
const sansScrollHorizontal = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
/* Une fiche tient sans défiler : #modal et son corps, et le bouton Enregistrer est dans l'écran */
const mesure = p => p.evaluate(() => {
  const m = document.querySelector('#modal'), b = m.querySelector('.sheet-body'), btn = m.querySelector('.modal-actions .btn.primary');
  const r = btn.getBoundingClientRect();
  return { modal: m.scrollHeight <= m.clientHeight + 1, corps: !!b && b.scrollHeight <= b.clientHeight + 1, bas: r.bottom <= innerHeight && r.height > 0,
    h: `${m.scrollHeight}/${m.clientHeight} corps ${b && b.scrollHeight}/${b && b.clientHeight} btn ${Math.round(r.bottom)}/${innerHeight}` };
});
const ok = m => m.modal && m.corps && m.bas;
const volet = async (p, i) => { await p.click(`#modal #volet-${i}`); await pause(p, 60); };
const fermerFiche = async p => { await p.evaluate(() => { if (document.querySelector('#modal').open) document.querySelector('#modal').close(); }); await pause(p, 150); };
const toastTexte = p => p.evaluate(() => { const t = document.querySelector('#toast'); return { show: t.classList.contains('show'), msg: t.firstChild ? t.firstChild.textContent : '', action: t.querySelector('.toast-action')?.textContent || '' }; });
const visible = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }, sel);

const NOTES300 = ('Signature du contrat de fourniture : apporter le mandat, les deux dernières factures, le RIB et le Kbis. '
  + 'Le gérant veut comparer avec l\'offre de son fournisseur actuel avant de signer ; prévoir le tableau comparatif imprimé. ').repeat(2).slice(0, 300);

/* Données de test : un RDV aux notes longues, un contact au journal de 20 entrées, Mme Roth avec un téléphone, un abonné avec des RDV passés et à venir */
const preparer = p => p.evaluate(notes => {
  const garage = state.dossiers.find(d => d.entreprise === 'Garage Central');
  state.events.push({ id: 'ev300', titre: 'Signature énergie · Boulangerie Martin', date: '2026-10-14', heure: '10:00', duree: 60, mode: 'place', activite: 'energie', lien: 'd:' + garage.id, fait: false, notes, important: true });
  const h = [];
  for (let i = 0; i < 20; i++) h.push({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, texte: i % 3 ? `Appel n° ${i + 1} : point sur le dossier CEE, il attend le retour du délégataire sur la prime pour l'éclairage LED de l'entrepôt` : `Échange n° ${i + 1}` });
  state.aVoir.push({ id: 'c20', createdAt: 1, nom: 'Karim Benali', entreprise: 'Logistique Est', activite: 'cee', priorite: 'haute', statut: 'suivi', attente: 'moi', rappel: '2026-10-12', tel: '+33 6 11 22 33 44', email: 'karim@logistique-est.fr', ville: 'Illkirch', lien: '', notes: 'Préfère être appelé le matin.', historique: h });
  const roth = state.aVoir.find(v => v.nom === 'Mme Roth'); roth.tel = '06 12 34 56 78';
  state.abonnes.push({ id: 'abX', createdAt: 1, restaurant: 'Bistrot Supprimé', contact: 'Léo', ville: 'Obernai', statut: 'actif', prix: 149, engagement: 12, debut: '2026-03-01', formule: state.formules[1].id, notes: '' });
  const e = (id, date, fait) => ({ id, titre: 'RDV ' + id, date, heure: '10:00', duree: 45, mode: 'visio', activite: 'kamifood', lien: 'a:abX', fait, notes: '' });
  state.events.push(e('abPasse', '2026-10-05', false), e('abFait', '2026-10-01', true), e('abJour', '2026-10-10', false), e('abFutur', '2026-10-20', false), e('abFuturFait', '2026-10-21', true));
  state.aVoir.push({ id: 'cLie', createdAt: 1, nom: 'Léo', entreprise: 'Bistrot Supprimé', activite: 'kamifood', priorite: 'normale', statut: 'suivi', attente: '', rappel: '2026-10-15', lien: 'a:abX', historique: [] });
  save(); render();
  return { garage: garage.id, roth: roth.id, abonne: state.abonnes.find(a => a.restaurant === 'Le Petit Zinc').id };
}, NOTES300);

for (const [largeur, hauteur] of [[390, 844], [1366, 800]]) {
  const ecran = `${largeur}px`;
  const telephone = largeur <= 760;
  const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, exemple: true });
  const avertissements = [];
  p.on('console', m => { if (m.type() === 'warning' && /verifierSansAscenseur/.test(m.text())) avertissements.push(m.text()); });
  await p.evaluate(() => localStorage.setItem('kgd-debug', '1'));
  await pause(p, 2600); // le toast « Exemple chargé » est passé
  const ids = await preparer(p);

  /* ---------- 1, 2, 7. Chaque fiche, chaque volet : rien ne défile, Enregistrer dans l'écran, champs en 16 px ---------- */
  const fiches = [
    ['openEvent()', () => p.evaluate(() => openEvent())],
    ['openEvent(300 caractères de notes)', () => p.evaluate(() => openEvent('ev300'))],
    ['openDossier()', () => p.evaluate(() => openDossier())],
    ['openDossier(id)', () => p.evaluate(id => openDossier(id), ids.garage)],
    ['openAbonne()', () => p.evaluate(() => openAbonne())],
    ['openAbonne(id)', () => p.evaluate(id => openAbonne(id), ids.abonne)],
    ['openAVoir(20 entrées de journal)', () => p.evaluate(() => openAVoir('c20'))],
  ];
  const tailles = [];
  for (const [nom, ouvrirFiche] of fiches) {
    await ouvrirFiche(); await pause(p, 300);
    const n = await p.evaluate(() => document.querySelectorAll('#modal .pane').length);
    const res = [];
    for (let i = 0; i < n; i++) {
      await volet(p, i);
      const m = await mesure(p);
      res.push({ volet: i, ...m });
      tailles.push(...await p.evaluate(() => [...document.querySelectorAll('#modal input, #modal select, #modal textarea')].map(e => `${e.name || e.id}:${getComputedStyle(e).fontSize}`)));
      await capture(p, `f1-${largeur}-${nom.replace(/[^a-z0-9]+/gi, '-')}-${i}`);
    }
    verifier(`${ecran} 1. ${nom} : ${n} volets, aucun ne défile (#modal et corps), Enregistrer dans l'écran`, n >= 2 && res.every(ok), res.map(r => `${r.volet}: ${r.h}`).join(' | '));
    if (nom.startsWith('openAVoir')) {
      /* « Tout le journal (20) » : la vue paginée par 8 (‹ ›) tient aussi, sur chaque page */
      await volet(p, 0);
      const lien = await p.evaluate(() => [...document.querySelectorAll('#modal .lien-btn')].map(b => b.textContent.trim()));
      const cinq = await p.evaluate(() => document.querySelectorAll('#fiche-vue .journal li').length);
      await p.click('#modal .lien-btn'); await pause(p, 80);
      const pages = [];
      for (let k = 0; k < 3; k++) {
        pages.push({ ...await mesure(p), n: await p.evaluate(() => document.querySelectorAll('#fiche-vue .journal li').length), page: await p.evaluate(() => document.querySelector('#fiche-vue .pager span')?.textContent) });
        if (k === 0) await capture(p, `f1-${largeur}-journal-complet`);
        if (k < 2) { await p.click('#modal .pager button[aria-label="Plus anciens"]'); await pause(p, 60); }
      }
      verifier(`${ecran} 1. fiche contact : les 5 dernières lignes puis « Tout le journal (20) »`, cinq === 5 && lien.includes('Tout le journal (20)'), JSON.stringify({ cinq, lien }));
      verifier(`${ecran} 1. journal complet paginé par 8 (8, 8, 4 ; 1/3 → 3/3) : aucune page ne défile`, pages.map(x => x.n).join(',') === '8,8,4' && pages[2].page === '3 / 3' && pages.every(ok), JSON.stringify(pages.map(x => ({ n: x.n, page: x.page, h: x.h }))));
      /* Un toucher sur une ligne l'ouvre en entier, sans faire défiler la fiche */
      await p.click('#fiche-vue .journal li:nth-child(2)'); await pause(p, 60);
      const ouverte = await p.evaluate(() => ({ cl: document.querySelector('#fiche-vue .journal li:nth-child(2)').className }));
      verifier(`${ecran} 1. une ligne du journal touchée s'ouvre en entier, la fiche ne défile toujours pas`, /ouvert/.test(ouverte.cl) && ok(await mesure(p)), JSON.stringify(ouverte));
    }
    /* Le menu ⋯ ouvert ne fait rien déborder */
    if (await p.$('#modal .sheet-plus')) {
      await p.click('#modal .sheet-plus'); await pause(p, 60);
      verifier(`${ecran} 1. ${nom} : menu ⋯ ouvert, toujours aucun défilement`, ok(await mesure(p)));
      await p.keyboard.press('Escape'); await pause(p, 60);
    }
    await fermerFiche(p);
  }
  if (telephone) {
    const petites = tailles.filter(t => parseFloat(t.split(':').pop()) < 16);
    verifier(`${ecran} 2. aucun input, select ou textarea de #modal sous 16px (${tailles.length} champs, toutes fiches et volets)`, tailles.length > 40 && !petites.length, petites.join(', '));
  }

  /* ---------- 2. Ouverture en tactile : pas de champ actif (ni clavier ni zoom) ; à l'ordinateur, le titre est prêt à taper ---------- */
  {
    await p.evaluate(() => openEvent()); await pause(p, 200);
    const f = await p.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, actif: document.activeElement.tagName + '#' + document.activeElement.id }));
    if (telephone) verifier(`${ecran} 2. openEvent() en émulation tactile : document.activeElement n'est pas un champ`, f.coarse && !/^(INPUT|SELECT|TEXTAREA)/.test(f.actif), JSON.stringify(f));
    else verifier(`${ecran} 2. openEvent() à l'ordinateur : le titre a le focus`, !f.coarse && f.actif === 'INPUT#f-titre', JSON.stringify(f));
    await fermerFiche(p);
    await p.evaluate(() => openAVoir('c20')); await pause(p, 200);
    const g = await p.evaluate(() => document.activeElement.tagName + '#' + document.activeElement.id + '.' + document.activeElement.className);
    verifier(`${ecran} 2. fiche contact ouverte : ni un champ ni le menu ⋯ n'a le focus`, !/^(INPUT|SELECT|TEXTAREA)/.test(g) && !/sheet-plus/.test(g), g);
    await fermerFiche(p);
  }

  /* ---------- 3. Pas de secteur « Perso » par défaut ; le dernier choisi est repris ---------- */
  {
    await p.evaluate(() => { location.hash = '#planning'; }); await pause(p, 200);
    const avant = await p.evaluate(() => ({ n: state.events.length, dernier: state.prefs.dernierSecteur ?? null }));
    if (telephone) await p.click('#fab');
    else await p.locator('#main .btn.primary', { hasText: '+ RDV' }).first().click();
    await pause(p, 250);
    const puces = await p.evaluate(() => ({ titre: document.querySelector('#modal h2').textContent, on: [...document.querySelectorAll('#modal [aria-labelledby="lab-activite"] .chip.on')].map(b => b.dataset.v), valeur: document.querySelector('#f-activite').value }));
    verifier(`${ecran} 3. nouveau RDV depuis le planning sans prefs.dernierSecteur : aucune puce secteur active`, avant.dernier === null && /Nouveau RDV/.test(puces.titre) && puces.on.length === 0 && puces.valeur === '', JSON.stringify({ avant, puces }));
    await p.fill('#f-titre', 'Visite chaufferie');
    await p.click('#modal .modal-actions .btn.primary'); await pause(p, 150);
    const refus = await p.evaluate(() => {
      /* Le toast est dans la fiche (la couche du dessus), dans ses limites et dans l'écran : sinon il resterait caché sous la fenêtre */
      const t = document.querySelector('#toast'), m = document.querySelector('#modal'), r = t.getBoundingClientRect(), f = m.getBoundingClientRect();
      const auDessus = t.parentElement === m && r.top >= f.top && r.bottom <= f.bottom && r.bottom <= innerHeight && r.width > 0;
      return { n: state.events.length, ouvert: m.open, toast: t.textContent, show: t.classList.contains('show'), auDessus, manque: !!document.querySelector('#modal .field.manque #lab-activite') };
    });
    verifier(`${ecran} 3. Enregistrer sans secteur : toast « Choisis le secteur » visible au-dessus de la fiche, rien n'est créé`, refus.toast === 'Choisis le secteur' && refus.show && refus.auDessus && refus.n === avant.n && refus.ouvert && refus.manque, JSON.stringify(refus));
    await capture(p, `f1-${largeur}-choisis-le-secteur`);
    await p.click('#modal [aria-labelledby="lab-activite"] [data-v="cee"]');
    await p.click('#modal .modal-actions .btn.primary'); await pause(p, 200);
    const cree = await p.evaluate(() => { const e = state.events.at(-1); return { n: state.events.length, titre: e.titre, activite: e.activite, dernier: state.prefs.dernierSecteur, stocke: JSON.parse(localStorage.getItem('kami-dashboard-v1')).prefs.dernierSecteur, ouvert: document.querySelector('#modal').open }; });
    verifier(`${ecran} 3. avec CEE : RDV créé en CEE, prefs.dernierSecteur = cee (enregistré)`, cree.n === avant.n + 1 && cree.titre === 'Visite chaufferie' && cree.activite === 'cee' && cree.dernier === 'cee' && cree.stocke === 'cee' && !cree.ouvert, JSON.stringify(cree));
    await p.evaluate(() => openEvent(null, '2026-10-16')); await pause(p, 200);
    const suivant = await p.evaluate(() => ({ on: [...document.querySelectorAll('#modal [aria-labelledby="lab-activite"] .chip.on')].map(b => b.dataset.v), date: document.querySelector('#f-date').value, autre: document.querySelector('#f-dates').classList.contains('autre') }));
    verifier(`${ecran} 3. le RDV suivant présélectionne CEE (et une date hors des raccourcis montre le champ date)`, suivant.on.join() === 'cee' && suivant.date === '2026-10-16' && suivant.autre, JSON.stringify(suivant));
    await fermerFiche(p);
    /* Puces de date : Aujourd'hui · Demain · Lun. 12 · Lun. 19 · Autre… ; une puce touchée remplit la date */
    await p.evaluate(() => openEvent()); await pause(p, 200);
    const dates = await p.evaluate(() => [...document.querySelectorAll('#f-dates .puces .chip')].map(b => b.textContent.trim()));
    await p.click('#f-dates .chip[data-v="2026-10-12"]');
    await p.click('#modal [aria-labelledby="lab-duree"] [data-v="90"]');
    await p.click('#modal [aria-labelledby="lab-mode"] [data-v="place"]');
    const choix = await p.evaluate(() => ({ date: document.querySelector('#f-date').value, duree: document.querySelector('#f-duree').value, mode: document.querySelector('#f-mode').value }));
    verifier(`${ecran} 3. puces de date, de durée et de type : « Aujourd'hui · Demain · Lun. 12 · Lun. 19 · Autre… », lun. 12, 1 h 30, sur place`,
      dates.join('|') === 'Aujourd\'hui|Demain|Lun. 12|Lun. 19|Autre…' && choix.date === '2026-10-12' && choix.duree === '90' && choix.mode === 'place', JSON.stringify({ dates, choix }));
    /* Client lié : son secteur et sa ville (le lieu) */
    await volet(p, 1);
    const lien = await p.evaluate(() => 'a:' + state.abonnes.find(a => a.restaurant === 'Le Petit Zinc').id);
    await p.selectOption('#f-lien', lien); await pause(p, 60);
    const lie = await p.evaluate(() => ({ lieu: document.querySelector('#f-lieu').value, secteur: document.querySelector('#f-activite').value }));
    await volet(p, 0); await p.fill('#f-titre', 'Point Petit Zinc');
    await p.click('#modal .modal-actions .btn.primary'); await pause(p, 200);
    const zinc = await p.evaluate(() => { const e = state.events.at(-1); return { titre: e.titre, lieu: e.lieu, activite: e.activite, mode: e.mode, duree: e.duree, date: e.date }; });
    verifier(`${ecran} 3. client lié choisi : secteur KamiFood et lieu « Strasbourg » (sa ville), enregistrés avec le RDV`, lie.lieu === 'Strasbourg' && lie.secteur === 'kamifood' && zinc.titre === 'Point Petit Zinc' && zinc.lieu === 'Strasbourg' && zinc.activite === 'kamifood' && zinc.mode === 'place' && zinc.duree === 90 && zinc.date === '2026-10-12', JSON.stringify({ lie, zinc }));
    await p.evaluate(() => { location.hash = '#dashboard'; }); await pause(p, 150);
  }

  /* ---------- Saisie par puces : formule → prix, statut, secteur ; openDossier(id, prefill) ---------- */
  {
    await p.evaluate(() => openAbonne()); await pause(p, 200);
    await p.fill('#f-restaurant', 'Le Bouchon Test');
    await p.click('#modal [aria-labelledby="lab-formule"] .chip:has-text("Premium")');
    const prix = await p.$eval('#f-prix', e => e.value);
    await p.click('#modal [aria-labelledby="lab-statut"] [data-v="essai"]');
    await p.click('#modal .modal-actions .btn.primary'); await pause(p, 200);
    const ab = await p.evaluate(() => { const a = state.abonnes.find(x => x.restaurant === 'Le Bouchon Test'); return a && { prix: String(a.prix), statut: a.statut, formule: state.formules.find(f => f.id === a.formule)?.nom, rdv: state.events.filter(e => e.lien === 'a:' + a.id).length }; });
    verifier(`${ecran} saisie : la puce Premium remplit le prix (249), statut Essai, les RDV inclus sont planifiés`, prix === '249' && ab && ab.prix === '249' && ab.statut === 'essai' && ab.formule === 'Premium' && ab.rdv === 6, JSON.stringify({ prix, ab }));
    await p.evaluate(() => openDossier(null, { entreprise: 'Hôtel Prérempli', contact: 'M. Weiss', activite: 'foncier' })); await pause(p, 200);
    const pre = await p.evaluate(() => ({ entreprise: document.querySelector('#f-entreprise').value, contact: document.querySelector('#f-contact').value, secteur: document.querySelector('#modal [aria-labelledby="lab-activite"] .chip.on')?.dataset.v, titre: document.querySelector('#modal h2').textContent }));
    await p.click('#modal [aria-labelledby="lab-statut"] [data-v="signe"]');
    await p.fill('#f-commEstimee', '1200');
    await p.click('#modal .modal-actions .btn.primary'); await pause(p, 200);
    const dos = await p.evaluate(() => { const d = state.dossiers.find(x => x.entreprise === 'Hôtel Prérempli'); return d && { activite: d.activite, statut: d.statut, comm: String(d.commEstimee), signe: d.dateSignature }; });
    verifier(`${ecran} saisie : openDossier(null, prefill) préremplit un nouveau dossier ; statut Signé par puce (signé aujourd'hui)`,
      pre.entreprise === 'Hôtel Prérempli' && pre.contact === 'M. Weiss' && pre.secteur === 'foncier' && pre.titre === 'Nouveau dossier d\'apport' && dos && dos.activite === 'foncier' && dos.statut === 'signe' && dos.comm === '1200' && dos.signe === '2026-10-10', JSON.stringify({ pre, dos }));
    /* Un champ requis vide dans l'autre volet : le volet qui le contient passe devant, rien n'est enregistré */
    await p.evaluate(() => openAVoir('c20')); await pause(p, 200);
    await volet(p, 1); await p.fill('#f-nom', ''); await volet(p, 2);
    await p.click('#modal .modal-actions .btn.primary'); await pause(p, 120);
    const requis = await p.evaluate(() => ({ volet: [...document.querySelectorAll('#modal .pane')].findIndex(x => !x.hidden), ouvert: document.querySelector('#modal').open, nom: state.aVoir.find(v => v.id === 'c20').nom }));
    verifier(`${ecran} saisie : nom vidé puis Enregistrer depuis « Suivi » : le volet Coordonnées revient, rien n'est enregistré`, requis.volet === 1 && requis.ouvert && requis.nom === 'Karim Benali', JSON.stringify(requis));
    await fermerFiche(p);
  }

  /* ---------- 4. Suppressions immédiates, rattrapables d'un toucher ---------- */
  {
    const photo = () => p.evaluate(() => JSON.stringify(['events', 'dossiers', 'abonnes', 'aVoir'].map(k => state[k])));
    const avant = await photo();
    const liens0 = await p.evaluate(id => state.events.filter(e => e.lien === 'd:' + id).map(e => e.id + '=' + e.lien), ids.garage);
    await p.evaluate(id => openDossier(id), ids.garage); await pause(p, 200);
    const cache = !await visible(p, '#modal .sheet-menu .danger');
    await p.click('#modal .sheet-plus'); await pause(p, 60);
    await p.click('#modal .sheet-menu .danger'); await pause(p, 350);
    const apres = await p.evaluate(id => ({ confirm: document.querySelector('#confirm').open, modal: document.querySelector('#modal').open, existe: !!state.dossiers.find(d => d.id === id), liens: state.events.filter(e => ['ev300'].includes(e.id) || /Visio devis CEE|Visite entrepôt/.test(e.titre)).map(e => e.lien) }), ids.garage);
    const t = await toastTexte(p);
    verifier(`${ecran} 4. supprimer un dossier : il disparaît sans fenêtre #confirm, ses RDV perdent le lien`, cache && !apres.confirm && !apres.modal && !apres.existe && apres.liens.every(l => l === ''), JSON.stringify({ cache, ...apres }));
    verifier(`${ecran} 4. toast « Supprimé · Annuler »`, t.show && t.msg === 'Supprimé' && t.action === 'Annuler', JSON.stringify(t));
    await capture(p, `f1-${largeur}-supprime-annuler`);
    await p.click('#toast.show .toast-action'); await pause(p, 200);
    const retour = await p.evaluate(id => ({ existe: !!state.dossiers.find(d => d.id === id), liens: state.events.filter(e => e.lien === 'd:' + id).map(e => e.id + '=' + e.lien), stocke: JSON.parse(localStorage.getItem('kami-dashboard-v1')).dossiers.some(d => d.id === id) }), ids.garage);
    const identique = (await photo()) === avant;
    verifier(`${ecran} 4. Annuler restaure le dossier, avec les e.lien de ses RDV identiques (état identique à avant)`, retour.existe && retour.stocke && JSON.stringify(retour.liens) === JSON.stringify(liens0) && liens0.length >= 2 && identique, JSON.stringify({ retour, liens0, identique }));

    /* Annuler ne défait pas ce qui a été fait entre-temps : suppression, puis un autre changement, puis Annuler */
    await p.evaluate(() => { state.dossiers.push({ id: 'dTemp', createdAt: 1, entreprise: 'Temp SARL', activite: 'cee', statut: 'prospect' }); state.events.find(x => x.titre === 'Compta holding').lien = 'd:dTemp'; save(); });
    await p.evaluate(() => supprimerDossier('dTemp')); await pause(p, 300);
    const sans = await p.evaluate(() => ({ dossier: !!state.dossiers.find(d => d.id === 'dTemp'), lien: state.events.find(x => x.titre === 'Compta holding').lien }));
    await p.evaluate(() => { const e = state.events.find(x => x.titre === 'Compta holding'); e.notes = 'changé après la suppression'; save(); });
    await p.click('#toast.show .toast-action'); await pause(p, 200);
    const melange = await p.evaluate(() => { const e = state.events.find(x => x.titre === 'Compta holding'); return { dossier: !!state.dossiers.find(d => d.id === 'dTemp'), lien: e.lien, notes: e.notes }; });
    verifier(`${ecran} 4. Annuler après un autre changement : le dossier et son lien reviennent, le changement fait entre-temps reste`, !sans.dossier && sans.lien === '' && melange.dossier && melange.lien === 'd:dTemp' && melange.notes === 'changé après la suppression', JSON.stringify({ sans, melange }));

    /* RDV : supprimé depuis le menu ⋯ de sa fiche, rétabli par Annuler */
    await p.evaluate(() => openEvent('ev300')); await pause(p, 200);
    await p.click('#modal .sheet-plus'); await p.click('#modal .sheet-menu .danger'); await pause(p, 350);
    const ev1 = await p.evaluate(() => ({ existe: state.events.some(e => e.id === 'ev300'), confirm: document.querySelector('#confirm').open }));
    const tEv = await toastTexte(p);
    await p.click('#toast.show .toast-action'); await pause(p, 200);
    const ev2 = await p.evaluate(() => state.events.find(e => e.id === 'ev300'));
    verifier(`${ecran} 4. supprimer un RDV : sans confirmation, « Supprimé · Annuler », Annuler le remet (notes comprises)`, !ev1.existe && !ev1.confirm && tEv.msg === 'Supprimé' && tEv.action === 'Annuler' && ev2 && ev2.notes.length === 300, JSON.stringify({ ev1, tEv, notes: ev2 && ev2.notes.length }));

    /* Abonné : seuls ses RDV à venir non faits partent ; les autres restent sans lien ; Annuler remet tout */
    const ab0 = await photo();
    await p.evaluate(() => openAbonne('abX')); await pause(p, 200);
    await p.click('#modal .sheet-plus'); await p.click('#modal .sheet-menu .danger'); await pause(p, 350);
    const ab = await p.evaluate(() => ({ abonne: state.abonnes.some(a => a.id === 'abX'), restent: state.events.filter(e => e.id.startsWith('ab')).map(e => e.id + (e.lien ? '+lien' : '')).sort(), contact: state.aVoir.find(v => v.id === 'cLie').lien, confirm: document.querySelector('#confirm').open }));
    const tAb = await toastTexte(p);
    verifier(`${ecran} 4. supprimer un abonné : seuls les RDV à venir non faits (aujourd'hui, 20 oct.) partent, les autres restent sans lien`,
      !ab.abonne && !ab.confirm && ab.restent.join(',') === 'abFait,abFuturFait,abPasse' && ab.contact === '' && /^Supprimé avec 2 RDV à venir$/.test(tAb.msg), JSON.stringify({ ab, tAb }));
    await p.click('#toast.show .toast-action'); await pause(p, 200);
    verifier(`${ecran} 4. Annuler remet l'abonné, ses 5 RDV et les liens à l'identique`, (await photo()) === ab0);

    /* Contact : idem */
    const c0 = await photo();
    await p.evaluate(() => supprimerAVoir('cLie')); await pause(p, 350);
    const c1 = await p.evaluate(() => ({ existe: state.aVoir.some(v => v.id === 'cLie'), confirm: document.querySelector('#confirm').open }));
    await p.click('#toast.show .toast-action'); await pause(p, 200);
    verifier(`${ecran} 4. supprimer un contact : sans confirmation, Annuler le remet à l'identique`, !c1.existe && !c1.confirm && (await photo()) === c0, JSON.stringify(c1));
    const sources = await p.evaluate(() => [supprimerEvent, supprimerDossier, supprimerAbonne, supprimerAVoir].map(f => /confirmer\(/.test(String(f))));
    verifier(`${ecran} 4. confirmer() n'est plus appelé par les 4 suppressions`, sources.every(x => !x), JSON.stringify(sources));
  }

  /* ---------- 5. Fiche contact de Mme Roth : résumé, Appeler, Supprimer caché dans ⋯ ---------- */
  {
    await p.evaluate(id => openAVoir(id), ids.roth); await pause(p, 250);
    const f = await p.evaluate(() => ({
      lignes: [...document.querySelectorAll('#fiche-resume p')].map(x => x.textContent.replace(/\s+/g, ' ').trim()),
      tel: document.querySelector('#modal a[href^="tel:"]')?.getAttribute('href'), wa: document.querySelector('#modal a[href^="https://wa.me/"]')?.getAttribute('href'),
      boutons: [...document.querySelectorAll('#modal .fiche-actions .btn')].map(b => ({ t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height) })),
      menu: document.querySelector('#modal .sheet-menu').hidden,
    }));
    const supprimerAvant = await visible(p, '#modal .sheet-menu .danger');
    await capture(p, `f1-${largeur}-fiche-roth`);
    verifier(`${ecran} 5. openAVoir(Mme Roth) : résumé « Rencontrée le 7 oct. · 1 échange · dernier il y a 3 j : … »`, /^Rencontrée? le 7 oct\. · 1 échange · dernier il y a 3 j : Croisée au marché/.test(f.lignes[0] || ''), f.lignes[0]);
    verifier(`${ecran} 5. résumé : prochaine étape et ce qu'elle doit (lu dans le journal)`, f.lignes[1] === 'Prochaine étape : rappel aujourd\'hui' && f.lignes[2] === 'Elle te doit : ses avis 2024-2025', JSON.stringify(f.lignes));
    verifier(`${ecran} 5. lien tel: (et WhatsApp) quand v.tel existe ; boutons d'action de 44 px au moins`, f.tel === 'tel:0612345678' && f.wa === 'https://wa.me/33612345678' && f.boutons.length === 4 && f.boutons.every(b => b.h >= 44) && f.boutons.some(b => b.t === '+ Prise de contact') && f.boutons.some(b => b.t === 'Planifier un RDV'), JSON.stringify(f));
    await p.click('#modal .sheet-plus'); await pause(p, 80);
    const supprimerApres = await visible(p, '#modal .sheet-menu .danger');
    await capture(p, `f1-${largeur}-menu-supprimer`);
    verifier(`${ecran} 5. Supprimer n'est visible qu'après ouverture du menu ⋯`, f.menu && !supprimerAvant && supprimerApres, JSON.stringify({ supprimerAvant, supprimerApres }));
    /* Échap avec le menu ouvert : seul le menu se ferme */
    await p.keyboard.press('Escape'); await pause(p, 80);
    const esc = await p.evaluate(() => ({ menu: document.querySelector('#modal .sheet-menu').hidden, ouvert: document.querySelector('#modal').open }));
    verifier(`${ecran} 5. Échap ferme le menu ⋯ sans fermer la fiche`, esc.menu && esc.ouvert, JSON.stringify(esc));
    /* Un contact sans téléphone : ni Appeler ni WhatsApp */
    await p.evaluate(() => openAVoir(state.aVoir.find(v => v.nom === 'Julien').id)); await pause(p, 200);
    const julien = await p.evaluate(() => ({ tel: !!document.querySelector('#modal a[href^="tel:"]'), n: document.querySelectorAll('#modal .fiche-actions .btn').length, l3: document.querySelector('#fiche-resume .r3').textContent }));
    verifier(`${ecran} 5. Julien (sans téléphone) : pas de lien tel:, « Tu lui dois : le lien »`, !julien.tel && julien.n === 2 && julien.l3 === 'Tu lui dois : le lien', JSON.stringify(julien));
    /* Volet Suivi : statut, attente, priorité en segments, enregistrés */
    await volet(p, 2);
    await p.click('#modal [aria-labelledby="lab-priorite"] [data-v="haute"]');
    await p.click('#modal [aria-labelledby="lab-attente"] [data-v=""]');
    await p.click('#modal .modal-actions .btn.primary'); await pause(p, 200);
    const j2 = await p.evaluate(() => { const v = state.aVoir.find(x => x.nom === 'Julien'); return { priorite: v.priorite, attente: v.attente, ouvert: document.querySelector('#modal').open }; });
    verifier(`${ecran} 5. volet Suivi : priorité haute et « Rien en attente » enregistrés`, j2.priorite === 'haute' && j2.attente === '' && !j2.ouvert, JSON.stringify(j2));
  }

  /* ---------- 6. Le geste retour ferme la fiche, sans changer le # ---------- */
  {
    for (const [nom, code] of [['RDV', 'openEvent()'], ['contact', `openAVoir('c20')`]]) {
      const h0 = await p.evaluate(() => location.hash);
      await p.evaluate(c => eval(c), code); await pause(p, 200);
      const pousse = await p.evaluate(() => ({ ouvert: document.querySelector('#modal').open, etat: history.state && history.state.couche }));
      await p.evaluate(() => history.back()); await pause(p, 300);
      const apres = await p.evaluate(() => ({ ouvert: document.querySelector('#modal').open, hash: location.hash }));
      verifier(`${ecran} 6. fiche ${nom} : history.back() la ferme, location.hash inchangé (${h0})`, pousse.ouvert && pousse.etat === 'modal' && !apres.ouvert && apres.hash === h0, JSON.stringify({ pousse, apres }));
    }
    /* Fermée par ✕ (ou Annuler) : son entrée d'historique est retirée, un retour de plus ne rouvre rien */
    await p.evaluate(() => { location.hash = '#contacts'; }); await pause(p, 200);
    await p.evaluate(() => openDossier()); await pause(p, 200);
    await p.click('#modal .sheet-fermer'); await pause(p, 300);
    const x = await p.evaluate(() => ({ ouvert: document.querySelector('#modal').open, etat: history.state && history.state.couche, hash: location.hash }));
    verifier(`${ecran} 6. fermée par ✕ : plus d'entrée « modal » dans l'historique, # inchangé`, !x.ouvert && !x.etat && x.hash === '#contacts', JSON.stringify(x));
    /* Fiche → « Planifier un RDV » (une autre fiche) → retour : tout est fermé, pas d'entrée orpheline */
    await p.evaluate(() => openAVoir('c20')); await pause(p, 200);
    await p.click('#modal .fiche-actions button:has-text("Planifier un RDV")'); await pause(p, 300);
    const rdv = await p.evaluate(() => ({ titre: document.querySelector('#modal h2').textContent, etat: history.state && history.state.couche, lieu: document.querySelector('#f-lieu').value }));
    await p.evaluate(() => history.back()); await pause(p, 300);
    const fin = await p.evaluate(() => ({ ouvert: document.querySelector('#modal').open, etat: history.state && history.state.couche, hash: location.hash }));
    verifier(`${ecran} 6. fiche contact → « Planifier un RDV » → retour : tout est fermé, historique propre, # inchangé`, /Nouveau RDV/.test(rdv.titre) && rdv.etat === 'modal' && rdv.lieu === 'Illkirch' && !fin.ouvert && !fin.etat && fin.hash === '#contacts', JSON.stringify({ rdv, fin }));
    /* « + Prise de contact » depuis la fiche : Noter au premier plan, et le retour ferme Noter (une seule entrée) */
    await p.evaluate(() => openAVoir('c20')); await pause(p, 200);
    await p.click('#modal button:has-text("+ Prise de contact")'); await pause(p, 300);
    const noter = await p.evaluate(() => ({ modal: document.querySelector('#modal').open, noter: !document.querySelector('#rencontre').hidden, etat: history.state && history.state.couche }));
    await p.evaluate(() => history.back()); await pause(p, 300);
    const ferme = await p.evaluate(() => ({ noter: !document.querySelector('#rencontre').hidden, etat: history.state && history.state.couche }));
    verifier(`${ecran} 6. fiche → « + Prise de contact » : Noter s'ouvre, un seul retour le ferme`, !noter.modal && noter.noter && noter.etat === 'rencontre' && !ferme.noter && !ferme.etat, JSON.stringify({ noter, ferme }));
  }

  /* ---------- 7. Outil de contrôle : silencieux sur toutes les fiches, mais il voit un vrai débordement ---------- */
  {
    verifier(`${ecran} 7. kgd-debug = 1 : aucune console.warn de verifierSansAscenseur sur toutes les fiches`, avertissements.length === 0, avertissements.join(' | '));
    await p.evaluate(() => openDossier()); await pause(p, 200);
    const test = await p.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'height:2000px;flex:none'; document.querySelector('#modal .pane').appendChild(d); const r = verifierSansAscenseur(); return { r, contour: document.querySelector('#modal .sheet-body').style.outline }; });
    await pause(p, 50);
    verifier(`${ecran} 7. (contrôle de l'outil) un débordement forcé est signalé : console.warn et contour rouge`, test.r === false && /red/.test(test.contour) && avertissements.length > 0, JSON.stringify({ test, n: avertissements.length }));
    await fermerFiche(p);
    await p.evaluate(() => localStorage.removeItem('kgd-debug'));
  }

  verifier(`${ecran} aucun défilement horizontal`, await sansScrollHorizontal(p));
  verifier(`${ecran} aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* ---------- Données : le lieu est assaini, dernierSecteur inconnu est retiré ---------- */
{
  const KEY = 'kami-dashboard-v1';
  const brut = { nom: 'Kami Groupe', dossiers: [], abonnes: [], aVoir: [], memoire: [], events: [{ id: 'e1', titre: 'RDV', date: '2026-10-12', heure: '', duree: 30, mode: 'visio', activite: 'cee', lien: '', fait: false, notes: '', lieu: 67000 }],
    prefs: { periode: 'mois', dernierSecteur: 'inconnu', migrations: { rappelsRecuperes: true, dureesPeriodes: true, resilieSansFin: true, dedoublonMoi: true } }, rev: 2 };
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, stockage: { [KEY]: brut } });
  const r = await p.evaluate(() => ({ lieu: state.events[0].lieu, dernier: state.prefs.dernierSecteur }));
  verifier('assainir : un lieu non texte devient du texte, un dernierSecteur inconnu est vidé', r.lieu === '67000' && r.dernier === '', JSON.stringify(r));
  verifier('assainir : aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* ---------- Kami (api/jarvis.js) : le lieu d'un RDV ---------- */
{
  const { runJarvis, TOOLS } = await import('../../api/jarvis.js');
  const appels = [{ type: 'tool_use', id: 't1', name: 'ajouter_rdv', input: { titre: 'Visite', date: '2026-10-14', activite: 'kamifood', lien: 'a:a1' } },
    { type: 'tool_use', id: 't2', name: 'ajouter_rdv', input: { titre: 'Visio', date: '2026-10-15', activite: 'cee', lieu: '12 rue du Port, Kehl' } }];
  let n = 0;
  const client = { beta: { messages: { create: async () => (n++ === 0 ? { content: appels, stop_reason: 'tool_use', usage: {} } : { content: [{ type: 'text', text: 'Fait.' }], stop_reason: 'end_turn', usage: {} }) } } };
  const body = { messages: [{ role: 'user', content: 'Pose deux RDV' }], aujourdhui: '2026-10-10', state: { abonnes: [{ id: 'a1', restaurant: 'Le Petit Zinc', ville: 'Strasbourg' }], dossiers: [], events: [], aVoir: [], formules: [], rdvModele: [], memoire: [] } };
  const out = await runJarvis(body, client);
  const lieux = out.actions.filter(a => a.op === 'add' && a.collection === 'events').map(a => a.item.lieu);
  const schema = TOOLS.find(t => t.name === 'ajouter_rdv').input_schema.properties.lieu;
  verifier('Kami : ajouter_rdv connaît « lieu » ; par défaut la ville du client lié, sinon le lieu donné', !!schema && lieux[0] === 'Strasbourg' && lieux[1] === '12 rue du Port, Kehl', JSON.stringify(lieux));
}

bilan();
