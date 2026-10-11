/*
 * Banc d'essai du lecteur local, sans navigateur : node tests/lire.test.mjs
 * Évalue lire.js puis tests/cas.js dans un contexte { window: {} } (comme dans la page), lance chaque cas,
 * mesure la lecture d'une phrase de 200 caractères, et sort avec le code 1 au moindre échec.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contexte = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(racine, 'lire.js'), 'utf8'), contexte, { filename: 'lire.js' });
vm.runInNewContext(fs.readFileSync(path.join(racine, 'tests', 'cas.js'), 'utf8'), contexte, { filename: 'tests/cas.js' });
const { Lire, CAS_LIRE } = contexte.window;

let echecs = 0;
const noter = (ok, texte) => { if (!ok) echecs++; console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${texte}`); };

noter(!!Lire && ['lireNote', 'normaliser', 'scoreFlou', 'jourOuvre', 'premierNom'].every(k => typeof Lire[k] === 'function'),
  'window.Lire expose lireNote, normaliser, scoreFlou, jourOuvre, premierNom');
noter(Object.keys(contexte).filter(k => k !== 'window').length === 0, 'aucune globale nue en dehors de window');

const resultats = CAS_LIRE.executer(Lire);
for (const r of resultats) {
  if (r.ecarts.length) { echecs++; console.log(`ÉCHEC « ${r.note} »${r.ignores ? ` (ignorés : ${r.ignores.join(', ')})` : ''}\n       ${r.ecarts.join('\n       ')}`); }
}
const verts = resultats.filter(r => !r.ecarts.length).length;
noter(verts === resultats.length && resultats.length >= 45, `${verts}/${resultats.length} cas verts (au moins 45)`);

/* Outils exposés */
noter(Lire.normaliser("Début Électricité Pompe à chaleur l’été") === "debut electricite pompe a chaleur l'ete", 'normaliser : minuscules, sans accents, apostrophe droite');
noter(Lire.normaliser('Écrit À Noël').length === 'Écrit À Noël'.length, 'normaliser garde la longueur (positions des jetons)');
const sf = [Lire.scoreFlou('Mme Roth', 'Mme Roth'), Lire.scoreFlou('Roth', 'Mme Roth'), Lire.scoreFlou('Rot', 'Mme Roth'), Lire.scoreFlou('oth', 'Mme Roth'), Lire.scoreFlou('mrth', 'Mme Roth'), Lire.scoreFlou('Zoé', 'Mme Roth')];
noter(sf[0] === 1 && sf[1] >= 0.8 && sf[1] > sf[2] && sf[2] > sf[3] && sf[3] > sf[4] && sf[4] > 0 && sf[5] === 0,
  `scoreFlou : identique > début de mot > sous-chaîne > lettres dans l'ordre (${sf.map(x => x.toFixed(2)).join(' > ')})`);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
noter(iso(Lire.jourOuvre('2026-10-10')) === '2026-10-12' && iso(Lire.jourOuvre('2026-10-11')) === '2026-10-12' && iso(Lire.jourOuvre('2026-10-13')) === '2026-10-13', 'jourOuvre : samedi et dimanche glissent au lundi');
noter(Lire.premierNom('croisé Karim de Karim SARL, KGD Pro') === 'Karim' && Lire.premierNom('Mme Roth : avis de taxe') === 'Mme Roth' && Lire.premierNom('visite du salon, super') === 'visite du salon',
  'premierNom : le nom deviné, sinon le début de la note');
const schema = Lire.lireNote('', CAS_LIRE.ref);
noter(JSON.stringify(Object.keys(schema)) === JSON.stringify(['nom', 'entreprise', 'activite', 'sujet', 'attente', 'rappel', 'creneau', 'objet', 'tel', 'resume', 'important', 'existant', 'jetons'])
  && JSON.stringify(Object.keys(schema.creneau)) === JSON.stringify(['type', 'date', 'heure', 'du', 'au']), "schéma d'api/analyser.js, plus important, existant et jetons");
noter(Lire.lireNote('rappelle-moi jeudi', new Date(2026, 9, 10, 9, 0)).rappel === '2026-10-15', 'ref peut être une Date (heure locale)');

/* Vitesse : une phrase de 200 caractères, moyenne sur 100 lectures */
const phrase = CAS_LIRE.phrase200;
const t0 = performance.now();
for (let i = 0; i < 100; i++) Lire.lireNote(phrase, CAS_LIRE.ref, [{ type: 'c', id: 'x1', nom: 'Mme Roth', entreprise: 'Pharmacie de la Gare', activite: 'foncier' }]);
const moyenne = (performance.now() - t0) / 100;
noter(phrase.length === 200 && moyenne < 5, `phrase de ${phrase.length} caractères lue en ${moyenne.toFixed(3)} ms en moyenne (< 5 ms)`);

console.log(`\n${echecs ? `${echecs} échec(s)` : 'Tout est vert'} · ${verts}/${resultats.length} cas`);
process.exitCode = echecs ? 1 : 0;
