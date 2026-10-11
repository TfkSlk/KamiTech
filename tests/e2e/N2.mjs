/* N2 — Juste après une rencontre : écran « Noter », une phrase, un toucher, rien de perdu.
   Horloge figée au samedi 2026-10-10 09:00 (Paris) : « jeudi » = 2026-10-15, 3 jours ouvrés = mardi 13 oct.
   Téléphone (390x844, et 390x500 pour le clavier ouvert) et ordinateur (1366x800). Sans jeton Kami sauf mention. */
import { ouvrir, verifier, bilan, sansDefilement } from './outil.mjs';
import path from 'node:path';

const CAPTURES = process.env.CAPTURES || '';
const capture = async (p, nom) => { if (CAPTURES) await p.screenshot({ path: path.join(CAPTURES, nom + '.png') }); };
const pause = (p, ms = 80) => p.waitForTimeout(ms);
const sansScrollHorizontal = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const ouverte = p => p.evaluate(() => !document.querySelector('#rencontre').hidden && !!renc);
const titre = p => p.$eval('#rencontre h2', e => e.textContent.trim());
const KARIM = 'croisé Karim de Karim SARL pour les CEE, je lui envoie le devis, rappelle-moi jeudi';
/* Ouvre Noter comme Toufek : le bouton de l'accueil (focus immédiat) */
const noter = async p => { await p.evaluate(() => { location.hash = '#dashboard'; }); await pause(p); await p.click('.noter-bar'); await pause(p); };
const jetons = p => p.$$eval('#r-jetons .jeton:not(.jeton-plus)', l => l.map(j => ({ t: j.textContent.trim(), cl: [...j.classList].filter(c => c !== 'jeton').join(' '), c: getComputedStyle(j).color, fond: getComputedStyle(j).backgroundImage })));

