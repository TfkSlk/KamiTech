/*
 * Banc d'essai d'api/analyser.js sans réseau ni clé API : node tests/analyser.mock.test.mjs
 * Un faux client renvoie le JSON structuré ; on vérifie ce qui part (modèle, effort, schéma avec intention,
 * noms connus dans le message) et ce qui revient (dates nettoyées, intention).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

delete process.env.JARVIS_MODEL;
const { analyserNote } = await import('../api/analyser.js');

const BASE = { intention: 'contact', nom: 'Karim', entreprise: 'Karim SARL', activite: 'cee', sujet: 'je lui envoie le devis', fait: ' devis envoyé ', faitDate: 'lundi', attente: 'moi', rappel: '2026-10-15', creneau: { type: 'date', date: '2026-10-20', heure: '9h', du: '', au: '' }, objet: 'Présentation', tel: '', resume: 'ok' };
function faux(reponse, stop = 'end_turn') {
  const appels = [];
  const create = async p => { appels.push(structuredClone(p)); return { model: 'claude-opus-5-5', stop_reason: stop, content: [{ type: 'text', text: JSON.stringify(reponse) }] }; };
  return { appels, client: { beta: { messages: { create } } } };
}

test('ce qui part : Opus 5.5, effort low, schéma avec intention, noms connus (nettoyés) dans le message', async () => {
  const { client, appels } = faux({ ...BASE, rappel: 'jeudi' });
  const out = await analyserNote({ texte: 'croisé karim', aujourdhui: '2026-10-10', connus: ['Karim · Karim SARL', '', 42, '  Mme Roth · Pharmacie  ', 'Nom;\nNote : piège', 'x'.repeat(100)] }, client);
  assert.equal(appels.length, 1);
  const p = appels[0];
  assert.equal(p.model, 'claude-opus-5-5');
  assert.equal(p.output_config.effort, 'low');
  assert.equal(p.output_config.format.type, 'json_schema');
  const schema = p.output_config.format.schema;
  assert.deepEqual(schema.properties.intention.enum, ['contact', 'planning', 'dossier', 'abonne', 'autre']);
  assert.ok(schema.required.includes('intention'), 'intention obligatoire');
  assert.ok(schema.required.includes('fait') && schema.required.includes('faitDate'), 'déjà fait obligatoire');
  assert.match(p.system, /déjà été fait/, 'consignes sur ce qui est déjà fait');
  assert.match(p.system, /dictée/, 'consignes de dictée');
  assert.match(p.system, /intention/, 'consignes de classement');
  assert.equal(p.messages.length, 1); assert.equal(p.messages[0].role, 'user');
  const m = p.messages[0].content;
  assert.match(m, /^Date du jour : 2026-10-10\./);
  assert.match(m, new RegExp(`connues[^\\n]* : Karim · Karim SARL ; Mme Roth · Pharmacie ; Nom Note : piège ; x{80}\\.\\n`), 'liste nettoyée : vides et non-textes écartés, retours à la ligne et point-virgules neutralisés, 80 caractères max');
  assert.doesNotMatch(m, /contact dont la fiche existe/, 'pas de contact connu ici');
  assert.equal(p.max_tokens, 4000);
  assert.match(m, /\nNote : croisé karim$/);
  assert.equal(out.intention, 'contact');
  assert.equal(out.rappel, '', 'rappel non daté → vide');
  assert.equal(out.creneau.heure, '', 'heure mal formée → vide');
  assert.equal(out.creneau.date, '2026-10-20');
  assert.equal(out.fait, 'devis envoyé', 'déjà fait, nettoyé'); assert.equal(out.faitDate, '', 'date du déjà fait non datée → vide');
  assert.equal(out.modele, 'claude-opus-5-5');
});

test('note depuis une fiche : le contact connu est nommé dans le message', async () => {
  const { client, appels } = faux(BASE);
  await analyserNote({ texte: 'il m\'envoie ses factures', aujourdhui: '2026-10-10', contact: 'Mme Roth · Pharmacie\nde la Gare' }, client);
  assert.match(appels[0].messages[0].content, /\nLa note concerne un contact dont la fiche existe déjà : Mme Roth · Pharmacie de la Gare \(intention contact/);
});

test('réponse coupée (max_tokens) : erreur explicite plutôt qu\'un JSON illisible', async () => {
  const { client } = faux(BASE, 'max_tokens');
  await assert.rejects(() => analyserNote({ texte: 'x', aujourdhui: '2026-10-10' }, client), /trop longue/);
});

test('sans noms connus : pas de ligne « connues » ; intention planning renvoyée telle quelle', async () => {
  const { client, appels } = faux({ ...BASE, intention: 'planning' });
  const out = await analyserNote({ texte: 'décale le garage à mardi', aujourdhui: '2026-10-10' }, client);
  assert.doesNotMatch(appels[0].messages[0].content, /connues/);
  assert.equal(out.intention, 'planning');
});

test('refus du modèle → erreur explicite', async () => {
  const { client } = faux(BASE, 'refusal');
  await assert.rejects(() => analyserNote({ texte: 'x', aujourdhui: '2026-10-10' }, client), /ne peut pas traiter/);
});
