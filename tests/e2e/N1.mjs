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
  verifier(`${ecran} Rencontre sans jeton : récapitulatif avec le sujet sans les dates et la suite`, e4.sujet === 'croisé Karim de Karim SARL, on a parlé du KGD Pro, je lui envoie le dossier' && /Rappel mardi 13 oct\./.test(e4.suite) && /04\/01\/2027|4 janv/.test(e4.suite), JSON.stringify(e4));
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
