/* R1 — Rituels : « Ta journée » le matin, « Clôturer » le soir, jamais bloquants */
import { ouvrir, verifier, bilan } from './outil.mjs';

const KEY = 'kami-dashboard-v1';
const sansDefil = p => p.evaluate(() => { const b = document.querySelector('.rituel:not([hidden]) .r-body'); return b ? { ok: b.scrollHeight <= b.clientHeight + 1, sh: b.scrollHeight, ch: b.clientHeight } : null; });
const ouvertBrief = p => p.evaluate(() => !document.querySelector('#brief').hidden);

/* 1. Matin : le brief s'ouvre seul ; Passer ×3 ne change que la date du brief ; il ne revient pas le même jour */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge: '2026-10-10T08:00:00', exemple: true });
  await p.evaluate(() => { localStorage.setItem('kgd-rituels', '1'); state.prefs.dernierBrief = '2026-10-09'; save(); location.hash = '#dashboard'; render(); });
  await p.waitForTimeout(300);
  verifier('8 h, retards présents, dernier brief hier : « Ta journée » s\'ouvre', await ouvertBrief(p));
  const avant = await p.evaluate(() => JSON.stringify([state.events, state.dossiers, state.aVoir]));
  const titres = [];
  for (let i = 0; i < 3; i++) { titres.push(await p.evaluate(() => document.querySelector('#b-titre').textContent)); await p.click('#brief .r-annuler'); await p.waitForTimeout(200); }
  const apres = await p.evaluate(() => ({ brief: state.prefs.dernierBrief, ouvert: !document.querySelector('#brief').hidden, donnees: JSON.stringify([state.events, state.dossiers, state.aVoir]) }));
  verifier('Trois écrans : En retard, Aujourd\'hui, Qui rappeler', JSON.stringify(titres) === JSON.stringify(['En retard', 'Aujourd\'hui', 'Qui rappeler']), JSON.stringify(titres));
  verifier('Passer ×3 : brief fermé, dernierBrief = 2026-10-10, rien d\'autre ne change', !apres.ouvert && apres.brief === '2026-10-10' && apres.donnees === avant, JSON.stringify({ ...apres, donnees: apres.donnees === avant }));
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(400);
  verifier('Rechargé le même jour : le brief ne s\'ouvre pas', !(await ouvertBrief(p)));
  /* Rouvrir depuis « Plus » */
  await p.click('#lien-plus'); await p.waitForTimeout(200);
  await p.click('#modal .tuile:has-text("Ta journée")'); await p.waitForTimeout(250);
  verifier('« Plus » → « Ta journée » le rouvre', await ouvertBrief(p));
  await p.click('#brief .btn.icon[aria-label="Fermer"]'); await p.waitForTimeout(300);
  verifier('✕ le ferme', !(await ouvertBrief(p)));
  /* À 15 h ou avec le rituel désactivé : rien ne s'ouvre seul */
  await p.evaluate(() => { state.prefs.dernierBrief = ''; state.prefs.rituelMatin = false; save(); render(); }); await p.waitForTimeout(200);
  verifier('Rituel du matin désactivé : rien ne s\'ouvre', !(await ouvertBrief(p)));
  verifier('Pas d\'erreur JS (1)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 2. Dix retards à 390x844 : aucune étape ne défile ; « Demain » ; « Tout reporter à demain (6) » ; Julien avant Mme Roth */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge: '2026-10-10T08:00:00', exemple: true });
  await p.evaluate(() => {
    state.events = state.events.filter(e => !(e.date < today() && !e.fait));
    state.dossiers.forEach(d => { if (d.dateRelance && d.dateRelance < today()) d.dateRelance = today(); });
    state.aVoir.forEach(v => { if (v.rappel && v.rappel < today()) v.rappel = today(); });
    for (let i = 0; i < 10; i++) state.events.push({ id: 'old' + i, titre: `RDV oublié numéro ${i} avec un intitulé assez long`, date: `2026-10-0${i % 9 + 1}`, heure: '10:00', duree: 30, mode: 'visio', activite: 'cee', lien: '', fait: false, notes: '' });
    state.aVoir.find(v => v.nom === 'Julien').rappel = today();
    save(); ouvrirBrief();
  });
  await p.waitForTimeout(200);
  const defil = [];
  for (let e = 0; e < 3; e++) { await p.evaluate(e => { rituel.etape = e; briefRender(); }, e); const s = await sansDefil(p); if (!s || !s.ok) defil.push({ e, ...s }); }
  verifier('10 retards : aucune des 3 étapes ne défile', defil.length === 0, JSON.stringify(defil));
  const ordre = await p.evaluate(() => [...document.querySelectorAll('#brief .b-item .b-txt b')].map(b => b.textContent));
  verifier('« Qui rappeler » : Julien (je lui dois) avant Mme Roth', ordre.findIndex(x => /Julien/.test(x)) === 0 && ordre.some(x => /Mme Roth/.test(x)), JSON.stringify(ordre));
  await p.evaluate(() => { rituel.etape = 0; briefRender(); });
  const premier = await p.evaluate(() => rituel.retards[0]);
  const bouton = await p.evaluate(() => document.querySelector('#b-tout')?.textContent);
  verifier('« Tout reporter à demain (6) » sous les 4 cartes', bouton === 'Tout reporter à demain (6)' && (await p.evaluate(() => document.querySelectorAll('#brief .b-item').length)) === 4, bouton);
  await p.click('#brief .b-item:first-child button:has-text("Demain")'); await p.waitForTimeout(250);
  const r = await p.evaluate(id => { const e = state.events.find(x => x.id === id); return { date: e.date, attendu: rappelDans(1), reports: e.reports, cartes: document.querySelectorAll('#brief .b-item').length }; }, premier.id);
  verifier('« Demain » : date = rappelDans(1), reports = 1, la carte disparaît', r.date === r.attendu && r.reports === 1 && r.cartes === 3, JSON.stringify(r));
  await p.click('#b-tout'); await p.waitForTimeout(200);
  const t = await p.evaluate(() => { const ids = rituel.retards.slice(4).map(x => x.id); return ids.map(id => { const e = state.events.find(x => x.id === id); return e ? [e.date, e.reports] : null; }); });
  verifier('« Tout reporter » : les 6 restants passent à demain (reports = 1)', t.length === 6 && t.every(x => x && x[0] === '2026-10-12' && x[1] === 1), JSON.stringify(t));
  /* « Fait » sur une carte : RDV coché */
  const id2 = await p.evaluate(() => rituel.retards[1].id);
  await p.click('#brief .b-item:first-child button:has-text("Fait")'); await p.waitForTimeout(250);
  verifier('« Fait » : RDV coché', await p.evaluate(id => state.events.find(x => x.id === id).fait === true, id2));
  /* Planning : badge « reporté ×1 » ; à 3 reports, Abandonner / Garder */
  await p.evaluate(() => { quitterRituel(); }); await p.waitForTimeout(300);
  await p.evaluate(() => { planDate = '2026-10-12'; state.prefs.planVue = 'jour'; location.hash = '#planning'; }); await p.waitForTimeout(300);
  const badges = await p.evaluate(() => [...document.querySelectorAll('.badge-report')].map(b => b.textContent));
  verifier('Planning : badge « reporté ×1 » sur les RDV reportés', badges.length >= 6 && badges.every(b => b === 'reporté ×1'), JSON.stringify(badges));
  await p.evaluate(id => { state.events.find(x => x.id === id).reports = 3; save(); render(); }, premier.id); await p.waitForTimeout(150);
  const act = await p.evaluate(() => [...document.querySelectorAll('.reports-act button')].map(b => b.textContent));
  verifier('À 3 reports : « Abandonner » et « Garder »', JSON.stringify(act) === '["Abandonner","Garder"]', JSON.stringify(act));
  await p.click('.reports-act button:has-text("Garder")'); await p.waitForTimeout(150);
  verifier('« Garder » remet le compteur à 0', await p.evaluate(id => state.events.find(x => x.id === id).reports === 0, premier.id));
  verifier('Pas d\'erreur JS (2)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 3. Soir : « Clôturer la journée » à 19 h (pas à 17 h) ; Fait → Signé ; Pas fait → Demain ; Bonne soirée */
for (const heure of ['17:00', '19:00']) {
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge: `2026-10-10T${heure}:00`, exemple: true });
  await p.evaluate(() => {
    localStorage.setItem('kgd-rituels', '1');
    const garage = state.dossiers.find(d => d.entreprise === 'Garage Central');
    state.events = state.events.filter(e => e.date !== today());
    state.events.push({ id: 'g1', titre: 'RDV Garage Central', date: today(), heure: '09:00', duree: 60, mode: 'place', activite: 'cee', lien: 'd:' + garage.id, fait: false, notes: '' },
      { id: 'g2', titre: 'Visio fournisseur', date: today(), heure: '11:00', duree: 30, mode: 'visio', activite: 'energie', lien: '', fait: false, notes: '' },
      { id: 'g3', titre: 'Point compta', date: today(), heure: '15:00', duree: 45, mode: 'tache', activite: 'perso', lien: '', fait: false, notes: '' });
    state.prefs.dernierBrief = today();
    save(); render();
  });
  await p.waitForTimeout(200);
  const carte = await p.evaluate(() => document.querySelector('#carte-cloture')?.innerText.replace(/\s+/g, ' ') || '');
  if (heure === '17:00') { verifier('17 h : pas de carte « Clôturer »', !carte, carte); await fermer(); continue; }
  verifier('19 h, 3 RDV non cochés : carte « Clôturer la journée »', /Clôturer la journée/.test(carte) && /3 RDV/.test(carte), carte);
  await p.click('#carte-cloture'); await p.waitForTimeout(250);
  verifier('L\'écran de clôture ne défile pas', (await sansDefil(p))?.ok);
  await p.click('#cloture .b-item:has-text("Garage Central") button:has-text("Fait")'); await p.waitForTimeout(150);
  await p.click('#cloture .b-item:has-text("Garage Central") button:has-text("Signé")'); await p.waitForTimeout(150);
  const d = await p.evaluate(() => { const d = state.dossiers.find(x => x.entreprise === 'Garage Central'); return { s: d.statut, sig: d.dateSignature, fait: state.events.find(e => e.id === 'g1').fait }; });
  verifier('Fait puis Signé (Garage Central) : statut signé le 2026-10-10, RDV coché', d.s === 'signe' && d.sig === '2026-10-10' && d.fait, JSON.stringify(d));
  await p.click('#cloture .b-item:has-text("Visio fournisseur") button:has-text("Pas fait")'); await p.waitForTimeout(150);
  await p.click('#cloture .b-item:has-text("Visio fournisseur") button:has-text("Demain")'); await p.waitForTimeout(150);
  const g2 = await p.evaluate(() => { const e = state.events.find(x => x.id === 'g2'); return { date: e.date, reports: e.reports, attendu: rappelDans(1) }; });
  verifier('Pas fait puis Demain : RDV reporté (reports = 1)', g2.date === g2.attendu && g2.reports === 1, JSON.stringify(g2));
  await p.click('#cloture .b-item:has-text("Point compta") button:has-text("Fait")'); await p.waitForTimeout(150);
  const bil = await p.evaluate(() => document.querySelector('#b-bilan').innerText.replace(/\s+/g, ' '));
  verifier('Bilan : 1 h 45 faites, 1 800 € signés', /1 h 45/.test(bil) && /1\s?800\s?€/.test(bil), bil);
  await p.click('#cloture .btn.primary:has-text("Bonne soirée")'); await p.waitForTimeout(300);
  const fin = await p.evaluate(() => ({ ferme: document.querySelector('#cloture').hidden, carte: !!document.querySelector('#carte-cloture'), date: state.prefs.derniereCloture }));
  verifier('« Bonne soirée » : fermé, la carte ne revient pas ce soir', fin.ferme && !fin.carte && fin.date === '2026-10-10', JSON.stringify(fin));
  await p.evaluate(() => { planDate = rappelDans(1); state.prefs.planVue = 'jour'; location.hash = '#planning'; }); await p.waitForTimeout(300);
  verifier('Planning de demain : « reporté ×1 » sur la visio', await p.evaluate(() => [...document.querySelectorAll('#main li')].some(l => /Visio fournisseur/.test(l.textContent) && /reporté ×1/.test(l.textContent))));
  verifier('Pas d\'erreur JS (3)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 4. Réglages : journée pleine et rituel du matin */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 1366, hauteur: 900, vue: 'parametres' });
  await p.fill('#heures-max', '7.5'); await p.dispatchEvent('#heures-max', 'change'); await p.waitForTimeout(150);
  await p.uncheck('#rituel-matin'); await p.waitForTimeout(150);
  verifier('Réglages : journée pleine 7,5 h, rituel du matin désactivé', await p.evaluate(() => state.prefs.heuresMax === 7.5 && state.prefs.rituelMatin === false));
  verifier('Pas d\'erreur JS (4)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

bilan();
