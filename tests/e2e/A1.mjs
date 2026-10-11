/* A1 — Accueil du matin : « à faire d'abord », alertes comptées en jours, rouge réservé à l'urgent, toujours à jour.
   Horloge figée au samedi 2026-10-10 (Paris). Téléphone (390x844, tactile) et ordinateur (1366x800).
   Captures : CAPTURES=<dossier> node tests/e2e/A1.mjs */
import { ouvrir, verifier, bilan, RACINE } from './outil.mjs';
import path from 'node:path';
import fs from 'node:fs';

const CAPTURES = process.env.CAPTURES || '';
const capture = async (p, nom) => { if (CAPTURES) await p.screenshot({ path: path.join(CAPTURES, nom + '.png') }); };
const pause = (p, ms = 120) => p.waitForTimeout(ms);
const sansScrollHorizontal = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const boite = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 }; }, sel);
const fermerFiche = async p => { await p.evaluate(() => { if (document.querySelector('#modal').open) document.querySelector('#modal').close(); }); await pause(p, 150); };
const accueil = async p => { await p.evaluate(() => { location.hash = '#dashboard'; render(); }); await pause(p); };
/* « Signature requise le jour de l'annonce des prix », dans 5 jours */
const IMPORTANT = { id: 'imp15', titre: 'Signature énergie · annonce des prix', date: '2026-10-15', heure: '', duree: 30, mode: 'tache', activite: 'energie', lien: '', fait: false, notes: '', important: true };

