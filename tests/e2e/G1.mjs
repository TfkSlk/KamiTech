/* G1 — Quand un client paie : encaissé, attendu, en retard, qui te doit quoi, et la prochaine affaire */
import { ouvrir, verifier, bilan } from './outil.mjs';

const KEY = 'kami-dashboard-v1';
const aller = async (p, h) => { await p.evaluate(x => { location.hash = '#' + x; }, h); await p.waitForTimeout(250); };

/* 1. Migration : un dossier CEE signé le 1er juillet, sans date prévue → 29 septembre ; en retard, regroupé par partenaire */
{
  const brut = { nom: 'Kami Groupe', prefs: { theme: 'light', periode: 'mois', migrations: { rappelsRecuperes: true, dureesPeriodes: true, resilieSansFin: true } },
    dossiers: [
      { id: 'd1', entreprise: 'Usine Nord', activite: 'cee', statut: 'signe', partenaire: 'Délégataire B', commEstimee: 3000, dateSignature: '2026-07-01', createdAt: 1 },
      { id: 'd2', entreprise: 'Garage Est', activite: 'cee', statut: 'signe', partenaire: ' délégataire  b ', commEstimee: 2300, commRecue: 0, datePaiementPrevue: '2026-10-01', createdAt: 2 },
      { id: 'd3', entreprise: 'Boulangerie', activite: 'energie', statut: 'signe', partenaire: 'Fournisseur A', commEstimee: 900, datePaiementPrevue: '2026-11-20', createdAt: 3 },
      { id: 'd4', entreprise: 'Hôtel', activite: 'energie', statut: 'paye', commEstimee: 500, commRecue: 500, datePaiement: '2026-10-05', dateSignature: '2026-09-01', createdAt: 4 },
    ], events: [], abonnes: [], aVoir: [], memoire: [], formules: [], rdvModele: [] };
  const { p, erreurs, fermer } = await ouvrir({ largeur: 1366, hauteur: 900, horloge: '2026-10-10T09:00:00', stockage: { [KEY]: brut } });
  const r = await p.evaluate(() => ({ d1: dossier('d1').datePaiementPrevue, d2: dossier('d2').datePaiementPrevue, delais: state.prefs.delais, a: argent('mois'), stocke: JSON.parse(localStorage.getItem('kami-dashboard-v1')).dossiers.find(d => d.id === 'd1').datePaiementPrevue }));
  verifier('Migration : CEE signé le 1er juillet → paiement prévu le 29 septembre (enregistré)', r.d1 === '2026-09-29' && r.stocke === '2026-09-29', JSON.stringify(r));
  verifier('Migration : une date déjà posée reste', r.d2 === '2026-10-01');
  verifier('Délais par défaut : CEE 90, Énergie 45, Foncier 120', JSON.stringify(r.delais) === JSON.stringify({ cee: 90, energie: 45, foncier: 120 }), JSON.stringify(r.delais));
  verifier('argent() : retard 5 300 € (Usine Nord + Garage Est), attendu 900 €, encaissé ce mois 500 €', r.a.retard === 5300 && r.a.attendu === 900 && r.a.encaisse === 500, JSON.stringify(r.a));
  const g = r.a.parPartenaire;
  verifier('Retards regroupés par partenaire (casse et espaces ignorés) : Délégataire B, 2 dossiers, +11 j', g.length === 1 && g[0].nom === 'Délégataire B' && g[0].n === 2 && g[0].total === 5300 && g[0].plusAncienJours === 11 && g[0].plusAncien === 'd1', JSON.stringify(g));
  const gs = await p.evaluate(() => ({ sem: gains('energie', 'semaine').prevu, an: gains('energie', 'annee').prevu, ceeAn: gains('cee', 'annee').prevu }));
  verifier('Paiement prévu le 20 novembre : pas attendu cette semaine, attendu cette année', gs.sem === 0 && gs.an === 900, JSON.stringify(gs));
  verifier('Un retard n\'est pas compté comme « attendu » de la période', gs.ceeAn === 0, JSON.stringify(gs));
  /* Carte « Ton argent » sur l'accueil et sur Gains */
  for (const v of ['dashboard', 'gains']) {
    await aller(p, v);
    const c = await p.evaluate(() => { const s = document.querySelector('.argent'); return s && { txt: s.innerText.replace(/\s+/g, ' '), barre: s.querySelectorAll('.argent-barre rect').length, boutons: [...s.querySelectorAll('button')].map(b => b.textContent.trim()) }; });
    verifier(`#${v} : carte « Ton argent » avec « Délégataire B te doit 5 300 € · 2 dossiers · le plus ancien +11 j »`, c && /Délégataire B te doit 5\s?300\s?€/.test(c.txt) && /2 dossiers · le plus ancien \+11 j/.test(c.txt), c && c.txt);
    verifier(`#${v} : barre à 3 segments, Relancer et Marquer payé`, c && c.barre === 3 && c.boutons.join() === 'Relancer,Marquer payé', JSON.stringify(c));
  }
  /* KPI : attendus d'ici fin de période, et le retard en rouge */
  await aller(p, 'dashboard');
  const kpi = await p.evaluate(() => { const k = [...document.querySelectorAll('.kpi')].find(x => /Gagné · /.test(x.textContent)); return { txt: k.querySelector('.sub').innerText, rouge: !!k.querySelector('.sub .late') }; });
  verifier('KPI : « attendus d\'ici fin octobre · 5 300 € en retard » (en rouge)', /attendus d'ici fin octobre/.test(kpi.txt) && /5\s?300\s?€ en retard/.test(kpi.txt) && kpi.rouge, JSON.stringify(kpi));
  /* Alerte forte par partenaire */
  const al = await p.evaluate(() => alertes().filter(a => /te doit/.test(a.titre)).map(a => ({ t: a.titre, n: a.niveau })));
  verifier('Alerte forte : « Délégataire B te doit 5 300 € »', al.length === 1 && al[0].n === 'fort' && /Délégataire B te doit/.test(al[0].t), JSON.stringify(al));
  /* Relancer : les dossiers remontent dans « Aujourd'hui » */
  await p.click('.argent button:has-text("Relancer")'); await p.waitForTimeout(250);
  const rel = await p.evaluate(() => ({ r1: dossier('d1').dateRelance, r2: dossier('d2').dateRelance, jour: [...document.querySelectorAll('.jour-card li')].map(li => li.textContent.replace(/\s+/g, ' ')).filter(x => /Relance/.test(x)).length }));
  verifier('Relancer : dateRelance = aujourd\'hui sur les 2 dossiers, visibles dans « Aujourd\'hui »', rel.r1 === '2026-10-10' && rel.r2 === '2026-10-10' && rel.jour === 2, JSON.stringify(rel));
  /* Fiche dossier : le champ « Paiement prévu le » */
  await p.evaluate(() => openDossier('d1')); await p.waitForTimeout(250);
  const champ = await p.evaluate(() => document.querySelector('#modal [name="datePaiementPrevue"]')?.value);
  verifier('Fiche dossier : « Paiement prévu le » = 2026-09-29', champ === '2026-09-29', String(champ));
  await p.evaluate(() => fermerModal());
  /* Passer un prospect à « Signé » : paiement prévu = signature + délai */
  await p.evaluate(() => { state.dossiers.push({ id: 'd5', entreprise: 'Nouvelle SCI', activite: 'foncier', statut: 'prospect', commEstimee: 1200, createdAt: 5 }); save(); openDossier('d5'); });
  await p.waitForTimeout(250);
  await p.click('#modal [aria-labelledby="lab-statut"] [data-v="signe"]');
  await p.evaluate(() => document.querySelector('#modal-form').requestSubmit());
  await p.waitForTimeout(250);
  const d5 = await p.evaluate(() => ({ s: dossier('d5').statut, sig: dossier('d5').dateSignature, pp: dossier('d5').datePaiementPrevue }));
  verifier('Prospect passé à Signé : signé aujourd\'hui, paiement prévu +120 j (7 février 2027)', d5.s === 'signe' && d5.sig === '2026-10-10' && d5.pp === '2027-02-07', JSON.stringify(d5));
  /* Réglages : délai modifiable */
  await aller(p, 'parametres');
  await p.fill('#delai-energie', '60'); await p.dispatchEvent('#delai-energie', 'change'); await p.waitForTimeout(150);
  verifier('Réglages : délai Énergie passé à 60 jours', await p.evaluate(() => state.prefs.delais.energie === 60));
  /* Gains à l'ordinateur : le tableau seul, pas les lignes du téléphone */
  await aller(p, 'gains');
  verifier('1366px #gains : .sect-rows masqué', await p.evaluate(() => getComputedStyle(document.querySelector('.sect-rows')).display === 'none'));
  verifier('Pas d\'erreur JS (1)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 2. Données d'exemple : SCI Les Tilleuls (Foncier, signée il y a 10 jours) est attendue, pas en retard ; marquer payé → prochaine affaire */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge: '2026-10-10T09:00:00', exemple: true });
  const sci = await p.evaluate(() => { const d = state.dossiers.find(x => x.entreprise === 'SCI Les Tilleuls'); const a = argent('mois'); return { ech: echeance(d), retard: a.parPartenaire.some(g => g.ids.includes(d.id)), attendu: a.attendu >= 2400 }; });
  verifier('Exemple : SCI Les Tilleuls attendue (échéance 2027), pas en retard', sci.ech > '2026-10-10' && !sci.retard && sci.attendu, JSON.stringify(sci));
  for (const v of ['dossiers', 'kamifood']) {
    await aller(p, v);
    const m = await p.evaluate(() => { const m = document.querySelector('#main'); return { sw: m.scrollWidth, cw: m.clientWidth, doc: document.documentElement.scrollWidth, petits: [...document.querySelectorAll('#main button')].filter(b => /Marquer payé/.test(b.textContent) && b.offsetParent).filter(b => b.getBoundingClientRect().height < 44).length }; });
    verifier(`390px #${v} : rien ne dépasse en largeur, « Marquer payé » ≥ 44 px`, m.sw <= m.cw && m.doc <= 390 && m.petits === 0, JSON.stringify(m));
  }
  /* KamiFood : « — » pour la licence éditeur, l'année pour un engagement qui finit en 2027 */
  await p.evaluate(() => { const a = state.abonnes.find(x => !x.interne); a.debut = '2026-03-01'; a.engagement = 12; save(); render(); });
  await aller(p, 'kamifood');
  const kf = await p.evaluate(() => [...document.querySelectorAll('#main tbody tr')].map(tr => ({ nom: tr.querySelector('.c-nom strong')?.textContent, fin: tr.querySelector('[data-l="Fin d\'engagement"]')?.textContent.trim() })));
  const lic = kf.find(x => /Kami|Licence|Éditeur/i.test(x.nom || '') ) || kf.find(x => x.fin === '—');
  verifier('KamiFood : la licence éditeur affiche « — »', kf.some(x => x.fin === '—'), JSON.stringify(kf));
  verifier('KamiFood : un engagement qui finit en 2027 affiche l\'année', kf.some(x => /2027/.test(x.fin || '')), JSON.stringify(kf));
  /* Marquer payé sur un dossier Foncier, puis « Oui » : contact lié, rappel le 2 août 2027 (le 1er est un dimanche) */
  await aller(p, 'dossiers');
  const id = await p.evaluate(() => state.dossiers.find(x => x.entreprise === 'SCI Les Tilleuls').id);
  await p.evaluate(i => marquerPaye(i), id); await p.waitForTimeout(200);
  const t1 = await p.evaluate(() => document.querySelector('#toast').textContent);
  verifier('Marquer payé : toast « +2 400 € · ce mois … »', /^\+2\s?400\s?€ · ce mois /.test(t1), t1);
  await p.waitForTimeout(2800);
  const t2 = await p.evaluate(() => ({ txt: document.querySelector('#toast').textContent, vu: document.querySelector('#toast').classList.contains('show') }));
  verifier('Puis « Prévoir la prochaine affaire ? · Oui »', t2.vu && /Prévoir la prochaine affaire \?/.test(t2.txt) && /Oui/.test(t2.txt), JSON.stringify(t2));
  await p.click('#toast .toast-action'); await p.waitForTimeout(250);
  const v = await p.evaluate(i => { const v = state.aVoir.find(x => x.lien === 'd:' + i); return v && { nom: v.nom, statut: v.statut, rappel: v.rappel, der: v.historique[v.historique.length - 1].texte, activite: v.activite }; }, id);
  verifier('« Oui » : contact lié en suivi, rappel le 2027-08-02, journal « Commission payée : 2 400 € »', v && v.statut === 'suivi' && v.rappel === '2027-08-02' && /^Commission payée : 2\s?400\s?€$/.test(v.der) && v.activite === 'foncier', JSON.stringify(v));
  /* Une seconde fois : le même contact est mis à jour, pas de doublon */
  await p.evaluate(i => prochaineAffaire(i), id);
  verifier('Prochaine affaire deux fois : un seul contact lié', await p.evaluate(i => state.aVoir.filter(x => x.lien === 'd:' + i).length === 1, id));
  /* CEE : +12 mois ; Énergie : +10 mois (jour ouvré) */
  const r = await p.evaluate(() => {
    state.dossiers.push({ id: 'zc', entreprise: 'Z CEE', activite: 'cee', statut: 'signe', commEstimee: 100, contact: 'Zoé' }, { id: 'ze', entreprise: 'Z Énergie', activite: 'energie', statut: 'signe', commEstimee: 100 });
    prochaineAffaire('zc'); prochaineAffaire('ze');
    return { cee: state.aVoir.find(x => x.lien === 'd:zc')?.rappel, en: state.aVoir.find(x => x.lien === 'd:ze')?.rappel, nomCee: state.aVoir.find(x => x.lien === 'd:zc')?.nom };
  });
  verifier('CEE : rappel dans 12 mois (lundi 11 oct. 2027), au nom du contact', r.cee === '2027-10-11' && r.nomCee === 'Zoé', JSON.stringify(r));
  verifier('Énergie : rappel dans 10 mois (mardi 10 août 2027)', r.en === '2027-08-10', JSON.stringify(r));
  verifier('Pas d\'erreur JS (2)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

bilan();
