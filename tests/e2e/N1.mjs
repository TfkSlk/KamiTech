/* N1 — Kami hors ligne : lecteur local des phrases en français, sans clé.
   Horloge figée au samedi 2026-10-10 09:00 (Paris). Le lecteur (window.Lire) est vérifié dans l'appli, au téléphone (390x844)
   et à l'ordinateur (1366x800) ; le banc d'essai (tests/lire.test.mjs et tests/lire.html) est lancé aussi.
   La Rencontre est parcourue sans jeton Kami (lecture locale), puis avec un faux /api/analyser (Kami complète, sans rien effacer). */
import { ouvrir, verifier, bilan, sansDefilement, RACINE } from './outil.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CAPTURES = process.env.CAPTURES || '';
const capture = async (p, nom) => { if (CAPTURES) await p.screenshot({ path: path.join(CAPTURES, nom + '.png') }); };
const pause = (p, ms = 80) => p.waitForTimeout(ms);
const sansScrollHorizontal = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const titre = p => p.$eval('#rencontre h2', e => e.textContent.trim());
/* Depuis N2, l'écran 0 est « Noter » : son bouton principal enregistre ; « Ajuster… » mène aux étapes suivantes */
const continuer = async p => { await p.click((await titre(p)) === 'Noter' ? '#r-ajuster' : '#rencontre .r-foot .btn.primary'); await pause(p, 60); };
const retour = async p => { await p.click('#rencontre .r-foot .btn:not(.primary)'); await pause(p, 60); };
const KARIM = 'croisé Karim de Karim SARL, on a parlé du KGD Pro, je lui envoie le dossier, rappelle-moi dans 3 jours, à voir début 2027';
const AUCUN = JSON.stringify({ type: 'aucun', date: '', heure: '', du: '', au: '' });

/* 1. Banc d'essai en Node : code 0 et au moins 45 cas verts */
{
  const r = spawnSync(process.execPath, [path.join(RACINE, 'tests', 'lire.test.mjs')], { encoding: 'utf8', timeout: 60000 });
  const m = /(\d+)\/(\d+) cas verts/.exec(r.stdout || '');
  verifier('1. node tests/lire.test.mjs : code 0, au moins 45 cas verts', r.status === 0 && m && m[1] === m[2] && Number(m[1]) >= 45, `code ${r.status} · ${m ? m[0] : (r.stdout || '') + (r.stderr || '')}`);
}

