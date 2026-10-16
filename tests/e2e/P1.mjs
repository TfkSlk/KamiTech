/* P1 — Planning complet et lisible : rappels de contacts, périodes une fois, aujourd'hui en premier, grille bien placée */
import { ouvrir, verifier, bilan } from './outil.mjs';

const aller = async (p, h) => { await p.evaluate(x => { location.hash = '#' + x; }, h); await p.waitForTimeout(250); };
const vue = async (p, v, date) => { await p.evaluate(([v, date]) => { if (date) planDate = date; setPlanVue(v); }, [v, date]); await p.waitForTimeout(250); };

/* Deux contacts : un rappel aujourd'hui (lundi 12), un autre dans 4 jours (vendredi 16) */
const preparerContacts = p => p.evaluate(() => {
  state.aVoir.push({ id: 'ct-a', createdAt: Date.now(), nom: 'Alice Martin', entreprise: 'Fleurs Martin', activite: 'energie', priorite: 'normale', statut: 'suivi', attente: 'lui', rappel: today(), historique: [{ date: today(), texte: 'Vue au salon' }] });
  state.aVoir.push({ id: 'ct-b', createdAt: Date.now(), nom: 'Bruno Weber', entreprise: '', activite: 'cee', priorite: 'normale', statut: 'suivi', attente: '', rappel: iso(addDays(parse(today()), 4)), historique: [{ date: today(), texte: 'Appel' }] });
  save(); render();
});

