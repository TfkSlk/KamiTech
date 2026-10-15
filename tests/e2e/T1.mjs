/* T1 — En voiture entre deux RDV : appeler en un geste, bandeau « Maintenant / Ensuite », noter l'appel au retour */
import { ouvrir, verifier, bilan } from './outil.mjs';

const aller = async (p, v) => { await p.evaluate(h => { location.hash = '#' + h; }, v); await p.waitForTimeout(200); };
/* Simule le retour dans l'appli après l'appel (l'onglet a été caché puis revient) */
const retourAppli = async p => {
  await p.evaluate(() => {
    let etat = 'hidden';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => etat });
    document.dispatchEvent(new Event('visibilitychange'));
    etat = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(500);
};
/* Un clic sur un lien tel: ne doit pas quitter la page de test : on garde le gestionnaire et on bloque la navigation */
const sansNavigation = p => p.evaluate(() => window.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="tel:"], a[href^="sms:"], a[href^="https://wa.me"]'); if (a) e.preventDefault(); }, true));

/* 1. Numéros : Mme Roth et Garage Central reçoivent un numéro ; leurs lignes portent un lien tel:, les autres non */
for (const largeur of [390, 1366]) {
  const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur: largeur > 760 ? 900 : 844, exemple: true });
  await p.evaluate(() => {
    state.aVoir.forEach(v => { v.tel = ''; });
    state.dossiers.forEach(d => { d.tel = ''; });
    state.aVoir.find(v => v.nom === 'Mme Roth').tel = '06 12 34 56 78';
    state.dossiers.find(d => d.entreprise === 'Garage Central').tel = '03 88 11 22 33';
    save(); render();
  });
  await aller(p, 'contacts');
  const c = await p.evaluate(() => [...document.querySelectorAll('#main li')].filter(li => li.offsetParent !== null && state.aVoir.some(v => v.nom && li.textContent.includes(v.nom)))
    .map(li => ({ roth: /Mme Roth/.test(li.textContent), tel: !!li.querySelector('a[href^="tel:"]'), href: li.querySelector('a[href^="tel:"]')?.getAttribute('href') })));
  const roth = c.filter(x => x.roth), autres = c.filter(x => !x.roth);
  verifier(`${largeur}px #contacts : la ligne de Mme Roth porte « Appeler » (tel:0612345678)`, roth.length > 0 && roth.every(x => x.tel && x.href === 'tel:0612345678'), JSON.stringify(roth));
  verifier(`${largeur}px #contacts : les lignes sans numéro n'en ont pas (${autres.length})`, autres.length > 0 && autres.every(x => !x.tel), JSON.stringify(autres));
  await aller(p, 'dossiers');
  const d = await p.evaluate(() => [...document.querySelectorAll('#main tr')].filter(tr => tr.querySelector('td'))
    .map(tr => ({ garage: /Garage Central/.test(tr.textContent), tel: !!tr.querySelector('a[href^="tel:"]') })));
  verifier(`${largeur}px #dossiers : Garage Central porte « Appeler », pas les autres`, d.some(x => x.garage && x.tel) && d.filter(x => !x.garage).every(x => !x.tel), JSON.stringify(d));
  await aller(p, 'dashboard');
  const acc = await p.evaluate(() => [...document.querySelectorAll('#main li')].filter(li => /Mme Roth/.test(li.textContent)).map(li => !!li.querySelector('a[href^="tel:"]')));
  verifier(`${largeur}px accueil : Mme Roth appelable depuis l'accueil`, acc.length > 0 && acc.every(Boolean), JSON.stringify(acc));
  if (largeur === 390) {
    await aller(p, 'contacts');
    const t = await p.evaluate(() => [...document.querySelectorAll('.act-tel .tel-btn')].filter(b => b.offsetParent !== null).map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    verifier('390px : chaque bouton d\'appel visible fait au moins 44x44', t.length > 0 && t.every(([w, h]) => w >= 44 && h >= 44), JSON.stringify(t));
    const deborde = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    verifier('390px : pas de défilement horizontal', !deborde);
  }
  verifier(`${largeur}px : pas d'erreur JS`, erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 2. Lien WhatsApp et numéros */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844 });
  const r = await p.evaluate(() => ({
    wa: waLien('06 12 34 56 78', 'Bonjour'),
    wa2: waLien('+33 6 12 34 56 78'),
    wa3: waLien('0033612345678', 'Ça va ?'),
    vide: actionsTel({ id: 'x', nom: 'Sans', tel: '' }),
    maps: itineraire('Mundolsheim'),
  }));
  verifier('waLien(« 06 12 34 56 78 », « Bonjour ») = https://wa.me/33612345678?text=Bonjour', r.wa === 'https://wa.me/33612345678?text=Bonjour', r.wa);
  verifier('waLien(+33 …) sans texte', r.wa2 === 'https://wa.me/33612345678', r.wa2);
  verifier('waLien(0033 …) encode le texte', r.wa3 === 'https://wa.me/33612345678?text=%C3%87a%20va%20%3F', r.wa3);
  verifier('Sans numéro : aucun bouton', r.vide === '');
  verifier('Itinéraire Google Maps', r.maps === 'https://www.google.com/maps/dir/?api=1&destination=Mundolsheim', r.maps);
  verifier('pas d\'erreur JS', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 3. Bandeau « Maintenant / Ensuite » à 14:35 : RDV 14:00–15:00 puis visio à 15:05 */
for (const largeur of [390, 1366]) {
  const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur: largeur > 760 ? 900 : 844, horloge: '2026-10-10T14:35:00', exemple: true });
  await p.evaluate(() => {
    const t = today();
    state.events = state.events.filter(e => e.date !== t);
    state.events.push({ id: 'ev-a', date: t, heure: '14:00', duree: 60, mode: 'place', titre: 'RDV Boulangerie Kehl', activite: 'kamifood', lien: '', lieu: 'Schiltigheim', fait: false, notes: '' });
    state.events.push({ id: 'ev-b', date: t, heure: '15:05', duree: 30, mode: 'visio', titre: 'Visio Karim', activite: 'kamifood', lien: '', fait: false, notes: 'Lien : https://meet.google.com/abc puis point budget' });
    save(); render();
  });
  const m = await p.evaluate(() => { const b = document.querySelector('#maintenant'); const r = b?.getBoundingClientRect(); return b && { txt: b.innerText, rouge: b.classList.contains('rouge'), cache: b.hidden, h: r.height, visio: b.querySelector('a[href="https://meet.google.com/abc"]')?.textContent?.trim(), haut: r.top }; });
  verifier(`${largeur}px : bandeau visible sur l'accueil`, m && !m.cache, JSON.stringify(m));
  verifier(`${largeur}px : « reste 25 min »`, m && /reste 25 min/.test(m.txt), m && m.txt);
  verifier(`${largeur}px : « Ensuite : 15:05 »`, m && /Ensuite : 15:05/.test(m.txt), m && m.txt);
  verifier(`${largeur}px : bandeau rouge (5 min entre les deux)`, m && m.rouge);
  verifier(`${largeur}px : « Ouvrir la visio » mène à https://meet.google.com/abc`, m && m.visio === 'Ouvrir la visio', JSON.stringify(m));
  if (largeur === 390) {
    verifier('390px : bandeau ≤ 64 px de haut', m && m.h <= 64.5, String(m && m.h));
    const noter = await p.evaluate(() => document.querySelector('.noter-bar, #noter-bar, [data-noter]')?.getBoundingClientRect().top ?? -1);
    verifier('390px : le bouton Noter reste en haut (≤ 200 px)', noter >= 0 && noter <= 200, String(noter));
    await aller(p, 'planning');
    const pl = await p.evaluate(() => { const b = document.querySelector('#maintenant'); return b && !b.hidden ? b.getBoundingClientRect().height : -1; });
    verifier('390px : bandeau aussi en tête du planning (≤ 64 px)', pl > 0 && pl <= 64.5, String(pl));
    await aller(p, 'dashboard');
  }
  /* Une minute plus tard : rafraîchi tout seul */
  await p.clock.fastForward(61000); await p.waitForTimeout(200);
  const m2 = await p.evaluate(() => document.querySelector('#maintenant')?.innerText || '');
  verifier(`${largeur}px : une minute plus tard, « reste 24 min »`, /reste 24 min/.test(m2), m2);
  /* Sur place ensuite avec un lieu : Itinéraire + Waze */
  await p.evaluate(() => { const e = state.events.find(x => x.id === 'ev-b'); e.mode = 'place'; e.lieu = 'Mundolsheim'; save(); render(); });
  const it = await p.evaluate(() => [...document.querySelectorAll('#maintenant a')].map(a => [a.textContent.trim(), a.getAttribute('href')]));
  verifier(`${largeur}px : RDV sur place ensuite → Itinéraire et Waze`, it.some(([t, h]) => t === 'Itinéraire' && h.includes('destination=Mundolsheim')) && it.some(([t, h]) => t === 'Waze' && h.startsWith('https://waze.com/ul?q=Mundolsheim')), JSON.stringify(it));
  /* Rien aujourd'hui : bandeau absent */
  await p.evaluate(() => { const t = today(); state.events = state.events.filter(e => e.date !== t); save(); render(); });
  const vide = await p.evaluate(() => { const b = document.querySelector('#maintenant'); return !b || b.hidden || b.offsetHeight === 0; });
  verifier(`${largeur}px : sans RDV restant aujourd'hui, pas de bandeau`, vide);
  verifier(`${largeur}px : pas d'erreur JS`, erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 3 bis. Marge confortable : pas de rouge */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge: '2026-10-10T14:35:00' });
  await p.evaluate(() => {
    const t = today();
    state.events.push({ id: 'ev-c', date: t, heure: '14:00', duree: 30, mode: 'tel', titre: 'Point tél', activite: 'perso', lien: '', fait: false, notes: '' });
    state.events.push({ id: 'ev-d', date: t, heure: '16:00', duree: 30, mode: 'tel', titre: 'Appel fournisseur', activite: 'perso', lien: '', fait: false, notes: '' });
    save(); render();
  });
  const m = await p.evaluate(() => { const b = document.querySelector('#maintenant'); return b && { txt: b.innerText, rouge: b.classList.contains('rouge') }; });
  verifier('Prochain RDV dans 1 h 25 : pas de rouge, pas de « Maintenant »', m && !m.rouge && !/Maintenant/.test(m.txt) && /dans 1 h 25/.test(m.txt), JSON.stringify(m));
  verifier('pas d\'erreur JS', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 4. Appeler puis revenir : la mini-feuille propose de noter ; « Pas répondu » → tentative 1, rappel dans 2 jours ouvrés, journal +1 */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, exemple: true });
  await p.evaluate(() => { const v = state.aVoir.find(x => x.nom === 'Mme Roth'); v.tel = '06 12 34 56 78'; save(); render(); });
  await sansNavigation(p);
  await aller(p, 'contacts');
  const avant = await p.evaluate(() => { const v = state.aVoir.find(x => x.nom === 'Mme Roth'); return { n: (v.historique || []).length, t: v.tentatives || 0 }; });
  await p.click('#main li:has-text("Mme Roth") a[href^="tel:"]');
  await p.waitForTimeout(100);
  await retourAppli(p);
  const f = await p.evaluate(() => ({ ouvert: $('#modal').open, titre: document.querySelector('#modal h2, #modal .sheet-title, #modal header')?.textContent?.trim(), opts: [...document.querySelectorAll('#modal .opt b')].map(b => b.textContent.trim()), defile: (() => { const b = document.querySelector('#modal .sheet-body'); return b ? b.scrollHeight > b.clientHeight + 1 : false; })() }));
  verifier('Retour après l\'appel : la feuille « Appel avec Mme Roth » s\'ouvre', f.ouvert && /Appel avec Mme Roth/.test(f.titre || ''), JSON.stringify(f));
  verifier('Quatre réponses : Joint, Pas répondu, Messagerie, Rien à noter', JSON.stringify(f.opts) === JSON.stringify(['Joint', 'Pas répondu', 'Messagerie', 'Rien à noter']), JSON.stringify(f.opts));
  verifier('Feuille sans défilement', !f.defile);
  await p.click('#modal .opt:has-text("Pas répondu")');
  await p.waitForTimeout(300);
  const apres = await p.evaluate(() => { const v = state.aVoir.find(x => x.nom === 'Mme Roth'); return { n: (v.historique || []).length, t: v.tentatives, rappel: v.rappel, attendu: rappelDans(2), der: v.historique[v.historique.length - 1].texte, ouvert: $('#modal').open, toast: document.querySelector('#toast')?.textContent || '' }; });
  verifier('« Pas répondu » : tentatives 1', apres.t === avant.t + 1 && apres.t === 1, JSON.stringify(apres));
  verifier('« Pas répondu » : rappel = rappelDans(2)', apres.rappel === apres.attendu, JSON.stringify(apres));
  verifier('« Pas répondu » : journal +1 « Appel · pas de réponse (tentative 1) »', apres.n === avant.n + 1 && apres.der === 'Appel · pas de réponse (tentative 1)', JSON.stringify(apres));
  verifier('Feuille refermée et toast de confirmation', !apres.ouvert && /pas de réponse/.test(apres.toast), JSON.stringify(apres));
  /* Un second retour ne repose pas la question */
  await retourAppli(p);
  verifier('Second retour : plus de question', !(await p.evaluate(() => $('#modal').open)));
  /* Messagerie à la deuxième tentative */
  await p.click('#main li:has-text("Mme Roth") a[href^="tel:"]');
  await retourAppli(p);
  await p.click('#modal .opt:has-text("Messagerie")');
  await p.waitForTimeout(300);
  const m = await p.evaluate(() => { const v = state.aVoir.find(x => x.nom === 'Mme Roth'); return { t: v.tentatives, der: v.historique[v.historique.length - 1].texte }; });
  verifier('« Messagerie » : tentative 2, « message laissé »', m.t === 2 && m.der === 'Appel · message laissé (tentative 2)', JSON.stringify(m));
  /* Joint : la fiche s'ouvre sur la note */
  await p.click('#main li:has-text("Mme Roth") a[href^="tel:"]');
  await retourAppli(p);
  await p.click('#modal .opt:has-text("Joint")');
  await p.waitForTimeout(500);
  const j = await p.evaluate(() => { const r = document.querySelector('#rencontre'); return { ouvert: !!r && !r.hidden, feuille: $('#modal').open, nom: r?.querySelector('input[name="nom"], #r-nom, #nom')?.value || r?.innerText.slice(0, 120), actif: document.activeElement?.tagName }; });
  verifier('« Joint » : l\'écran Noter s\'ouvre sur Mme Roth, la note prête', j.ouvert && !j.feuille && /Roth/.test(j.nom || '') && j.actif === 'TEXTAREA', JSON.stringify(j));
  /* Appel vieux de plus de 30 min : oublié */
  await p.evaluate(() => { if ($('#modal').open) $('#modal').close(); if (!$('#rencontre').hidden) history.back(); sessionStorage.setItem('kgd-appel', JSON.stringify({ ref: 'c:x', nom: 'Vieux', canal: 'appel', t: Date.now() - 31 * 60e3 })); });
  await p.waitForTimeout(400);
  await retourAppli(p);
  verifier('Appel de plus de 30 min : pas de question', !(await p.evaluate(() => $('#modal').open)));
  verifier('pas d\'erreur JS', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 5. Dossier (Apport) : « Pas répondu » déplace la relance de 2 jours ouvrés */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 1366, hauteur: 900, exemple: true });
  await p.evaluate(() => { const d = state.dossiers.find(x => x.entreprise === 'Garage Central'); d.tel = '03 88 11 22 33'; save(); render(); });
  await sansNavigation(p);
  await aller(p, 'dossiers');
  await p.click('#main tr:has-text("Garage Central") a[href^="tel:"]');
  await retourAppli(p);
  const opts = await p.evaluate(() => [...document.querySelectorAll('#modal .opt b')].map(b => b.textContent.trim()));
  verifier('Dossier : la feuille propose Pas répondu', opts.includes('Pas répondu'), JSON.stringify(opts));
  await p.click('#modal .opt:has-text("Pas répondu")');
  await p.waitForTimeout(300);
  const d = await p.evaluate(() => { const x = state.dossiers.find(y => y.entreprise === 'Garage Central'); return { r: x.dateRelance, attendu: rappelDans(2) }; });
  verifier('Dossier : relance = rappelDans(2)', d.r === d.attendu, JSON.stringify(d));
  verifier('pas d\'erreur JS', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

bilan();
