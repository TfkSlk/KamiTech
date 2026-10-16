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
    const cree = await p.evaluate(() => { const v = state.aVoir.at(-1); return { nom: v.nom, entreprise: v.entreprise, activite: v.activite, attente: v.attente, rappel: v.rappel, statut: v.statut, journal: v.historique.at(-1)?.texte, n: state.aVoir.length, toast: ($('#toast').firstChild ? $('#toast').firstChild.textContent : ''), ferme: $('#rencontre').hidden, brouillon: localStorage.getItem('kgd-brouillon') }; });
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
    const t9 = await p.evaluate(() => { const v = state.aVoir.at(-1); const ev = state.events.find(e => e.id === v.eventId); return { toast: ($('#toast').firstChild ? $('#toast').firstChild.textContent : ''), ev: ev && ev.date + ' ' + ev.heure, statut: v.statut }; });
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
    /* Rechargement pendant la saisie (onglet tué pendant un appel) : Noter revient tout seul avec la note, sur la même entrée d'historique */
    const apresRechargement = await p.evaluate(() => ({ ouverte: !document.querySelector('#rencontre').hidden, hash: location.hash, note: $('#r-note')?.value, couche: history.state && history.state.couche, couches: couches.length }));
    verifier(`${ecran} 5. rechargement avec Noter ouvert : Noter revient avec la note, le # ne bouge pas`,
      apresRechargement.ouverte && apresRechargement.note === 'croisé Léa de la Boulangerie Sud, KamiFood' && apresRechargement.hash === '#dashboard' && apresRechargement.couche === 'rencontre' && apresRechargement.couches === 1, JSON.stringify(apresRechargement));
    await p.evaluate(() => history.back()); await pause(p, 250);
    const premierRetour = await p.evaluate(() => ({ ferme: $('#rencontre').hidden, hash: location.hash, brouillon: JSON.parse(localStorage.getItem('kgd-brouillon') || 'null')?.note }));
    verifier(`${ecran} 5. après le rechargement, le premier retour ferme Noter (#dashboard), le brouillon reste`,
      premierRetour.ferme && premierRetour.hash === '#dashboard' && premierRetour.brouillon === 'croisé Léa de la Boulangerie Sud, KamiFood', JSON.stringify(premierRetour));
    await noter(p);
    const repris = await p.evaluate(() => ({ note: $('#r-note').value, bandeau: $('#r-brouillon span')?.textContent.trim() + ' · ' + $('#r-brouillon button')?.textContent.trim(), nom: renc.nom }));
    verifier(`${ecran} 5. note, rechargement, réouverture de Noter : le texte est revenu avec « Brouillon … repris »`,
      repris.note === 'croisé Léa de la Boulangerie Sud, KamiFood' && /^Brouillon de \d\d:\d\d repris · Effacer$/.test(repris.bandeau) && repris.nom === 'Léa', JSON.stringify({ apresRechargement, repris }));
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
    await p.click('#r-brouillon button'); await pause(p, 80); // « Effacer »
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
    const apres = await p.evaluate(id => { const v = aVoir(id); return { n: state.aVoir.length, journal: v.historique.length, dernier: v.historique.at(-1).texte, rappel: v.rappel, attente: v.attente, toast: ($('#toast').firstChild ? $('#toast').firstChild.textContent : '') }; }, avant.id);
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

  /* ---------- Recette N2 : rien de perdu, rien de compris à tort ---------- */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, exemple: true });
    await pause(p, 2500); // le toast « Exemple chargé » est parti
    const roth = await p.evaluate(() => state.aVoir.find(v => v.nom === 'Mme Roth').id);
    const brouillon = () => p.evaluate(() => JSON.parse(localStorage.getItem('kgd-brouillon') || 'null'));
    const NOTE_K = 'croisé Karim de Karim SARL pour les CEE, je lui envoie le devis';
    /* Une note commencée pour un nouveau contact, coupée (retour) ; puis « Contacté » sur Mme Roth, rien de tapé, Annuler ou Enregistrer */
    for (const fin of ['Annuler', 'Enregistrer']) {
      await noter(p);
      await p.keyboard.type(NOTE_K, { delay: 1 });
      await p.evaluate(() => history.back()); await pause(p, 200);
      await p.locator('#main button:has-text("Fait")').first().click(); await pause(p, 150);
      await p.click('#modal .suite-noter'); await pause(p, 120);
      const qui = await p.$eval('#rencontre .r-head .meta', e => e.textContent);
      await p.click(fin === 'Annuler' ? '#rencontre .r-annuler' : '#r-enregistrer'); await pause(p, 250);
      const b = await brouillon();
      await noter(p);
      const rouverte = await p.$eval('#r-note', e => e.value);
      verifier(`${ecran} recette : ${fin} sur une autre fiche (${qui.replace('Prise de contact · ', '')}) n'efface pas la note commencée pour un nouveau contact`,
        /Prise de contact · /.test(qui) && b && b.note === NOTE_K && b.contactId === null && rouverte === NOTE_K, JSON.stringify({ qui, b, rouverte }));
      if (fin === 'Annuler') { await p.click('#r-brouillon button'); await pause(p, 80); } // « Effacer » : on repart d'une note vide
      await p.evaluate(() => fermerRencontre());
    }
    /* Deux rencontres, deux brouillons : taper chez Mme Roth n'écrase pas la note du nouveau contact */
    await p.evaluate(id => openContact(id), roth); await pause(p);
    await p.locator('#r-note').pressSequentially('il me rappelle', { delay: 1 });
    await p.evaluate(() => history.back()); await pause(p, 200);
    const deux = await brouillon();
    await noter(p);
    const nouveau = await p.$eval('#r-note', e => e.value);
    await p.evaluate(() => history.back()); await pause(p, 200);
    await p.evaluate(id => openContact(id), roth); await pause(p);
    const chezRoth = await p.$eval('#r-note', e => e.value);
    verifier(`${ecran} recette : un brouillon par rencontre (nouveau contact et Mme Roth), chacun repris à sa place`,
      nouveau === NOTE_K && chezRoth === 'il me rappelle' && deux.note === 'il me rappelle' && deux.contactId === roth && deux.autres?.nouveau?.note === NOTE_K, JSON.stringify({ nouveau, chezRoth, deux }));
    /* Enregistrer chez Mme Roth n'efface que son brouillon */
    await p.click('#r-enregistrer'); await pause(p, 200);
    const apresRoth = await brouillon();
    verifier(`${ecran} recette : Enregistrer chez Mme Roth efface son brouillon, celui du nouveau contact reste`,
      apresRoth && apresRoth.note === NOTE_K && !apresRoth.autres, JSON.stringify(apresRoth));
    await noter(p); await p.click('#r-brouillon button'); await pause(p, 80); await p.evaluate(() => fermerRencontre());

    /* Contact connu : le numéro lu va dans sa fiche s'il n'en a pas ; ni le service ni « Important » (sans RDV) ne sont montrés comme compris */
    await p.evaluate(id => openContact(id), roth); await pause(p);
    await p.locator('#r-note').pressSequentially("elle m'a donné son portable 06 12 34 56 78, on a parlé des CEE, signature !", { delay: 1 });
    await pause(p, 250);
    const jsRoth = await jetons(p);
    await p.click('#r-enregistrer'); await pause(p, 200);
    const fiche = await p.evaluate(id => { const v = aVoir(id); return { tel: v.tel, activite: v.activite, journal: v.historique.at(-1).texte }; }, roth);
    verifier(`${ecran} recette : contact connu, jetons montrés = ce qui sera enregistré (Tél. seulement, ni CEE ni Important)`,
      jsRoth.map(j => j.t).join(' | ') === 'Tél. 06 12 34 56 78', JSON.stringify(jsRoth));
    verifier(`${ecran} recette : contact connu sans numéro → 06 12 34 56 78 dans sa fiche, la note entière au journal, service inchangé`,
      fiche.tel === '06 12 34 56 78' && /06 12 34 56 78/.test(fiche.journal) && fiche.activite === 'foncier', JSON.stringify(fiche));
    await p.evaluate(id => openContact(id), roth); await pause(p);
    await p.fill('#r-note', 'nouveau numéro 07 11 22 33 44'); await pause(p, 200);
    const autreTel = await jetons(p);
    await p.click('#r-enregistrer'); await pause(p, 200);
    const telGarde = await p.evaluate(id => aVoir(id).tel, roth);
    verifier(`${ecran} recette : un numéro déjà connu n'est jamais remplacé (pas de jeton Tél. trompeur, la note le garde)`,
      telGarde === '06 12 34 56 78' && !autreTel.some(j => /^Tél/.test(j.t)), JSON.stringify({ telGarde, autreTel }));
    /* « Important » : seulement avec un RDV, qui passe en alerte */
    await noter(p);
    await p.fill('#r-note', 'croisé Paul Dubois de Dubois BTP, CEE, signature !'); await pause(p, 200);
    const sansRdv = await jetons(p);
    await p.fill('#r-note', 'croisé Paul Dubois de Dubois BTP, CEE, rdv jeudi 14h pour la signature !'); await pause(p, 200);
    const avecRdv = await jetons(p);
    await p.click('#r-enregistrer'); await pause(p, 200);
    const evImp = await p.evaluate(() => { const v = state.aVoir.at(-1); const e = state.events.find(x => x.id === v.eventId); return { nom: v.nom, date: e?.date, heure: e?.heure, important: e?.important }; });
    verifier(`${ecran} recette : « Important » n'est montré qu'avec un RDV, et le RDV créé est en alerte`,
      !sansRdv.some(j => j.t === 'Important') && avecRdv.some(j => j.t === 'Important') && evImp.nom === 'Paul Dubois' && evImp.date === '2026-10-15' && evImp.heure === '14:00' && evImp.important === true, JSON.stringify({ sansRdv: sansRdv.map(j => j.t), avecRdv: avecRdv.map(j => j.t), evImp }));

    /* « Qui ? » affiché, puis le nom écrit dans la phrase : les puces reviennent et Enregistrer crée le contact */
    await noter(p);
    await p.fill('#r-note', 'rappelle-moi jeudi pour le devis'); await pause(p, 200);
    await p.click('#r-enregistrer'); await pause(p, 120);
    const quiVu = !!await p.$('#r-qui');
    await p.fill('#r-note', 'croisé Hugo de Hugo Peinture, rappelle-moi jeudi pour le devis'); await pause(p, 250);
    const zone = await p.evaluate(() => ({ qui: !!$('#r-qui'), puces: !!$('#r-rappels'), nom: renc.nom }));
    await p.click('#r-enregistrer'); await pause(p, 200);
    const hugo = await p.evaluate(() => { const v = state.aVoir.at(-1); return { nom: v.nom, entreprise: v.entreprise, rappel: v.rappel, ferme: $('#rencontre').hidden }; });
    verifier(`${ecran} recette : « Qui ? » puis le nom dans la phrase → les puces reviennent, Enregistrer crée Hugo (rappel jeudi)`,
      quiVu && !zone.qui && zone.puces && zone.nom === 'Hugo' && hugo.nom === 'Hugo' && hugo.entreprise === 'Hugo Peinture' && hugo.rappel === '2026-10-15' && hugo.ferme, JSON.stringify({ quiVu, zone, hugo }));
    /* « Qui ? » laissé vide alors que la phrase donne le nom (le champ garde le focus) : Enregistrer prend le nom lu */
    await noter(p);
    await p.fill('#r-note', 'rappelle-moi lundi'); await pause(p, 200);
    await p.click('#r-enregistrer'); await pause(p, 120);
    await p.evaluate(() => { const t = $('#r-note'); t.value = 'vu Inès de Atelier Sud, rappelle-moi lundi'; noteSaisie(t.value); $('#r-qui').focus(); });
    await pause(p, 250);
    await p.click('#r-enregistrer'); await pause(p, 200);
    const ines = await p.evaluate(() => ({ nom: state.aVoir.at(-1).nom, ferme: $('#rencontre').hidden, toast: ($('#toast').firstChild ? $('#toast').firstChild.textContent : '') }));
    verifier(`${ecran} recette : « Qui ? » vide n'efface pas le nom lu dans la phrase`, ines.nom === 'Inès' && ines.ferme, JSON.stringify(ines));

    /* Contact sans nom (ancien stockage) : son entreprise le nomme partout */
    await p.evaluate(() => { state.aVoir.push({ id: 'sansnom1', createdAt: 1, nom: '', entreprise: 'Boulangerie Martin', activite: 'energie', priorite: 'normale', statut: 'suivi', attente: '', rappel: '2026-10-20', historique: [] }); save(); render(); });
    await noter(p);
    await p.fill('#r-note', 'passé à la Boulangerie Martin, le gérant veut un devis'); await pause(p, 250);
    const sn = await p.evaluate(() => ({ bandeau: $('#r-doublon > span')?.textContent, compris: $('#r-jetons').textContent }));
    await p.click('#r-doublon button'); await pause(p, 80);
    const sn2 = await p.evaluate(() => ({ toast: ($('#toast').firstChild ? $('#toast').firstChild.textContent : ''), entete: $('#rencontre .r-head .meta').textContent }));
    await p.click('#r-enregistrer'); await pause(p, 200);
    const sn3 = await p.evaluate(() => ($('#toast').firstChild ? $('#toast').firstChild.textContent : ''));
    verifier(`${ecran} recette : contact sans nom → « Boulangerie Martin existe déjà », toast et en-tête à son nom`,
      sn.bandeau === 'Boulangerie Martin existe déjà' && !/Rien de reconnu/.test(sn.compris) && sn2.toast === 'La note ira dans la fiche de Boulangerie Martin' && sn2.entete === 'Prise de contact · Boulangerie Martin' && /^Boulangerie Martin · rappel /.test(sn3), JSON.stringify({ sn, sn2, sn3 }));

    /* « Rétablir » (après Annuler) n'écrase pas une nouvelle note : le toast part dès qu'on écrit */
    await noter(p);
    await p.fill('#r-note', 'vu Marc au salon, CEE'); await pause(p, 100);
    await p.click('#rencontre .r-annuler'); await pause(p, 150);
    const retablirVu = await p.evaluate(() => $('#toast').classList.contains('show') && !!$('#toast .toast-action'));
    await noter(p);
    await p.keyboard.type('croisé Julie Martin de Solaris, foncier', { delay: 1 }); await pause(p, 150);
    const toastParti = await p.evaluate(() => !$('#toast').classList.contains('show'));
    await p.evaluate(() => $('#toast .toast-action')?.click()); await pause(p, 150);
    const julie = await p.evaluate(() => ({ note: $('#r-note').value, b: JSON.parse(localStorage.getItem('kgd-brouillon')).note }));
    verifier(`${ecran} recette : après Annuler, une nouvelle note fait partir « Rétablir », qui ne l'écrase jamais`,
      retablirVu && toastParti && julie.note === 'croisé Julie Martin de Solaris, foncier' && julie.b === julie.note, JSON.stringify({ retablirVu, toastParti, julie }));
    await p.click('#rencontre .r-annuler'); await pause(p, 150);

    /* Toast pendant Noter : en haut (sur l'en-tête au téléphone), jamais sur la note, les jetons, les puces ni les boutons */
    {
      await noter(p);
      await p.fill('#r-note', "Mme Roth m'envoie ses avis, rappelle-moi jeudi"); await pause(p, 250);
      await p.click('#r-doublon button'); await pause(p, 250);
      const pos = await p.evaluate(() => {
        const t = $('#toast').getBoundingClientRect(), coupe = s => { const b = $(s).getBoundingClientRect(); return !(t.bottom <= b.top || t.top >= b.bottom || t.right <= b.left || t.left >= b.right); };
        return { visible: $('#toast').classList.contains('show'), haut: Math.round(t.top), bas: Math.round(t.bottom), tete: Math.round($('#rencontre .r-head').getBoundingClientRect().bottom), note: coupe('#r-note'), jetons: coupe('#r-jetons'), puces: coupe('#r-zone'), pied: coupe('#rencontre .r-foot') };
      });
      verifier(`${ecran} recette : toast pendant Noter posé en haut (ni note, ni jetons, ni puces, ni boutons)`,
        pos.visible && !pos.note && !pos.jetons && !pos.puces && !pos.pied && pos.bas <= pos.tete + 2, JSON.stringify(pos));
      await capture(p, `n2-toast-noter-${largeur}`);
      await p.evaluate(() => annulerRencontre());
      const horsNoter = await p.evaluate(() => { toast('essai'); return { marge: Math.round(innerHeight - $('#toast').getBoundingClientRect().bottom), barre: Math.round(innerHeight - $('.sidebar').getBoundingClientRect().top) }; });
      verifier(`${ecran} recette : hors de Noter, le toast reste en bas${tel ? ', au-dessus de la barre et de son bouton +' : ''}`, tel ? horsNoter.marge >= horsNoter.barre : horsNoter.marge >= 20 && horsNoter.marge < 60, JSON.stringify(horsNoter));
    }
    if (tel) {

      /* Double toucher impatient sur + : le second toucher (sur la puce « Clore ») ne fait rien */
      for (const delai of [120, 250]) {
        await p.evaluate(() => { location.hash = '#dashboard'; localStorage.removeItem('kgd-brouillon'); }); await pause(p, 120);
        const box = await p.locator('#fab').boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await p.touchscreen.tap(x, y); await pause(p, delai);
        const sous = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.textContent.trim(), [x, y]);
        await p.touchscreen.tap(x, y); await pause(p, 150);
        const r = await p.evaluate(() => ({ ouvert: !$('#rencontre').hidden, rappelJ: renc && renc.rappelJ, etape: renc && renc.etape }));
        await p.fill('#r-note', 'croisé Nadia de Nadia Fleurs, CEE'); await pause(p, 200);
        await p.waitForTimeout(400);
        await p.touchscreen.tap(...await p.locator('#r-rappels .chip[data-j="7"]').boundingBox().then(b => [b.x + b.width / 2, b.y + b.height / 2])); await pause(p, 80);
        const puceApres = await p.evaluate(() => renc.rappelJ);
        await p.click('#r-enregistrer'); await pause(p, 200);
        const nadia = await p.evaluate(() => { const v = state.aVoir.at(-1); return { nom: v.nom, statut: v.statut, rappel: v.rappel }; });
        verifier(`${ecran} recette : double toucher (${delai} ms) sur + : le second (sur « ${sous} ») ne change rien ; ensuite les puces répondent`,
          ['Clore', 'Ajuster…'].includes(sous) && r.ouvert && r.rappelJ === '3' && r.etape === 0 && puceApres === '7' && nadia.nom === 'Nadia' && nadia.statut === 'suivi' && nadia.rappel === '2026-10-19', JSON.stringify({ sous, r, puceApres, nadia }));
      }

      /* Rechargement depuis #contacts (après #planning) avec Noter ouvert : Noter revient ; retour → ferme Noter ; retour → #planning */
      await p.evaluate(() => { location.hash = '#planning'; }); await pause(p, 150);
      await p.evaluate(() => { location.hash = '#contacts'; }); await pause(p, 150);
      await p.tap('#fab'); await pause(p, 100);
      await p.keyboard.type('vu Paul pour la fibre'); await pause(p, 150);
      await p.reload({ waitUntil: 'domcontentloaded' }); await pause(p, 300);
      const r0 = await p.evaluate(() => ({ hash: location.hash, ouvert: !$('#rencontre').hidden, note: $('#r-note')?.value }));
      await p.evaluate(() => history.back()); await pause(p, 300);
      const r1 = await p.evaluate(() => ({ hash: location.hash, ouvert: !$('#rencontre').hidden }));
      await p.evaluate(() => history.back()); await pause(p, 300);
      const r2 = await p.evaluate(() => location.hash);
      verifier(`${ecran} recette : rechargement avec Noter ouvert sur #contacts → Noter revient ; 1er retour le ferme (#contacts) ; 2e retour → #planning`,
        r0.hash === '#contacts' && r0.ouvert && r0.note === 'vu Paul pour la fibre' && r1.hash === '#contacts' && !r1.ouvert && r2 === '#planning', JSON.stringify({ r0, r1, r2 }));
    }
    verifier(`${ecran} recette : aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* Brouillon de la veille au soir, repris le lendemain : « demain » et le journal restent ceux de la veille */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, horloge: '2026-10-14T09:00:00' });
    await p.evaluate(() => localStorage.setItem('kgd-brouillon', JSON.stringify({ note: 'croisé Paul de Dupont, rappelle-moi demain', contactId: null, etape: 0, t: new Date(2026, 9, 13, 22, 0).getTime() })));
    await noter(p);
    const r = await p.evaluate(() => ({ bandeau: $('#r-brouillon span')?.textContent, jetons: [...document.querySelectorAll('#r-jetons .jeton')].map(j => j.textContent), rappel: renc.rappel }));
    await p.click('#r-enregistrer'); await pause(p, 150);
    const v = await p.evaluate(() => { const v = state.aVoir.at(-1); return { nom: v.nom, rappel: v.rappel, journal: v.historique.at(-1).date }; });
    verifier(`${ecran} recette : brouillon d'hier 22:00 repris → « demain » = mer. 14 oct., journal daté du 13`,
      r.bandeau === 'Brouillon d\'hier, 22:00 repris' && r.jetons.includes('Rappel mer. 14 oct.') && v.nom === 'Paul' && v.rappel === '2026-10-14' && v.journal === '2026-10-13', JSON.stringify({ r, v }));
    verifier(`${ecran} recette (veille) : aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* « Affiner avec Kami » : une seule demande à la fois, même si la note change pendant que Kami lit */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur });
    await p.evaluate(() => { jarvis.token = 'jeton-test'; });
    let appels = 0;
    await p.route('**/api/analyser', async r => { appels++; await new Promise(o => setTimeout(o, 1200)); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ nom: '', entreprise: '', activite: '', sujet: 'Karim veut un devis', attente: '', rappel: '', creneau: { type: 'aucun' }, objet: '', tel: '', resume: 'Karim, devis.' }) }); });
    await noter(p);
    await p.fill('#r-note', KARIM); await pause(p, 200);
    await p.click('#r-affiner'); await pause(p, 60);
    await p.locator('#r-note').pressSequentially(' ok', { delay: 1 }); await pause(p, 250);
    const pendant = await p.$eval('#r-affiner', e => ({ disabled: e.disabled, texte: e.textContent }));
    await p.evaluate(() => { $('#r-affiner').disabled = false; $('#r-affiner').click(); analyserRencontre(); });
    await pause(p, 1800);
    const fin = await p.evaluate(() => ({ t: $('#rencontre h2').textContent, enCours: renc.kamiEnCours }));
    verifier(`${ecran} recette : pendant que Kami lit, « Kami lit… » reste désactivé ; un seul appel à /api/analyser`,
      pendant.disabled && pendant.texte === 'Kami lit…' && appels === 1 && fin.t === 'On enregistre ?' && fin.enCours === false, JSON.stringify({ pendant, appels, fin }));
    await p.evaluate(() => { fermerRencontre(); jarvis.token = ''; });
    verifier(`${ecran} recette (Kami) : aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
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