/* 1. Rappels de contacts dans les vues Jour, Semaine, Mois, au téléphone et à l'ordinateur */
for (const largeur of [390, 1366]) {
  const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur: largeur > 760 ? 800 : 844, horloge: '2026-10-12T09:00:00', vue: 'planning' });
  await preparerContacts(p);
  await aller(p, 'planning');
  const lire = () => p.evaluate(() => [...document.querySelectorAll('#main .rappel')].filter(e => e.offsetParent !== null).map(e => ({ txt: e.textContent.replace(/\s+/g, ' ').trim().slice(0, 80), contacte: !!e.querySelector('button') && /Fait/.test(e.textContent) })));
  for (const v of ['jour', 'semaine', 'mois']) {
    await vue(p, v, '2026-10-12');
    let r = await lire();
    if (v === 'jour') { await vue(p, 'jour', '2026-10-16'); r = r.concat(await lire()); }
    const alice = r.filter(x => /Alice Martin/.test(x.txt)), bruno = r.filter(x => /Bruno Weber/.test(x.txt));
    /* À l'ordinateur, la vue Jour montre le rappel dans la ligne Journée de la grille ET dans la colonne « À rappeler » (avec Contacté) */
    const attendu = v === 'jour' && largeur > 760 ? 2 : 1;
    verifier(`${largeur}px vue ${v} : Alice (aujourd'hui) et Bruno (dans 4 jours) en .rappel`, alice.length === attendu && bruno.length === attendu, JSON.stringify(r));
    if (v === 'jour' || (v === 'semaine' && largeur < 760)) verifier(`${largeur}px vue ${v} : bouton Contacté sur les rappels`, alice.some(x => x.contacte) && bruno.some(x => x.contacte), JSON.stringify(r));
    else {
      /* Grille ou mois : le rappel ouvre la fiche du contact (son bouton Contacté y est) */
      await vue(p, v, '2026-10-12');
      await p.locator('#main .rappel', { hasText: 'Alice Martin' }).first().click();
      await p.waitForTimeout(250);
      const f = await p.evaluate(() => ({ ouvert: $('#modal').open, txt: document.querySelector('#modal')?.innerText || '' }));
      verifier(`${largeur}px vue ${v} : toucher le rappel ouvre la fiche d'Alice avec Contacté`, f.ouvert && /Alice Martin/.test(f.txt) && /Prise de contact/.test(f.txt), f.txt.slice(0, 160));
      await p.evaluate(() => fermerModal()); await p.waitForTimeout(200);
    }
  }
  /* Un rappel dépassé est rattaché à aujourd'hui */
  await p.evaluate(() => { state.aVoir.find(v => v.id === 'ct-a').rappel = '2026-10-08'; save(); render(); });
  await vue(p, 'jour', '2026-10-12');
  const retard = await p.evaluate(() => [...document.querySelectorAll('#main .rappel')].filter(e => /Alice/.test(e.textContent)).map(e => e.textContent.replace(/\s+/g, ' ')));
  verifier(`${largeur}px : rappel dépassé du 8 affiché aujourd'hui (« Rappel du »)`, retard.length === (largeur > 760 ? 2 : 1) && retard.some(x => /Rappel du 8 oct/.test(x)), JSON.stringify(retard));
  await vue(p, 'jour', '2026-10-08');
  const passe = await p.evaluate(() => [...document.querySelectorAll('#main .rappel')].filter(e => /Alice/.test(e.textContent)).length);
  verifier(`${largeur}px : pas de rappel dans le passé (le 8)`, passe === 0);
  if (largeur < 760) {
    for (const v of ['jour', 'semaine', 'mois']) {
      await vue(p, v, '2026-10-12');
      const larg = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      verifier(`390px vue ${v} : pas de défilement horizontal`, !larg);
    }
  }
  verifier(`${largeur}px : pas d'erreur JS`, erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 2. Mois au téléphone : traits de période, alerte en point rouge, pas de « 102 h 15 » */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge: '2026-10-12T09:00:00', vue: 'planning' });
  await p.evaluate(() => {
    state.events.push({ id: 'p43', date: '2026-10-01', fin: '2026-11-12', titre: 'Campagne CEE', activite: 'cee', mode: 'tache', duree: 0, heure: '', fait: false, notes: '' });
    state.events.push({ id: 'imp', date: '2026-10-14', heure: '10:00', duree: 60, mode: 'place', titre: 'Signature notaire', activite: 'foncier', important: true, fait: false, notes: '' });
    state.events.push({ id: 'long', date: '2026-10-10', heure: '08:00', duree: 135, mode: 'place', titre: 'Formation', activite: 'perso', fait: false, notes: '' });
    state.events.push({ id: 'long2', date: '2026-10-10', heure: '13:00', duree: 480, mode: 'place', titre: 'Salon', activite: 'perso', fait: false, notes: '' });
    save(); render();
  });
  await vue(p, 'mois', '2026-10-12');
  const m = await p.evaluate(() => ({
    traits: [...document.querySelectorAll('.mtrait')].map(e => Math.round(e.getBoundingClientRect().width)),
    alerte: [...document.querySelectorAll('.mchip.alerte')].map(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return { w: r.width, h: r.height, bg: cs.backgroundColor }; }),
    danger: getComputedStyle(document.documentElement).getPropertyValue('--danger').trim(),
    anneau: !!document.querySelector('.mcell.a-alerte'),
    heures: [...document.querySelectorAll('.mcell')].map(c => c.innerText).filter(t => /\d\s*h\b|\d+\s*min/.test(t)),
    charge: [...document.querySelectorAll('.mcharge')].map(e => ({ w: e.style.width, trop: e.classList.contains('trop'), h: e.getBoundingClientRect().height })),
  }));
  verifier('Mois 390px : période de 43 jours en traits de largeur > 0', m.traits.length >= 28 && m.traits.every(w => w > 0), JSON.stringify(m.traits.slice(0, 8)));
  const rouge = await p.evaluate(c => { const d = document.createElement('div'); d.style.color = c; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; }, m.danger);
  verifier('Mois 390px : RDV important = point rouge plein ≥ 10 px', m.alerte.length === 1 && m.alerte[0].w >= 10 && m.alerte[0].h >= 10 && m.alerte[0].bg === rouge, JSON.stringify(m.alerte) + ' ' + rouge);
  verifier('Mois 390px : le jour de l\'alerte a son anneau', m.anneau);
  verifier('Mois 390px : aucune cellule avec une durée en texte', m.heures.length === 0, JSON.stringify(m.heures.slice(0, 3)));
  verifier('Mois 390px : barre de charge (10 h 15 le 10 : rouge, 1 h le 14 : non)', m.charge.length === 2 && m.charge.some(c => c.trop && c.w === '100%') && m.charge.some(c => !c.trop && c.w === '13%') && m.charge.every(c => c.h === 3), JSON.stringify(m.charge));
  /* Semaine au téléphone : une période de 6 semaines n'apparaît qu'une fois, sans case dans les cartes jour */
  await p.evaluate(() => { state.events = state.events.filter(e => e.id !== 'p43'); state.events.push({ id: 'p6', date: '2026-10-05', fin: '2026-11-15', titre: 'Chantier isolation', activite: 'cee', mode: 'tache', duree: 0, heure: '', fait: false, notes: '' }); save(); render(); });
  await vue(p, 'semaine', '2026-10-12');
  const s = await p.evaluate(() => ({
    fois: [...document.querySelectorAll('#main *')].filter(e => e.children.length === 0 && /Chantier isolation/.test(e.textContent)).length,
    dansJours: [...document.querySelectorAll('.day-card')].filter(c => /Chantier isolation/.test(c.textContent)).length,
    carte: document.querySelector('.periodes-card')?.innerText || '',
    caseCarte: !!document.querySelector('.periodes-card input[type=checkbox]'),
  }));
  verifier('Semaine 390px : la période apparaît une seule fois', s.fois === 1, JSON.stringify(s));
  verifier('Semaine 390px : aucune carte jour ne la répète', s.dansJours === 0);
  verifier('Semaine 390px : carte « Périodes » avec dates, « reste N j » et case', /Périodes/.test(s.carte) && /→/.test(s.carte) && /reste 34 j/.test(s.carte) && s.caseCarte, s.carte);
  /* Jours vides repliés sur une ligne de 48 px au plus */
  const libres = await p.evaluate(() => [...document.querySelectorAll('.day-libre')].map(e => ({ h: Math.round(e.getBoundingClientRect().height), t: e.innerText.replace(/\s+/g, ' ') })));
  verifier('Semaine 390px : jours vides en une ligne « … · libre » ≤ 48 px', libres.length >= 3 && libres.every(x => x.h <= 48 && /· libre/.test(x.t)), JSON.stringify(libres));
  /* Filtre en liste déroulante, légende absente au téléphone */
  const tete = await p.evaluate(() => ({ select: !!document.querySelector('.plan-filtre') && document.querySelector('.plan-filtre').offsetParent !== null, puces: [...document.querySelectorAll('.plan-chips .chip')].filter(e => e.offsetParent !== null).length, legende: !!document.querySelector('.legende') }));
  verifier('Téléphone : filtre en liste, puces et légende masquées', tete.select && tete.puces === 0 && !tete.legende, JSON.stringify(tete));
  await p.selectOption('.plan-filtre', 'cee'); await p.waitForTimeout(250);
  const filtre = await p.evaluate(() => ({ f: planFiltre, sel: document.querySelector('.plan-filtre').value, rdv: /Signature notaire/.test(document.querySelector('#main').innerText) }));
  verifier('Téléphone : choisir CEE filtre le planning', filtre.f === 'cee' && filtre.sel === 'cee' && !filtre.rdv, JSON.stringify(filtre));
  verifier('Mois/semaine 390px : pas d\'erreur JS', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 3. Semaine courante au téléphone : en-tête court, aujourd'hui en vue après ouverture */
for (const horloge of ['2026-10-12T09:00:00', '2026-10-17T09:00:00']) {
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge, exemple: true, vue: 'dashboard' });
  await p.evaluate(() => { state.prefs.planVue = 'semaine'; planDate = null; save(); });
  await aller(p, 'planning');
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const c = [...document.querySelectorAll('.day-card')], t = document.querySelector('.day-card.today')?.getBoundingClientRect();
    return { premier: c[0] ? Math.round(c[0].getBoundingClientRect().top + scrollY) : -1, today: t ? { top: Math.round(t.top), bottom: Math.round(t.bottom) } : null, h: innerHeight, nb: c.length };
  });
  verifier(`${horloge.slice(0, 10)} : première carte jour à moins de 300 px du haut de la page`, r.premier >= 0 && r.premier < 300, JSON.stringify(r));
  verifier(`${horloge.slice(0, 10)} : la carte d'aujourd'hui est dans la fenêtre`, r.today && r.today.top >= 0 && r.today.top < r.h - 96, JSON.stringify(r));
  /* Un nouveau rendu (case cochée, enregistrement) ne refait pas défiler */
  await p.evaluate(() => scrollTo(0, 0)); await p.evaluate(() => render()); await p.waitForTimeout(200);
  verifier(`${horloge.slice(0, 10)} : un nouveau rendu ne redéfile pas`, (await p.evaluate(() => scrollY)) === 0);
  verifier(`${horloge.slice(0, 10)} : pas d'erreur JS`, erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 4. Ordinateur : RDV à 6 h 30 visible ; à 16 h 30, la vue Jour s'ouvre sur 15 h ; charge filtrée ; clic sur la grille */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 1366, hauteur: 800, horloge: '2026-10-12T16:30:00', vue: 'planning' });
  await p.evaluate(() => {
    state.events.push({ id: 'tot', date: '2026-10-13', heure: '06:30', duree: 60, mode: 'tel', titre: 'Appel matinal', activite: 'cee', fait: false, notes: '' });
    state.events.push({ id: 'cee2', date: '2026-10-14', heure: '10:00', duree: 90, mode: 'visio', titre: 'Visio CEE', activite: 'cee', fait: false, notes: '' });
    state.events.push({ id: 'en', date: '2026-10-14', heure: '14:00', duree: 120, mode: 'place', titre: 'RDV énergie', activite: 'energie', fait: false, notes: '' });
    state.events.push({ id: 'aj', date: '2026-10-12', heure: '09:00', duree: 60, mode: 'place', titre: 'RDV du matin', activite: 'perso', fait: false, notes: '' });
    state.events.push({ id: 'aj2', date: '2026-10-12', heure: '17:00', duree: 60, mode: 'visio', titre: 'RDV de 17 h', activite: 'perso', fait: false, notes: '' });
    save(); render();
  });
  await vue(p, 'semaine', '2026-10-12');
  const tot = await p.evaluate(() => { const ev = [...document.querySelectorAll('.tev')].find(e => /Appel matinal/.test(e.textContent)); const h = [...document.querySelectorAll('.tg-hours div')].map(d => d.textContent); return { top: ev ? parseFloat(ev.style.top) : null, premiere: h[0] }; });
  verifier('1366px : un RDV à 6 h 30 est dans la grille (qui commence à 6 h)', tot.top !== null && tot.top >= 0 && tot.premiere === '6 h', JSON.stringify(tot));
  /* Charge de la semaine avec le filtre CEE : 2 h 30 */
  await p.evaluate(() => { planFiltre = 'cee'; render(); }); await p.waitForTimeout(200);
  const charge = await p.evaluate(() => document.querySelector('.load-head strong')?.textContent);
  verifier('1366px : avec le filtre CEE, la charge ne compte que les minutes CEE (2 h 30)', charge === '2 h 30 planifiées', charge);
  const legende = await p.evaluate(() => !!document.querySelector('.legende'));
  verifier('1366px : pas de légende sans période dans la vue', !legende);
  await p.evaluate(() => { planFiltre = 'all'; render(); });
  /* Vue Jour à 16 h 30 : la ligne de 15 h en haut (autant que la grille le permet), la ligne de maintenant visible */
  await vue(p, 'jour', '2026-10-12');
  await p.evaluate(() => { grilleCle = ''; render(); }); await p.waitForTimeout(300);
  const j = await p.evaluate(() => {
    const b = document.querySelector('.tg-body'), r = b.getBoundingClientRect();
    const h15 = [...document.querySelectorAll('.tg-hours div')].find(d => d.textContent === '15 h').getBoundingClientRect();
    const now = document.querySelector('.now')?.getBoundingClientRect();
    return { st: b.scrollTop, max: b.scrollHeight - b.clientHeight, attendu: (15 - 7) * 44, h15: Math.round(h15.top - r.top), now: now ? Math.round(now.top - r.top) : null, hauteur: Math.round(r.height), side: document.querySelector('.jour-side')?.innerText || '' };
  });
  verifier('1366px vue Jour à 16 h 30 : la grille défile jusqu\'à 15 h (ou au plus bas)', j.st === Math.min(j.attendu, j.max) && j.h15 >= -8 && j.h15 < j.hauteur, JSON.stringify({ ...j, side: undefined }));
  verifier('1366px vue Jour : la ligne de maintenant est visible', j.now !== null && j.now > 0 && j.now < j.hauteur, JSON.stringify({ now: j.now, h: j.hauteur }));
  verifier('1366px vue Jour : la colonne montre le prochain RDV (17:00), pas la liste répétée', /Prochain RDV/i.test(j.side) && /RDV de 17 h/.test(j.side) && !/RDV du matin/.test(j.side), j.side);
  /* Un rendu suivant garde le défilement de l'utilisateur */
  await p.evaluate(() => { document.querySelector('.tg-body').scrollTop = 20; render(); }); await p.waitForTimeout(200);
  verifier('1366px : un nouveau rendu garde le défilement de la grille', (await p.evaluate(() => document.querySelector('.tg-body').scrollTop)) === 20);
  /* Clic dans la grille : l'heure choisie */
  const clic = await p.evaluate(() => { const c = document.querySelector('.tg-col'); return { top: c.getBoundingClientRect().top }; });
  await p.evaluate(() => { document.querySelector('.tg-body').scrollTop = 0; }); await p.waitForTimeout(100);
  const box = await p.locator('.tg-col').first().boundingBox();
  await p.mouse.click(box.x + box.width / 2, box.y + 44 * 2 + 10);
  await p.waitForTimeout(250);
  const heure = await p.evaluate(() => document.querySelector('#modal [name=heure]')?.value || document.querySelector('#f-heure')?.value);
  verifier('1366px : un clic dans la grille sur la ligne de 9 h propose 09:00', heure === '09:00', String(heure) + ' ' + JSON.stringify(clic));
  await p.evaluate(() => fermerModal());
  verifier('1366px : pas d\'erreur JS', erreurs.length === 0, erreurs.join(' | '));
  /* Passer de 1366 à 390 puis 844 px : la vue se redessine sans rechargement */
  await vue(p, 'semaine', '2026-10-12');
  await p.evaluate(() => { window.__pasRecharge = 1; });
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400);
  const tel = await p.evaluate(() => ({ cartes: document.querySelectorAll('.day-card').length, grille: !!document.querySelector('.tgrid'), marque: window.__pasRecharge }));
  await p.setViewportSize({ width: 844, height: 800 }); await p.waitForTimeout(400);
  const large = await p.evaluate(() => ({ cartes: document.querySelectorAll('.day-card').length, grille: !!document.querySelector('.tgrid'), marque: window.__pasRecharge }));
  verifier('390 → 844 px : cartes jour puis grille, sans rechargement', tel.cartes === 7 && !tel.grille && tel.marque === 1 && large.grille && large.cartes === 0 && large.marque === 1, JSON.stringify({ tel, large }));
  await fermer();
}