/* 9. Vitesse dans le navigateur (horloge réelle : performance.now n'est pas figé) */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge: null });
  const ms = await p.evaluate(() => {
    const phrase = 'croisé Karim de Karim SARL au salon, on a parlé du KGD Pro et de la CEE, je lui envoie le dossier, il me renvoie ses factures, rappelle-moi dans 3 jours, rdv jeudi 14h30, à voir début 2027, 0612345678';
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) Lire.lireNote(phrase, new Date(), connus());
    return { moyenne: (performance.now() - t0) / 100, longueur: phrase.length };
  });
  verifier(`9. navigateur : phrase de ${ms.longueur} caractères lue en ${ms.moyenne.toFixed(3)} ms en moyenne sur 100 appels (< 5 ms)`, ms.longueur === 200 && ms.moyenne < 5);
  verifier('9. aucune erreur JS (mesure)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

for (const [largeur, hauteur] of [[390, 844], [1366, 800]]) {
  const ecran = `${largeur}px`;

  /* 1. tests/lire.html affiche N/N */
  {
    const { p, base, erreurs, fermer } = await ouvrir({ largeur, hauteur, horloge: null });
    await p.goto(base + 'tests/lire.html', { waitUntil: 'load' });
    await pause(p, 200);
    const banc = await p.evaluate(() => ({ score: document.querySelector('#score')?.textContent.trim(), vert: document.querySelector('#score')?.className, ko: document.querySelectorAll('.cas.ko').length, ok: document.querySelectorAll('.cas.ok').length }));
    const m = /^(\d+)\/(\d+)$/.exec(banc.score || '');
    verifier(`${ecran} 1. tests/lire.html affiche N/N (${banc.score}), tout en vert`, m && m[1] === m[2] && Number(m[1]) >= 45 && banc.ko === 0 && banc.ok === Number(m[1]) && banc.vert === 'vert', JSON.stringify(banc));
    verifier(`${ecran} 1. tests/lire.html sans défilement horizontal ni erreur`, await sansScrollHorizontal(p) && erreurs.length === 0, erreurs.join(' | '));
    await capture(p, `banc-${largeur}`);
    await fermer();
  }

  const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, exemple: true });
  const lire = (texte, connus = [], ignores = []) => p.evaluate(([t, c, i]) => Lire.lireNote(t, new Date(), c, i), [texte, connus, ignores]);

  /* Chargement : lire.js avant views.js, un seul nom exposé, premierNom passe par Lire */
  const charge = await p.evaluate(() => {
    const srcs = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'));
    return {
      ordre: srcs.indexOf('lire.js') >= 0 && srcs.indexOf('lire.js') < srcs.indexOf('views.js') && srcs.indexOf('views.js') < srcs.indexOf('app.js'),
      api: Object.keys(window.Lire || {}).sort().join(','), gele: Object.isFrozen(window.Lire),
      nues: ['lireNote', 'normaliser', 'scoreFlou'].filter(k => k in window),
      premier: premierNom('croisé Karim de Karim SARL, KGD Pro') + '|' + premierNom('visite du salon, super'),
    };
  });
  verifier(`${ecran} lire.js chargé avant views.js, window.Lire = { jourOuvre, lireNote, normaliser, premierNom, scoreFlou }, aucune globale nue`,
    charge.ordre && charge.api === 'jourOuvre,lireNote,normaliser,premierNom,scoreFlou' && charge.gele && charge.nues.length === 0, JSON.stringify(charge));
  verifier(`${ecran} premierNom d'app.js = Lire.premierNom (le nom, sinon le début de la note)`, charge.premier === 'Karim|visite du salon', charge.premier);
  const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
  verifier(`${ecran} sw.js : './lire.js' dans SHELL, VERSION kgd-v5 ou plus récente`, /SHELL = \[[^\]]*'\.\/lire\.js'/.test(sw) && Number((/VERSION = 'kgd-v(\d+)'/.exec(sw) || [])[1]) >= 5);

  /* 2. Dates, référence samedi 2026-10-10 (horloge de la page) */
  const d = {
    rappel3: await lire('rappelle-moi dans 3 jours'),
    jeudi: await lire('jeudi 14h'),
    semaine: await lire('semaine prochaine'),
    debut2027: await lire('à voir début 2027'),
    finOct: await lire('fin octobre'),
    miNov: await lire('mi-novembre'),
  };
  verifier(`${ecran} 2. « rappelle-moi dans 3 jours » → rappel 2026-10-13`, d.rappel3.rappel === '2026-10-13' && JSON.stringify(d.rappel3.creneau) === AUCUN, JSON.stringify(d.rappel3.rappel));
  verifier(`${ecran} 2. « jeudi 14h » → creneau date 2026-10-15 à 14:00`, JSON.stringify(d.jeudi.creneau) === JSON.stringify({ type: 'date', date: '2026-10-15', heure: '14:00', du: '', au: '' }), JSON.stringify(d.jeudi.creneau));
  verifier(`${ecran} 2. « semaine prochaine » → creneau semaine du 2026-10-12`, d.semaine.creneau.type === 'semaine' && d.semaine.creneau.du === '2026-10-12', JSON.stringify(d.semaine.creneau));
  verifier(`${ecran} 2. « à voir début 2027 » → période du 2027-01-04 au 2027-02-28`, d.debut2027.creneau.type === 'periode' && d.debut2027.creneau.du === '2027-01-04' && d.debut2027.creneau.au === '2027-02-28', JSON.stringify(d.debut2027.creneau));
  verifier(`${ecran} 2. « fin octobre » → du 2026-10-20 au 2026-10-31`, d.finOct.creneau.type === 'periode' && d.finOct.creneau.du === '2026-10-20' && d.finOct.creneau.au === '2026-10-31', JSON.stringify(d.finOct.creneau));
  verifier(`${ecran} 2. « mi-novembre » → du 2026-11-11 au 2026-11-20`, d.miNov.creneau.type === 'periode' && d.miNov.creneau.du === '2026-11-11' && d.miNov.creneau.au === '2026-11-20', JSON.stringify(d.miNov.creneau));

  /* 3 à 8 : les phrases des critères */
  const k = await lire(KARIM);
  verifier(`${ecran} 3. phrase de Karim → Karim · Karim SARL · kgdpro · moi · rappel 2026-10-13 · période 2027-01-04 → 2027-02-28`,
    k.nom === 'Karim' && k.entreprise === 'Karim SARL' && k.activite === 'kgdpro' && k.attente === 'moi' && k.rappel === '2026-10-13'
    && JSON.stringify(k.creneau) === JSON.stringify({ type: 'periode', date: '', heure: '', du: '2027-01-04', au: '2027-02-28' }), JSON.stringify({ ...k, jetons: k.jetons.length }));
  const f = await lire("il m'envoie ses avis de taxe foncière");
  verifier(`${ecran} 4. « il m'envoie ses avis de taxe foncière » → foncier · lui · rappel 2026-10-13`, f.activite === 'foncier' && f.attente === 'lui' && f.rappel === '2026-10-13', JSON.stringify({ ...f, jetons: undefined }));
  const j = await lire('Julien de la Pizzeria Nova, démo KamiFood, je lui envoie le lien');
  verifier(`${ecran} 5. « Julien de la Pizzeria Nova… » → Julien · Pizzeria Nova · kamifood · moi`, j.nom === 'Julien' && j.entreprise === 'Pizzeria Nova' && j.activite === 'kamifood' && j.attente === 'moi', JSON.stringify({ ...j, jetons: undefined }));
  const t = await lire('06 12 34 56 78'), imp = await lire("signature le jour de l'annonce des prix");
  verifier(`${ecran} 6. « 06 12 34 56 78 » → tel ; « signature… annonce des prix » → important`, t.tel === '06 12 34 56 78' && imp.important === true && t.important === false, `${t.tel} · ${imp.important}`);
  const ex = await lire("Mme Roth m'envoie ses avis", [{ type: 'c', id: 'x1', nom: 'Mme Roth', activite: 'foncier' }]);
  verifier(`${ecran} 7. connus = [Mme Roth] : « Mme Roth m'envoie ses avis » → existant {c, x1} et son secteur`, JSON.stringify(ex.existant) === JSON.stringify({ type: 'c', id: 'x1' }) && ex.activite === 'foncier', JSON.stringify(ex.existant));
  const ig = await lire('croisé Paul, il veut des primes CEE pour son entrepôt', [], ['activite']);
  verifier(`${ecran} 8. ignores = ['activite'] sur une phrase avec « CEE » → activite '' (le mot reste dans le sujet, jeton barré)`,
    ig.activite === '' && /CEE/.test(ig.sujet) && ig.jetons.some(x => x.cle === 'activite' && x.ignore), JSON.stringify({ activite: ig.activite, sujet: ig.sujet }));
  /* Avec les données d'exemple, la vraie liste des fiches : Mme Roth est reconnue */
  const exApp = await p.evaluate(() => { const r = Lire.lireNote("Mme Roth m'envoie ses avis", new Date(), connus()); const v = state.aVoir.find(x => x.nom === 'Mme Roth'); return r.existant && r.existant.type === 'c' && r.existant.id === v.id; });
  verifier(`${ecran} 7. connus() de l'appli (exemple) : Mme Roth reconnue`, exApp);

  /* Rencontre sans jeton : la phrase remplit les écrans suivants, chaque écran tient sans défiler */
  const sansJeton = await p.evaluate(() => !jarvis.token);
  await p.evaluate(() => openContact());
  await pause(p);
  const meta0 = await p.$eval('#rencontre .r-jetons-vide', e => e.textContent.trim());
  const boutonKami = await p.evaluate(() => /Kami remplit tout/.test(document.body.innerHTML));
  await p.fill('#r-note', KARIM);
  const vues = [{ t: await titre(p), ok: await sansDefilement(p, '#rencontre .r-body') }];
  await capture(p, `rencontre0-${largeur}`);
  await continuer(p);
  const e1 = await p.evaluate(() => ({ t: document.querySelector('#rencontre h2').textContent, nom: $('#r-nom').value, entreprise: $('#r-entreprise').value, chip: document.querySelector('#rencontre .chips .chip.on')?.textContent.trim() }));
  vues.push({ t: e1.t, ok: await sansDefilement(p, '#rencontre .r-body') });
  await capture(p, `rencontre1-${largeur}`);
  await continuer(p);
  const e2 = await p.evaluate(() => ({ t: document.querySelector('#rencontre h2').textContent, att: document.querySelector('#rencontre .opt.on b')?.textContent, rappel: $('#r-rappel-txt').textContent.trim(), date: $('#r-rappel').value, puce: document.querySelector('#r-rappels .chip.on')?.textContent.trim() }));
  vues.push({ t: e2.t, ok: await sansDefilement(p, '#rencontre .r-body') });
  await capture(p, `rencontre2-${largeur}`);
  await continuer(p);
  const e3 = await p.evaluate(() => ({ t: document.querySelector('#rencontre h2').textContent, cr: document.querySelector('#rencontre .opt.on b')?.textContent, du: $('#r-crDu')?.value, au: $('#r-crAu')?.value, objet: $('#r-objet')?.value }));
  vues.push({ t: e3.t, ok: await sansDefilement(p, '#rencontre .r-body') });
  await capture(p, `rencontre3-${largeur}`);
  await continuer(p);
  const e4 = await p.evaluate(() => ({ t: document.querySelector('#rencontre h2').textContent, sujet: $('#r-sujet').value, suite: $('#r-suite').textContent.replace(/\s+/g, ' ').trim() }));
  vues.push({ t: e4.t, ok: await sansDefilement(p, '#rencontre .r-body') });
  await capture(p, `rencontre4-${largeur}`);
  const horizontal = await sansScrollHorizontal(p);
  const nb = await p.evaluate(() => ({ c: state.aVoir.length, e: state.events.length }));
  await continuer(p); // Enregistrer
  const cree = await p.evaluate(() => { const v = state.aVoir.at(-1); const ev = state.events.find(e => e.id === v.eventId); return { v: { nom: v.nom, entreprise: v.entreprise, activite: v.activite, attente: v.attente, rappel: v.rappel, statut: v.statut, journal: v.historique.at(-1)?.texte }, ev: ev && { date: ev.date, fin: ev.fin, aPrevoir: ev.aPrevoir, lien: ev.lien === 'c:' + v.id }, toast: $('#toast').textContent }; });
  verifier(`${ecran} Rencontre sans jeton : le texte de l'écran 1 annonce la lecture locale, pas de bouton Kami grisé, rien de rouge`,
    sansJeton && /lus ici, même hors ligne/.test(meta0) && !boutonKami && await p.evaluate(() => !document.querySelector('#rencontre .manque, #rencontre .alerte-donnees')), meta0);
  verifier(`${ecran} Rencontre sans jeton : « Qui ? » pré-rempli (Karim · Karim SARL · KGD Pro)`, e1.t === 'Qui ?' && e1.nom === 'Karim' && e1.entreprise === 'Karim SARL' && e1.chip === 'KGD Pro', JSON.stringify(e1));
  verifier(`${ecran} Rencontre sans jeton : « Et ensuite ? » = je lui dois, rappel « → mardi 13 oct. », puce 3 jours allumée`, e2.att === 'Je lui dois des informations' && e2.rappel === '→ mardi 13 oct.' && e2.date === '2026-10-13' && e2.puce === '3 jours', JSON.stringify(e2));
  verifier(`${ecran} Rencontre sans jeton : « Dans le planning ? » = une période du 2027-01-04 au 2027-02-28`, e3.cr === 'Une période' && e3.du === '2027-01-04' && e3.au === '2027-02-28', JSON.stringify(e3));
  /* Recette N1 : sans Kami, le journal garde la note entière (le sujet du lecteur local, dates retirées et coupé à 140 caractères, n'y va plus) */
  verifier(`${ecran} Rencontre sans jeton : récapitulatif avec la note entière et la suite`, e4.sujet === KARIM && /Rappel mardi 13 oct\./.test(e4.suite) && /04\/01\/2027|4 janv/.test(e4.suite), JSON.stringify(e4));
  verifier(`${ecran} Rencontre : les 5 écrans tiennent sans défiler, pas de défilement horizontal`, vues.length === 5 && vues.every(v => v.ok) && horizontal, JSON.stringify(vues));
  verifier(`${ecran} Rencontre enregistrée : contact complet et période « à prévoir » liée`,
    cree.v.nom === 'Karim' && cree.v.entreprise === 'Karim SARL' && cree.v.activite === 'kgdpro' && cree.v.attente === 'moi' && cree.v.rappel === '2026-10-13' && cree.v.statut === 'suivi'
    && cree.v.journal === e4.sujet && cree.ev && cree.ev.date === '2027-01-04' && cree.ev.fin === '2027-02-28' && cree.ev.aPrevoir && cree.ev.lien
    && await p.evaluate(n => state.aVoir.length === n.c + 1 && state.events.length === n.e + 1, nb), JSON.stringify(cree));

  /* Un choix fait à la main n'est jamais remplacé par la lecture ; une note modifiée est relue pour le reste */
  await p.evaluate(() => openContact());
  await pause(p);
  await p.fill('#r-note', 'Julien de la Pizzeria Nova, démo KamiFood, rappelle-moi jeudi');
  await continuer(p);
  await p.click('#rencontre .chips .chip:has-text("CEE")'); await pause(p, 40);
  await retour(p);
  await p.fill('#r-note', 'Julien de la Pizzeria Nova, démo KamiFood, rappelle-moi lundi');
  await continuer(p);
  const main = await p.evaluate(() => ({ activite: renc.activite, nom: renc.nom, rappel: renc.rappel }));
  await p.evaluate(() => fermerRencontre());
  verifier(`${ecran} Lecture : le secteur choisi à la main reste (CEE), le rappel suit la note modifiée (lundi 12)`, main.activite === 'cee' && main.nom === 'Julien' && main.rappel === '2026-10-12', JSON.stringify(main));

  /* Formulaire de l'accueil (nom + sujet saisis) : ils restent tels quels, le secteur est lu */
  await p.evaluate(() => openContact(null, { nom: 'Paul', sujet: 'pas intéressé par la CEE' }));
  await pause(p);
  await continuer(p);
  const prefill = await p.evaluate(() => ({ nom: renc.nom, sujet: renc.sujet, activite: renc.activite }));
  await p.evaluate(() => fermerRencontre());
  verifier(`${ecran} Saisie de l'accueil : nom et sujet gardés, secteur CEE lu`, prefill.nom === 'Paul' && prefill.sujet === 'pas intéressé par la CEE' && prefill.activite === 'cee', JSON.stringify(prefill));

  /* Contact connu (« Contacté ») : la note donne l'attente et le rappel, le nom ne bouge pas */
  const roth = await p.evaluate(() => state.aVoir.find(v => v.nom === 'Mme Roth').id);
  await p.evaluate(id => openContact(id), roth);
  await pause(p);
  await p.fill('#r-note', "elle m'envoie ses avis, on parlera aussi de son électricité, rappelle-moi le 20");
  await continuer(p);
  const connu = await p.evaluate(() => ({ t: document.querySelector('#rencontre h2').textContent, attente: renc.attente, rappel: renc.rappel, nom: renc.v.nom, activite: renc.activite, txt: $('#r-rappel-txt').textContent.trim() }));
  await p.evaluate(() => fermerRencontre());
  verifier(`${ecran} Contact connu : attente « lui » et rappel du 20 lus ; son nom et son service (foncier) ne bougent pas`,
    connu.t === 'Et ensuite ?' && connu.attente === 'lui' && connu.rappel === '2026-10-20' && connu.nom === 'Mme Roth' && connu.activite === 'foncier' && connu.txt === '→ mardi 20 oct.', JSON.stringify(connu));

  /* ---------- Recette N1 : corrections ---------- */
  const enregistrerNote = async note => { await p.evaluate(() => openContact()); await pause(p); await p.fill('#r-note', note); await pause(p, 200); await p.click('#r-enregistrer'); await pause(p, 120); };
  const dernier = () => p.evaluate(() => { const v = state.aVoir.at(-1); return { nom: v.nom, entreprise: v.entreprise, rappel: v.rappel, statut: v.statut, journal: v.historique.at(-1)?.texte, toast: $('#toast').textContent }; });

  /* R1 et R8. Des mesures ne sont pas des dates : « 80m² » ne repousse pas le rappel de 7 ans, « 4m », « 12m », « 20s » ne sont pas des rappels */
  {
    const m = {
      a: await lire('croisé Paul de Logistik SARL, entrepôt de 80m², isolation, je lui envoie le devis'), b: await lire('plafond à 4m, éclairage LED'),
      c: await lire('Mme Roth, local de 80m², rappelle-moi jeudi'), d: await lire('il a 2 sites de 12m chacun, rappelle-moi lundi'), e: await lire('vu Paul, il veut 20s de vidéo'), f: await lire('Paul, CEE, 3j'),
    };
    verifier(`${ecran} R1/R8. lecteur : « 80m² », « 4m », « 12m », « 20s » ne sont pas des dates ; le « rappelle-moi » qui suit est lu ; « Paul, CEE, 3j » reste lu`,
      m.a.rappel === '2026-10-13' && /entrepôt de 80m²/.test(m.a.sujet) && m.b.rappel === '' && m.b.sujet === 'plafond à 4m, éclairage LED' && m.c.rappel === '2026-10-15' && m.c.sujet === 'Mme Roth, local de 80m²'
      && m.d.rappel === '2026-10-12' && m.e.rappel === '' && m.e.creneau.type === 'aucun' && m.f.rappel === '2026-10-13',
      JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, x]) => [k, [x.rappel, x.sujet]]))));
    await p.evaluate(() => openContact()); await pause(p);
    await p.fill('#r-note', 'croisé Paul de Logistik SARL, entrepôt de 80m², isolation, je lui envoie le devis');
    await continuer(p); await continuer(p);
    const e2 = await p.evaluate(() => ({ t: $('#rencontre h2').textContent, txt: $('#r-rappel-txt').textContent.trim(), date: $('#r-rappel').value }));
    await continuer(p); await continuer(p); await continuer(p); // Enregistrer
    const v = await dernier();
    verifier(`${ecran} R1. appli : « Et ensuite ? » → mardi 13 oct. ; contact enregistré avec ce rappel, « entrepôt de 80m² » au journal`,
      e2.t === 'Et ensuite ?' && e2.txt === '→ mardi 13 oct.' && e2.date === '2026-10-13' && v.nom === 'Paul' && v.rappel === '2026-10-13' && /entrepôt de 80m², isolation/.test(v.journal), JSON.stringify({ e2, v }));
    await enregistrerNote('Mme Weiss, local de 80m², rappelle-moi jeudi');
    const r8 = await dernier();
    verifier(`${ecran} R8. appli : « local de 80m², rappelle-moi jeudi » → rappel jeu. 15 oct. (pas le 10 juin 2033)`, r8.nom === 'Mme Weiss' && r8.rappel === '2026-10-15' && r8.toast === 'Mme Weiss · rappel jeu. 15 oct.', JSON.stringify(r8));
  }

  /* R2. Le moment de la rencontre (« vu Karim aujourd'hui », « ce matin ») n'est ni un rappel ni un RDV, et ne prend pas la place de la vraie date */
  {
    const a = await lire("vu Karim aujourd'hui, il m'envoie ses factures"), b = await lire('vu Paul ce matin, il veut une démo KamiFood la semaine prochaine'), c = await lire('urgent : il attend une réponse avant ce soir !');
    verifier(`${ecran} R2. lecteur : « vu Karim aujourd'hui » → rappel par défaut 13 oct. ; « vu Paul ce matin… démo la semaine prochaine » → semaine du 12, Démo KamiFood ; « avant ce soir » reste une échéance`,
      a.rappel === '2026-10-13' && a.creneau.type === 'aucun' && b.rappel === '' && b.creneau.type === 'semaine' && b.creneau.du === '2026-10-12' && b.objet === 'Démo KamiFood' && c.rappel === '2026-10-10',
      JSON.stringify({ a: [a.rappel, a.creneau], b: [b.rappel, b.creneau, b.objet], c: c.rappel }));
    await p.evaluate(() => openContact()); await pause(p);
    await p.fill('#r-note', "J'ai vu Marc ce matin au salon, il est chez EDF depuis 10 ans, son contrat finit fin mars");
    for (let i = 0; i < 4; i++) await continuer(p);
    const suite = await p.$eval('#r-suite', e => e.textContent.replace(/\s+/g, ' ').trim());
    await continuer(p); // Enregistrer
    const r = await p.evaluate(() => { const v = state.aVoir.at(-1); const ev = state.events.find(e => e.id === v.eventId); return { nom: v.nom, statut: v.statut, rappel: v.rappel, ev: ev && { date: ev.date, fin: ev.fin, heure: ev.heure, aPrevoir: ev.aPrevoir } }; });
    verifier(`${ecran} R2. appli : « vu Marc ce matin… fin mars » → pas de RDV aujourd'hui à 9 h, période du 20 au 31 mars 2027 à prévoir, contact en suivi`,
      !/RDV/.test(suite) && r.nom === 'Marc' && r.statut === 'suivi' && r.rappel === '2026-10-13' && r.ev && r.ev.date === '2027-03-20' && r.ev.fin === '2027-03-31' && r.ev.aPrevoir && !r.ev.heure, JSON.stringify({ suite, r }));
  }

  /* R3 et R9. Un contact déjà connu, reconnu par le lecteur, est proposé sur « Qui ? » et au récapitulatif : un toucher, et la note va dans sa fiche */
  {
    const roth = await p.evaluate(() => { const v = state.aVoir.find(x => x.nom === 'Mme Roth'); return { id: v.id, n: state.aVoir.length, journal: v.historique.length }; });
    await p.evaluate(() => openContact()); await pause(p);
    await p.fill('#r-note', "Mme Roth m'envoie ses avis, rappelle-moi lundi");
    await continuer(p); // Ajuster… → Qui ?
    const qui = await p.evaluate(() => ({ t: $('#rencontre h2').textContent, bandeau: $('#r-doublon span')?.textContent.trim(), bouton: $('#r-doublon button')?.textContent.trim(), activite: renc.activite, defaut: renc.defauts.activite, existant: renc.lecture.existant && renc.lecture.existant.id }));
    const tient = await sansDefilement(p, '#rencontre .r-body');
    await capture(p, `r3-qui-${largeur}`);
    verifier(`${ecran} R3. « Qui ? » : « Mme Roth (Pharmacie de la Gare) existe déjà · Ajouter à sa fiche », sans défiler`,
      qui.t === 'Qui ?' && qui.existant === roth.id && qui.bandeau === 'Mme Roth (Pharmacie de la Gare) existe déjà' && qui.bouton === 'Ajouter à sa fiche' && tient, JSON.stringify(qui));
    verifier(`${ecran} R9. nouveau contact non rattaché : le secteur de la fiche reconnue (foncier) n'est pas repris`, qui.activite === qui.defaut && qui.activite !== 'foncier', JSON.stringify(qui));
    await p.click('#r-doublon button'); await pause(p, 80);
    const apres = await p.evaluate(() => ({ t: $('#rencontre h2').textContent, v: renc.v && renc.v.id, meta: $('#rencontre .r-head .meta').textContent, rappel: renc.rappel, attente: renc.attente, activite: renc.activite }));
    await continuer(p); await continuer(p); // → planning → récapitulatif
    const recapSans = !(await p.$('#r-doublon'));
    await continuer(p); // Enregistrer
    const fin = await p.evaluate(id => { const v = aVoir(id); return { n: state.aVoir.length, roths: state.aVoir.filter(x => x.nom === 'Mme Roth').length, journal: v.historique.length, dernier: v.historique.at(-1).texte, rappel: v.rappel }; }, roth.id);
    verifier(`${ecran} R3. « Ajouter à sa fiche » depuis « Qui ? » : « Et ensuite ? » de Mme Roth (son secteur), puis aucun doublon et son journal +1`,
      apres.t === 'Et ensuite ?' && apres.v === roth.id && /Mme Roth/.test(apres.meta) && apres.rappel === '2026-10-12' && apres.attente === 'lui' && apres.activite === 'foncier' && recapSans
      && fin.n === roth.n && fin.roths === 1 && fin.journal === roth.journal + 1 && fin.dernier === "Mme Roth m'envoie ses avis, rappelle-moi lundi" && fin.rappel === '2026-10-12', JSON.stringify({ apres, fin }));
    /* Au récapitulatif aussi (chemin de Kami, qui saute « Qui ? ») */
    await p.evaluate(() => openContact()); await pause(p);
    await p.fill('#r-note', "Mme Roth m'envoie ses avis");
    for (let i = 0; i < 4; i++) await continuer(p);
    const recap = await p.evaluate(() => ({ t: $('#rencontre h2').textContent, bandeau: $('#r-doublon span')?.textContent.trim() }));
    const recapTient = await sansDefilement(p, '#rencontre .r-body');
    await p.click('#r-doublon button'); await pause(p, 80);
    const recap2 = await p.evaluate(() => ({ t: $('#rencontre h2').textContent, v: renc.v && renc.v.nom }));
    await continuer(p); // Enregistrer
    const fin2 = await p.evaluate(id => ({ roths: state.aVoir.filter(x => x.nom === 'Mme Roth').length, journal: aVoir(id).historique.length }), roth.id);
    verifier(`${ecran} R3. récapitulatif : le bandeau est là aussi ; « Ajouter à sa fiche » y reste, puis Enregistrer ajoute au journal de Mme Roth`,
      recap.t === 'On enregistre ?' && recap.bandeau === 'Mme Roth (Pharmacie de la Gare) existe déjà' && recapTient && recap2.t === 'On enregistre ?' && recap2.v === 'Mme Roth' && fin2.roths === 1 && fin2.journal === roth.journal + 2,
      JSON.stringify({ recap, recap2, fin2 }));
  }

  /* R4. Une note qui commence par un commerce : « Hôtel du Parc » est l'entreprise (et son dossier est signalé), « Qui ? » demande la personne */
  {
    const a = await lire('Café de la Poste, démo KamiFood jeudi 15h'), b = await lire("Pharmacie de la Gare, elle m'envoie ses avis de taxe foncière"), c = await lire('Grosse boîte de transport, isolation des entrepôts');
    verifier(`${ecran} R4. lecteur : Café de la Poste et Pharmacie de la Gare sont des entreprises ; « Grosse » n'est pas un prénom`,
      a.nom === '' && a.entreprise === 'Café de la Poste' && b.nom === '' && b.entreprise === 'Pharmacie de la Gare' && c.nom === '', JSON.stringify([a.nom, a.entreprise, b.nom, b.entreprise, c.nom]));
    await p.evaluate(() => openContact()); await pause(p);
    await p.fill('#r-note', 'Hôtel du Parc : la direction veut un audit CEE');
    await continuer(p);
    const h = await p.evaluate(() => ({ t: $('#rencontre h2').textContent, nom: $('#r-nom').value, entreprise: $('#r-entreprise').value, chip: document.querySelector('#rencontre .chips .chip.on')?.textContent.trim(), indice: $('#r-connu')?.textContent.trim() }));
    await p.evaluate(() => fermerRencontre());
    verifier(`${ecran} R4. appli : « Qui ? » = personne à saisir, entreprise « Hôtel du Parc » (« a déjà un dossier »), CEE`,
      h.t === 'Qui ?' && h.nom === '' && h.entreprise === 'Hôtel du Parc' && h.chip === 'CEE' && h.indice === 'Hôtel du Parc a déjà un dossier', JSON.stringify(h));
  }

  /* R5. « jusqu'au » part avec sa date : le sujet reste lisible */
  {
    const a = await lire("contrat jusqu'au 31/12, il hésite"), b = await lire("il est en vacances jusqu'au 2 novembre, rappelle-moi après");
    verifier(`${ecran} R5. « jusqu'au 31/12 » et « jusqu'au 2 novembre » partent entiers du sujet`, a.sujet === 'contrat, il hésite' && b.sujet === 'il est en vacances, rappelle-moi après' && b.rappel === '2026-11-02', JSON.stringify([a.sujet, b.sujet, b.rappel]));
  }

  /* R6. Sans jeton, une note longue (plus de 140 caractères) va entière au journal, par Noter comme par le récapitulatif */
  {
    const longue = "croisé Karim de Karim SARL au salon de Lyon, il a trois restaurants et une brasserie, on a parlé du KGD Pro et des primes CEE pour ses cuisines, il hésite encore à cause du prix, il veut aussi qu'on regarde sa taxe foncière l'an prochain, je lui envoie le dossier complet";
    await enregistrerNote(longue);
    const a = await dernier();
    await p.evaluate(() => openContact()); await pause(p);
    await p.fill('#r-note', longue + ', rappelle-moi jeudi');
    for (let i = 0; i < 4; i++) await continuer(p);
    const champ = await p.$eval('#r-sujet', e => e.value);
    await continuer(p); // Enregistrer
    const b = await dernier();
    verifier(`${ecran} R6. note de ${longue.length} caractères gardée entière au journal (Noter et récapitulatif), dates comprises`,
      longue.length > 140 && a.journal === longue && champ === longue + ', rappelle-moi jeudi' && b.journal === longue + ', rappelle-moi jeudi' && b.rappel === '2026-10-15', JSON.stringify({ a: a.journal.length, champ: champ.length, b: b.journal.length, rappel: b.rappel }));
  }

  /* R7. Un « rappelle-moi jeudi » explicite l'emporte sur une date de contexte placée avant lui */
  {
    const l = [await lire("il m'envoie sa facture du 12/09, rappelle-moi jeudi"), await lire('son contrat EDF finit le 31 décembre, rappelle-moi lundi'), await lire('Paul, ouvert depuis le 1er mars, rappelle-moi dans 3 jours'), await lire('facture du 12 septembre reçue, relance mardi')];
    verifier(`${ecran} R7. lecteur : le rappel annoncé gagne (15, 12, 13, 13 oct.) et la date de contexte reste dans le sujet`,
      l.map(x => x.rappel).join() === '2026-10-15,2026-10-12,2026-10-13,2026-10-13' && l[0].sujet === "il m'envoie sa facture du 12/09" && l[1].sujet === 'son contrat EDF finit le 31 décembre', JSON.stringify(l.map(x => [x.rappel, x.sujet])));
    await enregistrerNote("Paul, il m'envoie sa facture du 12/09, rappelle-moi jeudi");
    const v = await dernier();
    verifier(`${ecran} R7. appli : contact Paul avec rappel jeu. 15 oct. (pas le 12 sept. 2027), note entière au journal`,
      v.nom === 'Paul' && v.rappel === '2026-10-15' && v.toast === 'Paul · rappel jeu. 15 oct.' && v.journal === "Paul, il m'envoie sa facture du 12/09, rappelle-moi jeudi", JSON.stringify(v));
  }

  /* R10. Date de rappel choisie à la main, puis note modifiée : la puce et la date restent d'accord */
  {
    await p.evaluate(() => openContact()); await pause(p);
    await p.fill('#r-note', 'Paul, rappelle-moi le 20');
    await continuer(p); await continuer(p); // Qui ? → Et ensuite ?
    await p.fill('#r-rappel', '2026-10-22'); await p.dispatchEvent('#r-rappel', 'change'); await pause(p, 40);
    await retour(p); await retour(p);
    await p.fill('#r-note', 'Paul'); await pause(p, 200);
    await continuer(p); await continuer(p);
    const e = await p.evaluate(() => ({ t: $('#rencontre h2').textContent, rappel: renc.rappel, rappelJ: renc.rappelJ, puce: document.querySelector('#r-rappels .chip.on')?.textContent.trim() || '', txt: $('#r-rappel-txt').textContent.trim(), date: $('#r-rappel').value }));
    await p.evaluate(() => fermerRencontre());
    verifier(`${ecran} R10. date du 22 choisie à la main puis note sans date : « → jeudi 22 oct. », aucune puce allumée`,
      e.t === 'Et ensuite ?' && e.rappel === '2026-10-22' && e.date === '2026-10-22' && e.rappelJ === 'x' && e.puce === '' && e.txt === '→ jeudi 22 oct.', JSON.stringify(e));
  }

  /* Avec un jeton : Kami complète sans rien effacer ; s'il échoue, la lecture locale reste */
  await p.evaluate(() => { jarvis.token = 'jeton-test'; });
  await p.route('**/api/analyser', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ nom: '', entreprise: '', activite: 'cee', sujet: 'Karim veut des infos sur le KGD Pro', attente: '', rappel: '', creneau: { type: 'aucun', date: '', heure: '', du: '', au: '' }, objet: '', tel: '', resume: 'Karim, rappel mardi.' }) }));
  await p.evaluate(() => openContact());
  await pause(p);
  await p.fill('#r-note', KARIM);
  await p.click('#r-affiner');
  await pause(p, 250);
  const kami = await p.evaluate(() => ({ t: document.querySelector('#rencontre h2').textContent, nom: renc.nom, entreprise: renc.entreprise, activite: renc.activite, attente: renc.attente, rappel: renc.rappel, creneau: renc.creneau, crDu: renc.crDu, sujet: renc.sujet }));
  await p.evaluate(() => fermerRencontre());
  verifier(`${ecran} Avec Kami : ses champs remplis l'emportent (secteur, sujet), ses champs vides ne retirent rien au lecteur local`,
    kami.t === 'On enregistre ?' && kami.nom === 'Karim' && kami.entreprise === 'Karim SARL' && kami.activite === 'cee' && kami.attente === 'moi' && kami.rappel === '2026-10-13'
    && kami.creneau === 'periode' && kami.crDu === '2027-01-04' && kami.sujet === 'Karim veut des infos sur le KGD Pro', JSON.stringify(kami));
  await p.unroute('**/api/analyser');
  await p.route('**/api/analyser', r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ erreur: "ANTHROPIC_API_KEY n'est pas définie" }) }));
  await p.evaluate(() => openContact());
  await pause(p);
  await p.fill('#r-note', KARIM);
  await p.click('#r-affiner');
  await pause(p, 250);
  const panne = await p.evaluate(() => ({ t: document.querySelector('#rencontre h2').textContent, nom: renc.nom, activite: renc.activite, rappel: renc.rappel, creneau: renc.creneau }));
  await continuer(p);
  const apresPanne = await p.evaluate(() => ({ t: document.querySelector('#rencontre h2').textContent, nom: $('#r-nom').value }));
  await p.evaluate(() => { fermerRencontre(); jarvis.token = ''; });
  verifier(`${ecran} Kami en panne : la lecture locale reste, Continuer garde les champs`, panne.t === 'Noter' && panne.nom === 'Karim' && panne.activite === 'kgdpro' && panne.rappel === '2026-10-13' && panne.creneau === 'periode' && apresPanne.t === 'Qui ?' && apresPanne.nom === 'Karim', JSON.stringify({ panne, apresPanne }));

  verifier(`${ecran} aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}
bilan();
