/* C2 — Données sûres : infobulles sans HTML, stockage abîmé protégé, fenêtres synchronisées, import annulable.
   Horloge figée au samedi 2026-10-10 09:00 (Paris). Chaque critère est vérifié au téléphone (390x844) et à l'ordinateur (1366x800). */
import { ouvrir, verifier, bilan } from './outil.mjs';
import path from 'node:path';

const KEY = 'kami-dashboard-v1';
const PIEGE = '<img src=x onerror=window.__x=1>';
const CAPTURES = process.env.CAPTURES || '';
const capture = async (p, nom) => { if (CAPTURES) await p.screenshot({ path: path.join(CAPTURES, nom + '.png') }); };
const sansScrollHorizontal = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const pause = (p, ms = 120) => p.waitForTimeout(ms);
/* État complet et sain : le chargement ne le réécrit pas (aucune migration ni réparation à faire).
   Toute nouvelle migration nommée doit être ajoutée à prefs.migrations ci-dessous. */
const etatSain = (extra = {}) => ({
  nom: 'Kami Groupe', dossiers: [], events: [], memoire: [],
  abonnes: [{ id: 'moi', createdAt: 1, interne: true, restaurant: 'Toufek · licence éditeur', contact: 'Toufek', statut: 'actif', prix: 0, engagement: 0, debut: '2026-01-01', formule: 'f3', notes: '' }],
  aVoir: [],
  formules: [{ id: 'f1', nom: 'Essentiel', prix: 79 }, { id: 'f2', nom: 'Pro', prix: 149 }, { id: 'f3', nom: 'Premium', prix: 249 }],
  rdvModele: [{ titre: 'Installation', jours: 7, duree: 60, mode: 'place' }],
  prefs: { periode: 'mois', theme: 'light', planVue: 'semaine', migrations: { rappelsRecuperes: true, dureesPeriodes: true, resilieSansFin: true, dedoublonMoi: true }, persistDemande: true, jourCopie: '2026-10-10' },
  stripe: null, rev: 3,
  ...extra,
});
const contact = (id, nom) => ({ id, createdAt: 1, nom, entreprise: '', activite: 'cee', priorite: 'normale', statut: 'suivi', attente: '', rappel: '2026-10-14', tel: '', lien: '', notes: '', historique: [{ date: '2026-10-05', texte: 'Premier échange avec ' + nom }] });
/* Clique le bouton du toast (« Annuler », « Annuler l'import »…) une fois le toast visible */
const actionToast = async p => { await pause(p, 350); await p.click('#toast.show .toast-action'); await pause(p, 150); };
const confirmerOk = async p => { await p.waitForSelector('#confirm[open]', { timeout: 3000 }); await p.click('#confirm-ok'); await pause(p, 200); };

