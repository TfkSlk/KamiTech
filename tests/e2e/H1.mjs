/* H1 — Accueil « Parle, je note » : un toucher ouvre Noter et l'écoute ; la note est comprise avec le contexte
   (prise de contact → fiche remplie jusqu'au récapitulatif ; planning, dossier… → Kami agit, « Annuler » à portée) ;
   dictée du clavier en repli ; « Écrire » ; « Noté aujourd'hui » */
import { ouvrir, verifier, bilan } from './outil.mjs';

const FAUX = () => {
  window.__fake = { instances: [], mode: 'ok', starts: 0 };
  class FakeSR {
    constructor() { this.lang = ''; window.__fake.instances.push(this); }
    start() { window.__fake.starts++; setTimeout(() => { if (this.onstart) this.onstart(); }, 0); }
    stop() { setTimeout(() => { if (this.onend) this.onend(); }, window.__fake.finLente ? 150 : 0); }
    abort() { this.stop(); }
  }
  window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;
  window.__emit = (txt, isFinal) => { const r = window.__fake.instances.at(-1); const res = [{ transcript: txt }]; res.isFinal = isFinal; r.onresult({ resultIndex: 0, results: [res] }); };
};
const SANS = () => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; };
const toastTxt = p => p.evaluate(() => { const t = document.querySelector('#toast'); return t && t.firstChild ? t.firstChild.textContent : ''; });
const hero = p => p.evaluate(() => {
  const e = document.querySelector('.noter-bar.parle'); if (!e) return null;
  const r = x => x && x.getBoundingClientRect();
  const b = r(e.querySelector('.parle-btn')), i = r(e.querySelector('.parle-ico')), w = r(e.querySelector('.noter-ecrire'));
  return { txt: e.textContent.replace(/\s+/g, ' ').trim(), btn: b && b.height, ico: i && i.width, icoH: i && i.height, ecrire: w && w.height, top: r(e).top, sous: e.querySelector('.parle-txt small').textContent };
});
const noter = p => p.evaluate(() => {
  const el = document.querySelector('#rencontre'), it = document.querySelector('#r-interim');
  return { ouvert: !!el && !el.hidden, micOn: !!document.querySelector('#r-mic.on'), clavier: !!document.querySelector('#r-mic.clavier'), interim: it ? it.textContent : null, ecoute: !!(it && it.classList.contains('ecoute')), interimCache: it ? it.hidden : null, actif: document.activeElement && document.activeElement.id, etape: typeof renc !== 'undefined' && renc ? renc.etape : null, note: (document.querySelector('#r-note') || {}).value || '' };
});
/* Faux /api/analyser et /api/jarvis : ce que l'appli envoie est gardé pour vérification */
async function stubs(p, { intention, actions = [], jarvisTexte = "C'est fait." }) {
  await p.unroute('**/api/analyser').catch(() => {}); await p.unroute('**/api/jarvis').catch(() => {});
  const vus = { analyser: [], jarvis: [] };
  await p.route('**/api/analyser', async route => {
    vus.analyser.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intention, nom: 'Nadia', entreprise: 'Boulangerie Nadia', activite: 'cee', sujet: 'elle attend ma proposition CEE', fait: 'devis envoyé', faitDate: '2026-10-06', attente: 'lui', rappel: '2026-10-15', creneau: { type: 'date', date: '2026-10-13', heure: '15:00', du: '', au: '' }, objet: 'Présentation CEE', tel: '', resume: 'Nadia (Boulangerie Nadia), CEE : devis envoyé lundi, RDV mardi 15h, rappel jeudi.', modele: 'test' }) });
  });
  await p.route('**/api/jarvis', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cleApi: true, tokenDefini: true, modele: 'test', effort: 'low' }) });
    vus.jarvis.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ texte: jarvisTexte, actions, modele: 'test', usage: {} }) });
  });
  return vus;
}
const PHRASE = 'croisé Nadia de la boulangerie pour les CEE je lui ai envoyé le devis lundi on se voit mardi à quinze heures rappelle-moi jeudi';

