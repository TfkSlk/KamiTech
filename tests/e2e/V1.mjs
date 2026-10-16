/* V1 — Le lundi : ta semaine passée (temps contre argent), comparaison à date égale, 3 objectifs */
import { ouvrir, verifier, bilan } from './outil.mjs';

const KEY = 'kami-dashboard-v1';
const PREFS = { periode: 'mois', theme: 'light', migrations: { rappelsRecuperes: true, dureesPeriodes: true, resilieSansFin: true, dedoublonMoi: true, paiementPrevu: true, historiqueDossiers: true }, dernierBrief: '2026-10-12', dernierExport: '2026-10-11T08:00:00.000Z' };
const ev = (id, k, date, heure, duree, fait) => ({ id, titre: 'RDV ' + id, date, heure, duree, mode: 'visio', activite: k, lien: '', fait, notes: '' });
const paye = (id, k, datePaiement, montant) => ({ id, entreprise: 'Client ' + id, activite: k, statut: 'paye', commEstimee: montant, commRecue: montant, dateSignature: '2026-09-01', datePaiement, createdAt: 1, historique: [] });
const base = () => ({ nom: 'Kami Groupe', memoire: [], abonnes: [], formules: [], rdvModele: [], aVoir: [
  { id: 'v1', createdAt: Date.parse('2026-10-06T10:00:00'), nom: 'Alice', entreprise: 'Fleurs', activite: 'energie', priorite: 'normale', statut: 'suivi', attente: 'lui', rappel: '2026-10-14', tel: '06 11 22 33 44', lien: '', notes: '', historique: [{ date: '2026-10-06', texte: 'Vue au salon' }] },
  { id: 'v2', createdAt: 1, nom: 'Bruno', entreprise: '', activite: 'cee', priorite: 'normale', statut: 'suivi', attente: '', rappel: '2026-10-08', tel: '', lien: '', notes: '', historique: [{ date: '2026-09-20', texte: 'Premier échange' }] },
  { id: 'v3', createdAt: 1, nom: 'Chloé', entreprise: '', activite: 'foncier', priorite: 'normale', statut: 'suivi', attente: '', rappel: '2026-10-07', tel: '', lien: '', notes: '', historique: [{ date: '2026-09-25', texte: 'Appel' }, { date: '2026-10-07', texte: 'Rappelée' }] },
], prefs: { ...PREFS } });
const semaine = () => ({ ...base(),
  events: [ev('e1', 'energie', '2026-10-06', '10:00', 60, true), ev('e2', 'foncier', '2026-10-07', '14:00', 120, true), ev('e3', 'cee', '2026-10-08', '09:00', 30, false), ev('e4', 'energie', '2026-09-30', '10:00', 60, true), ev('e5', 'energie', '2026-10-12', '10:00', 60, false)],
  dossiers: [paye('d1', 'energie', '2026-10-06', 300), paye('d2', 'foncier', '2026-10-08', 1200), paye('d3', 'cee', '2026-09-30', 500)] });
const aller = async (p, h) => { await p.evaluate(x => { location.hash = '#' + x; }, h); await p.waitForTimeout(250); };
const sansDefil = p => p.evaluate(() => { const b = document.querySelector('#revue .r-body'); return b ? { ok: b.scrollHeight <= b.clientHeight + 1, sh: b.scrollHeight, ch: b.clientHeight } : null; });

