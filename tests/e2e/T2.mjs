/* T2 — La tournée de relances : la file vidée carte par carte, message prêt, une issue en un toucher */
import { ouvrir, verifier, bilan } from './outil.mjs';

const aller = async (p, h) => { await p.evaluate(x => { location.hash = '#' + x; }, h); await p.waitForTimeout(250); };
const sansDefil = p => p.evaluate(() => { const b = document.querySelector('#tournee .r-body'); return b ? { ok: b.scrollHeight <= b.clientHeight + 1, sh: b.scrollHeight, ch: b.clientHeight } : null; });
const journal = (p, nom) => p.evaluate(n => (state.aVoir.find(v => v.nom === n)?.historique || []).length, nom);

/* 1. Données d'exemple à 390x844 : chaque carte (et chaque mini-choix) sans défilement ; WhatsApp de Mme Roth prêt */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge: '2026-10-10T09:00:00', exemple: true });
  await p.evaluate(() => { const v = state.aVoir.find(x => x.nom === 'Mme Roth'); v.tel = '06 12 34 56 78'; state.dossiers.forEach(d => { if (d.dateRelance) d.tel = d.tel || '03 88 00 00 00'; }); save(); render(); });
  const n = await p.evaluate(() => fileTournee().length);
  const bouton = await p.evaluate(() => [...document.querySelectorAll('#main button')].find(b => /Lancer la tournée/.test(b.textContent))?.textContent.trim());
  verifier(`Accueil : « Lancer la tournée (${n}) »`, n >= 2 && bouton === `Lancer la tournée (${n})`, String(bouton));
  await p.click('#main button:has-text("Lancer la tournée")'); await p.waitForTimeout(300);
  const premiere = await p.evaluate(() => ({ ouvert: !document.querySelector('#tournee').hidden, titre: document.querySelector('#t-titre')?.textContent, nom: document.querySelector('.t-nom')?.textContent }));
  verifier('La tournée s\'ouvre sur la carte 1/N', premiere.ouvert && premiere.titre === `1/${n}`, JSON.stringify(premiere));
  /* Chaque carte, chaque mini-choix : rien ne défile */
  const defil = [];
  for (let i = 0; i < n; i++) {
    for (const m of ['', 'joint', 'reporter', 'clore']) {
      await p.evaluate(m => tourMode(m), m); await p.waitForTimeout(60);
      const s = await sansDefil(p);
      if (!s || !s.ok) defil.push({ i, m, ...s });
    }
    await p.evaluate(() => tourPasser()); await p.waitForTimeout(60);
  }
  verifier(`390x844 : ${n} cartes × 4 écrans sans défilement`, defil.length === 0, JSON.stringify(defil));
  await p.evaluate(() => quitterTournee()); await p.waitForTimeout(300);
  /* WhatsApp de Mme Roth : numéro international, message foncier avec ses avis */
  await p.evaluate(() => { lancerTournee(); });
  await p.waitForTimeout(200);
  for (let i = 0; i < n; i++) { if (await p.evaluate(() => document.querySelector('.t-nom')?.textContent === 'Mme Roth')) break; await p.evaluate(() => tourPasser()); }
  const wa = await p.evaluate(() => document.querySelector('#tournee a[href^="https://wa.me/"]')?.getAttribute('href') || '');
  const texte = decodeURIComponent((wa.split('?text=')[1] || ''));
  verifier('WhatsApp de Mme Roth : https://wa.me/33612345678?text=…', wa.startsWith('https://wa.me/33612345678?text='), wa.slice(0, 60));
  verifier('Le message contient « Mme Roth » et « avis »', /Mme Roth/.test(texte) && /avis/.test(texte), texte);
  const sms = await p.evaluate(() => document.querySelector('#tournee a[href^="sms:"]')?.getAttribute('href') || '');
  verifier('SMS prérempli avec le même message', sms.startsWith('sms:0612345678?&body=') && /avis/.test(decodeURIComponent(sms)), sms.slice(0, 60));
  /* WhatsApp puis « Pas répondu » : une seule ligne de journal, qui dit le canal */
  const avant = await journal(p, 'Mme Roth');
  await p.evaluate(() => { window.addEventListener('click', e => { if (e.target.closest('a[href^="https://wa.me"]')) e.preventDefault(); }, true); });
  await p.click('#tournee a[href^="https://wa.me/"]');
  await p.click('#tournee .opt:has-text("Pas répondu")'); await p.waitForTimeout(200);
  const der = await p.evaluate(() => { const h = state.aVoir.find(v => v.nom === 'Mme Roth').historique; return h[h.length - 1].texte; });
  verifier('Une ligne de journal : « WhatsApp · Message après rencontre Foncier & CFE · Relance 1 · pas de réponse »', (await journal(p, 'Mme Roth')) === avant + 1 && /^WhatsApp · Message après rencontre Foncier & CFE · Relance 1 · pas de réponse$/.test(der), der);
  verifier('Pas de question « Appel avec… » pendant la tournée', !(await p.evaluate(() => document.querySelector('#modal').open)));
  /* Recherche dans Contacts */
  await p.evaluate(() => quitterTournee()); await p.waitForTimeout(300);
  await aller(p, 'contacts');
  await p.fill('#av-q', 'pharma'); await p.waitForTimeout(150);
  const r1 = await p.evaluate(() => [...document.querySelectorAll('#av-liste li .title-txt')].map(e => e.textContent.trim()));
  verifier('Recherche « pharma » : Mme Roth seule', r1.length === 1 && /Mme Roth/.test(r1[0]), JSON.stringify(r1));
  await p.evaluate(() => { const v = state.aVoir.find(x => x.nom !== 'Mme Roth'); v.notes = 'Habite à Hoenheim, près de la gare'; save(); });
  await p.fill('#av-q', 'hoenheim'); await p.waitForTimeout(150);
  const r2 = await p.evaluate(() => ({ lignes: document.querySelectorAll('#av-liste li').length, attendu: state.aVoir.find(x => /Hoenheim/.test(x.notes || '')).nom, txt: document.querySelector('#av-liste').innerText }));
  verifier('Recherche « hoenheim » (sans majuscule) : le contact dont les notes disent « Hoenheim »', r2.lignes === 1 && r2.txt.includes(r2.attendu), JSON.stringify(r2));
  await p.fill('#av-q', 'croisee au marche'); await p.waitForTimeout(150);
  verifier('Recherche sans accents dans le journal (« croisee au marche »)', await p.evaluate(() => /Mme Roth/.test(document.querySelector('#av-liste').innerText)));
  await p.fill('#av-q', ''); await p.waitForTimeout(150);
  await p.evaluate(() => { state.aVoir.find(x => x.nom === 'Mme Roth').rappel = today(); save(); refreshContacts(); });
  const groupes = await p.evaluate(() => [...document.querySelectorAll('.av-groupe')].map(h => h.firstChild.textContent.trim()));
  verifier('En cours : groupes « En retard ou aujourd\'hui », « Cette semaine » ou « Plus tard »', groupes.length >= 2 && groupes[0] === 'En retard ou aujourd\'hui' && groupes.every(g => ['En retard ou aujourd\'hui', 'Cette semaine', 'Plus tard'].includes(g)), JSON.stringify(groupes));
  verifier('Ancienneté du dernier échange (« il y a N j »)', await p.evaluate(() => /dernier échange (il y a \d+ j|hier|aujourd'hui)/.test(document.querySelector('#av-liste').innerText)));
  const larg = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  verifier('390px Contacts : rien ne dépasse en largeur', larg);
  verifier('Pas d\'erreur JS (1)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 2. « Pas répondu » trois tournées de suite : rappels à 2, 5 puis 10 jours ; à la 3e, « Clore : sans réponse » en premier */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge: '2026-10-10T09:00:00' });
  await p.evaluate(() => { state.aVoir.push({ id: 'k1', createdAt: Date.now(), nom: 'Karim Benali', entreprise: 'Karim SARL', activite: 'cee', priorite: 'normale', statut: 'suivi', attente: 'lui', rappel: today(), tel: '06 11 22 33 44', historique: [{ date: today(), texte: 'Croisé au salon' }] }); save(); render(); });
  const rappels = [], attendus = [], premiers = [], lignes = [];
  for (let k = 0; k < 3; k++) {
    await p.evaluate(() => { aVoir('k1').rappel = today(); save(); lancerTournee(); }); await p.waitForTimeout(150);
    premiers.push(await p.evaluate(() => document.querySelector('#tournee .t-issues .opt b')?.textContent));
    const h0 = await p.evaluate(() => aVoir('k1').historique.length);
    attendus.push(await p.evaluate(n => rappelDans(n), [2, 5, 10][k]));
    await p.click('#tournee .opt:has-text("Pas répondu")'); await p.waitForTimeout(150);
    rappels.push(await p.evaluate(() => aVoir('k1').rappel));
    lignes.push((await p.evaluate(() => aVoir('k1').historique.length)) - h0);
    await p.evaluate(() => quitterTournee()); await p.waitForTimeout(250);
  }
  verifier('Rappels = rappelDans(2), rappelDans(5), rappelDans(10)', JSON.stringify(rappels) === JSON.stringify(attendus), JSON.stringify({ rappels, attendus }));
  verifier('Rappels en ordre croissant', rappels[0] < rappels[1] && rappels[1] < rappels[2]);
  verifier('À la 3e tournée, le premier bouton est « Clore : sans réponse »', premiers[0] === 'Joint' && premiers[2] === 'Clore : sans réponse', JSON.stringify(premiers));
  verifier('Chaque « Pas répondu » ajoute exactement une ligne', lignes.every(n => n === 1), JSON.stringify(lignes));
  verifier('Tentatives = 3', await p.evaluate(() => aVoir('k1').tentatives === 3));
  /* Joint → rappel 3 j : tentatives remises à zéro, une ligne */
  await p.evaluate(() => { aVoir('k1').rappel = today(); save(); lancerTournee(); }); await p.waitForTimeout(150);
  const h0 = await p.evaluate(() => aVoir('k1').historique.length);
  await p.click('#tournee .opt:has-text("Joint")'); await p.waitForTimeout(100);
  await p.click('#tournee .opt:has-text("Rappel dans 3 j")'); await p.waitForTimeout(150);
  const j = await p.evaluate(() => ({ t: aVoir('k1').tentatives, r: aVoir('k1').rappel, attendu: rappelDans(3), n: aVoir('k1').historique.length }));
  verifier('Joint · rappel dans 3 j : tentatives 0, rappel posé, une ligne', j.t === 0 && j.r === j.attendu && j.n === h0 + 1, JSON.stringify({ ...j, h0 }));
  await p.evaluate(() => quitterTournee()); await p.waitForTimeout(250);
  /* Clore → dans 3 mois / jamais */
  await p.evaluate(() => { aVoir('k1').rappel = today(); save(); lancerTournee(); }); await p.waitForTimeout(150);
  await p.click('#tournee .opt:has-text("Clore")'); await p.waitForTimeout(100);
  await p.click('#tournee .opt:has-text("Dans 3 mois")'); await p.waitForTimeout(150);
  const c3 = await p.evaluate(() => ({ s: aVoir('k1').statut, r: aVoir('k1').rappel, a: aVoir('k1').attente }));
  verifier('Clore · dans 3 mois : en suivi, sans attente, rappel le 11 janvier 2027 (lundi)', c3.s === 'suivi' && c3.a === '' && c3.r === '2027-01-11', JSON.stringify(c3));
  await p.evaluate(() => quitterTournee()); await p.waitForTimeout(250);
  await p.evaluate(() => { aVoir('k1').rappel = today(); save(); lancerTournee(); }); await p.waitForTimeout(150);
  await p.click('#tournee .opt:has-text("Clore")'); await p.waitForTimeout(100);
  await p.click('#tournee .opt:has-text("Jamais")'); await p.waitForTimeout(150);
  verifier('Clore · jamais : contact clos', await p.evaluate(() => aVoir('k1').statut === 'clos' && !aVoir('k1').rappel));
  verifier('Pas d\'erreur JS (2)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 3. Un vendredi : « Reporter → Demain » pose le lundi ; glisser à gauche reporte ; écran de fin (1 joint, 1 pas répondu, 1 reporté) ; dossier */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge: '2026-10-09T09:00:00' });
  await p.evaluate(() => {
    const c = (id, nom, attente, rappel) => ({ id, createdAt: Date.now(), nom, entreprise: '', activite: 'energie', priorite: 'normale', statut: 'suivi', attente, rappel, tel: '06 00 00 00 0' + id.slice(1), historique: [{ date: '2026-10-01', texte: 'Premier échange' }] });
    state.aVoir.push(c('a1', 'Alice', '', '2026-10-08'), c('a2', 'Bruno', 'moi', '2026-10-09'), c('a3', 'Chloé', '', '2026-10-07'));
    state.dossiers.push({ id: 'dd', entreprise: 'Garage Est', activite: 'cee', statut: 'etude', commEstimee: 1800, dateRelance: '2026-10-09', contact: 'M. Klein', tel: '03 88 11 22 33', historique: [] });
    save(); render();
  });
  const ordre = await p.evaluate(() => fileTournee().map(x => x.type + ':' + x.id));
  verifier('Ordre : celui à qui je dois d\'abord, puis le rappel le plus ancien, puis le dossier', JSON.stringify(ordre) === JSON.stringify(['c:a2', 'c:a3', 'c:a1', 'd:dd']), JSON.stringify(ordre));
  await p.evaluate(() => lancerTournee()); await p.waitForTimeout(150);
  /* Carte 1 (Bruno) : Joint → 1 semaine */
  await p.click('#tournee .opt:has-text("Joint")'); await p.click('#tournee .opt:has-text("Dans 1 semaine")'); await p.waitForTimeout(150);
  /* Carte 2 (Chloé) : Reporter → Demain (samedi → lundi 12) */
  await p.click('#tournee .opt:has-text("Reporter")'); await p.click('#tournee .opt:has-text("Demain")'); await p.waitForTimeout(150);
  const chloe = await p.evaluate(() => aVoir('a3').rappel);
  verifier('Vendredi, « Reporter → Demain » : lundi 12 octobre', chloe === '2026-10-12', chloe);
  /* Carte 3 (Alice) : glisser de 150 px vers la gauche → reporté de 7 jours ouvrés, carte suivante */
  const avantNom = await p.evaluate(() => document.querySelector('.t-nom').textContent);
  const box = await p.locator('#t-carte').boundingBox();
  const y = box.y + box.height / 2, x = box.x + box.width / 2;
  await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= 10; i++) await p.mouse.move(x - i * 15, y); await p.mouse.up();
  await p.waitForTimeout(250);
  const g = await p.evaluate(() => ({ r: aVoir('a1').rappel, attendu: ouvresDans(7), nom: document.querySelector('.t-nom')?.textContent, titre: document.querySelector('#t-titre').textContent }));
  verifier('Glisser à gauche : rappel reporté (7 jours ouvrés), carte suivante affichée', avantNom === 'Alice' && g.r === g.attendu && g.r === '2026-10-20' && g.nom === 'M. Klein' && g.titre === '4/4', JSON.stringify(g));
  /* Carte 4 (dossier) : Pas répondu → dateRelance et journal du dossier */
  await p.click('#tournee .opt:has-text("Pas répondu")'); await p.waitForTimeout(150);
  const d = await p.evaluate(() => ({ r: dossier('dd').dateRelance, attendu: rappelDans(2), h: dossier('dd').historique.map(x => x.texte), t: dossier('dd').tentatives }));
  verifier('Dossier : relance déplacée, une ligne au journal du dossier', d.r === d.attendu && d.h.length === 1 && d.h[0] === 'Relance 1 · pas de réponse' && d.t === 1, JSON.stringify(d));
  const fin = await p.evaluate(() => ({ titre: document.querySelector('#t-titre').textContent, bilan: document.querySelector('#t-bilan')?.textContent }));
  verifier('Écran de fin : « 4 traités en 1 min · 1 joint · 1 sans réponse · 2 reportés »', fin.titre === 'C\'est fait' && fin.bilan === '4 traités en 1 min · 1 joint · 1 sans réponse · 2 reportés', JSON.stringify(fin));
  /* Journal : chaque issue = une ligne */
  const n = await p.evaluate(() => ['a1', 'a2', 'a3'].map(id => aVoir(id).historique.length));
  verifier('Chaque contact traité a exactement une ligne de plus', JSON.stringify(n) === '[2,2,2]', JSON.stringify(n));
  await p.click('#tournee .btn.primary:has-text("Terminer")'); await p.waitForTimeout(300);
  verifier('Terminer : la tournée se ferme, retour à la page', await p.evaluate(() => document.querySelector('#tournee').hidden && !document.querySelector('#main').hasAttribute('inert')));
  /* Reporter depuis la liste Contacts */
  await p.evaluate(() => { aVoir('a2').rappel = today(); save(); location.hash = '#contacts'; }); await p.waitForTimeout(250);
  await p.click('#av-liste li:has-text("Bruno") button:has-text("Reporter")'); await p.waitForTimeout(200);
  await p.click('#modal .opt:has-text("Lundi prochain")'); await p.waitForTimeout(200);
  verifier('Contacts · Reporter → Lundi prochain : 12 octobre', await p.evaluate(() => aVoir('a2').rappel === '2026-10-12' && !$('#modal').open));
  /* Retour arrière pendant une tournée : elle se ferme */
  await p.evaluate(() => { aVoir('a2').rappel = today(); save(); lancerTournee(); }); await p.waitForTimeout(200);
  await p.goBack(); await p.waitForTimeout(300);
  verifier('Geste retour : la tournée se ferme, on reste sur Contacts', await p.evaluate(() => document.querySelector('#tournee').hidden && location.hash === '#contacts'));
  verifier('Pas d\'erreur JS (3)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 4. Ordinateur : la tournée tient dans sa carte, bouton dans l'en-tête de Contacts */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 1366, hauteur: 800, horloge: '2026-10-10T09:00:00', exemple: true, vue: 'contacts' });
  const b = await p.evaluate(() => [...document.querySelectorAll('.page-head button')].map(x => x.textContent.trim()));
  verifier('Contacts : « Lancer la tournée (N) » dans l\'en-tête', b.some(x => /^Lancer la tournée \(\d+\)$/.test(x)), JSON.stringify(b));
  await p.click('.page-head button:has-text("Lancer la tournée")'); await p.waitForTimeout(250);
  const s = await sansDefil(p);
  verifier('1366px : carte sans défilement', s && s.ok, JSON.stringify(s));
  verifier('Pas d\'erreur JS (4)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

bilan();
