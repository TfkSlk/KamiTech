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
      const cibles = await p.evaluate(piege => [...document.querySelectorAll('[data-tip]')].filter(e => e.dataset.tip.includes(piege)).map(e => { const r = e.getBoundingClientRect(), x = r.left + Math.min(r.width / 2, 6), y = r.top + Math.min(r.height / 2, 3), dessus = document.elementFromPoint(x, y); return { x, y, w: r.width, h: r.height, multi: e.dataset.tip.includes('\n'), libre: !!dessus && (dessus === e || e.contains(dessus)) }; }).filter(r => r.w > 0 && r.h > 0 && r.y > 0 && r.y < innerHeight && r.libre), PIEGE); // une cible cachée sous la barre du bas ne compte pas
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
      /* Au téléphone, les vues Semaine et Jour listent les RDV sans infobulle de titre : on vérifie alors seulement qu'aucun code ne s'exécute */
      const attendues = !(largeur <= 760 && (vue === 'semaine' || vue === 'jour'));
      verifier(`${ecran} 1. vue ${vue} : titre piégé jamais exécuté, #tip montre le texte littéral`,
        etat.x === undefined && etat.img === 0 && (attendues ? cibles.length > 0 && litteral === Math.min(cibles.length, 4) : true),
        JSON.stringify({ ...etat, cibles: cibles.length, litteral }));
      if (vue === 'jour' && attendues) verifier(`${ecran} 1. vue jour : une infobulle multiligne garde ses retours à la ligne`, multiOk === true, String(multiOk));
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
    /* Une saisie en mode illisible (tout de suite après, sans attendre) : le toast dit « Pas enregistré », pas « Dossier créé » */
    await p.evaluate(() => { location.hash = '#dossiers'; }); await pause(p);
    await p.evaluate(() => openDossier()); await pause(p);
    await p.fill('#f-entreprise', 'Dossier pendant illisible');
    await p.click('#modal .modal-actions .btn.primary'); await pause(p, 150);
    const t = await p.evaluate(K => ({ toast: document.querySelector('#toast').textContent, vu: document.querySelector('#toast').classList.contains('show'), action: document.querySelector('#toast .toast-action')?.textContent, cle: localStorage.getItem(K) }), KEY);
    verifier(`${ecran} 2. saisie en mode illisible : le toast dit « Pas enregistré » (avec « Choisir »), la clé reste '{abime'`,
      t.vu && /^Pas enregistré/.test(t.toast) && t.action === 'Choisir' && t.cle === '{abime', JSON.stringify(t));
    await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    if (t.action) { await p.click('#toast.show .toast-action'); await pause(p, 700); }
    const vue = await p.evaluate(() => { const r = document.querySelector('.alerte-donnees').getBoundingClientRect(); return { haut: Math.round(r.top), focus: document.activeElement?.classList.contains('alerte-donnees') }; });
    verifier(`${ecran} 2. « Choisir » amène la carte rouge sous les yeux`, vue.haut >= -1 && vue.haut < hauteur / 2 && vue.focus, JSON.stringify(vue));
    await p.evaluate(() => { location.hash = '#dashboard'; }); await pause(p);
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
    /* 6. Import puis « Annuler l'import » : retour exact à l'état d'avant (le compteur de version rev n'est pas dans l'état) */
    await p.evaluate(() => { location.hash = '#parametres'; }); await pause(p);
    await p.evaluate(() => { loadDemo(); }); await confirmerOk(p); // des données riches avant l'import
    await p.evaluate(() => { location.hash = '#parametres'; }); await pause(p);
    const avant = await p.evaluate(() => JSON.stringify(state));
    await importer(piege);
    const pendant = await p.evaluate(K => ({ d: state.dossiers.length, e: state.events.length, toast: document.querySelector('#toast .toast-action')?.textContent, copie: localStorage.getItem(K + '.avant-import') }), KEY);
    await actionToast(p);
    const apresAnnul = await p.evaluate(() => JSON.stringify(state));
    const stocke = await p.evaluate(K => { const o = JSON.parse(localStorage.getItem(K)); return JSON.stringify({ d: o.dossiers.length, e: o.events.length }); }, KEY);
    const attendu = JSON.stringify({ d: JSON.parse(avant).dossiers.length, e: JSON.parse(avant).events.length });
    verifier(`${ecran} 6. « Annuler l'import » : JSON.stringify(state) identique à l'état d'avant l'import`,
      apresAnnul === avant && !('rev' in JSON.parse(avant)) && pendant.toast === 'Annuler l\'import' && pendant.d === 1 && pendant.e === 2 && stocke === attendu && pendant.copie === avant,
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
    /* Lisible au téléphone : chaque libellé garde sa largeur (pas 5 px), rien ne se superpose */
    const mise = await p.evaluate(() => {
      const els = [...document.querySelectorAll('.etat-stockage dt, .etat-stockage dd')].map(e => { const r = e.getBoundingClientRect(); return { t: e.tagName, g: r.left, d: r.right, h: r.top, b: r.bottom, l: Math.round(r.width) }; });
      const chevauche = els.some((a, i) => els.some((b, j) => j > i && a.g < b.d - 1 && b.g < a.d - 1 && a.h < b.b - 1 && b.h < a.b - 1));
      return { largeurs: els.filter(e => e.t === 'DT').map(e => e.l), chevauche, deborde: els.some(e => e.d > innerWidth) };
    });
    verifier(`${ecran} 7. Réglages > Sauvegarde : libellés d'au moins 120 px, aucun texte superposé ni hors de l'écran`,
      mise.largeurs.length === 3 && mise.largeurs.every(l => l >= 120) && !mise.chevauche && !mise.deborde, JSON.stringify(mise));
    await p.evaluate(() => document.querySelector('.etat-stockage').scrollIntoView({ block: 'center' }));
    await capture(p, `c2-reglages-${largeur}`);
    await p.click('#main .btn:has-text("Revenir à la version d\'hier")');
    await confirmerOk(p);
    const hier = await p.evaluate(() => ({ noms: state.aVoir.map(v => v.nom), periode: state.prefs.periode, toast: document.querySelector('#toast .toast-action')?.textContent }));
    verifier(`${ecran} 7. « Revenir à la version d'hier » restaure cet état`, JSON.stringify(hier.noms) === '["Hier"]' && hier.periode === 'mois' && hier.toast === 'Annuler', JSON.stringify(hier));
    await actionToast(p);
    const annule = await p.evaluate(() => state.aVoir.map(v => v.nom));
    verifier(`${ecran} 7. « Annuler » rétablit les changements du jour`, JSON.stringify(annule) === '["Hier","Aujourd\'hui"]', JSON.stringify(annule));
    /* Ni le retour à hier ni son annulation ne refont la copie du jour : la copie d'hier reste disponible */
    const veilleNoms = () => p.evaluate(K => JSON.parse(localStorage.getItem(K + '.veille')).aVoir.map(v => v.nom), KEY);
    const apresAnnul = { veille: await p.evaluate(K => localStorage.getItem(K + '.veille'), KEY) };
    await p.evaluate(() => { location.hash = '#dashboard'; }); await pause(p, 80);
    await p.evaluate(() => { location.hash = '#parametres'; }); await pause(p);
    apresAnnul.dl = await p.evaluate(() => [...document.querySelectorAll('.etat-stockage dd')].map(x => x.textContent.trim())[2]);
    apresAnnul.bouton = await p.evaluate(() => [...document.querySelectorAll('#main .btn')].map(b => b.textContent.trim()).find(t => t.startsWith('Revenir')));
    verifier(`${ecran} 7. retour à hier puis « Annuler » : ${KEY}.veille inchangée, Réglages proposent toujours la version d'hier`,
      apresAnnul.veille === r.veille && apresAnnul.dl === 'état du vendredi 9 oct.' && apresAnnul.bouton === 'Revenir à la version d\'hier', JSON.stringify({ egal: apresAnnul.veille === r.veille, dl: apresAnnul.dl, bouton: apresAnnul.bouton }));
    /* Import puis « Annuler l'import » dans la même journée : la copie d'hier ne bouge pas non plus */
    await p.setInputFiles('#main .settings input[type=file]', { name: 'autre.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(etatSain({ aVoir: [contact('i1', 'Importé')], prefs: { ...etatSain().prefs, jourCopie: '2026-09-01' } }))) });
    await confirmerOk(p);
    const imp = { noms: await p.evaluate(() => state.aVoir.map(v => v.nom)), veille: await veilleNoms() };
    await actionToast(p);
    const impAnnul = { noms: await p.evaluate(() => state.aVoir.map(v => v.nom)), veille: await veilleNoms(), egal: await p.evaluate(K => localStorage.getItem(K + '.veille'), KEY) === r.veille };
    verifier(`${ecran} 7. import puis « Annuler l'import » : ${KEY}.veille reste la copie d'hier`,
      JSON.stringify(imp.noms) === '["Importé"]' && JSON.stringify(imp.veille) === '["Hier"]' && JSON.stringify(impAnnul.noms) === '["Hier","Aujourd\'hui"]' && impAnnul.egal, JSON.stringify({ imp, impAnnul }));
    verifier(`${ecran} 7. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* 7 bis. Import ou « Tout effacer » en premier geste du jour (jourCopie = hier), puis « Annuler » :
     la copie de la veille garde l'état d'avant, jamais celui qu'on vient d'annuler (importé ou vide) */
  {
    const dossier = (id, entreprise) => ({ id, createdAt: 1, entreprise, activite: 'cee', statut: 'prospect', commEstimee: 0, commRecue: 0 });
    const hier = etatSain({ dossiers: [dossier('d1', 'HIER')], prefs: { ...etatSain().prefs, jourCopie: '2026-10-09' } });
    const veilleDe = p => p.evaluate(K => { const v = localStorage.getItem(K + '.veille'); if (!v) return null; const o = JSON.parse(v); return { dossiers: o.dossiers.map(d => d.entreprise), jour: o.prefs.jourCopie }; }, KEY);
    /* A : import puis « Annuler l'import » */
    {
      const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, vue: 'parametres', stockage: { [KEY]: hier } });
      const avant = await p.evaluate(() => JSON.stringify(state));
      await p.setInputFiles('#main .settings input[type=file]', { name: 'fichier.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(etatSain({ dossiers: [dossier('d2', 'FICHIER')], prefs: { ...etatSain().prefs, jourCopie: '2026-09-01' } }))) });
      await confirmerOk(p);
      const v1 = await veilleDe(p);
      await actionToast(p);
      const v2 = await veilleDe(p);
      const apres = await p.evaluate(() => ({ json: JSON.stringify(state), dossiers: state.dossiers.map(d => d.entreprise), jour: state.prefs.jourCopie }));
      /* Seul le jour de copie avance : la copie de la veille a bien été faite aujourd'hui (avec l'état d'avant l'import) */
      const memeEtat = apres.json === avant.replace('"jourCopie":"2026-10-09"', '"jourCopie":"2026-10-10"');
      verifier(`${ecran} 7 bis. import en premier geste du jour : la veille reçoit l'état d'avant, et « Annuler l'import » ne la touche plus`,
        JSON.stringify(v1) === '{"dossiers":["HIER"],"jour":"2026-10-09"}' && JSON.stringify(v2) === JSON.stringify(v1) && JSON.stringify(apres.dossiers) === '["HIER"]' && apres.jour === '2026-10-10' && memeEtat,
        JSON.stringify({ v1, v2, dossiers: apres.dossiers, jour: apres.jour, memeEtat }));
      verifier(`${ecran} 7 bis. import : aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
      await fermer();
    }
    /* B : « Tout effacer » puis « Annuler », puis « Revenir à la version d'hier » : on retrouve HIER, jamais un état vide */
    {
      const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, vue: 'parametres', stockage: { [KEY]: hier } });
      await p.click('#main .btn.danger:has-text("Tout effacer")');
      await confirmerOk(p);
      const v1 = await veilleDe(p);
      await actionToast(p);
      const v2 = await veilleDe(p);
      await p.evaluate(() => { location.hash = '#dashboard'; }); await pause(p, 80);
      await p.evaluate(() => { location.hash = '#parametres'; }); await pause(p);
      const bouton = await p.evaluate(() => [...document.querySelectorAll('#main .btn')].map(b => b.textContent.trim()).find(t => t.startsWith('Revenir')));
      await p.click('#main .btn:has-text("Revenir à la version")');
      await confirmerOk(p);
      const fin = await p.evaluate(K => ({ etat: state.dossiers.map(d => d.entreprise), stocke: JSON.parse(localStorage.getItem(K)).dossiers.map(d => d.entreprise) }), KEY);
      verifier(`${ecran} 7 bis. « Tout effacer » puis « Annuler » : la veille garde HIER, « Revenir à la version d'hier » ne vide rien`,
        JSON.stringify(v1) === '{"dossiers":["HIER"],"jour":"2026-10-09"}' && JSON.stringify(v2) === JSON.stringify(v1) && bouton === 'Revenir à la version d\'hier' && JSON.stringify(fin.etat) === '["HIER"]' && JSON.stringify(fin.stocke) === '["HIER"]',
        JSON.stringify({ v1, v2, bouton, fin }));
      verifier(`${ecran} 7 bis. tout effacer : aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
      await fermer();
    }
  }

  /* Rappel au format français (stocké ou venu de Kami) : retourné en AAAA-MM-JJ, jamais vidé ; un contact en cours sans rappel
     reçoit aujourd'hui (règle C1 : un contact en cours a toujours un rappel) ; un contact clos reste sans rappel */
  {
    const c = (id, statut, rappel) => ({ ...contact(id, 'Contact ' + id), statut, rappel });
    const donnees = etatSain({ aVoir: [c('v1', 'suivi', '09/10/2026'), c('v2', 'suivi', '12/10/2026'), c('v3', 'suivi', ''), c('v4', 'clos', ''), c('v5', 'suivi', '31/02/2026')] });
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, stockage: { [KEY]: donnees } });
    const r = await p.evaluate(K => ({
      rappels: Object.fromEntries(state.aVoir.map(v => [v.id, v.rappel])), stockes: Object.fromEntries(JSON.parse(localStorage.getItem(K)).aVoir.map(v => [v.id, v.rappel])),
      dus: rappelsContacts().map(x => x.contact).sort(),
    }), KEY);
    verifier(`${ecran} rappels : '09/10/2026' devient '2026-10-09', un rappel vide ou impossible d'un contact en cours devient aujourd'hui, un clos reste sans rappel`,
      JSON.stringify(r.rappels) === '{"v1":"2026-10-09","v2":"2026-10-12","v3":"2026-10-10","v4":"","v5":"2026-10-10"}' && JSON.stringify(r.stockes) === JSON.stringify(r.rappels) && JSON.stringify(r.dus) === '["v1","v3","v5"]', JSON.stringify(r));
    /* Par Kami : une date française est gardée, un rappel vidé sur un contact en cours revient à aujourd'hui */
    const k = await p.evaluate(() => {
      appliquer([{ op: 'update', collection: 'aVoir', id: 'v1', fields: { rappel: '13/10/2026' } }, { op: 'update', collection: 'aVoir', id: 'v2', fields: { rappel: '' } }]);
      return { v1: aVoir('v1').rappel, v2: aVoir('v2').rappel };
    });
    verifier(`${ecran} rappels par Kami : '13/10/2026' devient '2026-10-13', un rappel vidé revient à aujourd'hui`, k.v1 === '2026-10-13' && k.v2 === '2026-10-10', JSON.stringify(k));
    /* Le 13 octobre, le contact v1 est bien signalé */
    await p.clock.setSystemTime(new Date('2026-10-13T09:00:00'));
    const le13 = await p.evaluate(() => rappelsContacts().some(x => x.contact === 'v1'));
    verifier(`${ecran} rappels : le jour venu, le contact au rappel retourné est dans les rappels`, le13, String(le13));
    verifier(`${ecran} rappels : aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* Kami pendant qu'une autre fenêtre écrit : ses actions s'appliquent sur les données à jour, rien n'est jeté ;
     et « ✓ appliquée(s) » n'est affiché que si c'est vraiment enregistré */
  {
    const jarvisCle = { 'kami-jarvis': { endpoint: '/api/jarvis', token: 'jeton', nom: 'Kami', voix: false, historique: [] } };
    const { ctx, p, base, erreurs, fermer } = await ouvrir({ largeur, hauteur, vue: 'jarvis', stockage: { [KEY]: etatSain(), ...jarvisCle } });
    const rdv = { id: 'kami1', titre: 'RDV posé par Kami', date: '2026-10-12', heure: '10:00', duree: 60, mode: 'visio', activite: 'cee', lien: '', fait: false, notes: '' };
    await ctx.route('**/api/jarvis', async r => {
      if (r.request().method() === 'GET') return r.fulfill({ json: { cleApi: true, tokenDefini: true, modele: 'test', effort: 'bas' } });
      await new Promise(ok => setTimeout(ok, 1200));
      return r.fulfill({ json: { texte: 'C\'est noté, RDV posé lundi.', actions: [{ op: 'add', collection: 'events', item: rdv }] } });
    });
    await pause(p, 200);
    const b = await ctx.newPage();
    await b.goto(base + 'index.html?b#contacts', { waitUntil: 'domcontentloaded' }); await pause(b, 300);
    await p.bringToFront();
    await p.click('#chat-in'); await p.keyboard.type('Mets un RDV lundi 10h'); await p.keyboard.press('Enter');
    await pause(p, 300);
    await b.evaluate(() => { state.aVoir.push({ id: 'vB', createdAt: 1, nom: 'Contact de B', entreprise: '', activite: 'cee', priorite: 'normale', statut: 'suivi', attente: '', rappel: '2026-10-14', historique: [] }); save(); });
    await pause(p, 1800);
    const r = await p.evaluate(K => { const o = JSON.parse(localStorage.getItem(K)); return { rdvEtat: state.events.some(e => e.id === 'kami1'), contactEtat: state.aVoir.some(v => v.id === 'vB'), rdvStocke: o.events.some(e => e.id === 'kami1'), contactStocke: o.aVoir.some(v => v.id === 'vB'), bulle: [...document.querySelectorAll('#chat-log .bulle')].pop()?.innerText, toast: document.querySelector('#toast').textContent }; }, KEY);
    verifier(`${ecran} Kami : une autre fenêtre écrit pendant la requête, le RDV de Kami et le contact de B sont gardés tous les deux`,
      r.rdvEtat && r.contactEtat && r.rdvStocke && r.contactStocke && /✓ 1 action\(s\) appliquée\(s\)/.test(r.bulle) && !/refais/.test(r.toast), JSON.stringify(r));
    await b.close();
    /* Données illisibles : rien ne peut être enregistré, Kami le dit au lieu d'annoncer « ✓ appliquée(s) » */
    await p.evaluate(K => localStorage.setItem(K, '{abime'), KEY);
    await p.reload({ waitUntil: 'domcontentloaded' }); await pause(p, 300);
    await p.click('#chat-in'); await p.keyboard.type('Mets un RDV lundi 10h'); await p.keyboard.press('Enter');
    await pause(p, 1700);
    const k = await p.evaluate(K => { const b = [...document.querySelectorAll('#chat-log .bulle')].pop(); return { texte: b?.innerText, erreur: b?.classList.contains('erreur'), cle: localStorage.getItem(K), toast: document.querySelector('#toast').textContent }; }, KEY);
    verifier(`${ecran} Kami : pas enregistré (données illisibles) → bulle « Pas enregistré », jamais « ✓ appliquée(s) »`,
      k.erreur && /^Pas enregistré/.test(k.texte) && !/✓/.test(k.texte) && k.cle === '{abime' && /^Pas enregistré/.test(k.toast), JSON.stringify(k));
    verifier(`${ecran} Kami : aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* Données illisibles ET stockage plein (aucune copie possible) : on peut télécharger le texte illisible tel quel ;
     « Revenir à la veille » et « Importer » demandent confirmation avant de le remplacer pour de bon */
  {
    const brut = '{"dossiers":[{"id":"d9","entreprise":"PRECIEUX"';
    const veille = etatSain({ dossiers: [{ id: 'd1', createdAt: 1, entreprise: 'VEILLE', activite: 'cee', statut: 'prospect' }], prefs: { ...etatSain().prefs, jourCopie: '2026-10-09' } });
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, stockage: { [KEY]: brut, [KEY + '.veille']: veille } });
    await p.addInitScript(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(k).includes('.corrompu-')) throw new DOMException('plein', 'QuotaExceededError'); return o.call(this, k, v); }; });
    await p.evaluate(K => { for (const k of Object.keys(localStorage)) if (k.includes('.corrompu-')) localStorage.removeItem(k); }, KEY);
    await p.reload({ waitUntil: 'domcontentloaded' }); await pause(p, 300);
    const carte = await p.evaluate(() => { const c = document.querySelector('.alerte-donnees'); return { texte: c?.innerText || '', boutons: c ? [...c.querySelectorAll('.btn')].map(b => b.textContent.trim()) : [] }; });
    verifier(`${ecran} stockage plein : la carte propose d'abord « Télécharger les données illisibles », sans conseiller d'exporter`,
      carte.boutons[0] === 'Télécharger les données illisibles' && carte.boutons.includes('Revenir à la veille') && !/Exporte/.test(carte.texte), JSON.stringify(carte));
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.alerte-donnees .btn:has-text("Télécharger les données illisibles")')]);
    const fs = await import('node:fs');
    const contenu = fs.readFileSync(await dl.path(), 'utf8');
    verifier(`${ecran} stockage plein : le fichier téléchargé contient le texte illisible tel quel`, contenu === brut && /\.txt$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    await p.click('.alerte-donnees .btn:has-text("Revenir à la veille")'); await pause(p, 150);
    const conf = await p.evaluate(() => ({ ouvert: document.querySelector('#confirm').open, msg: document.querySelector('#confirm-msg').textContent }));
    await p.click('#confirm button[value="cancel"]'); await pause(p, 150);
    const garde = await p.evaluate(K => localStorage.getItem(K), KEY);
    verifier(`${ecran} stockage plein : « Revenir à la veille » demande confirmation ; « Annuler » garde le texte illisible`, conf.ouvert && /définitivement/.test(conf.msg) && garde === brut, JSON.stringify({ ...conf, garde: garde === brut }));
    await p.setInputFiles('.alerte-donnees input[type=file]', { name: 's.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(etatSain())) });
    await p.waitForSelector('#confirm[open]', { timeout: 3000 });
    const confImp = await p.evaluate(() => document.querySelector('#confirm-msg').textContent);
    await p.click('#confirm button[value="cancel"]'); await pause(p, 150);
    verifier(`${ecran} stockage plein : « Importer » prévient que les données illisibles seront définitivement remplacées`, /définitivement/.test(confImp) && await p.evaluate(K => localStorage.getItem(K), KEY) === brut, confImp);
    await p.click('.alerte-donnees .btn:has-text("Revenir à la veille")');
    await confirmerOk(p);
    const fin = await p.evaluate(() => ({ dossiers: state.dossiers.map(d => d.entreprise), carte: !!document.querySelector('.alerte-donnees') }));
    verifier(`${ecran} stockage plein : confirmé, la veille est rétablie`, JSON.stringify(fin.dossiers) === '["VEILLE"]' && !fin.carte, JSON.stringify(fin));
    verifier(`${ecran} stockage plein : aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* Ancien contact (objet + createdAt illisible) : pas d'écran blanc. Et si une migration plante quand même, filet :
     l'appli s'affiche avec la carte rouge, les données stockées restent intactes et copiées */
  {
    const ancien = '{"dossiers":[],"events":[],"aVoir":[{"id":"v1","nom":"X","objet":"ancien","createdAt":"zzz"}]}';
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, stockage: { [KEY]: ancien } });
    const r = await p.evaluate(() => ({ main: document.querySelector('#main').children.length, carte: !!document.querySelector('.alerte-donnees'), histo: state.aVoir[0]?.historique }));
    verifier(`${ecran} ancien contact au createdAt illisible : pas d'écran blanc, son sujet passe au journal (daté d'aujourd'hui)`,
      r.main > 0 && !r.carte && JSON.stringify(r.histo) === '[{"date":"2026-10-10","texte":"ancien"}]', JSON.stringify(r));
    verifier(`${ecran} ancien contact : aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }
  {
    const piege = JSON.stringify(etatSain({ aVoir: [contact('p1', 'Piège migration')] }));
    const bonneVeille = JSON.stringify(etatSain({ aVoir: [contact('h1', 'Bonne veille')], prefs: { ...etatSain().prefs, jourCopie: '2026-10-08' } }));
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, stockage: { [KEY]: piege, [KEY + '.veille']: bonneVeille } });
    /* Simule une migration en panne : lire « relance » sur ce contact lève une erreur (migrate() le lit pour chaque contact) */
    await p.addInitScript(() => { Object.defineProperty(Object.prototype, 'relance', { configurable: true,
      get() { if (this && this.nom === 'Piège migration') throw new Error('migration en panne'); return undefined; },
      set(v) { Object.defineProperty(this, 'relance', { value: v, writable: true, enumerable: true, configurable: true }); } }); });
    await p.reload({ waitUntil: 'domcontentloaded' }); await pause(p, 300);
    const r = await p.evaluate(K => ({ main: document.querySelector('#main').children.length, carte: document.querySelector('.alerte-donnees h2')?.textContent, cle: localStorage.getItem(K), copie: Object.keys(localStorage).some(k => k.startsWith(K + '.corrompu-') && localStorage.getItem(k) === localStorage.getItem(K)) }), KEY);
    verifier(`${ecran} migration en panne : l'appli s'affiche avec la carte rouge, la clé est intacte et copiée`,
      r.main > 0 && r.carte === 'Tes données n\'ont pas pu être lues. Une copie est gardée.' && r.cle === piege && r.copie, JSON.stringify({ ...r, cle: r.cle === piege }));
    /* « Repartir de zéro » : on enregistre de nouveau, sans écraser la bonne copie de la veille par les données en panne */
    await p.click('.alerte-donnees .btn:has-text("Repartir de zéro")');
    await confirmerOk(p);
    const z = await p.evaluate(K => ({ carte: !!document.querySelector('.alerte-donnees'), cle: localStorage.getItem(K), veille: localStorage.getItem(K + '.veille') }), KEY);
    verifier(`${ecran} migration en panne puis « Repartir de zéro » : enregistré de nouveau, la copie de la veille reste la bonne`,
      !z.carte && z.cle !== piege && JSON.parse(z.cle).rev > 3 && z.veille === bonneVeille, JSON.stringify({ carte: z.carte, rev: JSON.parse(z.cle || '{}').rev, veille: z.veille === bonneVeille }));
    verifier(`${ecran} migration en panne : aucune erreur JS non rattrapée`, erreurs.length === 0, erreurs.join(' | '));
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