/* 1. Lundi 12 octobre : la carte « Ta semaine passée », les 3 volets sans défilement, chiffres = tempsEntre / gainsEntre, phrase, objectifs */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge: '2026-10-12T09:00:00', stockage: { [KEY]: semaine() } });
  await p.evaluate(() => { localStorage.setItem('kgd-rituels', '1'); render(); });
  await p.waitForTimeout(200);
  const carte = await p.evaluate(() => document.querySelector('#carte-revue')?.innerText.replace(/\s+/g, ' ') || '');
  verifier('Lundi, derniereRevue absent : carte « Ta semaine passée » visible', /Ta semaine passée/.test(carte), carte);
  await p.click('#carte-revue'); await p.waitForTimeout(250);
  const defil = [];
  for (let e = 0; e < 3; e++) { await p.evaluate(e => { rituel.etape = e; revueRender(); }, e); const s = await sansDefil(p); if (!s || !s.ok) defil.push({ e, ...s }); }
  verifier('390x844 : aucun des 3 volets ne défile', defil.length === 0, JSON.stringify(defil));
  /* Volet 1 : les chiffres du 5 au 11 octobre */
  await p.evaluate(() => { rituel.etape = 0; revueRender(); });
  const v = await p.evaluate(() => ({
    lignes: [...document.querySelectorAll('#revue .r-table tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.firstChild?.textContent?.trim() || td.textContent.trim())),
    attendu: ['cee', 'energie', 'foncier', 'kamifood'].map(k => [SECTEURS[k].label, hrs(tempsEntre(k, '2026-10-05', '2026-10-11')), eur(gainsEntre(k, '2026-10-05', '2026-10-11'))]),
    periode: document.querySelector('#revue .r-head .meta').textContent,
    phrase: document.querySelector('#r-phrase')?.textContent || '',
    ecarts: [...document.querySelectorAll('#revue .r-table tbody tr td:nth-child(3) small')].map(s => s.textContent),
  }));
  verifier('Volet 1 : du 5 oct. au 11 oct.', /du 5 oct\. au 11 oct\./.test(v.periode), v.periode);
  verifier('Heures et euros = tempsEntre et gainsEntre sur 2026-10-05 → 2026-10-11', v.lignes.length === 4 && v.lignes.every((l, i) => l[0] === v.attendu[i][0] && l[1] === v.attendu[i][1] && l[2] === v.attendu[i][2]), JSON.stringify({ lignes: v.lignes, attendu: v.attendu }));
  verifier('Écart avec la semaine d\'avant : CEE −500 €, Énergie +300 €, Foncier +1 200 €', JSON.stringify(v.ecarts.map(x => x.replace(/[  ]/g, ' '))) === JSON.stringify(['−500 €', '+300 €', '+1 200 €', '=']), JSON.stringify(v.ecarts));
  verifier('Phrase : « Ton heure Foncier & CFE vaut 2× ton heure Énergie. »', v.phrase === 'Ton heure Foncier & CFE vaut 2× ton heure Énergie.', v.phrase);
  /* Volet 2 : contacts */
  await p.evaluate(() => { rituel.etape = 1; revueRender(); });
  const c = await p.evaluate(() => ({ stats: [...document.querySelectorAll('#revue .r-stats div')].map(d => d.innerText.replace(/\s+/g, ' ').trim()), noms: [...document.querySelectorAll('#revue .b-item .b-txt b')].map(b => b.textContent.trim()) }));
  verifier('Volet 2 : 1 nouvelle personne notée (Alice) ; rappels traités 1 sur 2 (50 %)', /^1 nouvelle personne notée$/.test(c.stats[0]) && /^50 % des rappels traités à temps \(1 sur 2\)$/.test(c.stats[1]), JSON.stringify(c.stats));
  verifier('Ceux qui attendent depuis le plus longtemps : Bruno (20 sept.) d\'abord', c.noms[0] === 'Bruno' && c.noms.length === 3, JSON.stringify(c.noms));
  /* Volet 3 : objectifs, partage, Terminer */
  await p.evaluate(() => { rituel.etape = 2; revueRender(); });
  await p.fill('#obj-0', 'Appeler les 5 contacts CEE'); await p.fill('#obj-1', 'Signer Garage Central'); await p.fill('#obj-2', '   ');
  await p.evaluate(() => { window.__share = null; navigator.share = async o => { window.__share = o.text; }; });
  await p.click('#revue button:has-text("Partager le récap")'); await p.waitForTimeout(150);
  const recap = await p.evaluate(() => window.__share || '');
  verifier('Partager : récap texte (semaine du 5 oct., 3 h 30 planifiées, 1 500 € encaissés, objectifs)', /^Ma semaine du 5 oct\. : 3 h 30 planifiées, 1[\s  ]500[\s  ]€ encaissés\./.test(recap) && /Objectifs de la semaine :\n· Appeler les 5 contacts CEE\n· Signer Garage Central$/.test(recap), JSON.stringify(recap));
  await p.evaluate(() => { delete navigator.share; window.__copie = null; navigator.clipboard.writeText = async t => { window.__copie = t; }; });
  await p.click('#revue button:has-text("Partager le récap")'); await p.waitForTimeout(150);
  verifier('Sans partage : copié dans le presse-papiers, toast « Copié »', await p.evaluate(() => window.__copie && /Ma semaine/.test(window.__copie) && document.querySelector('#toast').textContent === 'Copié'));
  await p.click('#revue .btn.primary:has-text("Terminer")'); await p.waitForTimeout(300);
  const fin = await p.evaluate(() => ({ revue: state.revues['2026-10-12'], der: state.prefs.derniereRevue, carte: !!document.querySelector('#carte-revue'), obj: document.querySelector('#objectifs-semaine')?.innerText.replace(/\s+/g, ' ') || '', ferme: document.querySelector('#revue').hidden }));
  verifier('Terminer : state.revues[2026-10-12] = 2 objectifs + chiffres, derniereRevue posée, carte retirée', fin.ferme && !fin.carte && fin.der === '2026-10-12' && JSON.stringify(fin.revue.objectifs) === JSON.stringify(['Appeler les 5 contacts CEE', 'Signer Garage Central']) && fin.revue.chiffres.minutes === 210 && fin.revue.chiffres.euros === 1500, JSON.stringify(fin));
  verifier('Les objectifs s\'affichent sur l\'accueil', /Appeler les 5 contacts CEE/.test(fin.obj) && /Signer Garage Central/.test(fin.obj), fin.obj);
  /* Mardi : toujours visibles, pas de carte ; lundi suivant : la carte revient */
  await p.clock.setSystemTime(new Date('2026-10-13T09:00:00')); await p.evaluate(() => render()); await p.waitForTimeout(150);
  const mardi = await p.evaluate(() => ({ carte: !!document.querySelector('#carte-revue'), obj: /Signer Garage Central/.test(document.querySelector('#objectifs-semaine')?.innerText || '') }));
  verifier('Mardi 13 : objectifs visibles, pas de carte', !mardi.carte && mardi.obj, JSON.stringify(mardi));
  await p.clock.setSystemTime(new Date('2026-10-19T09:00:00')); await p.evaluate(() => render()); await p.waitForTimeout(150);
  const lundi2 = await p.evaluate(() => ({ carte: !!document.querySelector('#carte-revue'), obj: !!document.querySelector('#objectifs-semaine') }));
  verifier('Lundi 19 : la carte revient, les objectifs de la semaine passée ne s\'affichent plus', lundi2.carte && !lundi2.obj, JSON.stringify(lundi2));
  /* Un seul secteur avec heures et gains : pas de phrase */
  await p.clock.setSystemTime(new Date('2026-10-12T09:00:00'));
  await p.evaluate(() => { state.events = state.events.filter(e => e.id !== 'e2'); save(); ouvrirRevue(); }); await p.waitForTimeout(200);
  verifier('Un seul secteur utile : aucune phrase « Ton heure … vaut »', await p.evaluate(() => !document.querySelector('#r-phrase') && !/vaut/.test(document.querySelector('#revue .r-body').innerText)));
  await p.evaluate(() => quitterRituel()); await p.waitForTimeout(250);
  /* Plus : tuile « Ta semaine » */
  await p.click('#lien-plus'); await p.waitForTimeout(200);
  await p.click('#modal .tuile:has-text("Ta semaine")'); await p.waitForTimeout(250);
  verifier('« Plus » → « Ta semaine » ouvre la revue', await p.evaluate(() => !document.querySelector('#revue').hidden));
  verifier('Pas d\'erreur JS (1)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 2. Samedi 10 octobre : la pastille du KPI mensuel compare au 1er → 10 septembre (espion sur gainsPeriode) */
{
  const donnees = { ...base(), events: [], dossiers: [paye('s1', 'cee', '2026-09-05', 500), paye('s2', 'cee', '2026-09-20', 400), paye('o1', 'energie', '2026-10-03', 900), paye('o2', 'foncier', '2026-10-08', 250)] };
  const { p, erreurs, fermer } = await ouvrir({ largeur: 1366, hauteur: 900, horloge: '2026-10-10T09:00:00', stockage: { [KEY]: donnees } });
  const r = await p.evaluate(() => {
    const appels = [], orig = gainsPeriode;
    window.gainsPeriode = (k, from, to) => { appels.push([from, to]); return orig(k, from, to); };
    const html = pastilleVariation('mois');
    window.gainsPeriode = orig;
    const uniques = [...new Set(appels.map(a => a.join('→')))];
    return { html, uniques, v: variation('tot', 'mois') };
  });
  verifier('Espion : bornes 2026-10-01→2026-10-10 et 2026-09-01→2026-09-10, rien d\'autre', r.uniques.length === 2 && r.uniques.includes('2026-10-01→2026-10-10') && r.uniques.includes('2026-09-01→2026-09-10'), JSON.stringify(r.uniques));
  verifier('variation : 1 150 € contre 500 € (le paiement du 20 septembre ne compte pas)', r.v.a === 1150 && r.v.b === 500 && r.v.diff === 650, JSON.stringify(r.v));
  const k = await p.evaluate(() => { const v = document.querySelector('.kpis .kpi .variation'); return v && { txt: v.textContent.replace(/[  ]/g, ' '), cls: v.className, titre: v.title.replace(/[  ]/g, ' ') }; });
  verifier('KPI « Gagné · ce mois » : pastille noire « +650 € vs au 10 sept. »', k && k.txt === '+650 € vs au 10 sept.' && /hausse/.test(k.cls), JSON.stringify(k));
  const an = await p.evaluate(() => [...document.querySelectorAll('.kpis .kpi')].find(x => /Gagné · année/.test(x.textContent))?.querySelector('.variation'));
  verifier('KPI « Gagné · année » : pas de pastille (rien en 2025)', an === null || an === undefined);
  /* Baisse de plus de 10 % : rouge ; entre -5 et +5 % : argent */
  const cls = await p.evaluate(() => {
    const d = state.dossiers;
    d.find(x => x.id === 'o1').commRecue = 300; d.find(x => x.id === 'o2').commRecue = 100; // 400 contre 500 : -20 %
    const baisse = pastilleVariation('mois');
    d.find(x => x.id === 'o1').commRecue = 400; d.find(x => x.id === 'o2').commRecue = 110; // 510 contre 500 : +2 %
    const stable = pastilleVariation('mois');
    return { baisse, stable };
  });
  verifier('Baisse de 20 % : pastille rouge « −100 € »', /class="variation baisse"/.test(cls.baisse) && /−100/.test(cls.baisse.replace(/[  ]/g, ' ')), cls.baisse);
  verifier('+2 % : pastille argent « +10 € »', /class="variation stable"/.test(cls.stable) && /\+10/.test(cls.stable), cls.stable);
  /* Gains : pastille sous « Gagné » aussi */
  await aller(p, 'gains');
  verifier('#gains : pastille sous « Gagné »', await p.evaluate(() => !!document.querySelector('.kpis .kpi .variation')));
  /* Semaine : lundi → aujourd'hui contre la semaine d'avant, même jour */
  const sem = await p.evaluate(() => bornesComparees('semaine'));
  verifier('Période semaine : 2026-10-05→10 contre 2026-09-28→10-03', JSON.stringify(sem) === JSON.stringify({ cur: ['2026-10-05', '2026-10-10'], prev: ['2026-09-28', '2026-10-03'] }), JSON.stringify(sem));
  const fev = await p.evaluate(() => bornesComparees('mois', new Date(2026, 2, 31)));
  verifier('31 mars : comparé au 1er → 28 février (borné à la fin du mois)', JSON.stringify(fev) === JSON.stringify({ cur: ['2026-03-01', '2026-03-31'], prev: ['2026-02-01', '2026-02-28'] }), JSON.stringify(fev));
  verifier('Pas d\'erreur JS (2)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

bilan();