for (const [largeur, hauteur] of [[390, 844], [1366, 800]]) {
  const ecran = `${largeur}px`;
  const tel = largeur <= 760;

  /* ---------- 1. Une phrase, UN toucher sur Enregistrer ---------- */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur });
    const focusImmediat = await p.evaluate(() => { document.querySelector('.noter-bar').click(); return document.activeElement && document.activeElement.id; });
    verifier(`${ecran} accueil : « Noter quelqu'un… » ouvre Noter et donne le focus à la note tout de suite (même geste)`, focusImmediat === 'r-note' && await titre(p) === 'Noter', String(focusImmediat));
    const champs = await p.evaluate(() => { const t = $('#r-note'); return { rows: t.rows, hint: t.getAttribute('enterkeyhint'), taille: getComputedStyle(t).fontSize }; });
    verifier(`${ecran} 1. #r-note : textarea de 3 lignes, 16px, enterkeyhint=done`, champs.rows === 3 && champs.hint === 'done' && champs.taille === '16px', JSON.stringify(champs));
    await p.keyboard.type(KARIM, { delay: 2 });
    await pause(p, 250);
    const js = await jetons(p);
    const parTexte = t => js.find(j => j.t === t);
    verifier(`${ecran} 1. jetons recalculés à la saisie : Karim · Karim SARL · CEE · Je lui dois · Rappel jeu. 15 oct.`,
      js.map(j => j.t).join(' | ') === 'Karim | Karim SARL | CEE | Je lui dois | Rappel jeu. 15 oct.', js.map(j => j.t).join(' | '));
    verifier(`${ecran} 1. couleurs : date en argent, secteur dans sa couleur, attente « moi » en rouge`,
      /gradient/.test(parTexte('Rappel jeu. 15 oct.')?.fond || '') && /date/.test(parTexte('Rappel jeu. 15 oct.')?.cl)
      && /secteur/.test(parTexte('CEE')?.cl) && parTexte('CEE')?.c !== parTexte('Karim')?.c
      && /rouge/.test(parTexte('Je lui dois')?.cl) && parTexte('Je lui dois')?.c === 'rgb(212, 0, 0)', JSON.stringify(js));
    const rappelAffiche = await p.$eval('#r-rappel-txt', e => e.textContent.trim());
    verifier(`${ecran} 1. la ligne de rappel affiche la date lue (« → jeudi 15 oct. »), puces 2 j · 3 j · 1 sem. · 2 sem. · Clore`,
      rappelAffiche === '→ jeudi 15 oct.' && (await p.$$eval('#r-rappels .chip', l => l.map(b => b.textContent.trim()).join(' · '))) === '2 j · 3 j · 1 sem. · 2 sem. · Clore', rappelAffiche);
    verifier(`${ecran} 2. Noter (jetons affichés) : .r-body ne défile pas`, await sansDefilement(p, '#rencontre .r-body'));
    await capture(p, `n2-noter-karim-${largeur}`);
    const n0 = await p.evaluate(() => state.aVoir.length);
    await p.click('#r-enregistrer');
    await pause(p, 150);
    const cree = await p.evaluate(() => { const v = state.aVoir.at(-1); return { nom: v.nom, entreprise: v.entreprise, activite: v.activite, attente: v.attente, rappel: v.rappel, statut: v.statut, journal: v.historique.at(-1)?.texte, n: state.aVoir.length, toast: $('#toast').textContent, ferme: $('#rencontre').hidden, brouillon: localStorage.getItem('kgd-brouillon') }; });
    verifier(`${ecran} 1. UN toucher sur Enregistrer : contact Karim · Karim SARL · cee · moi · rappel 2026-10-15`,
      cree.n === n0 + 1 && cree.nom === 'Karim' && cree.entreprise === 'Karim SARL' && cree.activite === 'cee' && cree.attente === 'moi' && cree.rappel === '2026-10-15' && cree.statut === 'suivi' && cree.ferme, JSON.stringify(cree));
    verifier(`${ecran} 9. le toast dit ce qui a été créé : « Karim · Karim SARL · rappel jeu. 15 oct. »`, cree.toast === 'Karim · Karim SARL · rappel jeu. 15 oct.', cree.toast);
    verifier(`${ecran} 6. brouillon effacé à l'enregistrement`, cree.brouillon === null, String(cree.brouillon));
    const stocke = await p.evaluate(() => JSON.parse(localStorage.getItem('kami-dashboard-v1')).aVoir.some(v => v.nom === 'Karim' && v.rappel === '2026-10-15'));
    verifier(`${ecran} 1. le contact est bien enregistré dans le stockage`, stocke);

    /* 9. Avec un créneau : « … · RDV jeu. 15 à 14:00 » */
    await noter(p);
    await p.fill('#r-note', 'croisé Karim de Karim SARL pour les CEE, je lui envoie le devis, rappelle-moi mardi, rdv jeudi 14h');
    await p.click('#r-enregistrer'); await pause(p, 120);
    const t9 = await p.evaluate(() => { const v = state.aVoir.at(-1); const ev = state.events.find(e => e.id === v.eventId); return { toast: $('#toast').textContent, ev: ev && ev.date + ' ' + ev.heure, statut: v.statut }; });
    verifier(`${ecran} 9. toast avec RDV : « Karim · Karim SARL · rappel mar. 13 oct. · RDV jeu. 15 à 14:00 »`, t9.toast === 'Karim · Karim SARL · rappel mar. 13 oct. · RDV jeu. 15 à 14:00' && t9.ev === '2026-10-15 14:00' && t9.statut === 'planifie', JSON.stringify(t9));

    /* Ctrl + Entrée enregistre aussi */
    await noter(p);
    await p.keyboard.type('vu Sophie de Garage Ouest pour la taxe foncière', { delay: 1 });
    await p.keyboard.press('Control+Enter'); await pause(p, 120);
    const ctrl = await p.evaluate(() => ({ ferme: $('#rencontre').hidden, v: state.aVoir.at(-1).nom + '|' + state.aVoir.at(-1).activite + '|' + state.aVoir.at(-1).rappel }));
    verifier(`${ecran} 1. Ctrl + Entrée enregistre (Sophie · foncier · rappel par défaut 2026-10-13)`, ctrl.ferme && ctrl.v === 'Sophie|foncier|2026-10-13', JSON.stringify(ctrl));

    /* Un jeton touché est écarté (barré, son champ revient au départ), un second toucher le reprend */
    await noter(p);
    await p.fill('#r-note', KARIM); await pause(p, 200);
    await p.click('#r-jetons .jeton.secteur'); await pause(p, 60);
    const ecarte = await p.evaluate(() => ({ cl: document.querySelector('#r-jetons .jeton[data-cle="activite"]').className, barre: getComputedStyle(document.querySelector('#r-jetons .jeton[data-cle="activite"] span')).textDecorationLine, activite: renc.activite, ignores: renc.ignores.join(','), focus: document.activeElement.id }));
    await p.click('#r-jetons .jeton.secteur'); await pause(p, 60);
    const repris = await p.evaluate(() => ({ cl: document.querySelector('#r-jetons .jeton[data-cle="activite"]').className, activite: renc.activite, ignores: renc.ignores.join(',') }));
    verifier(`${ecran} 1. toucher le jeton CEE l'écarte (barré, secteur de départ), un second toucher le reprend`,
      /ignore/.test(ecarte.cl) && ecarte.barre === 'line-through' && ecarte.activite === 'energie' && ecarte.ignores === 'activite' && !/ignore/.test(repris.cl) && repris.activite === 'cee' && repris.ignores === '', JSON.stringify({ ecarte, repris }));
    verifier(`${ecran} 1. toucher un jeton ne retire pas le focus de la note (le clavier reste)`, ecarte.focus === 'r-note', ecarte.focus);
    /* Une puce de rappel touchée l'emporte sur la date lue */
    await p.click('#r-rappels .chip[data-j="7"]'); await pause(p, 60);
    const puce = await p.evaluate(() => ({ on: document.querySelector('#r-rappels .chip.on')?.textContent.trim(), txt: $('#r-rappel-txt').textContent.trim(), rappel: renc.rappel }));
    await p.type('#r-note', ' ok', { delay: 1 }); await pause(p, 200);
    const puce2 = await p.evaluate(() => renc.rappel);
    verifier(`${ecran} 1. puce « 1 sem. » : rappel 2026-10-19 affiché, gardé même si la note change`, puce.on === '1 sem.' && puce.rappel === '2026-10-19' && puce.txt === '→ lundi 19 oct.' && puce2 === '2026-10-19', JSON.stringify({ puce, puce2 }));
    await p.evaluate(() => annulerRencontre()); await pause(p, 120);

    /* Aucun nom trouvé : « Qui ? » remplace les puces dans le même écran et reçoit le focus */
    await noter(p);
    await p.fill('#r-note', 'intéressé par la CEE pour son entrepôt');
    await p.click('#r-enregistrer'); await pause(p, 80);
    const qui = await p.evaluate(() => ({ t: $('#rencontre h2')?.textContent, champ: !!$('#r-qui'), focus: document.activeElement.id, puces: !!$('#r-rappels'), taille: $('#r-qui') && getComputedStyle($('#r-qui')).fontSize, n: state.aVoir.length }));
    verifier(`${ecran} 1. sans nom : « Qui ? » à la place des puces, dans Noter, avec le focus`, qui.t === 'Noter' && qui.champ && qui.focus === 'r-qui' && !qui.puces && qui.taille === '16px', JSON.stringify(qui));
    verifier(`${ecran} 2. Noter avec « Qui ? » : .r-body ne défile pas`, await sansDefilement(p, '#rencontre .r-body'));
    await capture(p, `n2-qui-${largeur}`);
    await p.keyboard.type('Paul Durand');
    await p.keyboard.press('Enter'); await pause(p, 120);
    const paul = await p.evaluate(() => { const v = state.aVoir.at(-1); return { nom: v.nom, activite: v.activite, n: state.aVoir.length, ferme: $('#rencontre').hidden }; });
    verifier(`${ecran} 1. « Qui ? » rempli puis Entrée : contact Paul Durand (CEE) enregistré`, paul.nom === 'Paul Durand' && paul.activite === 'cee' && paul.n === qui.n + 1 && paul.ferme, JSON.stringify(paul));

    /* « Ajuster… » : les étapes de l'assistant, champs déjà remplis */
    await noter(p);
    await p.fill('#r-note', KARIM);
    await p.click('#r-ajuster'); await pause(p, 80);
    const aj = await p.evaluate(() => ({ t: $('#rencontre h2').textContent, nom: $('#r-nom').value, entreprise: $('#r-entreprise').value, chip: document.querySelector('#rencontre .chips .chip.on')?.textContent.trim() }));
    verifier(`${ecran} 1. « Ajuster… » mène à « Qui ? » déjà rempli (Karim · Karim SARL · CEE)`, aj.t === 'Qui ?' && aj.nom === 'Karim' && aj.entreprise === 'Karim SARL' && aj.chip === 'CEE', JSON.stringify(aj));
    await p.click('#rencontre .r-foot .btn:not(.primary)'); await pause(p, 60); // Retour
    verifier(`${ecran} 1. Retour revient à Noter avec la note et ses jetons`, await titre(p) === 'Noter' && await p.$eval('#r-note', e => e.value) === KARIM && (await jetons(p)).length === 5);
    await p.evaluate(() => annulerRencontre()); await pause(p, 120);

    /* 3. Sans jeton : jamais « Kami remplit tout », ni « Affiner avec Kami » */
    await noter(p);
    const sansKami = await p.evaluate(() => !jarvis.token && !/Kami remplit tout/.test(document.body.innerHTML) && !$('#r-affiner'));
    const rouge = await p.evaluate(() => !document.querySelector('#rencontre .manque, #rencontre .alerte-donnees'));
    verifier(`${ecran} 3. sans jeton : document.body.innerHTML ne contient pas « Kami remplit tout », pas de lien Kami, rien de rouge`, sansKami && rouge);
    await p.evaluate(() => fermerRencontre());

    verifier(`${ecran} pas de défilement horizontal`, await sansScrollHorizontal(p));
    verifier(`${ecran} 1. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* ---------- 2. Aucun défilement ; 8. clavier ; 16px partout ---------- */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, exemple: true });
    await noter(p);
    verifier(`${ecran} 2. Noter vide : .r-body ne défile pas`, await sansDefilement(p, '#rencontre .r-body'));
    await capture(p, `n2-noter-vide-${largeur}`);
    await p.fill('#r-note', "Mme Roth m'envoie ses avis, rdv jeudi 14h, 06 12 34 56 78, important, on parle aussi de KamiFood");
    await pause(p, 200);
    verifier(`${ecran} 2. Noter avec bandeau de doublon et 7 jetons : .r-body ne défile pas`, await sansDefilement(p, '#rencontre .r-body') && !!await p.$('#r-doublon'));
    const tailles = await p.evaluate(() => [...document.querySelectorAll('#rencontre input, #rencontre textarea, #rencontre select')].map(e => getComputedStyle(e).fontSize));
    verifier(`${ecran} 8. tous les champs de #rencontre sont en 16px (Noter)`, tailles.length && tailles.every(t => t === '16px'), tailles.join(','));
    /* Les étapes d'Ajuster… : 16px aussi */
    const tous = [];
    await p.click('#r-ajuster'); await pause(p, 60);
    for (let i = 0; i < 4; i++) {
      tous.push(...await p.evaluate(() => [...document.querySelectorAll('#rencontre input, #rencontre textarea, #rencontre select')].map(e => getComputedStyle(e).fontSize)));
      tous.push(await sansDefilement(p, '#rencontre .r-body') ? 'ok' : 'défile');
      if (await titre(p) === 'On enregistre ?') break;
      await p.click('#rencontre .r-foot .btn.primary'); await pause(p, 60);
    }
    verifier(`${ecran} 8. étapes d'Ajuster… : champs en 16px, aucune ne défile`, tous.every(t => t === '16px' || t === 'ok'), tous.join(','));
    await p.evaluate(() => fermerRencontre());
    const attributs = await p.evaluate(() => { const r = $('#rencontre'); return { role: r.getAttribute('role'), modal: r.getAttribute('aria-modal'), lb: r.getAttribute('aria-labelledby') }; });
    await noter(p);
    const a11y = await p.evaluate(() => ({ titre: document.getElementById($('#rencontre').getAttribute('aria-labelledby'))?.tagName + ':' + document.getElementById($('#rencontre').getAttribute('aria-labelledby'))?.textContent, main: $('#main').hasAttribute('inert'), nav: $('#nav').closest('[inert]') !== null }));
    verifier(`${ecran} 7. #rencontre : role=dialog, aria-modal=true, aria-labelledby vers le h2 ; main et nav inertes pendant l'ouverture`,
      attributs.role === 'dialog' && attributs.modal === 'true' && a11y.titre === 'H2:Noter' && a11y.main && a11y.nav, JSON.stringify({ attributs, a11y }));
    await p.evaluate(() => fermerRencontre());
    const libere = await p.evaluate(() => !$('#main').hasAttribute('inert') && $('#nav').closest('[inert]') === null);
    verifier(`${ecran} 7. à la fermeture, main et nav ne sont plus inertes`, libere);

    if (tel) {
      const vp = await p.evaluate(() => document.querySelector('meta[name="viewport"]').content);
      verifier(`${ecran} 8. meta viewport : viewport-fit=cover, interactive-widget=resizes-content`, vp === 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content', vp);
      /* Clavier ouvert : la partie visible passe à 500 px */
      await noter(p);
      await p.fill('#r-note', "Mme Roth m'envoie ses avis, rdv jeudi 14h, 06 12 34 56 78, important, on parle aussi de KamiFood");
      await pause(p, 200);
      await p.setViewportSize({ width: 390, height: 500 });
      await pause(p, 200);
      const cl = await p.evaluate(() => {
        const r = $('#rencontre'), b = $('#r-enregistrer').getBoundingClientRect(), box = $('#r-jetons');
        return { clavier: r.classList.contains('clavier'), vvh: r.style.getPropertyValue('--vvh'), bas: b.bottom, haut: b.top, points: getComputedStyle(document.querySelector('.r-dots')).display,
          ligne: getComputedStyle(box).flexWrap, plus: box.querySelector('.jeton-plus')?.textContent || '', deborde: box.scrollWidth > box.clientWidth + 1, ta: parseFloat(getComputedStyle($('#r-note')).minHeight), doublon: !!$('#r-doublon') };
      });
      verifier(`${ecran} 2. viewport 390x500 : Enregistrer entièrement visible (bottom ${cl.bas} <= 500)`, cl.bas <= 500 && cl.haut >= 0, JSON.stringify(cl));
      verifier(`${ecran} 8. clavier : --vvh = 500px et classe .clavier ; points d'étape masqués ; textarea 64 px min ; jetons sur une ligne avec « +N »`,
        cl.clavier && cl.vvh === '500px' && cl.points === 'none' && cl.ta === 64 && cl.ligne === 'nowrap' && /^\+\d+$/.test(cl.plus) && !cl.deborde, JSON.stringify(cl));
      verifier(`${ecran} 2. viewport 390x500 : .r-body ne défile pas`, await sansDefilement(p, '#rencontre .r-body'));
      await capture(p, `n2-clavier-390x500`);
      await p.setViewportSize({ width: 390, height: 844 });
      await pause(p, 200);
      const ouvert = await p.evaluate(() => ({ clavier: $('#rencontre').classList.contains('clavier'), plus: !!document.querySelector('#r-jetons .jeton-plus') }));
      verifier(`${ecran} 8. clavier refermé : plus de .clavier, tous les jetons visibles`, !ouvert.clavier && !ouvert.plus, JSON.stringify(ouvert));
      await p.evaluate(() => fermerRencontre());
      /* Pire cas (petit téléphone, clavier ouvert) : contact connu avec « Garder », brouillon repris et doublon, 390x420 */
      const julien = await p.evaluate(() => { const j = state.aVoir.find(v => v.nom === 'Julien'); localStorage.setItem('kgd-brouillon', JSON.stringify({ note: "Mme Roth m'envoie ses avis, rdv jeudi 14h, 06 12 34 56 78, important", contactId: j.id, etape: 0, t: Date.now() })); return j.id; });
      await p.evaluate(id => openContact(id), julien); await pause(p, 150);
      await p.setViewportSize({ width: 390, height: 420 }); await pause(p, 200);
      const pire = await p.evaluate(() => ({ bas: $('#r-enregistrer').getBoundingClientRect().bottom, puces: document.querySelectorAll('#r-rappels .chip').length, uneLigne: $('#r-rappels').getBoundingClientRect().height < 40, doublon: !!$('#r-doublon'), brouillon: !!$('#r-brouillon'), ta: $('#r-note').getBoundingClientRect().height }));
      verifier(`${ecran} 2. pire cas à 390x420 (Garder, brouillon, doublon) : rien ne défile, Enregistrer visible, puces sur une ligne, note >= 64 px`,
        await sansDefilement(p, '#rencontre .r-body') && pire.bas <= 420 && pire.puces === 6 && pire.uneLigne && pire.doublon && pire.brouillon && pire.ta >= 63.5, JSON.stringify(pire));
      await capture(p, `n2-clavier-390x420`);
      await p.evaluate(() => { fermerRencontre(); localStorage.removeItem('kgd-brouillon'); });
      await p.setViewportSize({ width: 390, height: 844 }); await pause(p, 150);
      const nettoye = await p.evaluate(() => $('#rencontre').style.getPropertyValue('--vvh'));
      verifier(`${ecran} 8. Noter fermé : --vvh retiré`, nettoye === '', nettoye);
    }
    verifier(`${ecran} 2. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* ---------- 3. Avec un jeton : « Affiner avec Kami » (lien secondaire), échec sans perte ---------- */
  {
    const { p, ctx, erreurs, fermer } = await ouvrir({ largeur, hauteur });
    await p.evaluate(() => { jarvis.token = 'jeton-test'; });
    await noter(p);
    const lien = await p.evaluate(() => ({ lien: $('#r-affiner')?.textContent, primaire: $('#r-affiner')?.classList.contains('primary'), kami: /Kami remplit tout/.test(document.body.innerHTML) }));
    verifier(`${ecran} 3. avec jeton et en ligne : lien secondaire « Affiner avec Kami », plus de « Kami remplit tout »`, lien.lien === 'Affiner avec Kami' && !lien.primaire && !lien.kami, JSON.stringify(lien));
    await ctx.setOffline(true);
    await p.evaluate(() => window.dispatchEvent(new Event('offline'))); await pause(p, 60);
    const horsLigne = await p.evaluate(() => !$('#r-affiner'));
    await ctx.setOffline(false);
    await p.evaluate(() => window.dispatchEvent(new Event('online'))); await pause(p, 60);
    verifier(`${ecran} 3. hors ligne : pas de lien Kami (il revient en ligne)`, horsLigne && !!await p.$('#r-affiner'));
    await p.route('**/api/analyser', r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ erreur: 'Kami indisponible' }) }));
    await p.fill('#r-note', KARIM);
    await p.click('#r-affiner'); await pause(p, 250);
    const panne = await p.evaluate(() => ({ t: $('#rencontre h2').textContent, nom: renc.nom, activite: renc.activite, attente: renc.attente, rappel: renc.rappel, lien: $('#r-affiner')?.textContent }));
    verifier(`${ecran} 3. Kami en échec : le résultat local reste (Karim · cee · moi · 2026-10-15)`, panne.t === 'Noter' && panne.nom === 'Karim' && panne.activite === 'cee' && panne.attente === 'moi' && panne.rappel === '2026-10-15' && panne.lien === 'Affiner avec Kami', JSON.stringify(panne));
    await p.unroute('**/api/analyser');
    await p.route('**/api/analyser', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ nom: '', entreprise: '', activite: '', sujet: 'Karim veut un devis CEE', attente: '', rappel: '', creneau: { type: 'aucun', date: '', heure: '', du: '', au: '' }, objet: '', tel: '', resume: 'Karim, devis CEE.' }) }));
    await p.click('#r-affiner'); await pause(p, 250);
    const kami = await p.evaluate(() => ({ t: $('#rencontre h2').textContent, nom: renc.nom, rappel: renc.rappel, sujet: renc.sujet }));
    verifier(`${ecran} 3. Kami répond : récapitulatif, ses champs vides n'effacent rien`, kami.t === 'On enregistre ?' && kami.nom === 'Karim' && kami.rappel === '2026-10-15' && kami.sujet === 'Karim veut un devis CEE', JSON.stringify(kami));
    await p.evaluate(() => { fermerRencontre(); jarvis.token = ''; });
    verifier(`${ecran} 3. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* ---------- 5. Brouillon : rien de perdu ---------- */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur });
    await noter(p);
    await p.keyboard.type('croisé Léa de la Boulangerie Sud, KamiFood', { delay: 1 });
    const brut = await p.evaluate(() => JSON.parse(localStorage.getItem('kgd-brouillon')));
    verifier(`${ecran} 6. brouillon écrit à chaque saisie : {note, contactId, etape, t}`, brut && brut.note === 'croisé Léa de la Boulangerie Sud, KamiFood' && brut.contactId === null && brut.etape === 0 && typeof brut.t === 'number', JSON.stringify(brut));
    await p.reload({ waitUntil: 'domcontentloaded' }); await pause(p, 300);
    const apresRechargement = await p.evaluate(() => ({ ouverte: !document.querySelector('#rencontre').hidden, hash: location.hash }));
    await noter(p);
    const repris = await p.evaluate(() => ({ note: $('#r-note').value, bandeau: $('#r-brouillon span')?.textContent.trim() + ' · ' + $('#r-brouillon button')?.textContent.trim(), nom: renc.nom }));
    verifier(`${ecran} 5. note, rechargement, réouverture de Noter : le texte est revenu avec « Brouillon … repris »`,
      !apresRechargement.ouverte && repris.note === 'croisé Léa de la Boulangerie Sud, KamiFood' && /^Brouillon de \d\d:\d\d repris · Effacer$/.test(repris.bandeau) && repris.nom === 'Léa', JSON.stringify({ apresRechargement, repris }));
    await capture(p, `n2-brouillon-${largeur}`);
    /* Échap ferme, le brouillon reste */
    await p.keyboard.press('Escape'); await pause(p, 150);
    const echap = await p.evaluate(() => ({ ferme: $('#rencontre').hidden, brouillon: !!localStorage.getItem('kgd-brouillon') }));
    verifier(`${ecran} 6. Échap ferme Noter et garde le brouillon`, echap.ferme && echap.brouillon, JSON.stringify(echap));
    /* « Effacer » du bandeau */
    await noter(p);
    await p.click('#r-brouillon button'); await pause(p, 80);
    const efface = await p.evaluate(() => ({ note: $('#r-note').value, bandeau: !!$('#r-brouillon'), brouillon: localStorage.getItem('kgd-brouillon'), nom: renc.nom }));
    verifier(`${ecran} 6. « Effacer » vide la note, retire le bandeau et le brouillon`, efface.note === '' && !efface.bandeau && efface.brouillon === null && efface.nom === '', JSON.stringify(efface));
    /* Annuler efface le brouillon, avec « Rétablir » */
    await p.keyboard.type('vu Marc au salon, CEE', { delay: 1 });
    await p.click('#rencontre .r-annuler'); await pause(p, 150);
    const annule = await p.evaluate(() => ({ ferme: $('#rencontre').hidden, brouillon: localStorage.getItem('kgd-brouillon'), toast: $('#toast').textContent }));
    verifier(`${ecran} 6. Annuler ferme et efface le brouillon (toast « Note effacée · Rétablir »)`, annule.ferme && annule.brouillon === null && /Note effacée/.test(annule.toast) && /Rétablir/.test(annule.toast), JSON.stringify(annule));
    await p.click('#toast .toast-action'); await pause(p, 120);
    const retabli = await p.evaluate(() => ({ ouverte: !$('#rencontre').hidden, note: $('#r-note')?.value }));
    verifier(`${ecran} 6. « Rétablir » rouvre Noter avec la note`, retabli.ouverte && retabli.note === 'vu Marc au salon, CEE', JSON.stringify(retabli));
    await p.evaluate(() => fermerRencontre());
    /* Brouillon d'un autre contact : jamais repris ailleurs ; plus de 24 h : oublié */
    const roth = await p.evaluate(() => { const v = { id: 'roth1', createdAt: 1, nom: 'Mme Roth', entreprise: 'Pharmacie', activite: 'foncier', priorite: 'normale', statut: 'suivi', attente: 'lui', rappel: '2026-10-10', historique: [] }; state.aVoir.push(v); save(); render(); return v.id; });
    await p.evaluate(id => { openContact(id); }, roth); await pause(p);
    await p.fill('#r-note', 'elle a envoyé ses avis');
    await p.evaluate(() => fermerRencontre());
    await noter(p);
    const autre = await p.evaluate(() => $('#r-note').value);
    await p.evaluate(() => fermerRencontre());
    await p.evaluate(id => openContact(id), roth); await pause(p);
    const sien = await p.evaluate(() => ({ note: $('#r-note').value, bandeau: !!$('#r-brouillon') }));
    await p.evaluate(() => fermerRencontre());
    await p.evaluate(() => { const b = JSON.parse(localStorage.getItem('kgd-brouillon')); b.t -= 25 * 3600e3; localStorage.setItem('kgd-brouillon', JSON.stringify(b)); });
    await p.evaluate(id => openContact(id), roth); await pause(p);
    const vieux = await p.evaluate(() => $('#r-note').value);
    await p.evaluate(() => fermerRencontre());
    verifier(`${ecran} 6. brouillon par contact : celui de Mme Roth ne revient que chez elle, et pas après 24 h`, autre === '' && sien.note === 'elle a envoyé ses avis' && sien.bandeau && vieux === '', JSON.stringify({ autre, sien, vieux }));
    verifier(`${ecran} 5. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* ---------- 6. Retour (history.back) et Échap : Noter se ferme, le # ne bouge pas ---------- */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, vue: 'contacts' });
    await p.evaluate(() => { openContact(); }); await pause(p);
    const avant = await p.evaluate(() => ({ hash: location.hash, couche: history.state && history.state.couche }));
    await p.evaluate(() => history.back()); await pause(p, 200);
    const apres = await p.evaluate(() => ({ ferme: $('#rencontre').hidden, hash: location.hash, vue: $('#main h1')?.textContent }));
    verifier(`${ecran} 6. history.back() ferme Noter, location.hash reste #contacts`, avant.couche === 'rencontre' && avant.hash === '#contacts' && apres.ferme && apres.hash === '#contacts' && apres.vue === 'Contacts', JSON.stringify({ avant, apres }));
    await p.evaluate(() => { openContact(); }); await pause(p);
    await p.keyboard.press('Escape'); await pause(p, 200);
    const echap = await p.evaluate(() => ({ ferme: $('#rencontre').hidden, hash: location.hash, couche: history.state && history.state.couche }));
    verifier(`${ecran} 6. Échap ferme Noter, location.hash reste #contacts, plus d'entrée de couche`, echap.ferme && echap.hash === '#contacts' && !echap.couche, JSON.stringify(echap));
    await p.evaluate(() => { openContact(); }); await pause(p);
    await p.click('#rencontre .r-head .btn.icon'); await pause(p, 200);
    verifier(`${ecran} 7. le ✕ ferme par history.back(), le # ne bouge pas`, await p.evaluate(() => $('#rencontre').hidden && location.hash === '#contacts' && !(history.state && history.state.couche)));
    /* Après un enregistrement, l'entrée de la couche est retirée : un seul retour revient à la vue précédente */
    await p.evaluate(() => { location.hash = '#planning'; }); await pause(p, 120);
    await p.evaluate(() => { openContact(); }); await pause(p);
    await p.fill('#r-note', 'croisé Nina de Atelier Bleu pour KamiFood');
    await p.click('#r-enregistrer'); await pause(p, 250);
    await p.evaluate(() => history.back()); await pause(p, 250);
    const retour = await p.evaluate(() => ({ hash: location.hash, ferme: $('#rencontre').hidden, nina: state.aVoir.some(v => v.nom === 'Nina') }));
    verifier(`${ecran} 7. après Enregistrer, un seul retour revient à la vue précédente (#contacts)`, retour.hash === '#contacts' && retour.ferme && retour.nina, JSON.stringify(retour));
    /* Rouvrir juste après un enregistrement : la nouvelle couche se ferme toujours au retour */
    await p.evaluate(() => { openContact(); }); await pause(p);
    await p.fill('#r-note', 'croisé Omar de Garage Nord, CEE');
    await p.click('#r-enregistrer');
    await p.evaluate(() => { openContact(); }); await pause(p, 250);
    await p.evaluate(() => history.back()); await pause(p, 250);
    const enchaine = await p.evaluate(() => ({ hash: location.hash, ferme: $('#rencontre').hidden }));
    verifier(`${ecran} 7. Noter rouvert aussitôt après un enregistrement : le retour le ferme, le # reste #contacts`, enchaine.ferme && enchaine.hash === '#contacts', JSON.stringify(enchaine));
    verifier(`${ecran} 6. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* ---------- 7. Doublon : « Ajouter à sa fiche » ---------- */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, exemple: true });
    const avant = await p.evaluate(() => { const v = state.aVoir.find(x => x.nom === 'Mme Roth'); return { n: state.aVoir.length, journal: v.historique.length, id: v.id }; });
    await noter(p);
    await p.keyboard.type("Mme Roth m'envoie ses avis 2025, rappelle-moi lundi", { delay: 1 });
    await pause(p, 200);
    const bandeau = await p.evaluate(() => ({ txt: $('#r-doublon span')?.textContent.trim(), bouton: $('#r-doublon button')?.textContent.trim() }));
    verifier(`${ecran} 7. bandeau de doublon : « Mme Roth (Pharmacie de la Gare) existe déjà · Ajouter à sa fiche »`, bandeau.txt === 'Mme Roth (Pharmacie de la Gare) existe déjà' && bandeau.bouton === 'Ajouter à sa fiche', JSON.stringify(bandeau));
    await capture(p, `n2-doublon-${largeur}`);
    await p.click('#r-doublon button'); await pause(p, 80);
    const rattache = await p.evaluate(() => ({ v: renc.v && renc.v.nom, meta: $('#rencontre .r-head .meta').textContent, doublon: !!$('#r-doublon'), note: $('#r-note').value, brouillon: JSON.parse(localStorage.getItem('kgd-brouillon')).contactId }));
    verifier(`${ecran} 7. « Ajouter à sa fiche » : la Rencontre vise Mme Roth, la note est gardée, plus de bandeau`, rattache.v === 'Mme Roth' && /Mme Roth/.test(rattache.meta) && !rattache.doublon && rattache.note === "Mme Roth m'envoie ses avis 2025, rappelle-moi lundi" && rattache.brouillon === avant.id, JSON.stringify(rattache));
    await p.click('#r-enregistrer'); await pause(p, 150);
    const apres = await p.evaluate(id => { const v = aVoir(id); return { n: state.aVoir.length, journal: v.historique.length, dernier: v.historique.at(-1).texte, rappel: v.rappel, attente: v.attente, toast: $('#toast').textContent }; }, avant.id);
    verifier(`${ecran} 7. Enregistrer : nombre de contacts inchangé, journal de Mme Roth +1 (rappel lundi 12)`,
      apres.n === avant.n && apres.journal === avant.journal + 1 && /avis 2025/.test(apres.dernier) && apres.rappel === '2026-10-12' && apres.attente === 'lui', JSON.stringify(apres));
    verifier(`${ecran} 9. toast : « Mme Roth · Pharmacie de la Gare · rappel lun. 12 oct. »`, apres.toast === 'Mme Roth · Pharmacie de la Gare · rappel lun. 12 oct.', apres.toast);
    /* Depuis la fiche de Mme Roth (« Contacté ») : pas de bandeau sur elle-même */
    await p.evaluate(id => openContact(id), avant.id); await pause(p);
    await p.fill('#r-note', "Mme Roth m'envoie ses avis"); await pause(p, 200);
    verifier(`${ecran} 7. Rencontre de Mme Roth : pas de bandeau de doublon sur elle-même`, !await p.$('#r-doublon'));
    await p.evaluate(() => fermerRencontre());
    /* La fiche ouverte (fenêtre) puis « + Prise de contact » : la fenêtre se ferme, Noter est au premier plan */
    await p.evaluate(id => openAVoir(id), avant.id); await pause(p);
    await p.click('#modal button:has-text("+ Prise de contact")'); await pause(p, 120);
    const premierPlan = await p.evaluate(() => ({ modal: $('#modal').open, noter: !$('#rencontre').hidden }));
    verifier(`${ecran} fiche contact → « + Prise de contact » : la fenêtre se ferme, Noter est visible`, !premierPlan.modal && premierPlan.noter, JSON.stringify(premierPlan));
    await p.evaluate(() => fermerRencontre());
    verifier(`${ecran} 7. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* ---------- 8. Accueil : « Noter quelqu'un » en haut ; 10. #noter ---------- */
  for (const exemple of [false, true]) {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, exemple });
    const b = await p.evaluate(() => { const e = document.querySelector('.noter-bar'), r = e.getBoundingClientRect(), h = document.querySelector('.page-head').getBoundingClientRect(); return { top: r.top, h: r.height, w: r.width, apresTete: r.top >= h.bottom - 1, txt: e.textContent.replace(/\s+/g, ' ').trim(), capture: !!document.querySelector('.card.capture'), main: document.querySelector('#main').clientWidth }; });
    verifier(`${ecran} ${exemple ? 'exemple' : 'vide'} 8. bouton « Noter quelqu'un… » de 48 px, pleine largeur, juste sous l'en-tête${tel ? `, top ${b.top} <= 200` : ''}`,
      /^Noter quelqu'un…/.test(b.txt) && b.h === 48 && b.apresTete && !b.capture && (!tel || b.top <= 200), JSON.stringify(b));
    await capture(p, `n2-accueil-${exemple ? 'exemple' : 'vide'}-${largeur}`);
    verifier(`${ecran} ${exemple ? 'exemple' : 'vide'} accueil sans défilement horizontal`, await sansScrollHorizontal(p));
    await fermer();
    if (erreurs.length) verifier(`${ecran} accueil aucune erreur JS`, false, erreurs.join(' | '));
  }
  {
    const { p, base, erreurs, fermer } = await ouvrir({ largeur, hauteur, vue: 'noter' });
    const r = await p.evaluate(() => ({ ouverte: !$('#rencontre').hidden, titre: $('#rencontre h2')?.textContent, hash: location.hash, vue: $('#main h1')?.textContent }));
    verifier(`${ecran} 10. ouvrir #noter ouvre l'écran Noter et le hash devient #dashboard`, r.ouverte && r.titre === 'Noter' && r.hash === '#dashboard' && /Toufek/.test(r.vue), JSON.stringify(r));
    await p.evaluate(() => history.back()); await pause(p, 200);
    const fermeNoter = await p.evaluate(() => ({ ferme: $('#rencontre').hidden, hash: location.hash }));
    verifier(`${ecran} 10. le retour ferme Noter et reste sur #dashboard`, fermeNoter.ferme && fermeNoter.hash === '#dashboard', JSON.stringify(fermeNoter));
    await p.evaluate(() => { location.hash = '#noter'; }); await pause(p, 150);
    const r2 = await p.evaluate(() => ({ ouverte: !$('#rencontre').hidden, hash: location.hash }));
    verifier(`${ecran} 10. location.hash = '#noter' depuis l'appli : Noter s'ouvre, hash #dashboard`, r2.ouverte && r2.hash === '#dashboard', JSON.stringify(r2));
    const manifeste = await (await fetch(base + 'manifest.json')).json();
    verifier(`${ecran} 10. manifest.json : raccourci « Noter quelqu'un » vers ./#noter`, (manifeste.shortcuts || []).some(s => s.url === './#noter'), JSON.stringify(manifeste.shortcuts));
    verifier(`${ecran} 10. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* ---------- 4. Bouton + (téléphone) ---------- */
  if (tel) {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, exemple: true });
    const fab = {};
    for (const v of ['dashboard', 'contacts']) {
      await p.evaluate(h => { location.hash = '#' + h; }, v); await pause(p, 120);
      const lab = await p.$eval('#fab', e => ({ aria: e.getAttribute('aria-label'), svg: !!e.querySelector('svg circle') }));
      await p.click('#fab'); await pause(p, 120);
      fab[v] = { ...lab, noter: await p.evaluate(() => !$('#rencontre').hidden && $('#rencontre h2').textContent === 'Noter'), focus: await p.evaluate(() => document.activeElement.id) };
      await p.evaluate(() => fermerRencontre());
    }
    verifier(`${ecran} 4. #fab ouvre Noter sur #dashboard et #contacts (aria-label « Noter une rencontre », icône personne+, focus sur la note)`,
      ['dashboard', 'contacts'].every(v => fab[v].noter && fab[v].aria === 'Noter une rencontre' && fab[v].svg && fab[v].focus === 'r-note'), JSON.stringify(fab));
    await p.evaluate(() => { location.hash = '#planning'; }); await pause(p, 120);
    await p.evaluate(() => planNav(1)); await pause(p, 80);
    const pd = await p.evaluate(() => planDate);
    await p.click('#fab'); await pause(p, 120);
    const rdv = await p.evaluate(() => ({ open: $('#modal').open, h2: $('#modal h2')?.textContent, date: $('#f-date')?.value, aria: $('#fab').getAttribute('aria-label') }));
    await p.evaluate(() => modal().close()); await pause(p, 150); // depuis F1, la fiche retire son entrée d'historique (history.back, asynchrone)
    verifier(`${ecran} 4. #fab sur #planning : « Nouveau RDV » à planDate (${pd})`, rdv.open && /Nouveau RDV/.test(rdv.h2) && rdv.date === pd && pd === '2026-10-17' && rdv.aria === 'Nouveau RDV', JSON.stringify(rdv));
    await p.evaluate(() => { location.hash = '#dossiers'; }); await pause(p, 120);
    await p.click('#fab'); await pause(p, 120);
    const dos = await p.evaluate(() => ({ open: $('#modal').open, h2: $('#modal h2')?.textContent }));
    await p.evaluate(() => modal().close()); await pause(p, 150); // depuis F1, la fiche retire son entrée d'historique (history.back, asynchrone)
    verifier(`${ecran} 4. #fab sur #dossiers : le formulaire dossier`, dos.open && dos.h2 === "Nouveau dossier d'apport", JSON.stringify(dos));
    await p.evaluate(() => { location.hash = '#kamifood'; }); await pause(p, 120);
    await p.click('#fab'); await pause(p, 120);
    const ab = await p.evaluate(() => ({ open: $('#modal').open, h2: $('#modal h2')?.textContent }));
    await p.evaluate(() => modal().close()); await pause(p, 150); // depuis F1, la fiche retire son entrée d'historique (history.back, asynchrone)
    verifier(`${ecran} 4. #fab sur #kamifood : le formulaire abonné`, ab.open && ab.h2 === 'Nouvel abonné KamiFood', JSON.stringify(ab));
    /* Appui long de 600 ms : le menu de 4 actions */
    await p.evaluate(() => { location.hash = '#dashboard'; }); await pause(p, 120);
    const box = await p.$eval('#fab', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.mouse.move(box.x, box.y);
    await p.mouse.down(); await pause(p, 600);
    const menu = await p.evaluate(() => ({ visible: !$('#menu-plus').hidden && $('#menu-plus').getBoundingClientRect().height > 0, actions: [...document.querySelectorAll('#menu-plus [role="menuitem"]')].map(b => b.textContent.trim()) }));
    await p.mouse.up(); await pause(p, 120);
    const apresLacher = await p.evaluate(() => ({ menu: !$('#menu-plus').hidden, noter: !$('#rencontre').hidden }));
    verifier(`${ecran} 4. appui long de 600 ms : menu de 4 actions (Noter, RDV, Dossier, Abonné), le lâcher n'ouvre rien d'autre`,
      menu.visible && menu.actions.join('|') === "Noter quelqu'un|Nouveau RDV|Nouveau dossier|Nouvel abonné" && apresLacher.menu && !apresLacher.noter, JSON.stringify({ menu, apresLacher }));
    await capture(p, `n2-menu-plus-${largeur}`);
    verifier(`${ecran} 4. menu ouvert sans défilement horizontal`, await sansScrollHorizontal(p));
    await p.click('#menu-plus [data-action="dossier"]'); await pause(p, 120);
    const choix = await p.evaluate(() => ({ menu: !$('#menu-plus').hidden, h2: $('#modal').open && $('#modal h2').textContent }));
    await p.evaluate(() => modal().close()); await pause(p, 150); // depuis F1, la fiche retire son entrée d'historique (history.back, asynchrone)
    verifier(`${ecran} 4. menu : « Nouveau dossier » ouvre le formulaire dossier et ferme le menu`, !choix.menu && choix.h2 === "Nouveau dossier d'apport", JSON.stringify(choix));
    /* Menu refermé par un toucher ailleurs ou Échap */
    await p.mouse.move(box.x, box.y); await p.mouse.down(); await pause(p, 600); await p.mouse.up(); await pause(p, 60);
    await p.mouse.click(40, 300); await pause(p, 60);
    const ailleurs = await p.evaluate(() => $('#menu-plus').hidden);
    await p.mouse.move(box.x, box.y); await p.mouse.down(); await pause(p, 600); await p.mouse.up(); await pause(p, 60);
    await p.keyboard.press('Escape'); await pause(p, 60);
    const echap = await p.evaluate(() => $('#menu-plus').hidden);
    verifier(`${ecran} 4. le menu se referme d'un toucher ailleurs et avec Échap`, ailleurs && echap);
    /* Un appui court après un appui long : l'action normale */
    await p.click('#fab'); await pause(p, 120);
    verifier(`${ecran} 4. appui court ensuite : Noter s'ouvre normalement`, await ouverte(p));
    await p.evaluate(() => fermerRencontre());
    /* Pendant Noter, le bouton + est inerte */
    await noter(p);
    verifier(`${ecran} 7. #fab inerte pendant Noter`, await p.evaluate(() => $('#fab').hasAttribute('inert')));
    await p.evaluate(() => fermerRencontre());
    verifier(`${ecran} 4. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* ---------- Sans lire.js (repli premierNom) : Noter fonctionne encore ---------- */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, horloge: '2026-10-10T09:00:00' });
    await p.route('**/lire.js', r => r.abort());
    await p.reload({ waitUntil: 'domcontentloaded' }); await pause(p, 300);
    const sansLire = await p.evaluate(() => !window.Lire);
    await noter(p);
    await p.fill('#r-note', 'Paul, salon CEE');
    await p.click('#r-enregistrer'); await pause(p, 150);
    const r = await p.evaluate(() => ({ nom: state.aVoir.at(-1)?.nom, rappel: state.aVoir.at(-1)?.rappel, ferme: $('#rencontre').hidden }));
    verifier(`${ecran} sans lire.js : repli premierNom, contact « Paul » avec le rappel par défaut`, sansLire && r.nom === 'Paul' && r.rappel === '2026-10-13' && r.ferme, JSON.stringify(r));
    verifier(`${ecran} sans lire.js : aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }
}
bilan();
