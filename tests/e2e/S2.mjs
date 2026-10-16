/* S2 — Ne rien perdre, même appli fermée : rappels dans l'agenda du téléphone (.ics), sauvegarde en un geste */
import { ouvrir, verifier, bilan, RACINE } from './outil.mjs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(RACINE, 'package.json'));
const ICAL = require('ical.js');
const aller = async (p, h) => { await p.evaluate(x => { location.hash = '#' + x; }, h); await p.waitForTimeout(250); };

/* 1. Le fichier .ics des 7 prochains jours (données d'exemple) */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge: '2026-10-10T09:00:00', exemple: true });
  await p.evaluate(() => {
    state.events.push({ id: 'imp1', date: '2026-10-13', heure: '10:00', duree: 60, mode: 'place', titre: 'Signature, notaire; étude « Weber », dossier\\CEE', activite: 'foncier', important: true, fait: false, notes: 'Apporter les avis\net le RIB', lieu: 'Strasbourg' });
    state.events.push({ id: 'per1', date: '2026-10-12', fin: '2026-10-30', titre: 'Campagne CEE', activite: 'cee', mode: 'tache', duree: 0, heure: '', fait: false, notes: '' });
    state.events.push({ id: 'tard', date: '2026-10-11', heure: '23:30', duree: 90, mode: 'visio', titre: 'Visio tardive avec un titre assez long pour devoir être plié sur plusieurs lignes du fichier iCalendar', activite: 'perso', fait: false, notes: '' });
    save();
  });
  const txt = await p.evaluate(() => ics(sept()));
  const lignes = txt.split('\r\n');
  verifier('BEGIN:VCALENDAR … END:VCALENDAR', txt.startsWith('BEGIN:VCALENDAR\r\n') && txt.endsWith('END:VCALENDAR\r\n'));
  verifier('Toutes les lignes finissent par CRLF (pas de \\n seul)', !/[^\r]\n/.test(txt) && txt.endsWith('\r\n'));
  const longues = lignes.filter(l => Buffer.byteLength(l, 'utf8') > 75);
  verifier('Aucune ligne de plus de 75 octets', longues.length === 0, longues.slice(0, 2).join(' | '));
  const evs = txt.split('BEGIN:VEVENT').slice(1).map(b => b.split('END:VEVENT')[0]);
  const deplie = s => s.replace(/\r\n /g, '');
  const champ = (b, k) => (deplie(b).split('\r\n').find(l => l.startsWith(k + ':') || l.startsWith(k + ';')) || '').replace(/^[^:]+:/, '');
  verifier(`Chaque VEVENT (${evs.length}) a DTSTART différent de DTEND`, evs.length >= 5 && evs.every(b => champ(b, 'DTSTART') && champ(b, 'DTEND') && champ(b, 'DTSTART') !== champ(b, 'DTEND')), JSON.stringify(evs.map(b => [champ(b, 'DTSTART'), champ(b, 'DTEND')])));
  const imp = evs.find(b => /UID:imp1@kgd/.test(b));
  verifier('RDV important : exactement 2 alarmes (veille 18 h en UTC, puis 1 h avant)', imp && (imp.match(/BEGIN:VALARM/g) || []).length === 2 && /TRIGGER;VALUE=DATE-TIME:20261012T160000Z/.test(imp) && /TRIGGER:-PT1H/.test(imp), imp);
  verifier('Texte échappé (virgule, point-virgule, antislash, retour à la ligne)', /SUMMARY:Signature\\, notaire\\; étude « Weber »\\, dossier\\\\CEE/.test(deplie(imp)) && /Apporter les avis\\net le RIB/.test(deplie(imp)), deplie(imp).split('\r\n').filter(l => /SUMMARY|DESCRIPTION/.test(l)).join(' | '));
  const per = evs.find(b => /UID:per1@kgd/.test(b));
  verifier('Période : dates entières, fin au lendemain', /DTSTART;VALUE=DATE:20261012/.test(per) && /DTEND;VALUE=DATE:20261031/.test(per), per);
  const tard = evs.find(b => /UID:tard@kgd/.test(b));
  verifier('RDV qui passe minuit : fin le lendemain à 01:00, alarme 15 min avant', /DTSTART:20261011T233000/.test(tard) && /DTEND:20261012T010000/.test(tard) && /TRIGGER:-PT15M/.test(tard), deplie(tard));
  const rappel = evs.find(b => /SUMMARY:☎ Rappeler/.test(deplie(b)));
  verifier('Rappel de contact : 9 h – 9 h 15, alarme à l\'heure', rappel && /DTSTART:\d{8}T090000/.test(rappel) && /DTEND:\d{8}T091500/.test(rappel) && /TRIGGER:PT0M/.test(rappel), rappel);
  /* Validateur iCalendar (ical.js) */
  let ok = true, detail = '';
  try {
    const comp = new ICAL.Component(ICAL.parse(txt));
    const vevents = comp.getAllSubcomponents('vevent');
    vevents.forEach(v => { const e = new ICAL.Event(v); if (!e.startDate || !e.endDate || e.endDate.compare(e.startDate) <= 0) throw new Error('dates ' + e.uid); });
    detail = `${vevents.length} VEVENT lus`;
    ok = vevents.length === evs.length;
  } catch (e) { ok = false; detail = e.message; }
  verifier('Le fichier passe le validateur ical.js', ok, detail);
  /* Export : un téléchargement kgd-2026-10-10.ics (sans feuille de partage) */
  await aller(p, 'planning');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('.agenda-tel')]);
  const contenu = readFileSync(await dl.path(), 'utf8');
  verifier('Planning au téléphone : « Mettre les 7 prochains jours dans mon agenda » télécharge kgd-2026-10-10.ics', dl.suggestedFilename() === 'kgd-2026-10-10.ics' && contenu.startsWith('BEGIN:VCALENDAR'), dl.suggestedFilename());
  /* Fiche RDV : « Mettre dans mon agenda » */
  await p.evaluate(() => openEvent('imp1')); await p.waitForTimeout(250);
  await p.click('#modal .sheet-plus'); await p.waitForTimeout(100);
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('#modal .sheet-menu button:has-text("Mettre dans mon agenda")')]);
  const c2 = readFileSync(await dl2.path(), 'utf8');
  verifier('Fiche RDV : un .ics avec ce seul RDV', dl2.suggestedFilename() === 'kgd-2026-10-13.ics' && (c2.match(/BEGIN:VEVENT/g) || []).length === 1, dl2.suggestedFilename());
  await p.evaluate(() => fermerModal());
  verifier('Pas d\'erreur JS (1)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 2. Sauvegarde en un geste, relance douce, réimport identique */
{
  const KEY = 'kami-dashboard-v1';
  const huitJours = new Date(new Date('2026-10-10T09:00:00').getTime() - 8 * 864e5).toISOString();
  const donnees = { nom: 'Kami Groupe', dossiers: [{ id: 'd1', entreprise: 'Garage Est', activite: 'cee', statut: 'etude', commEstimee: 1200, createdAt: 1, historique: [] }], events: [], abonnes: [], memoire: [], formules: [], rdvModele: [],
    aVoir: [{ id: 'v1', createdAt: 1, nom: 'Julien', entreprise: '', activite: 'energie', priorite: 'normale', statut: 'suivi', attente: '', rappel: '2026-10-12', tel: '', lien: '', notes: '', historique: [{ date: '2026-10-01', texte: 'Échange' }] }],
    prefs: { periode: 'mois', theme: 'light', dernierExport: huitJours, migrations: { rappelsRecuperes: true, dureesPeriodes: true, resilieSansFin: true, dedoublonMoi: true, paiementPrevu: true, historiqueDossiers: true } } };
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge: '2026-10-10T09:00:00', stockage: { [KEY]: donnees } });
  const r1 = await p.evaluate(() => document.querySelector('#rappel-sauvegarde')?.innerText.replace(/\s+/g, ' ') || '');
  verifier('Dernier export à J-8 : « Dernière sauvegarde il y a 8 j · Sauvegarder » sur l\'accueil', /Dernière sauvegarde il y a 8 j/.test(r1) && /Sauvegarder/.test(r1), r1);
  const avant = await p.evaluate(() => JSON.stringify(state));
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('#rappel-sauvegarde button:has-text("Sauvegarder")')]);
  await p.waitForTimeout(250);
  const fichier = readFileSync(await dl.path(), 'utf8');
  verifier('« Sauvegarder » : téléchargement KGD-2026-10-10.json', dl.suggestedFilename() === 'KGD-2026-10-10.json', dl.suggestedFilename());
  const apres = await p.evaluate(() => ({ ligne: !!document.querySelector('#rappel-sauvegarde'), der: state.prefs.dernierExport, modifs: state.prefs.modifsDepuisExport }));
  verifier('Après la sauvegarde : la ligne disparaît, export daté d\'aujourd\'hui, compteur à 0', !apres.ligne && apres.der.startsWith('2026-10-10') && apres.modifs === 0, JSON.stringify(apres));
  const sans = s => { const o = JSON.parse(s); delete o.prefs.dernierExport; delete o.prefs.modifsDepuisExport; delete o.prefs.snoozeSauvegarde; return JSON.stringify(o); };
  verifier('Le fichier contient exactement l\'état (hors dates d\'export)', sans(fichier) === sans(avant));
  /* Réimport : même état */
  await p.evaluate(t => { importer(new File([t], 'KGD-2026-10-10.json', { type: 'application/json' })); }, fichier);
  await p.waitForTimeout(250);
  await p.click('#confirm-ok'); await p.waitForTimeout(300);
  const reimporte = await p.evaluate(() => JSON.stringify(state));
  verifier('Réimporter redonne le même état (hors dernierExport et modifsDepuisExport)', sans(reimporte) === sans(avant), sans(reimporte).slice(0, 200));
  /* Le compteur de modifications monte à chaque enregistrement ; au-delà de 25, la ligne revient */
  await p.evaluate(() => { state.prefs.dernierExport = new Date().toISOString(); state.prefs.modifsDepuisExport = 0; for (let i = 0; i < 26; i++) save(); render(); });
  const r2 = await p.evaluate(() => ({ n: state.prefs.modifsDepuisExport, ligne: document.querySelector('#rappel-sauvegarde')?.innerText.replace(/\s+/g, ' ') || '' }));
  verifier('26 enregistrements depuis la sauvegarde : la ligne revient (« 26 modifications depuis »)', r2.n === 26 && /26 modifications depuis/.test(r2.ligne), JSON.stringify(r2));
  /* « Plus tard » : masquée 24 h */
  await p.click('#rappel-sauvegarde .masquer'); await p.waitForTimeout(200);
  verifier('« Plus tard » : la ligne est masquée', !(await p.evaluate(() => !!document.querySelector('#rappel-sauvegarde'))));
  await p.clock.fastForward(25 * 3600e3); await p.evaluate(() => render()); await p.waitForTimeout(100);
  verifier('24 h plus tard, elle revient', await p.evaluate(() => !!document.querySelector('#rappel-sauvegarde')));
  /* Réglages : carte Sauvegarde en tête, sans défilement, rouge au-delà de 14 jours */
  await p.evaluate(() => { state.prefs.dernierExport = new Date(Date.now() - 15 * 864e5).toISOString(); save(false); });
  await aller(p, 'parametres');
  const c = await p.evaluate(() => { const k = document.querySelector('.settings > .card'); return { titre: k.querySelector('h2').textContent, rouge: k.classList.contains('rouge'), txt: k.querySelector('.etat-sauvegarde').textContent, defile: k.scrollHeight > k.clientHeight + 1, bouton: !!k.querySelector('button.primary') && k.querySelector('button.primary').textContent }; });
  verifier('Réglages : carte Sauvegarde en tête, rouge à 15 jours, sans défilement, bouton « Sauvegarder »', c.titre === 'Sauvegarde' && c.rouge && /il y a 15 j/.test(c.txt) && !c.defile && c.bouton === 'Sauvegarder', JSON.stringify(c));
  verifier('Pas d\'erreur JS (2)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 3. Avec la feuille de partage du téléphone : le fichier part par navigator.share */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge: '2026-10-10T09:00:00', exemple: true });
  await p.evaluate(() => { window.__partage = []; navigator.canShare = o => !!(o && o.files); navigator.share = async o => { window.__partage.push(o.files.map(f => [f.name, f.type])); }; });
  await p.evaluate(() => sauvegarder()); await p.waitForTimeout(200);
  const s = await p.evaluate(() => ({ p: window.__partage, toast: document.querySelector('#toast').textContent }));
  verifier('Avec le partage : KGD-2026-10-10.json envoyé par la feuille de partage', JSON.stringify(s.p) === '[[["KGD-2026-10-10.json","application/json"]]]' && /Sauvegarde envoyée/.test(s.toast), JSON.stringify(s));
  await p.evaluate(() => { navigator.share = async () => { throw Object.assign(new Error('annulé'), { name: 'AbortError' }); }; state.prefs.dernierExport = ''; save(false); });
  await p.evaluate(() => sauvegarder()); await p.waitForTimeout(200);
  verifier('Partage annulé : rien n\'est noté comme sauvegardé', await p.evaluate(() => !state.prefs.dernierExport));
  verifier('Pas d\'erreur JS (3)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

bilan();