for (const [largeur, hauteur] of [[390, 844], [1366, 800]]) {
  const ecran = `${largeur}px`;

  /* 1. Infobulles : un titre piégé reste du texte, en vues Jour, Semaine et Mois ; une infobulle multiligne garde ses retours */
  {
    const ev = (id, date, heure, extra = {}) => ({ id, titre: PIEGE, date, heure, duree: 60, mode: heure ? 'visio' : 'tache', activite: 'cee', lien: '', fait: false, notes: '', important: false, ...extra });
    const donnees = etatSain({ events: [ev('x1', '2026-10-10', '10:00'), ev('x2', '2026-10-10', ''), ev('x3', '2026-10-08', '', { fin: '2026-10-24', duree: 0 }), ev('x4', '2026-10-13', '14:00')] });
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, vue: 'planning', stockage: { [KEY]: donnees } });
    for (const vue of ['jour', 'semaine', 'mois']) {
      await p.evaluate(v => { planDate = '2026-10-10'; setPlanVue(v); }, vue);
      await pause(p);
      const cibles = await p.evaluate(piege => [...document.querySelectorAll('[data-tip]')].filter(e => e.dataset.tip.includes(piege)).map(e => { const r = e.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 6), y: r.top + Math.min(r.height / 2, 3), w: r.width, h: r.height, multi: e.dataset.tip.includes('\n') }; }).filter(r => r.w > 0 && r.h > 0 && r.y > 0 && r.y < innerHeight), PIEGE);
      let litteral = 0, multiOk = null;
      for (const c of cibles.slice(0, 4)) {
        await p.mouse.move(c.x, c.y); await pause(p, 60);
        const t = await p.evaluate(() => { const t = document.querySelector('#tip'); return { txt: t.textContent, enfants: t.children.length, lignes: t.innerText.split('\n').length, ws: getComputedStyle(t).whiteSpace, vu: t.classList.contains('show') }; });
        if (t.vu && t.txt.includes(PIEGE) && t.enfants === 0) litteral++;
        if (c.multi && t.vu) multiOk = (multiOk ?? true) && t.lignes >= 2 && t.ws === 'pre-line';
      }
      /* Toucher / cliquer un élément à infobulle : rien ne s'exécute (la fenêtre du RDV s'ouvre, on la ferme) */
      if (cibles[0]) {
        if (largeur <= 760) await p.touchscreen.tap(cibles[0].x, cibles[0].y); else await p.mouse.click(cibles[0].x, cibles[0].y);
        await pause(p, 150);
        await p.evaluate(() => { if (document.querySelector('#modal').open) document.querySelector('#modal').close(); });
      }
      const etat = await p.evaluate(() => ({ x: window.__x, img: document.querySelectorAll('img[src="x"]').length }));
      /* Au téléphone, la vue Semaine liste les RDV sans infobulle de titre : on vérifie alors seulement qu'aucun code ne s'exécute */
      const attendues = !(largeur <= 760 && vue === 'semaine');
      verifier(`${ecran} 1. vue ${vue} : titre piégé jamais exécuté, #tip montre le texte littéral`,
        etat.x === undefined && etat.img === 0 && (attendues ? cibles.length > 0 && litteral === Math.min(cibles.length, 4) : true),
        JSON.stringify({ ...etat, cibles: cibles.length, litteral }));
      if (vue === 'jour') verifier(`${ecran} 1. vue jour : une infobulle multiligne garde ses retours à la ligne`, multiOk === true, String(multiOk));
      if (vue === 'jour' && largeur > 760) await capture(p, `c2-infobulle-${largeur}`);
    }
    verifier(`${ecran} 1. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* 2. Stockage abîmé : l'appli s'affiche, la copie brute est gardée, la carte rouge est là, rien n'est écrasé */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, stockage: { [KEY]: '{abime' } });
    const r = await p.evaluate(K => {
      const copies = Object.keys(localStorage).filter(k => k.startsWith(K + '.corrompu-')).map(k => localStorage.getItem(k));
      const c = document.querySelector('.alerte-donnees'), b = c && c.getBoundingClientRect(), tete = document.querySelector('.page-head').getBoundingClientRect();
      return { main: document.querySelector('#main').children.length, copies, carte: !!c && b.height > 0, enTete: !!c && b.top <= tete.top, texte: c ? c.querySelector('h2').textContent : '',
        boutons: c ? [...c.querySelectorAll('.btn')].map(x => x.textContent.trim()) : [] };
    }, KEY);
    verifier(`${ecran} 2. l'appli s'affiche malgré '{abime'`, r.main > 0, String(r.main));
    verifier(`${ecran} 2. une clé ${KEY}.corrompu-… contient '{abime'`, r.copies.includes('{abime'), JSON.stringify(r.copies));
    verifier(`${ecran} 2. carte rouge visible en tête`, r.carte && r.enTete && r.texte === 'Tes données n\'ont pas pu être lues. Une copie est gardée.', r.texte);
    verifier(`${ecran} 2. boutons Importer une sauvegarde et Repartir de zéro (pas de veille ici)`, JSON.stringify(r.boutons) === JSON.stringify(['Importer une sauvegarde', 'Repartir de zéro']), JSON.stringify(r.boutons));
    verifier(`${ecran} 2. carte rouge sans défilement horizontal`, await sansScrollHorizontal(p));
    await capture(p, `c2-carte-rouge-${largeur}`);
    await p.click('.seg button:not(.on)'); await pause(p);
    const apres = await p.evaluate(K => ({ cle: localStorage.getItem(K), periode: state.prefs.periode }), KEY);
    verifier(`${ecran} 2. après un changement de période, la clé vaut toujours '{abime'`, apres.cle === '{abime' && apres.periode !== 'mois', JSON.stringify(apres));
    /* Repartir de zéro : la clé redevient lisible, la copie brute reste */
    await p.click('.alerte-donnees .btn:has-text("Repartir de zéro")');
    await confirmerOk(p);
    const z = await p.evaluate(K => { let ok = false; try { ok = !!JSON.parse(localStorage.getItem(K)); } catch (e) { /* */ } return { ok, carte: !!document.querySelector('.alerte-donnees'), copie: Object.keys(localStorage).some(k => k.startsWith(K + '.corrompu-') && localStorage.getItem(k) === '{abime') }; }, KEY);
    verifier(`${ecran} 2. « Repartir de zéro » : données de nouveau enregistrées, copie brute gardée`, z.ok && !z.carte && z.copie, JSON.stringify(z));
    verifier(`${ecran} 2. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }
  /* 2 bis. Avec une copie de la veille : « Revenir à la veille » la rétablit */
  {
    const veille = etatSain({ aVoir: [contact('h1', 'Hier OK')], prefs: { ...etatSain().prefs, jourCopie: '2026-10-09' } });
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, stockage: { [KEY]: '{abime', [KEY + '.veille']: veille } });
    const boutons = await p.$$eval('.alerte-donnees .btn', bs => bs.map(b => b.textContent.trim()));
    await p.click('.alerte-donnees .btn:has-text("Revenir à la veille")'); await pause(p, 200);
    const r = await p.evaluate(K => { let lu = null; try { lu = JSON.parse(localStorage.getItem(K)); } catch (e) { /* */ } return { noms: state.aVoir.map(v => v.nom), carte: !!document.querySelector('.alerte-donnees'), stocke: lu && lu.aVoir.map(v => v.nom), copie: Object.keys(localStorage).some(k => k.startsWith(K + '.corrompu-') && localStorage.getItem(k) === '{abime'), veille: localStorage.getItem(K + '.veille') }; }, KEY);
    verifier(`${ecran} 2. « Revenir à la veille » proposé puis appliqué (copie brute gardée, veille intacte)`,
      boutons[0] === 'Revenir à la veille' && JSON.stringify(r.noms) === '["Hier OK"]' && JSON.stringify(r.stocke) === '["Hier OK"]' && !r.carte && r.copie && r.veille === JSON.stringify(veille), JSON.stringify({ boutons, ...r, veille: undefined }));
    verifier(`${ecran} 2. veille : aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* 3. Collections à null : pas d'écran blanc, events et dossiers valent [] */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, stockage: { [KEY]: '{"events":null,"dossiers":null}' } });
    const r = await p.evaluate(() => ({ events: JSON.stringify(state.events), dossiers: JSON.stringify(state.dossiers), main: document.querySelector('#main').children.length, carte: !!document.querySelector('.alerte-donnees') }));
    let vues = true;
    for (const v of ['planning', 'contacts', 'kamifood', 'dossiers', 'gains', 'parametres', 'dashboard']) {
      await p.evaluate(h => { location.hash = '#' + h; }, v); await pause(p, 80);
      vues = vues && await p.evaluate(() => document.querySelector('#main').children.length > 0);
    }
    verifier(`${ecran} 3. {"events":null,"dossiers":null} : pas d'écran blanc, state.events et state.dossiers valent []`, r.events === '[]' && r.dossiers === '[]' && r.main > 0 && !r.carte && vues, JSON.stringify(r));
    verifier(`${ecran} 3. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* 4, 6, 8. Import assaini, import annulable, tout effacer */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, exemple: true, vue: 'parametres' });
    const piege = {
      nom: 'Kami Groupe', abonnes: [], aVoir: [],
      dossiers: [{ id: 'a"><x', entreprise: 'Piège SARL', activite: 'cee', statut: 'prospect', commEstimee: 100 }],
      events: [
        { id: 'ev1', titre: 'RDV lié au piège', date: '2026-10-12', heure: '10:00', duree: 60, mode: 'visio', activite: 'cee', lien: 'd:a"><x', fait: false, notes: '' },
        { id: 'ev2', titre: 'Secteur inconnu', date: '2026-10-13', heure: '11:00', duree: 30, mode: 'visio', activite: 'xxx', lien: '', fait: false, notes: '' },
      ],
    };
    const importer = async data => {
      await p.evaluate(() => { location.hash = '#parametres'; }); await pause(p);
      await p.setInputFiles('#main .settings input[type=file]', { name: 'sauvegarde.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
      await confirmerOk(p);
    };
    await importer(piege);
    /* 4. Le dossier piégé reçoit un id valide, le RDV lié pointe vers lui, le secteur inconnu devient perso */
    const r4 = await p.evaluate(() => {
      const d = state.dossiers[0], e1 = state.events.find(e => e.id === 'ev1'), e2 = state.events.find(e => e.id === 'ev2');
      return { id: d.id, lien: e1.lien, nomLie: lienNom(e1.lien), activite: e2.activite };
    });
    verifier(`${ecran} 4. import : le dossier 'a"><x' reçoit un id valide et le RDV pointe vers ce nouvel id`,
      /^[A-Za-z0-9_-]{1,40}$/.test(r4.id) && r4.id !== 'a"><x' && r4.lien === 'd:' + r4.id && r4.nomLie === 'Piège SARL', JSON.stringify(r4));
    verifier(`${ecran} 4. import : activite 'xxx' devient 'perso'`, r4.activite === 'perso', r4.activite);
    let injecte = 0;
    for (const v of ['dossiers', 'planning', 'dashboard']) {
      await p.evaluate(h => { location.hash = '#' + h; }, v); await pause(p, 100);
      injecte += await p.evaluate(() => document.querySelectorAll('x').length);
    }
    verifier(`${ecran} 4. aucune balise injectée dans les vues Apport, Planning, Accueil`, injecte === 0, String(injecte));
    /* 6. Import puis « Annuler l'import » : retour exact à l'état d'avant (hors compteur de version rev) */
    await p.evaluate(() => { location.hash = '#parametres'; }); await pause(p);
    await p.evaluate(() => { loadDemo(); }); await confirmerOk(p); // des données riches avant l'import
    await p.evaluate(() => { location.hash = '#parametres'; }); await pause(p);
    const avant = await p.evaluate(() => JSON.stringify({ ...state, rev: 0 }));
    await importer(piege);
    const pendant = await p.evaluate(K => ({ d: state.dossiers.length, e: state.events.length, toast: document.querySelector('#toast .toast-action')?.textContent, copie: localStorage.getItem(K + '.avant-import') }), KEY);
    await actionToast(p);
    const apresAnnul = await p.evaluate(() => JSON.stringify({ ...state, rev: 0 }));
    const stocke = await p.evaluate(K => { const o = JSON.parse(localStorage.getItem(K)); return JSON.stringify({ d: o.dossiers.length, e: o.events.length }); }, KEY);
    const attendu = JSON.stringify({ d: JSON.parse(avant).dossiers.length, e: JSON.parse(avant).events.length });
    verifier(`${ecran} 6. « Annuler l'import » : JSON.stringify(state) identique à l'état d'avant l'import`,
      apresAnnul === avant && pendant.toast === 'Annuler l\'import' && pendant.d === 1 && pendant.e === 2 && stocke === attendu && pendant.copie === avant.replace('"rev":0', '"rev":' + JSON.parse(pendant.copie).rev),
      JSON.stringify({ egal: apresAnnul === avant, pendant: { ...pendant, copie: !!pendant.copie }, stocke }));
    /* 8. Tout effacer : un seul abonné, « moi », sans rechargement ; la conversation Kami est vide */
    await p.evaluate(() => { jarvis.historique = [{ role: 'user', content: 'Bonjour' }, { role: 'assistant', content: 'Salut' }]; saveJarvis(); location.hash = '#parametres'; });
    await pause(p);
    await p.click('#main .btn.danger:has-text("Tout effacer")');
    await confirmerOk(p);
    const r8 = await p.evaluate(K => ({ ab: state.abonnes.map(a => a.id), histo: jarvis.historique.length, histoStocke: JSON.parse(localStorage.getItem('kami-jarvis')).historique.length, stocke: JSON.parse(localStorage.getItem(K)).abonnes.map(a => a.id), dossiers: state.dossiers.length, events: state.events.length, aVoir: state.aVoir.length, toast: document.querySelector('#toast .toast-action')?.textContent }), KEY);
    verifier(`${ecran} 8. après « Tout effacer » : exactement un abonné 'moi', sans rechargement`, JSON.stringify(r8.ab) === '["moi"]' && JSON.stringify(r8.stocke) === '["moi"]' && !r8.dossiers && !r8.events && !r8.aVoir, JSON.stringify(r8));
    verifier(`${ecran} 8. jarvis.historique est vide (et enregistré vide)`, r8.histo === 0 && r8.histoStocke === 0, JSON.stringify(r8));
    verifier(`${ecran} 8. « Tout effacer » propose « Annuler »`, r8.toast === 'Annuler', String(r8.toast));
    verifier(`${ecran} 4-6-8. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* 5. Deux onglets du même navigateur : rien ne s'efface */
  {
    const { ctx, p, base, erreurs, fermer } = await ouvrir({ largeur, hauteur, vue: 'contacts' });
    const b = await ctx.newPage();
    const erreursB = [];
    b.on('pageerror', e => erreursB.push(String(e.message || e)));
    await b.goto(base + 'index.html#contacts', { waitUntil: 'domcontentloaded' });
    await pause(b, 300);
    /* A : un contact par l'écran Rencontre */
    await p.bringToFront();
    await p.evaluate(() => openContact(null, { nom: 'Inès Onglet', sujet: 'deux fenêtres' }));
    await pause(p, 80);
    for (let i = 0; i < 6; i++) { // depuis N2, « Enregistrer » de l'écran Noter enregistre et ferme d'un toucher
      if (await p.$eval('#rencontre', e => e.hidden)) break;
      const t = await p.$eval('#rencontre h2', e => e.textContent.trim());
      await p.click('#rencontre .r-foot .btn.primary'); await pause(p, 80);
      if (t === 'On enregistre ?') break;
    }
    await pause(b, 400);
    const vuB = await b.evaluate(() => ({ etat: state.aVoir.some(v => v.nom === 'Inès Onglet'), dom: document.querySelector('#main').textContent.includes('Inès Onglet'), toast: document.querySelector('#toast').textContent }));
    verifier(`${ecran} 5. contact ajouté dans A visible dans B sans rechargement manuel`, vuB.etat && vuB.dom, JSON.stringify(vuB));
    /* B : un RDV par la fenêtre RDV */
    await b.bringToFront();
    await b.evaluate(() => openEvent(null, '2026-10-12'));
    await pause(b, 80);
    await b.fill('#f-titre', 'RDV fenêtre B');
    await b.click('#modal [aria-labelledby="lab-activite"] [data-v="cee"]'); // depuis F1, pas de secteur par défaut
    await b.click('#modal .modal-actions .btn.primary'); await pause(b, 200);
    await pause(p, 300);
    const stock = await p.evaluate(K => { const o = JSON.parse(localStorage.getItem(K)); return { contact: o.aVoir.some(v => v.nom === 'Inès Onglet'), rdv: o.events.some(e => e.titre === 'RDV fenêtre B'), rdvDansA: state.events.some(e => e.titre === 'RDV fenêtre B') }; }, KEY);
    verifier(`${ecran} 5. RDV ajouté ensuite dans B : les deux éléments sont dans localStorage (et A voit le RDV)`, stock.contact && stock.rdv && stock.rdvDansA, JSON.stringify(stock));
    /* Saisie en cours dans B pendant qu'A écrit : B n'écrase pas A (il recharge et demande de refaire) */
    await b.evaluate(() => openEvent(null, '2026-10-13'));
    await pause(b, 80);
    await p.evaluate(() => { state.aVoir.push({ id: 'conflitA', createdAt: 1, nom: 'Conflit A', entreprise: '', activite: 'cee', priorite: 'normale', statut: 'suivi', attente: '', rappel: '2026-10-14', historique: [] }); save(); });
    await pause(b, 300);
    const enAttente = await b.evaluate(() => ({ ouvert: document.querySelector('#modal').open, aRecharger }));
    await b.fill('#f-titre', 'RDV perdu B');
    await b.click('#modal [aria-labelledby="lab-activite"] [data-v="cee"]');
    await b.click('#modal .modal-actions .btn.primary'); await pause(b, 300);
    const conflit = await b.evaluate(K => { const o = JSON.parse(localStorage.getItem(K)); return { a: o.aVoir.some(v => v.id === 'conflitA'), etatB: state.aVoir.some(v => v.id === 'conflitA'), perdu: o.events.some(e => e.titre === 'RDV perdu B'), toast: document.querySelector('#toast').textContent }; }, KEY);
    verifier(`${ecran} 5. saisie ouverte dans B pendant une écriture de A : rien d'A n'est écrasé, B recharge et prévient`,
      enAttente.ouvert && enAttente.aRecharger && conflit.a && conflit.etatB && !conflit.perdu && /refais ta dernière action/.test(conflit.toast), JSON.stringify({ enAttente, conflit }));
    /* Rencontre ouverte dans A pendant une écriture de B : à l'enregistrement, A repart des données de B, rien n'est perdu */
    await p.bringToFront();
    const ines = await p.evaluate(() => state.aVoir.find(v => v.nom === 'Inès Onglet').id);
    await p.evaluate(id => openContact(id), ines); await pause(p, 80);
    await p.fill('#r-note', 'rappel après la démo');
    await b.evaluate(() => { state.events.push({ id: 'evB2', titre: 'RDV B pendant la Rencontre', date: '2026-10-14', heure: '09:00', duree: 30, mode: 'visio', activite: 'perso', lien: '', fait: false, notes: '' }); save(); });
    await pause(p, 300);
    const attendA = await p.evaluate(() => aRecharger);
    for (let i = 0; i < 6; i++) { // depuis N2, « Enregistrer » de l'écran Noter enregistre et ferme d'un toucher
      if (await p.$eval('#rencontre', e => e.hidden)) break;
      const t = await p.$eval('#rencontre h2', e => e.textContent.trim());
      await p.click('#rencontre .r-foot .btn.primary'); await pause(p, 80);
      if (t === 'On enregistre ?') break;
    }
    const fin = await p.evaluate(K => { const o = JSON.parse(localStorage.getItem(K)); return { rdvB: o.events.some(e => e.id === 'evB2'), note: o.aVoir.find(v => v.nom === 'Inès Onglet').historique.some(h => h.texte === 'rappel après la démo'), toast: document.querySelector('#toast').textContent }; }, KEY);
    verifier(`${ecran} 5. Rencontre ouverte dans A pendant une écriture de B : les deux sont gardés, rien à refaire`, attendA && fin.rdvB && fin.note && !/refais/.test(fin.toast), JSON.stringify({ attendA, ...fin }));
    verifier(`${ecran} 5. aucune erreur JS (A et B)`, erreurs.length === 0 && erreursB.length === 0, [...erreurs, ...erreursB].join(' | '));
    await fermer();
  }

  /* 7. Copie de la veille : le premier enregistrement du jour garde la valeur précédente ; « Revenir à la version d'hier » la rétablit */
  {
    const donnees = etatSain({ aVoir: [contact('h1', 'Hier')], prefs: { ...etatSain().prefs, jourCopie: '2026-10-09' } });
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, stockage: { [KEY]: donnees } });
    const brut0 = await p.evaluate(K => ({ cle: localStorage.getItem(K), veille: localStorage.getItem(K + '.veille') }), KEY);
    await p.click('.seg button:not(.on)'); await pause(p); // premier save() du jour
    const r = await p.evaluate(K => ({ veille: localStorage.getItem(K + '.veille'), jour: state.prefs.jourCopie }), KEY);
    verifier(`${ecran} 7. le premier save() écrit dans ${KEY}.veille la valeur précédente de la clé`, brut0.veille === null && brut0.cle === JSON.stringify(donnees) && r.veille === brut0.cle && r.jour === '2026-10-10', JSON.stringify({ veilleAvant: brut0.veille, egal: r.veille === brut0.cle, jour: r.jour }));
    /* Un changement d'aujourd'hui, puis retour à hier depuis les Réglages */
    await p.evaluate(() => { state.aVoir.push({ id: 'auj1', createdAt: 2, nom: 'Aujourd\'hui', entreprise: '', activite: 'cee', priorite: 'normale', statut: 'suivi', attente: '', rappel: '2026-10-14', historique: [] }); save(); location.hash = '#parametres'; });
    await pause(p);
    const reglages = await p.evaluate(() => { const dl = document.querySelector('.etat-stockage'); return { dl: dl ? [...dl.querySelectorAll('dt, dd')].map(x => x.textContent.trim()) : [], bouton: [...document.querySelectorAll('#main .btn')].some(b => b.textContent.trim() === 'Revenir à la version d\'hier') }; });
    verifier(`${ecran} 7. Réglages > Sauvegarde : protection, place utilisée, copie de la veille`,
      reglages.bouton && reglages.dl[0] === 'Données protégées sur cet appareil' && /^(oui|non)/.test(reglages.dl[1]) && reglages.dl[2] === 'Place utilisée' && /Ko/.test(reglages.dl[3]) && reglages.dl[5] === 'état du vendredi 9 oct.', JSON.stringify(reglages));
    verifier(`${ecran} 7. Réglages sans défilement horizontal`, await sansScrollHorizontal(p));
    await p.evaluate(() => document.querySelector('.etat-stockage').scrollIntoView({ block: 'center' }));
    await capture(p, `c2-reglages-${largeur}`);
    await p.click('#main .btn:has-text("Revenir à la version d\'hier")');
    await confirmerOk(p);
    const hier = await p.evaluate(() => ({ noms: state.aVoir.map(v => v.nom), periode: state.prefs.periode, toast: document.querySelector('#toast .toast-action')?.textContent }));
    verifier(`${ecran} 7. « Revenir à la version d'hier » restaure cet état`, JSON.stringify(hier.noms) === '["Hier"]' && hier.periode === 'mois' && hier.toast === 'Annuler', JSON.stringify(hier));
    await actionToast(p);
    const annule = await p.evaluate(() => state.aVoir.map(v => v.nom));
    verifier(`${ecran} 7. « Annuler » rétablit les changements du jour`, JSON.stringify(annule) === '["Hier","Aujourd\'hui"]', JSON.stringify(annule));
    verifier(`${ecran} 7. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* Premier lancement : la protection du stockage est demandée une fois, et notée */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur });
    const r = await p.evaluate(K => ({ demande: state.prefs.persistDemande, stocke: JSON.parse(localStorage.getItem(K)).prefs.persistDemande, rev: JSON.parse(localStorage.getItem(K)).rev }), KEY);
    verifier(`${ecran} premier lancement : persistance demandée et notée`, r.demande === true && r.stocke === true && r.rev >= 1, JSON.stringify(r));
    verifier(`${ecran} premier lancement : aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }
}
bilan();
