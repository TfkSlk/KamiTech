/* U1 — Après une prise de contact : le rappel s'acquitte (« ✓ Fait ») et la suite se choisit tout de suite ; un rappel à venir ne réclame rien */
import { ouvrir, verifier, bilan } from './outil.mjs';

const aller = async (p, h) => { await p.evaluate(x => { location.hash = '#' + x; }, h); await p.waitForTimeout(250); };
const ligne = (p, nom) => p.evaluate(n => { const li = [...document.querySelectorAll('.rappel-card .list > li')].find(l => l.querySelector('.title-txt')?.textContent.includes(n)); return li && { cl: li.className, boutons: [...li.querySelectorAll('button')].map(b => b.textContent.trim()) }; }, nom);

for (const largeur of [390, 1366]) {
  const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur: largeur > 760 ? 900 : 844, horloge: '2026-10-10T09:00:00', exemple: true });
  /* Accueil : Mme Roth (rappel aujourd'hui) a « ✓ Fait » ; Julien (rappel dans 2 j) est grisé, sans bouton */
  const roth = await ligne(p, 'Mme Roth'), julien = await ligne(p, 'Julien');
  verifier(`${largeur}px : Mme Roth (rappel dû) porte « ✓ Fait »`, roth && roth.boutons.includes('✓ Fait') && !roth.boutons.includes('Contacté'), JSON.stringify(roth));
  verifier(`${largeur}px : Julien (rappel à venir) est grisé, sans bouton`, julien && /a-venir/.test(julien.cl) && julien.boutons.length === 0, JSON.stringify(julien));
  const kpi0 = await p.evaluate(() => document.querySelector('.kpi-lien .value')?.textContent);
  /* « ✓ Fait » : la feuille « Et ensuite ? » */
  await p.locator('.rappel-card li', { hasText: 'Mme Roth' }).locator('button', { hasText: 'Fait' }).click();
  await p.waitForTimeout(250);
  const f = await p.evaluate(() => ({ ouvert: $('#modal').open, titre: document.querySelector('#modal-titre')?.textContent, opts: [...document.querySelectorAll('#modal .opt b')].map(b => b.textContent), defile: (() => { const b = document.querySelector('#modal .sheet-body'); return b ? b.scrollHeight > b.clientHeight + 1 : false; })(), petits: [...document.querySelectorAll('#modal .opt, #modal .btn')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 44).length }));
  verifier(`${largeur}px : « ✓ Fait » ouvre « C'est fait · Mme Roth » avec la suite à choisir`, f.ouvert && /C'est fait · Mme Roth/.test(f.titre) && JSON.stringify(f.opts) === JSON.stringify(['Noter ce qui s\'est dit…', 'Dans 3 jours', 'Dans 1 semaine', 'Dans 2 semaines', 'Dans 1 mois', 'Planifier un RDV', 'Clore']), JSON.stringify(f));
  verifier(`${largeur}px : la feuille ne défile pas${largeur < 760 ? ", cibles ≥ 44 px" : ""}`, !f.defile && (largeur > 760 || f.petits === 0), JSON.stringify(f));
  const avant = await p.evaluate(() => JSON.stringify(state.aVoir.find(v => v.nom === 'Mme Roth')));
  await p.click('#modal .opt:has-text("Dans 1 semaine")'); await p.waitForTimeout(250);
  const r = await p.evaluate(() => { const v = state.aVoir.find(x => x.nom === 'Mme Roth'); return { rappel: v.rappel, attendu: rappelDans(7), der: v.historique[v.historique.length - 1].texte, ferme: !$('#modal').open, toast: document.querySelector('#toast').textContent, kpi: document.querySelector('.kpi-lien .value')?.textContent }; });
  verifier(`${largeur}px : « Dans 1 semaine » : rappel dans 7 jours, journal « Rappel fait · prochain rappel … »`, r.rappel === r.attendu && /^Rappel fait · prochain rappel /.test(r.der) && r.ferme, JSON.stringify(r));
  verifier(`${largeur}px : le KPI « À rappeler » baisse de 1, toast avec « Annuler »`, Number(r.kpi) === Number(kpi0) - 1 && /Mme Roth · prochain rappel/.test(r.toast) && /Annuler/.test(r.toast), JSON.stringify({ kpi0, r }));
  const roth2 = await ligne(p, 'Mme Roth');
  verifier(`${largeur}px : Mme Roth passe « à venir » : grisée, sans bouton`, roth2 && /a-venir/.test(roth2.cl) && roth2.boutons.length === 0, JSON.stringify(roth2));
  /* Annuler : tout revient */
  await p.click('#toast .toast-action'); await p.waitForTimeout(200);
  verifier(`${largeur}px : « Annuler » remet le rappel et le journal`, (await p.evaluate(() => JSON.stringify(state.aVoir.find(v => v.nom === 'Mme Roth')))) === avant);
  /* « Noter ce qui s'est dit… » ouvre Noter sur Mme Roth */
  await p.locator('.rappel-card li', { hasText: 'Mme Roth' }).locator('button', { hasText: 'Fait' }).click(); await p.waitForTimeout(200);
  await p.click('#modal .suite-noter'); await p.waitForTimeout(250);
  const noter = await p.evaluate(() => ({ ouvert: !document.querySelector('#rencontre').hidden, qui: document.querySelector('#rencontre .r-head .meta')?.textContent, modal: $('#modal').open }));
  verifier(`${largeur}px : « Noter ce qui s'est dit… » ouvre Noter sur Mme Roth`, noter.ouvert && /Mme Roth/.test(noter.qui) && !noter.modal, JSON.stringify(noter));
  /* Enregistrer : le toast dit la suite et propose « Changer la suite » */
  await p.fill('#r-note', 'Elle envoie ses avis vendredi'); await p.waitForTimeout(150);
  await p.click('#r-enregistrer'); await p.waitForTimeout(300);
  const t = await p.evaluate(() => ({ txt: document.querySelector('#toast').textContent, n: state.aVoir.find(v => v.nom === 'Mme Roth').historique.length }));
  verifier(`${largeur}px : après Noter, toast avec « Changer la suite »`, /Changer la suite/.test(t.txt), JSON.stringify(t));
  await p.click('#toast .toast-action'); await p.waitForTimeout(250);
  const g = await p.evaluate(() => ({ titre: document.querySelector('#modal-titre')?.textContent, noter: !!document.querySelector('#modal .suite-noter') }));
  verifier(`${largeur}px : « Changer la suite » ouvre « La suite · Mme Roth » (sans Noter)`, /La suite · Mme Roth/.test(g.titre) && !g.noter, JSON.stringify(g));
  await p.click('#modal .opt:has-text("Dans 2 semaines")'); await p.waitForTimeout(200);
  const c = await p.evaluate(() => { const v = state.aVoir.find(x => x.nom === 'Mme Roth'); return { rappel: v.rappel, attendu: rappelDans(14), n: v.historique.length }; });
  verifier(`${largeur}px : « Dans 2 semaines » change seulement la suite (pas de ligne de journal en plus)`, c.rappel === c.attendu && c.n === t.n, JSON.stringify({ c, n: t.n }));
  /* Clore depuis « ✓ Fait » : le contact quitte la liste du jour */
  await p.evaluate(() => { state.aVoir.find(v => v.nom === 'Mme Roth').rappel = today(); save(); render(); });
  await p.locator('.rappel-card li', { hasText: 'Mme Roth' }).locator('button', { hasText: 'Fait' }).click(); await p.waitForTimeout(200);
  await p.click('#modal .opt.clore'); await p.waitForTimeout(200);
  const cl = await p.evaluate(() => { const v = state.aVoir.find(x => x.nom === 'Mme Roth'); return { s: v.statut, r: v.rappel, li: [...document.querySelectorAll('.rappel-card li')].some(l => /Mme Roth/.test(l.textContent)) }; });
  verifier(`${largeur}px : « Clore » : contact clos, plus dans « À rappeler »`, cl.s === 'clos' && !cl.r && !cl.li, JSON.stringify(cl));
  /* Planning : un rappel du jour se règle aussi par « ✓ Fait » */
  await p.evaluate(() => { const v = state.aVoir.find(x => x.nom === 'Mme Roth'); v.statut = 'suivi'; v.rappel = today(); save(); planDate = today(); setPlanVue('jour'); location.hash = '#planning'; });
  await p.waitForTimeout(300);
  const pl = await p.evaluate(() => [...document.querySelectorAll('#main li.rappel')].filter(l => /Mme Roth/.test(l.textContent)).map(l => [...l.querySelectorAll('button')].map(b => b.textContent.trim())));
  verifier(`${largeur}px : planning, vue Jour : la ligne de rappel porte « ✓ Fait »`, pl.length >= 1 && pl.every(b => b.includes('✓ Fait')), JSON.stringify(pl));
  verifier(`${largeur}px : pas d'erreur JS`, erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

bilan();