/* 5. Vue Jour au téléphone : liste seule, chaque RDV une fois */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge: '2026-10-12T09:00:00', vue: 'planning' });
  await p.evaluate(() => {
    state.events.push({ id: 'a1', date: '2026-10-12', heure: '10:00', duree: 60, mode: 'place', titre: 'Rendez-vous Alpha', activite: 'cee', fait: false, notes: '' });
    state.events.push({ id: 'a2', date: '2026-10-12', heure: '', duree: 30, mode: 'tache', titre: 'Tâche Beta', activite: 'perso', fait: false, notes: '' });
    state.events.push({ id: 'a3', date: '2026-10-10', fin: '2026-10-20', titre: 'Période Gamma', activite: 'energie', mode: 'tache', duree: 0, heure: '', fait: false, notes: '' });
    save(); render();
  });
  await vue(p, 'jour', '2026-10-12');
  const n = await p.evaluate(() => Object.fromEntries(['Rendez-vous Alpha', 'Tâche Beta', 'Période Gamma'].map(t => [t, (document.querySelector('#main').innerText.match(new RegExp(t, 'g')) || []).length])));
  verifier('Jour 390px : chaque RDV, tâche et période une seule fois', Object.values(n).every(x => x === 1), JSON.stringify(n));
  verifier('Jour 390px : pas de grille', !(await p.evaluate(() => !!document.querySelector('.tgrid'))));
  verifier('Jour 390px : pas d\'erreur JS', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

bilan();