/* 1. Téléphone, reconnaissance vocale disponible */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, exemple: true });
  await p.addInitScript(FAUX);
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(300);
  const h0 = await hero(p);
  verifier('Accueil : « Parle, je note » en tête, bouton ≥ 64 px, micro rond de 64 px, « Écrire » ≥ 44 px, sous-titre : qui, RDV, dossier',
    h0 && /^Parle, je note/.test(h0.txt) && h0.btn >= 64 && h0.ico === 64 && h0.icoH === 64 && h0.ecrire >= 44 && h0.top <= 200 && /Qui tu as vu/.test(h0.sous) && /RDV/.test(h0.sous) && /dossier/.test(h0.sous), JSON.stringify(h0));
  await p.click('.parle-btn'); await p.waitForTimeout(150);
  const n1 = await noter(p);
  verifier("Un toucher : Noter s'ouvre et l'écoute démarre (micro allumé, « J'écoute… » affiché)", n1.ouvert && n1.micOn && (await p.evaluate(() => window.__fake.starts)) === 1 && n1.interim === 'J\'écoute…' && n1.ecoute && !n1.interimCache, JSON.stringify(n1));
  await p.evaluate(() => window.__emit('croisé Karim de', false)); await p.waitForTimeout(50);
  verifier("Le texte provisoire remplace « J'écoute… »", (await noter(p)).interim === 'croisé Karim de');
  await p.evaluate(t => window.__emit(t, true), PHRASE); await p.waitForTimeout(200);
  const n2 = await noter(p);
  verifier("Phrase finale dans la note ; « J'écoute… » revient tant que le micro est allumé", /Nadia de la boulangerie/.test(n2.note) && n2.interim === 'J\'écoute…' && n2.ecoute, JSON.stringify(n2));
  await p.click('#r-mic'); await p.waitForTimeout(250);
  const n3 = await noter(p);
  verifier("Micro arrêté sans jeton Kami : « J'écoute… » disparaît, la note reste à l'étape Noter (lecture locale)", !n3.micOn && n3.interimCache && n3.etape === 0 && /Nadia de la boulangerie/.test(n3.note), JSON.stringify(n3));

  /* Avec Kami : prise de contact → la fiche est remplie jusqu'au récapitulatif, rien n'est enregistré sans « Enregistrer » */
  await p.evaluate(() => { jarvis.token = 'test'; saveJarvis(); effacerBrouillonDe(renc); fermerRencontre(); });
  let vus = await stubs(p, { intention: 'contact' });
  await p.click('.parle-btn'); await p.waitForTimeout(150);
  await p.evaluate(t => window.__emit(t, true), PHRASE); await p.waitForTimeout(100);
  await p.click('#r-mic'); await p.waitForTimeout(700);
  const n4 = await noter(p), corpsA = vus.analyser[0] || {};
  verifier('Micro arrêté avec Kami : la note lui part (texte, date du jour, noms connus) et la fiche arrive au récapitulatif',
    vus.analyser.length === 1 && /Nadia de la boulangerie/.test(corpsA.texte || '') && corpsA.aujourdhui === '2026-10-10' && Array.isArray(corpsA.connus) && corpsA.connus.length > 0 && n4.ouvert && n4.etape === 4,
    JSON.stringify({ n4, texte: corpsA.texte, connus: (corpsA.connus || []).length, aujourdhui: corpsA.aujourdhui }));
  const recap = await p.evaluate(() => ({ nom: document.querySelector('.recap-nom')?.textContent.replace(/\s+/g, ' ').trim(), fait: document.querySelector('.recap-fait')?.textContent, suite: document.querySelector('#r-suite')?.textContent.replace(/\s+/g, ' ').trim(), sujet: document.querySelector('#r-sujet')?.value, contact: state.aVoir.some(v => /Nadia/.test(v.nom)) }));
  verifier('Le récapitulatif montre tout : qui, « Déjà fait lun. 6 oct. : devis envoyé », la suite (RDV + rappel) ; rien n\'est enregistré avant « Enregistrer »',
    /^Nadia · Boulangerie Nadia/.test(recap.nom || '') && /Déjà fait .*6 oct\.? : devis envoyé/.test(recap.fait || '') && /15:00|15 h/.test(recap.suite || '') && /15 oct|jeu/.test(recap.suite || '') && recap.sujet === 'elle attend ma proposition CEE' && !recap.contact, JSON.stringify(recap));
  await p.click('#rencontre button.primary:has-text("Enregistrer")'); await p.waitForTimeout(300);
  const fait = await p.evaluate(() => { const v = state.aVoir.find(x => /Nadia/.test(x.nom)); const ev = v && state.events.find(e => e.lien === 'c:' + v.id); return v && { entreprise: v.entreprise, activite: v.activite, attente: v.attente, rappel: v.rappel, statut: v.statut, journal: v.historique.map(h => h.date + ' ' + h.texte), ev: ev && { date: ev.date, heure: ev.heure, titre: ev.titre, lie: v.eventId === ev.id }, toast: document.querySelector('#toast').firstChild?.textContent }; });
  verifier('« Enregistrer » fait tout : contact créé (CEE, elle me doit une réponse), journal « Déjà fait · devis envoyé » daté du 6 puis la note du jour, rappel jeudi, RDV mardi 15:00 lié au contact',
    fait && fait.entreprise === 'Boulangerie Nadia' && fait.activite === 'cee' && fait.attente === 'lui' && fait.rappel === '2026-10-15' && fait.statut === 'planifie'
    && fait.journal.join('|') === '2026-10-06 Déjà fait · devis envoyé|2026-10-10 elle attend ma proposition CEE' && fait.ev && fait.ev.date === '2026-10-13' && fait.ev.heure === '15:00' && /Nadia/.test(fait.ev.titre) && fait.ev.lie && /RDV/.test(fait.toast || ''), JSON.stringify(fait));

  /* Le dernier mot arrive souvent après l'arrêt du micro : Kami lit la note complète */
  await p.evaluate(() => { effacerBrouillonDe(renc); fermerRencontre(); window.__fake.finLente = true; });
  vus = await stubs(p, { intention: 'contact' });
  await p.click('.parle-btn'); await p.waitForTimeout(150);
  await p.evaluate(() => window.__emit('croisé Nadia de la boulangerie', true)); await p.waitForTimeout(50);
  await p.click('#r-mic');
  await p.evaluate(() => window.__emit('rappelle-moi jeudi', true)); await p.waitForTimeout(600);
  verifier('Un mot reconnu juste après l\'arrêt fait partie de ce que Kami lit', vus.analyser.length === 1 && vus.analyser[0].texte === 'croisé Nadia de la boulangerie rappelle-moi jeudi', JSON.stringify(vus.analyser.map(a => a.texte)));
  await p.evaluate(() => { window.__fake.finLente = false; effacerBrouillonDe(renc); fermerRencontre(); });

  /* Note dictée depuis la fiche d'un contact : Kami sait de qui on parle, et la note reste dans Noter même si elle ressemble à du planning */
  vus = await stubs(p, { intention: 'planning' });
  await p.evaluate(() => { openContact(state.aVoir[0].id); dicteeRencontre(); }); await p.waitForTimeout(150);
  await p.evaluate(() => window.__emit('on se voit mardi à quinze heures', true)); await p.waitForTimeout(50);
  await p.click('#r-mic'); await p.waitForTimeout(600);
  const fiche = await p.evaluate(() => ({ ouvert: !document.querySelector('#rencontre').hidden, etape: renc && renc.etape, v: renc && renc.v && nomDe(renc.v) }));
  verifier('Depuis une fiche : le contact est nommé à Kami, la note reste dans Noter (récapitulatif), pas de détour par la conversation', vus.analyser.length === 1 && (vus.analyser[0].contact || '').startsWith(fiche.v) && /Pharmacie/.test(vus.analyser[0].contact) && vus.jarvis.length === 0 && fiche.ouvert && fiche.etape === 4, JSON.stringify({ fiche, contact: vus.analyser[0]?.contact }));

  /* Autre chose qu'une prise de contact : Kami agit avec le planning sous les yeux, « Annuler » remet tout */
  await p.evaluate(() => { effacerBrouillonDe(renc); fermerRencontre(); });
  vus = await stubs(p, { intention: 'planning', jarvisTexte: "C'est fait : garage mardi quinze heures.", actions: [{ op: 'add', collection: 'events', item: { id: 'h1-ev', titre: 'Garage Central · déplacé', date: '2026-10-13', heure: '15:00', activite: 'perso', mode: 'place', duree: 60, fait: false } }] });
  await p.click('.parle-btn'); await p.waitForTimeout(150);
  await p.evaluate(() => window.__emit('décale le rendez-vous garage central à mardi quinze heures', true)); await p.waitForTimeout(100);
  await p.click('#r-mic'); await p.waitForTimeout(900);
  const k = await p.evaluate(() => ({ hash: location.hash, ouvert: !document.querySelector('#rencontre').hidden, ev: !!state.events.find(e => e.id === 'h1-ev'), bulles: [...document.querySelectorAll('#chat-log .bulle')].map(b => b.textContent.trim()).slice(-2), brouillon: localStorage.getItem('kgd-brouillon') || '', toast: document.querySelector('#toast').firstChild ? document.querySelector('#toast').firstChild.textContent : '', action: (document.querySelector('#toast .toast-action') || {}).textContent || '' }));
  const corpsJ = vus.jarvis[0] || {}, dernierMsg = (corpsJ.messages || []).at(-1) || {};
  verifier('Note de planning : Noter se ferme, Kami reçoit la phrase telle quelle (mode voix) et son action est appliquée',
    vus.analyser.length === 1 && vus.jarvis.length === 1 && /garage central/.test(dernierMsg.content || '') && corpsJ.mode === 'voice' && Array.isArray(corpsJ.state?.events) && !k.ouvert && k.hash === '#jarvis' && k.ev,
    JSON.stringify({ k, mode: corpsJ.mode, msg: dernierMsg.content }));
  verifier("La réponse de Kami s'affiche dans sa conversation ; le brouillon de Noter n'est pas gardé", k.bulles.some(b => /garage mardi quinze heures/.test(b)) && !/garage central/.test(k.brouillon), JSON.stringify({ bulles: k.bulles, brouillon: k.brouillon }));
  verifier('« Kami a mis à jour le planning (1 action) · Annuler » proposé', /a mis à jour le planning \(1 action\)/.test(k.toast) && k.action === 'Annuler', k.toast + ' / ' + k.action);
  await p.click('#toast .toast-action'); await p.waitForTimeout(250);
  const apres = await p.evaluate(() => ({ ev: !!state.events.find(e => e.id === 'h1-ev'), bulle: [...document.querySelectorAll('#chat-log .bulle.assistant')].at(-1)?.textContent || '', hist: jarvis.historique.at(-1) }));
  verifier('Annuler : le planning revient comme avant, et la réponse de Kami dit « annulé par Toufek » sans action comptée', !apres.ev && /Remis comme avant/.test(await toastTxt(p)) && /annulé par Toufek/.test(apres.bulle) && !/action/.test(apres.bulle) && apres.hist.actions === 0, JSON.stringify(apres));

  /* « Noté aujourd'hui » : les contacts notés dans la journée restent à portée sur l'accueil */
  await p.evaluate(() => { const v = state.aVoir[0]; (v.historique = v.historique || []).push({ date: today(), texte: 'test H1' }); save(); location.hash = '#dashboard'; }); await p.waitForTimeout(350);
  await p.evaluate(() => render()); await p.waitForTimeout(150);
  const nj = await p.evaluate(() => { const e = document.querySelector('#notes-jour'); return e ? { txt: e.textContent.trim(), chips: [...e.querySelectorAll('.chip')].map(c => c.textContent), nom: nomDe(state.aVoir[0]), h: e.querySelector('.chip').getBoundingClientRect().height } : null; });
  verifier("« Notés aujourd'hui » sous le micro : une puce par contact noté dans la journée (Nadia et le contact du test), puces de 44 px", nj && /^Notés aujourd'hui/.test(nj.txt) && nj.chips.length === 2 && nj.chips.includes('Nadia') && nj.chips.includes(nj.nom) && nj.h >= 44, JSON.stringify(nj));
  await p.click('#notes-jour .chip'); await p.waitForTimeout(250);
  verifier('La puce ouvre la fiche du contact', await p.evaluate(() => { const c = document.querySelector('#notes-jour .chip'); const v = state.aVoir.find(x => x.id === ficheId); return typeof modal === 'function' && modal().open && !!v && nomDe(v) === c.textContent; }));
  verifier("Pas d'erreur JS (1)", erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 2. Téléphone sans reconnaissance vocale (iPhone en appli installée, Firefox) : la dictée du clavier */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, exemple: true });
  await p.addInitScript(SANS);
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(300);
  const h = await hero(p);
  verifier('Sans reconnaissance : « Parle, je note » reste, le sous-titre montre la touche micro du clavier', h && /^Parle, je note/.test(h.txt) && /micro du clavier/.test(h.sous), JSON.stringify(h));
  await p.click('.parle-btn'); await p.waitForTimeout(200);
  const n = await noter(p);
  verifier("Un toucher : Noter s'ouvre, le clavier a le focus, aide « Dicte avec … »", n.ouvert && n.clavier && n.actif === 'r-note' && /Dicte avec/.test(await toastTxt(p)), JSON.stringify(n) + ' ' + await toastTxt(p));
  await p.evaluate(() => fermerRencontre()); await p.waitForTimeout(100);
  await p.click('.noter-ecrire'); await p.waitForTimeout(200);
  const e = await noter(p);
  verifier("« Écrire » : Noter s'ouvre au clavier, sans dictée", e.ouvert && e.actif === 'r-note' && !e.micOn, JSON.stringify(e));
  verifier("Pas d'erreur JS (2)", erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 3. Ordinateur */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 1366, hauteur: 900, exemple: true });
  await p.addInitScript(FAUX);
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(300);
  const h = await hero(p);
  verifier('Ordinateur : « Parle, je note » et « Écrire » présents, bouton ≥ 64 px', h && /^Parle, je note/.test(h.txt) && h.btn >= 64 && h.ecrire >= 44, JSON.stringify(h));
  await p.click('.parle-btn'); await p.waitForTimeout(150);
  const n = await noter(p);
  verifier("Un clic : Noter s'ouvre et l'écoute démarre", n.ouvert && n.micOn && (await p.evaluate(() => window.__fake.starts)) === 1, JSON.stringify(n));
  verifier("Pas d'erreur JS (3)", erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

bilan();