for (const [largeur, hauteur] of [[390, 844], [1366, 800]]) {
  const ecran = `${largeur}px`;
  const tel = largeur <= 760;

  /* ---------- 1 et 3. Exemple : l'ordre de l'accueil, la barre Noter, « Aujourd'hui » haut placé ; puis un RDV important le 15 ---------- */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, exemple: true });
    await p.evaluate(() => document.querySelector('#toast').classList.remove('show'));
    const jour = await boite(p, '.jour-card');
    if (!tel) verifier(`${ecran} 3. avec l'exemple : la carte « Aujourd'hui » a un top < 500 px (${jour && jour.top})`, jour && jour.visible && jour.top < 500, JSON.stringify(jour));
    else verifier(`${ecran} avec l'exemple : « Aujourd'hui » visible dans le premier écran (top ${jour && jour.top} < 844)`, jour && jour.top < 844, JSON.stringify(jour));
    verifier(`${ecran} sans alerte (exemple seul) : pas de bandeau Alertes`, await p.evaluate(() => !document.querySelector('.alertes') && alertes().length === 0));

    await p.evaluate(e => { state.events.push(e); save(); render(); }, IMPORTANT); await pause(p);
    const a = await p.evaluate(() => {
      const c = document.querySelector('.alertes'), r = c && c.getBoundingClientRect(), n = document.querySelector('.noter-bar').getBoundingClientRect();
      return { top: r ? Math.round(r.top) : null, comptes: c ? [...c.querySelectorAll('.compte')].map(x => x.textContent.trim()) : [], titre: c?.querySelector('.a-titre')?.textContent, noter: Math.round(n.top) };
    });
    verifier(`${ecran} 1. bandeau Alertes : « J-5 » pour le RDV important du 15${tel ? `, top ${a.top} < 450` : ''}`, a.comptes[0] === 'J-5' && a.titre === 'Signature énergie · annonce des prix' && (!tel || a.top < 450), JSON.stringify(a));
    verifier(`${ecran} 1. barre « Noter quelqu'un… » : top ${a.noter} <= 200`, a.noter <= 200, String(a.noter));
    await capture(p, `a1-accueil-${largeur}`);

    /* Ordre identique au téléphone et à l'ordinateur, sans règle order */
    const ordre = await p.evaluate(() => {
      const sels = ['.page-head', '.noter-bar', '.notice.mini', '.alertes', '.agenda-row', '.rang-tete', '.kpis', '.charts-row', '.sept-jours', '.sect-row'];
      const tops = sels.map(s => { const e = document.querySelector('#main > ' + s); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; });
      const orders = [...document.querySelectorAll('#main > *')].map(e => getComputedStyle(e).order);
      const cols = getComputedStyle(document.querySelector('.agenda-row')).gridTemplateColumns.split(' ').length;
      const aujPremier = document.querySelector('.agenda-row > .card h2')?.textContent;
      return { tops, croissant: tops.every((t, i) => t !== null && (i === 0 || t > tops[i - 1])), orders: [...new Set(orders)], cols, aujPremier, rappel: document.querySelector('.agenda-row > .card + .card h2')?.textContent };
    });
    verifier(`${ecran} 1. ordre : en-tête, Noter, exemple, Alertes, Aujourd'hui/À rappeler, chiffres, graphiques, 7 prochains jours, secteurs`, ordre.croissant && ordre.aujPremier === 'Aujourd\'hui' && ordre.rappel === 'À rappeler', JSON.stringify(ordre.tops));
    verifier(`${ecran} 1. aucune règle order dans #main (ordre du DOM = ordre affiché)`, JSON.stringify(ordre.orders) === '["0"]', JSON.stringify(ordre.orders));
    verifier(`${ecran} 1. « Aujourd'hui » et « À rappeler » ${tel ? 'l\'un sous l\'autre' : 'côte à côte (.grid.cols-2)'}`, ordre.cols === (tel ? 1 : 2), String(ordre.cols));
    const css = fs.readFileSync(path.join(RACINE, 'style.css'), 'utf8');
    verifier(`${ecran} 1. style.css : plus de règles order pour .page-head, .notice, .agenda-row, .noter-bar`, !/\.(page-head|notice|agenda-row|noter-bar|alerte-donnees|vide-kf)\s*\{\s*order/.test(css));

    /* En-tête : aucun bouton au téléphone ; « + Ajouter ▾ » (RDV, dossier, abonné) à l'ordinateur */
    const tete = await p.evaluate(() => ({ boutons: [...document.querySelectorAll('.page-head button')].filter(b => b.getBoundingClientRect().width > 0).map(b => b.textContent.replace(/\s+/g, ' ').trim()) }));
    if (tel) verifier(`${ecran} 1. en-tête sans bouton au téléphone`, tete.boutons.length === 0, JSON.stringify(tete));
    else {
      verifier(`${ecran} 1. en-tête : « + Ajouter ▾ »`, JSON.stringify(tete.boutons) === '["+ Ajouter ▾"]', JSON.stringify(tete));
      await p.click('#btn-ajout'); await pause(p);
      const m = await p.evaluate(() => ({ ouvert: !document.querySelector('#menu-ajout').hidden, items: [...document.querySelectorAll('#menu-ajout [role=menuitem]')].map(b => b.textContent.trim()), aria: document.querySelector('#btn-ajout').getAttribute('aria-expanded') }));
      verifier(`${ecran} 1. menu Ajouter : Nouveau RDV, Nouveau dossier, Nouvel abonné`, m.ouvert && m.aria === 'true' && JSON.stringify(m.items) === '["Nouveau RDV","Nouveau dossier","Nouvel abonné"]', JSON.stringify(m));
      await capture(p, `a1-menu-ajouter-${largeur}`);
      await p.keyboard.press('Escape'); await pause(p, 60);
      const ferme = await p.evaluate(() => document.querySelector('#menu-ajout').hidden && document.activeElement?.id === 'btn-ajout');
      await p.click('#btn-ajout'); await pause(p, 60);
      await p.click('#menu-ajout [role=menuitem]:has-text("Nouveau RDV")'); await pause(p, 200);
      const rdv = await p.evaluate(() => ({ open: document.querySelector('#modal').open, h2: document.querySelector('#modal h2')?.textContent, menu: document.querySelector('#menu-ajout')?.hidden }));
      verifier(`${ecran} 1. Échap ferme le menu ; « Nouveau RDV » ouvre la fiche RDV`, ferme && rdv.open && /Nouveau RDV/.test(rdv.h2), JSON.stringify(rdv));
      await fermerFiche(p);
    }

    /* Toucher une alerte ouvre le RDV */
    await accueil(p);
    await p.click('.alertes .alerte-ligne button'); await pause(p, 200);
    const fiche = await p.evaluate(() => ({ open: document.querySelector('#modal').open, titre: document.querySelector('#f-titre')?.value }));
    verifier(`${ecran} 2. toucher l'alerte ouvre la fiche du RDV`, fiche.open && fiche.titre === 'Signature énergie · annonce des prix', JSON.stringify(fiche));
    await fermerFiche(p);

    /* 8. Chiffres : « À rappeler : N » cliquable, période dans l'en-tête de la rangée, KGD Pro masqué à 0, « — » sans encaissement */
    await accueil(p);
    const k = await p.evaluate(() => {
      const labels = [...document.querySelectorAll('.kpis .kpi .label')].map(l => l.textContent.trim());
      const lien = document.querySelector('.kpis a.kpi-lien');
      const secteurs = [...document.querySelectorAll('.act-card .title span:first-child')].map(s => s.textContent.trim());
      const cee = [...document.querySelectorAll('.act-card')].find(c => c.querySelector('.title span').textContent === 'CEE');
      const dl = cee ? Object.fromEntries([...cee.querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent])) : {};
      return { labels, lien: lien && { href: lien.getAttribute('href'), label: lien.querySelector('.label').textContent, value: lien.querySelector('.value').textContent }, n: rappelsContacts().length,
        switchTete: !!document.querySelector('.rang-tete .seg'), switchGraph: !!document.querySelector('.charts-row .seg'), secteurs, ceeParHeure: dl['€ / heure'], ceePlanifie: dl['Planifié'], parHeure0: parHeure(0, 120), parHeure1: parHeure(600, 60).replace(/\s/g, ' ') };
    });
    verifier(`${ecran} 8. les KPI ne contiennent plus « Planifié · semaine »`, !k.labels.some(l => /Planifié/i.test(l)) && k.labels.length === 4, JSON.stringify(k.labels));
    verifier(`${ecran} 8. KPI « À rappeler : ${k.n} » cliquable vers #contacts`, k.lien && k.lien.href === '#contacts' && k.lien.label === 'À rappeler' && k.lien.value === String(k.n) && k.n === 1, JSON.stringify(k.lien));
    verifier(`${ecran} 8. le choix de période est dans l'en-tête de la rangée des chiffres (plus dans « Gains par secteur »)`, k.switchTete && !k.switchGraph);
    verifier(`${ecran} 8. la carte KGD Pro est absente quand elle est à 0`, !k.secteurs.includes('KGD Pro') && k.secteurs.length === 4, JSON.stringify(k.secteurs));
    verifier(`${ecran} 8. parHeure affiche « — » quand rien n'est encaissé (CEE : 0 € pour ${k.ceePlanifie})`, k.ceeParHeure === '—' && k.parHeure0 === '—' && k.parHeure1 === '600 €', JSON.stringify(k));
    await p.click('.kpis a.kpi-lien'); await pause(p);
    verifier(`${ecran} 8. toucher « À rappeler » ouvre #contacts`, await p.evaluate(() => location.hash === '#contacts' && document.querySelector('#main h1').textContent === 'Contacts'));
    await accueil(p);
    await p.click('.rang-tete .seg button:has-text("Cette année")'); await pause(p);
    const annee = await p.evaluate(() => ({ periode: state.prefs.periode, label: document.querySelector('.kpis .kpi .label').textContent }));
    verifier(`${ecran} 8. « Cette année » depuis l'en-tête de la rangée : KPI « Gagné · cette année »`, annee.periode === 'annee' && annee.label === 'Gagné · cette année', JSON.stringify(annee));
    await p.click('.rang-tete .seg button:has-text("Ce mois")'); await pause(p);
    await p.evaluate(() => { state.events.push({ id: 'kgd1', titre: 'Démo KGD Pro', date: '2026-10-12', heure: '14:00', duree: 60, mode: 'visio', activite: 'kgdpro', lien: '', fait: false, notes: '' }); save(); render(); }); await pause(p);
    const kgd = await p.evaluate(() => [...document.querySelectorAll('.act-card .title span:first-child')].map(s => s.textContent.trim()));
    verifier(`${ecran} 8. la carte KGD Pro revient dès qu'elle a du temps planifié`, kgd.includes('KGD Pro'), JSON.stringify(kgd));
    await p.evaluate(() => { state.events = state.events.filter(e => e.id !== 'kgd1'); save(); render(); });

    /* Phrase résumé : retards, RDV du jour, contacts à rappeler, gains ; plus de .replace inutile */
    const phrase = await p.evaluate(() => document.querySelector('.page-head p').textContent.replace(/\s+/g, ' ').trim());
    const pos = ['en retard', 'RDV aujourd\'hui', 'à rappeler', 'gagnés'].map(x => phrase.indexOf(x));
    verifier(`${ecran} 8. phrase résumé dans l'ordre : retards, RDV du jour, contacts, gains`, pos.every((x, i) => x > 0 && (i === 0 || x > pos[i - 1])) && /^Samedi 10 octobre · 1 en retard · 3 RDV aujourd'hui \(2 h 15\) · 1 contact à rappeler · .+ gagnés ce mois$/.test(phrase), phrase);
    verifier(`${ecran} 8. views.js : le .replace inutile de la phrase résumé est retiré`, !fs.readFileSync(path.join(RACINE, 'views.js'), 'utf8').includes(".replace('cette ', 'cette ')"));

    /* Exemple : une ligne .notice.mini « Données d'exemple affichées · Retirer » */
    const mini = await p.evaluate(() => { const n = document.querySelector('.notice.mini'); return n && { txt: n.textContent.replace(/\s+/g, ' ').trim(), h: n.getBoundingClientRect().height, carte: !!document.querySelector('.card.notice') }; });
    verifier(`${ecran} 5. notice d'exemple : une ligne « Données d'exemple affichées · Retirer »`, mini && mini.txt === 'Données d\'exemple affichées · Retirer' && mini.h <= 40 && !mini.carte, JSON.stringify(mini));
    await p.click('.notice.mini button'); await pause(p);
    await p.evaluate(() => document.querySelector('#confirm-ok')?.click()); await pause(p, 200);
    verifier(`${ecran} 5. « Retirer » retire l'exemple (le RDV important ajouté reste)`, await p.evaluate(() => !aDemo() && state.events.some(e => e.id === 'imp15') && !document.querySelector('.notice.mini')));

    verifier(`${ecran} accueil sans défilement horizontal`, await sansScrollHorizontal(p));
    verifier(`${ecran} 1. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* ---------- 2. Alertes : règles, niveaux, tri, 3 lignes puis « +N autres » ---------- */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur });
    const r = await p.evaluate(() => {
      const ev = (id, date, extra = {}) => ({ id, titre: 'Alerte ' + id, date, heure: '', duree: 30, mode: 'tache', activite: 'energie', lien: '', fait: false, notes: '', ...extra });
      state.events.push(
        ev('jour', '2026-10-10', { important: true, heure: '18:00' }), ev('demain', '2026-10-11', { important: true }), ev('j2', '2026-10-12', { important: true }),
        ev('j30', '2026-11-09', { important: true }), ev('j31', '2026-11-10', { important: true }), ev('fait', '2026-10-13', { important: true, fait: true }), ev('hier', '2026-10-09', { important: true }),
        ev('cale', '2026-10-05', { fin: '2026-10-15', aPrevoir: true, duree: 0, lien: 'c:x', titre: 'Voir Karim' }),
        ev('loin', '2026-10-05', { fin: '2026-10-20', aPrevoir: true, duree: 0, lien: 'c:y' }),
        ev('enCours', '2026-10-08', { fin: '2026-10-14', important: true, duree: 0 }),
      );
      save(); render();
      const a1 = alertes();
      const html1 = { lignes: document.querySelectorAll('.alertes .alerte-ligne').length, plus: document.querySelector('.alertes .plus-autres')?.textContent.trim() };
      return { a1: a1.map(a => `${a.id}:${a.compte}:${a.niveau}`), dates: a1.map(a => a.date), sousCale: a1.find(a => a.id === 'cale')?.sous, sousEnCours: a1.find(a => a.id === 'enCours')?.sous, html1 };
    });
    verifier(`${ecran} 2. alertes() : importants non faits de J à J+30 (pas J+31, pas fait, pas hier), période à prévoir ≤ 7 j sans créneau`,
      JSON.stringify(r.a1) === JSON.stringify(['jour:Aujourd\'hui:fort', 'demain:Demain:fort', 'j2:J-2:clair', 'enCours:J-4:clair', 'cale:J-5:clair', 'j30:J-30:clair']), JSON.stringify(r.a1));
    verifier(`${ecran} 2. alertes() triées par date`, r.dates.every((d, i) => !i || d >= r.dates[i - 1]), JSON.stringify(r.dates));
    verifier(`${ecran} 2. période à prévoir : « Créneau toujours pas calé, il reste 5 j » ; période importante en cours : jusqu'à sa fin`, r.sousCale === 'Créneau toujours pas calé, il reste 5 j' && /^En cours jusqu'au mercredi 14 oct\./.test(r.sousEnCours || ''), JSON.stringify([r.sousCale, r.sousEnCours]));
    verifier(`${ecran} 2. bandeau : 3 lignes au plus, puis « +3 autres »`, r.html1.lignes === 3 && r.html1.plus === '+3 autres', JSON.stringify(r.html1));
    const pills = await p.$$eval('.alertes .alerte-ligne', ls => ls.map(l => ({ c: l.className, fond: getComputedStyle(l.querySelector('.compte')).backgroundColor })));
    const accent = await p.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--accent)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; });
    verifier(`${ecran} 2. niveau fort (J-1 ou moins) en rouge plein, clair en argent`, pills[0].c.includes('fort') && pills[0].fond === accent && pills[2].c.includes('clair') && pills[2].fond !== accent, JSON.stringify(pills));
    await capture(p, `a1-alertes-${largeur}`);
    await p.click('.alertes .plus-autres'); await pause(p);
    const deplie = await p.evaluate(() => ({ lignes: document.querySelectorAll('.alertes .alerte-ligne').length, plus: document.querySelector('.alertes .plus-autres')?.textContent.trim() }));
    verifier(`${ecran} 2. « +3 autres » déplie la liste dans la carte (6 lignes, « Réduire »)`, deplie.lignes === 6 && deplie.plus === 'Réduire', JSON.stringify(deplie));
    await p.click('.alertes .plus-autres'); await pause(p);
    /* Un RDV calé avec le même client dans la période : l'alerte « pas calé » disparaît ; plus rien : bandeau masqué */
    const r2 = await p.evaluate(() => {
      state.events.push({ id: 'rdvx', titre: 'RDV Karim', date: '2026-10-13', heure: '10:00', duree: 30, mode: 'place', activite: 'cee', lien: 'c:x', fait: false, notes: '' });
      const sans = alertes().map(a => a.id);
      state.events = state.events.filter(e => !/^(jour|demain|j2|j30|enCours)$/.test(e.id)); save(); render();
      return { sans, reste: alertes().length, bandeau: !!document.querySelector('.alertes'), lignes: document.querySelectorAll('.alertes .alerte-ligne').length };
    });
    verifier(`${ecran} 2. un RDV du même client calé dans la période retire l'alerte « pas calé »`, !r2.sans.includes('cale') && r2.sans.length === 5, JSON.stringify(r2.sans));
    verifier(`${ecran} 2. bandeau masqué s'il n'y a rien`, r2.reste === 0 && !r2.bandeau, JSON.stringify(r2));
    verifier(`${ecran} 2. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* ---------- 4 (critère 2). 12 rappels dus et 4 RDV non cochés : 5 lignes et « +11 autres » ---------- */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur });
    await p.evaluate(() => {
      for (let i = 0; i < 12; i++) state.aVoir.push({ id: 'r' + i, createdAt: 1, nom: 'Contact ' + i, entreprise: '', activite: 'cee', priorite: 'normale', statut: 'suivi', attente: '', rappel: i < 6 ? '2026-10-08' : '2026-10-10', historique: [{ date: '2026-10-01', texte: 'Vu au salon' }] });
      ['09:00', '11:00', '14:00', '16:00'].forEach((h, i) => state.events.push({ id: 'e' + i, titre: 'RDV du jour ' + i, date: '2026-10-10', heure: h, duree: 30, mode: 'visio', activite: 'energie', lien: '', fait: false, notes: '' }));
      save(); render();
    });
    await pause(p);
    const j = await p.evaluate(() => ({ lignes: document.querySelectorAll('.jour-card .list > li').length, plus: document.querySelector('.jour-card .plus-autres')?.textContent.trim(), premier: document.querySelector('.jour-card .list > li')?.className,
      rappel: document.querySelectorAll('.rappel-card .list > li').length, rappelPlus: document.querySelector('.rappel-card .plus-autres')?.textContent.trim(), kpi: document.querySelector('.kpi-lien .value')?.textContent, retard: document.querySelector('.kpi-lien .late')?.textContent }));
    verifier(`${ecran} 2. « Aujourd'hui » : 5 lignes et « +11 autres »`, j.lignes === 5 && j.plus === '+11 autres', JSON.stringify(j));
    verifier(`${ecran} 4. « Aujourd'hui » : les retards d'abord`, /retard/.test(j.premier || ''), j.premier);
    verifier(`${ecran} 4. « À rappeler » : 5 lignes au maximum, le reste vers #contacts (« +7 autres → »)`, j.rappel === 5 && j.rappelPlus === '+7 autres →', JSON.stringify(j));
    verifier(`${ecran} 8. KPI « À rappeler » : 12, dont 6 en retard`, j.kpi === '12' && j.retard === 'dont 6 en retard', JSON.stringify(j));
    await capture(p, `a1-aujourdhui-${largeur}`);
    await p.click('.jour-card .plus-autres'); await pause(p);
    const tout = await p.evaluate(() => ({ lignes: document.querySelectorAll('.jour-card .list > li').length, plus: document.querySelector('.jour-card .plus-autres')?.textContent.trim() }));
    verifier(`${ecran} 4. « +11 autres » montre les 16 lignes (puis « Réduire »)`, tout.lignes === 16 && tout.plus === 'Réduire', JSON.stringify(tout));
    await p.click('.jour-card .plus-autres'); await pause(p);
    await p.click('.jour-card .card-head .link'); await pause(p, 200);
    const plan = await p.evaluate(() => ({ hash: location.hash, vue: state.prefs.planVue, planDate }));
    verifier(`${ecran} 4. « Journée → » : allerAuJour(today()) puis #planning (vue jour, aujourd'hui)`, plan.hash === '#planning' && plan.vue === 'jour' && plan.planDate === '2026-10-10', JSON.stringify(plan));
    verifier(`${ecran} 4. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* ---------- 3 (critère 4). Rouge réservé : Julien (je lui dois, rappel dans 2 j) neutre, Mme Roth (rappel dépassé) en rouge ---------- */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, exemple: true });
    await p.evaluate(() => { state.aVoir.find(v => v.nom === 'Mme Roth').rappel = '2026-10-08'; save(); render(); });
    const danger = await p.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--danger)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; });
    for (const vue of ['dashboard', 'contacts']) {
      await p.evaluate(h => { location.hash = '#' + h; }, vue); await pause(p);
      const c = await p.evaluate(() => {
        const li = nom => [...document.querySelectorAll(location.hash === '#contacts' ? '#main .list > li' : '.rappel-card .list > li')].find(l => l.querySelector('.title-txt')?.textContent.includes(nom));
        const info = l => l && { cl: l.className.trim().split(/\s+/), warn: !!l.querySelector('.warn-ico'), titre: getComputedStyle(l.querySelector('.title-txt')).color, when: getComputedStyle(l.querySelector('.when')).color, badge: l.querySelector('.status')?.className, badgeTxt: l.querySelector('.status')?.textContent };
        return { julien: info(li('Julien')), roth: info(li('Mme Roth')) };
      });
      verifier(`${ecran} #${vue} 3. Julien (attente moi, rappel dans 2 j) : ni classe alerte ni ⚠, titre pas rouge`, c.julien && !c.julien.cl.includes('alerte') && !c.julien.cl.includes('retard') && !c.julien.warn && c.julien.titre !== danger, JSON.stringify(c.julien));
      verifier(`${ecran} #${vue} 3. Mme Roth (rappel dépassé) en rouge`, c.roth && c.roth.cl.includes('retard') && c.roth.cl.includes('alerte') && c.roth.warn && c.roth.titre === danger && c.roth.when === danger, JSON.stringify(c.roth));
      verifier(`${ecran} #${vue} 3. badges d'attente neutres : « ↪ Tu lui dois » (att-moi), « ↩ Elle te doit » (att-lui), gris argent`,
        c.julien.badge === 'status att-moi' && c.julien.badgeTxt === '↪ Tu lui dois' && c.roth.badge === 'status att-lui' && c.roth.badgeTxt === '↩ Elle te doit', JSON.stringify([c.julien.badge, c.julien.badgeTxt, c.roth.badge, c.roth.badgeTxt]));
      if (vue === 'contacts') await capture(p, `a1-contacts-${largeur}`);
    }
    const couleurs = await p.evaluate(() => { const b = document.querySelector('.status.att-moi'), s = getComputedStyle(b); return { c: s.color, img: s.backgroundImage }; });
    verifier(`${ecran} 3. badge d'attente : dégradé argent, texte argent (pas rouge)`, /gradient/.test(couleurs.img) && couleurs.c !== danger, JSON.stringify(couleurs));
    /* Je lui dois et le rappel arrive (aujourd'hui) : alerte ; elle attend et le rappel est aujourd'hui : neutre, à faire */
    await p.evaluate(() => { state.aVoir.find(v => v.nom === 'Julien').rappel = today(); state.aVoir.find(v => v.nom === 'Mme Roth').rappel = today(); save(); location.hash = '#contacts'; render(); });
    await pause(p);
    const auj = await p.evaluate(() => {
      const li = nom => [...document.querySelectorAll('#main .list > li')].find(l => l.textContent.includes(nom));
      const j = li('Julien'), r = li('Mme Roth');
      return { julien: j.className.trim(), julienWarn: !!j.querySelector('.warn-ico'), roth: r.className.trim(), rothWarn: !!r.querySelector('.warn-ico'), rothWhen: r.querySelector('.when').className };
    });
    verifier(`${ecran} 3. Julien, rappel aujourd'hui (je lui dois) : alerte et ⚠`, /alerte/.test(auj.julien) && auj.julienWarn, JSON.stringify(auj));
    verifier(`${ecran} 3. Mme Roth, rappel aujourd'hui (elle me doit) : ni rouge ni ⚠, « Rappel aujourd'hui » en gras`, !/alerte|retard/.test(auj.roth) && !auj.rothWarn && /\bdu\b/.test(auj.rothWhen), JSON.stringify(auj));
    verifier(`${ecran} 3. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* ---------- 5. État neuf : la carte vide et ses 3 actions ---------- */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur });
    const v = await p.evaluate(() => {
      const c = document.querySelector('.vide-accueil'), r = c && c.getBoundingClientRect();
      return { visible: !!r && r.height > 0 && r.top < innerHeight, actions: c ? [...c.querySelectorAll('.vide-action b')].map(b => b.textContent) : [], exemple: c?.querySelector('.lien-btn')?.textContent, kpis: !!document.querySelector('.kpis'), noter: !!document.querySelector('.noter-bar'), bas: r ? Math.round(r.bottom) : 0 };
    });
    verifier(`${ecran} 5. état neuf : la carte vide avec ses 3 actions est visible`, v.visible && JSON.stringify(v.actions) === '["Noter quelqu\'un","Ajouter un RDV","Ajouter un dossier"]' && v.exemple === 'Voir un exemple', JSON.stringify(v));
    verifier(`${ecran} 5. état neuf : pas de page de zéros (ni KPI ni graphiques), la barre Noter reste`, !v.kpis && v.noter, JSON.stringify(v));
    if (tel) verifier(`${ecran} 5. état neuf : la carte tient dans le premier écran (bas ${v.bas} < 844 - barre)`, v.bas < 780, String(v.bas));
    await capture(p, `a1-vide-${largeur}`);
    await p.click('.vide-action:has-text("Ajouter un RDV")'); await pause(p, 200);
    const rdv = await p.evaluate(() => ({ open: document.querySelector('#modal').open, h2: document.querySelector('#modal h2')?.textContent }));
    verifier(`${ecran} 5. « Ajouter un RDV » ouvre la fiche RDV`, rdv.open && /Nouveau RDV/.test(rdv.h2), JSON.stringify(rdv));
    await fermerFiche(p);
    await p.click('.vide-action:has-text("Ajouter un dossier")'); await pause(p, 200);
    const dos = await p.evaluate(() => ({ open: document.querySelector('#modal').open, h2: document.querySelector('#modal h2')?.textContent }));
    verifier(`${ecran} 5. « Ajouter un dossier » ouvre la fiche dossier`, dos.open && dos.h2 === 'Nouveau dossier d\'apport', JSON.stringify(dos));
    await fermerFiche(p);
    await p.click('.vide-action:has-text("Noter quelqu\'un")'); await pause(p, 150);
    const noter = await p.evaluate(() => ({ ouverte: !document.querySelector('#rencontre').hidden, focus: document.activeElement?.id }));
    verifier(`${ecran} 5. « Noter quelqu'un » ouvre Noter, focus sur la note`, noter.ouverte && noter.focus === 'r-note', JSON.stringify(noter));
    await p.evaluate(() => fermerRencontre()); await pause(p, 150);
    await p.click('.vide-accueil .lien-btn'); await pause(p, 250);
    const ex = await p.evaluate(() => ({ demo: aDemo(), vide: !!document.querySelector('.vide-accueil'), kpis: !!document.querySelector('.kpis') }));
    verifier(`${ecran} 5. « Voir un exemple » charge l'exemple et l'accueil complet`, ex.demo && !ex.vide && ex.kpis, JSON.stringify(ex));
    verifier(`${ecran} 5. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* ---------- 6. Toujours à jour : « Bonsoir » à 21:30, « Bonjour » et la nouvelle date le lendemain à 08:30 ---------- */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, horloge: '2026-10-10T21:30:00+02:00' });
    await p.evaluate(() => { location.hash = '#planning'; }); await pause(p);
    await accueil(p);
    const soir = await p.evaluate(() => ({ h1: document.querySelector('#main h1').textContent, p: document.querySelector('.page-head p').textContent }));
    verifier(`${ecran} 6. à 21:30 : « Bonsoir, Toufek », samedi 10 octobre`, soir.h1 === 'Bonsoir, Toufek' && soir.p.startsWith('Samedi 10 octobre'), JSON.stringify(soir));
    await p.clock.setSystemTime(new Date('2026-10-11T08:30:00+02:00'));
    await pause(p, 50);
    const avant = await p.evaluate(() => document.querySelector('#main h1').textContent);
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await pause(p);
    const matin = await p.evaluate(() => ({ h1: document.querySelector('#main h1').textContent, p: document.querySelector('.page-head p').textContent, planDate }));
    verifier(`${ecran} 6. lendemain 08:30 puis visibilitychange : « Bonjour, Toufek » et « Dimanche 11 octobre », sans autre interaction`, avant === 'Bonsoir, Toufek' && matin.h1 === 'Bonjour, Toufek' && matin.p.startsWith('Dimanche 11 octobre'), JSON.stringify({ avant, matin }));
    verifier(`${ecran} 6. le planning qui montrait « aujourd'hui » suit le nouveau jour`, matin.planDate === '2026-10-11', matin.planDate);
    /* Pas de redessin pendant une saisie : fiche ouverte au changement de jour → rien ; fermée → la minute suivante redessine */
    await p.evaluate(() => openEvent()); await pause(p, 200);
    await p.clock.setSystemTime(new Date('2026-10-12T08:00:00+02:00'));
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await pause(p);
    const pendant = await p.evaluate(() => ({ p: document.querySelector('.page-head p').textContent, open: document.querySelector('#modal').open }));
    verifier(`${ecran} 6. fiche ouverte : pas de redessin sous la saisie`, pendant.open && pendant.p.startsWith('Dimanche 11 octobre'), JSON.stringify(pendant));
    await fermerFiche(p);
    await p.clock.runFor(61000); await pause(p);
    const apres = await p.evaluate(() => document.querySelector('.page-head p').textContent);
    verifier(`${ecran} 6. fiche fermée : le contrôle de chaque minute redessine (lundi 12 octobre)`, apres.startsWith('Lundi 12 octobre'), apres);
    /* Plus de 5 min depuis le dernier affichage : redessin ; pageshow (retour arrière, page gardée en mémoire) */
    await p.evaluate(() => { state.aVoir.push({ id: 'neuf', createdAt: 1, nom: 'Nadia', entreprise: '', activite: 'cee', priorite: 'normale', statut: 'suivi', attente: '', rappel: '2026-10-12', historique: [] }); });
    await p.clock.runFor(4 * 60000); await pause(p);
    const a4 = await p.evaluate(() => document.querySelector('#main').textContent.includes('Nadia'));
    await p.clock.runFor(2 * 60000); await pause(p);
    const a6 = await p.evaluate(() => document.querySelector('#main').textContent.includes('Nadia'));
    verifier(`${ecran} 6. même jour : redessin après plus de 5 min (pas avant)`, !a4 && a6, JSON.stringify({ a4, a6 }));
    await p.clock.setSystemTime(new Date('2026-10-13T07:45:00+02:00'));
    await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))); await pause(p);
    const ps = await p.evaluate(() => document.querySelector('.page-head p').textContent);
    verifier(`${ecran} 6. pageshow (persisted) : redessin au nouveau jour (mardi 13 octobre)`, ps.startsWith('Mardi 13 octobre'), ps);
    /* Un champ modifié non enregistré (recherche des dossiers) bloque le redessin */
    const garde = await p.evaluate(() => { location.hash = '#parametres'; render(); const i = document.querySelector('#main input:not([type=file]):not([type=checkbox])'); if (!i) return 'pas de champ'; i.value = i.value + ' x'; return saisieEnCours(); });
    verifier(`${ecran} 6. un champ modifié sans être enregistré compte comme une saisie en cours`, garde === true, String(garde));
    await p.evaluate(() => { location.hash = '#jarvis'; }); await pause(p, 200);
    await p.evaluate(() => { const m = document.createElement('i'); m.id = 'marque'; document.querySelector('#main').appendChild(m); });
    await p.clock.runFor(6 * 60000); await pause(p);
    verifier(`${ecran} 6. conversation avec Kami : pas de redessin toutes les 5 min (seulement à un nouveau jour)`, await p.evaluate(() => !!document.querySelector('#marque')));
    verifier(`${ecran} 6. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }

  /* ---------- 7. Pastille de l'icône : un espion sur navigator.setAppBadge reçoit le bon nombre ---------- */
  {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, exemple: true });
    await p.evaluate(() => { state.events.push({ id: 'demainImp', titre: 'Dépôt dossier CEE', date: '2026-10-11', heure: '', duree: 30, mode: 'tache', activite: 'cee', lien: '', fait: false, notes: '', important: true }); save(); });
    await p.addInitScript(() => {
      window.__badge = [];
      navigator.setAppBadge = n => { window.__badge.push(n); return Promise.resolve(); };
      navigator.clearAppBadge = () => { window.__badge.push('clear'); return Promise.resolve(); };
    });
    await p.reload({ waitUntil: 'domcontentloaded' }); await pause(p, 300);
    const r = await p.evaluate(() => {
      const t = today();
      const attendu = rappelsContacts().length + relances().filter(x => x.date < t).length + alertes().filter(a => a.niveau === 'fort').length;
      const auDemarrage = window.__badge.slice();
      window.__badge.length = 0; render();
      return { attendu, auDemarrage, apres: window.__badge.slice(), detail: [rappelsContacts().length, relances().filter(x => x.date < t).length, alertes().filter(a => a.niveau === 'fort').length] };
    });
    verifier(`${ecran} 7. setAppBadge reçoit ${r.attendu} (1 rappel + 1 relance en retard + 1 alerte de demain) au démarrage et après render()`,
      r.attendu === 3 && JSON.stringify(r.detail) === '[1,1,1]' && r.auDemarrage.at(-1) === 3 && JSON.stringify(r.apres) === '[3]', JSON.stringify(r));
    const zero = await p.evaluate(() => { window.__badge.length = 0; state.aVoir = []; state.dossiers.forEach(d => { d.dateRelance = ''; }); state.events.forEach(e => { e.important = false; }); render(); return window.__badge.slice(); });
    verifier(`${ecran} 7. plus rien d'urgent : clearAppBadge()`, JSON.stringify(zero) === '["clear"]', JSON.stringify(zero));
    const panne = await p.evaluate(() => { navigator.setAppBadge = () => Promise.reject(new Error('NotAllowedError')); state.aVoir.push({ id: 'z', createdAt: 1, nom: 'Zoé', entreprise: '', activite: 'cee', priorite: 'normale', statut: 'suivi', attente: '', rappel: '2026-10-10', historique: [] }); render(); return document.querySelector('#main h1')?.textContent; });
    await pause(p, 100);
    verifier(`${ecran} 7. une pastille refusée (appli non installée) ne casse rien`, /Toufek/.test(panne) && erreurs.length === 0, erreurs.join(' | '));
    /* Kami voit les mêmes alertes que l'accueil */
    await p.evaluate(() => { state.events.push({ id: 'k5', titre: 'Signature énergie', date: '2026-10-15', heure: '', duree: 30, mode: 'tache', activite: 'energie', lien: '', fait: false, notes: '', important: true }); });
    const proj = await p.evaluate(() => projection().resume.alertes);
    const persona = fs.readFileSync(path.join(RACINE, 'api', 'jarvis.js'), 'utf8');
    verifier(`${ecran} Kami : projection().resume.alertes et persona à jour`, Array.isArray(proj) && proj.some(a => a.compte === 'J-5' && a.niveau === 'clair' && a.titre === 'Signature énergie') && persona.includes('resume.alertes') && !persona.includes('le tableau de bord l\'affiche en alerte'), JSON.stringify(proj));
    verifier(`${ecran} 7. aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }
}

const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
verifier('sw.js : VERSION kgd-v8 (index, app, views, style modifiés)', /VERSION = 'kgd-v8'/.test(sw));
bilan();
