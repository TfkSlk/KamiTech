/*
 * Banc d'essai de Kami/Jarvis sans réseau ni clé API : node tests/jarvis.mock.test.mjs
 * Un faux client imite les réponses de claude-opus-5-5 (blocs thinking vides sous display omis,
 * tool_use, refus, erreur de plateforme) et on vérifie ce que api/jarvis.js envoie et renvoie :
 * paramètres conformes au guide de migration Opus 5.5, historique en ajout seul, actions, usage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';

/* Le module lit MODEL / EFFORT / FALLBACKS au chargement : on neutralise l'environnement avant l'import. */
for (const k of ['JARVIS_MODEL', 'JARVIS_EFFORT', 'JARVIS_FALLBACKS']) delete process.env[k];
const { runJarvis, TOOLS } = await import('../api/jarvis.js');

const AUJOURDHUI = '2026-10-23'; // un vendredi ; « mardi » = 2026-10-27
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const BETA_REPLI = 'server-side-fallback-2026-07-01';

/* ---------- Données : la même projection que projection() dans app.js ---------- */
function etat() {
  return {
    resume: {
      gagneMois: 149, attenduMois: 0, tempsMoisMin: 90, gagneAnnee: 1490,
      parSecteurAnnee: { kamifood: { gagne: 1490, tempsMin: 600 }, cee: { gagne: 0, tempsMin: 0 } },
      recurrentMensuelKamiFood: 149, stripe: null, abonnesActifs: 1,
      kamifoodGains: "estimation au prorata des jours d'abonnement",
      dossiersEnCours: 1, contactsARappeler: 1, contactsEnAttente: 1, alertes: [], enRetard: 0,
    },
    formules: [{ id: 'essentiel', nom: 'Essentiel', prix: 79 }, { id: 'pro', nom: 'Pro', prix: 149 }, { id: 'premium', nom: 'Premium', prix: 249 }],
    rdvModele: [{ jours: 0, titre: "Création de l'espace", mode: 'visio', duree: 60 }, { jours: 7, titre: 'Installation sur site', mode: 'place', duree: 120 }],
    memoire: ['Toufek préfère les visios le matin'],
    abonnes: [
      { id: 'ab1', restaurant: 'Garage Central', formule: 'pro', prix: 149, statut: 'actif', debut: '2026-09-01', engagement: 12, contact: 'Luc', tel: '', email: '', ville: 'Strasbourg', notes: '' },
      { id: 'moi', restaurant: 'Kami Groupe', formule: 'pro', prix: 0, statut: 'actif', debut: '2026-01-01', engagement: 0, interne: true },
    ],
    dossiers: [{ id: 'd1', entreprise: 'Boulangerie Muller', activite: 'cee', statut: 'etude', contact: 'M. Muller', ville: 'Schiltigheim', commEstimee: 800, dateRelance: '2026-10-28', notes: '' }],
    events: [{ id: 'e1', titre: 'Point suivi Garage Central', date: '2026-10-24', heure: '10:00', duree: 30, mode: 'visio', activite: 'kamifood', lien: 'a:ab1', fait: false, notes: '' }],
    aVoir: [{ id: 'c1', nom: 'Karim', entreprise: 'Karim SARL', activite: 'foncier', historique: [{ date: '2026-10-20', texte: 'Taxe foncière, il m\'envoie ses avis' }], attente: 'lui', rappel: AUJOURDHUI, statut: 'suivi', priorite: 'normale', tel: '', email: '', ville: '', lien: '', notes: '', eventId: '', tentatives: 0 }],
  };
}
/* Le corps tel que jarvisEnvoyer() l'envoie dans app.js */
function corps(messages, mode = 'text') {
  const now = new Date(`${AUJOURDHUI}T09:30:00`);
  return { messages, state: etat(), mode, nom: 'Kami', aujourdhui: AUJOURDHUI, heure: '09:30', now: now.toISOString() };
}

/* ---------- Faux client : rejoue un scénario (réponses ou erreurs) et enregistre les params ----------
   Copie profonde à la capture : runJarvis mute le même tableau `messages` d'un tour à l'autre. */
function fauxClient(scenario) {
  const appels = [];
  const file = [...scenario];
  const create = async params => {
    appels.push(structuredClone(params));
    const suivant = file.shift();
    if (!suivant) throw new Error('faux client : aucune réponse prévue pour cet appel');
    if (suivant instanceof Error) throw suivant;
    return suivant;
  };
  return { client: { beta: { messages: { create } } }, appels };
}

/* Une réponse à l'image de claude-opus-5-5 */
const reponse = (content, stop_reason, usage = {}, extra = {}) => ({
  id: 'msg_' + Math.random().toString(36).slice(2, 10), type: 'message', role: 'assistant', model: 'claude-opus-5-5',
  content, stop_reason, stop_sequence: null, stop_details: null,
  usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...usage },
  ...extra,
});
/* Sous display omis (défaut sur Opus 5.5), le bloc thinking revient avec un texte vide et une signature */
const pensee = sig => ({ type: 'thinking', thinking: '', signature: sig });

/* Vérifications communes aux paramètres d'un appel (guide « Migrating to Claude Opus 5.5 ») */
function verifierParams(p, { repli = true } = {}) {
  assert.equal(p.model, 'claude-opus-5-5', 'modèle');
  assert.equal(p.max_tokens, 16000, 'max_tokens dimensionné réflexion + réponse');
  assert.deepEqual(p.thinking, { type: 'adaptive' }, 'thinking adaptive, sans budget_tokens ni disabled');
  assert.ok(p.output_config && EFFORTS.includes(p.output_config.effort), `output_config.effort explicite (${p.output_config?.effort})`);
  assert.equal(p.output_config.effort, 'medium', 'effort par défaut du code = medium (explicite, pas hérité du défaut API)');
  assert.ok(!('tool_choice' in p), 'aucun tool_choice (forcé = 400 sur Opus 5.5)');
  for (const k of ['temperature', 'top_p', 'top_k']) assert.ok(!(k in p), `pas de ${k}`);
  assert.ok(Array.isArray(p.tools) && p.tools.length === TOOLS.length, 'les outils sont déclarés');
  assert.deepEqual(p.tools.map(t => t.name), TOOLS.map(t => t.name), 'mêmes outils, même ordre (préfixe stable)');
  assert.ok(Array.isArray(p.system) && p.system.length === 2, 'system = [persona, contexte]');
  assert.deepEqual(p.system[0].cache_control, { type: 'ephemeral' }, 'persona mise en cache');
  assert.ok(p.system[1].text.includes(`(${AUJOURDHUI})`) && p.system[1].text.includes('09:30'), 'le contexte porte la date et l\'heure envoyées');
  if (repli) {
    assert.deepEqual(p.betas, [BETA_REPLI], 'beta du repli serveur');
    assert.equal(p.fallbacks, 'default', 'fallbacks "default"');
  } else {
    assert.ok(!('fallbacks' in p), 'plus de fallbacks');
    assert.ok(!('betas' in p), 'plus de betas');
  }
}

/* ============================================================ */
test('boucle d\'outils : ajouter_rdv puis réponse finale (historique en ajout seul)', async () => {
  const outil = TOOLS.find(t => t.name === 'ajouter_rdv');
  assert.ok(outil, 'ajouter_rdv existe dans TOOLS');
  assert.deepEqual(outil.input_schema.required, ['titre', 'date', 'activite']);
  const entree = { titre: 'Visio Garage Central', date: '2026-10-27', heure: '14:00', mode: 'visio', activite: 'kamifood', lien: 'a:ab1' };
  for (const k of Object.keys(entree)) assert.ok(k in outil.input_schema.properties, `champ ${k} prévu par le schéma`);

  const r1 = reponse(
    [pensee('sig_tour1'), { type: 'text', text: 'Je regarde le planning de mardi.' }, { type: 'tool_use', id: 'toolu_01', name: 'ajouter_rdv', input: entree }],
    'tool_use', { input_tokens: 1200, output_tokens: 180, cache_creation_input_tokens: 2500 },
  );
  const r2 = reponse(
    [pensee('sig_tour2'), { type: 'text', text: "C'est noté : visio avec Garage Central mardi 27 octobre à 14h (30 min)." }],
    'end_turn', { input_tokens: 300, output_tokens: 60, cache_read_input_tokens: 2500 },
  );
  const { client, appels } = fauxClient([r1, r2]);
  const question = { role: 'user', content: 'Mets une visio avec Garage Central mardi à 14h' };
  const out = await runJarvis(corps([question]), client);

  assert.equal(appels.length, 2, 'deux appels au modèle');
  const [p1, p2] = appels;
  verifierParams(p1);
  verifierParams(p2);
  assert.ok(p1.system[1].text.includes('Mode : texte'), 'mode texte dans le contexte');
  assert.ok(p1.system[1].text.includes('Garage Central'), 'les données projetées sont dans le contexte');
  assert.deepEqual(p1.messages, [question], 'premier appel : la seule question de Toufek');

  /* Préfixe byte-identique entre les deux appels (cache + thinking préservé) */
  assert.equal(JSON.stringify(p2.system), JSON.stringify(p1.system), 'system identique au 2e appel');
  assert.equal(JSON.stringify(p2.tools), JSON.stringify(p1.tools), 'tools identiques au 2e appel');
  /* Historique en ajout seul : question, puis le content complet de la 1re réponse (thinking compris), puis le tool_result */
  assert.equal(p2.messages.length, 3);
  assert.deepEqual(p2.messages[0], p1.messages[0], 'le préfixe est conservé tel quel');
  assert.deepEqual(p2.messages[1], { role: 'assistant', content: r1.content }, 'content complet de la 1re réponse, bloc thinking vide + signature compris');
  assert.equal(p2.messages[2].role, 'user');
  assert.equal(p2.messages[2].content.length, 1, 'un tool_result par tool_use, dans un seul message user');
  const tr = p2.messages[2].content[0];
  assert.equal(tr.type, 'tool_result');
  assert.equal(tr.tool_use_id, 'toolu_01');
  assert.ok(!tr.is_error, 'pas d\'erreur d\'outil');
  const res = JSON.parse(tr.content);
  assert.equal(res.ok, true);
  assert.equal(res.client, 'Garage Central', 'le lien a:ab1 est résolu');
  assert.equal(res.rdv.lieu, 'Strasbourg', 'lieu par défaut = ville de l\'abonné lié');

  /* Sortie */
  assert.equal(out.texte, "C'est noté : visio avec Garage Central mardi 27 octobre à 14h (30 min).", 'texte final = blocs text de la dernière réponse');
  assert.equal(out.modele, 'claude-opus-5-5');
  assert.equal(out.actions.length, 1, 'une action à rejouer côté client');
  const a = out.actions[0];
  assert.equal(a.op, 'add'); assert.equal(a.collection, 'events');
  assert.ok(typeof a.item.id === 'string' && a.item.id, 'id généré');
  assert.equal(a.item.titre, 'Visio Garage Central');
  assert.equal(a.item.date, '2026-10-27'); assert.equal(a.item.heure, '14:00');
  assert.equal(a.item.mode, 'visio'); assert.equal(a.item.duree, 30);
  assert.equal(a.item.activite, 'kamifood'); assert.equal(a.item.lien, 'a:ab1'); assert.equal(a.item.lieu, 'Strasbourg');
  assert.equal(a.item.fait, false); assert.equal(a.item.important, false);
  assert.deepEqual(out.usage, { input: 1500, output: 240, cache: 2500 }, 'usage cumulé, cache_read_input_tokens compris');
});

test('stop_reason refusal : message de refus, aucune action, un seul appel', async () => {
  const refus = reponse([], 'refusal', { input_tokens: 900, output_tokens: 0 },
    { stop_details: { type: 'refusal', category: 'cyber', explanation: 'Déclinée par un classifieur.' } });
  const { client, appels } = fauxClient([refus]);
  const out = await runJarvis(corps([{ role: 'user', content: 'Fais-moi un truc interdit' }]), client);
  assert.equal(appels.length, 1);
  verifierParams(appels[0]);
  assert.equal(out.texte, 'Je ne peux pas répondre à ça.');
  assert.deepEqual(out.actions, []);
  assert.equal(out.modele, 'claude-opus-5-5');
  assert.deepEqual(out.usage, { input: 900, output: 0, cache: 0 });
});

test('BadRequestError mentionnant « fallback » au 1er appel : 2e appel sans fallbacks ni betas', async () => {
  const message = 'fallbacks: Extra inputs are not permitted';
  const erreur = new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message } }, message, new Headers());
  assert.ok(erreur instanceof Anthropic.BadRequestError && /fallback/i.test(erreur.message), 'prémisse : erreur 400 typée dont le message parle de fallback');
  const fin = reponse([pensee('sig_a'), { type: 'text', text: 'Demain tu as un point de suivi avec Garage Central à dix heures.' }], 'end_turn', { input_tokens: 1000, output_tokens: 40 });
  const { client, appels } = fauxClient([erreur, fin]);
  const out = await runJarvis(corps([{ role: 'user', content: "Qu'est-ce que j'ai demain ?" }], 'voice'), client);
  assert.equal(appels.length, 2, 'un seul nouvel essai');
  verifierParams(appels[0], { repli: true });
  verifierParams(appels[1], { repli: false });
  assert.deepEqual(appels[1].messages, appels[0].messages, 'la même conversation est renvoyée');
  assert.ok(appels[1].system[1].text.includes('VOIX'), 'mode voix dans le contexte');
  assert.equal(out.texte, 'Demain tu as un point de suivi avec Garage Central à dix heures.');
  assert.deepEqual(out.actions, []);
  assert.deepEqual(out.usage, { input: 1000, output: 40, cache: 0 }, 'l\'appel refusé ne compte pas dans l\'usage');
});

test('autre BadRequestError (sans « fallback ») : propagée telle quelle', async () => {
  const message = 'messages: text content blocks must be non-empty';
  const erreur = new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message } }, message, new Headers());
  const { client, appels } = fauxClient([erreur]);
  await assert.rejects(runJarvis(corps([{ role: 'user', content: 'Bonjour' }]), client), e => e === erreur);
  assert.equal(appels.length, 1, 'pas de nouvel essai');
});

test('outil en échec : tool_result is_error, la boucle continue, aucune action', async () => {
  const r1 = reponse([pensee('sig_1'), { type: 'tool_use', id: 'toolu_09', name: 'agenda', input: { du: 'demain', au: 'après-demain' } }], 'tool_use', { input_tokens: 500, output_tokens: 50 });
  const r2 = reponse([pensee('sig_2'), { type: 'text', text: 'Je n\'ai pas pu lire l\'agenda sur ces dates.' }], 'end_turn', { input_tokens: 600, output_tokens: 30, cache_read_input_tokens: 2500 });
  const { client, appels } = fauxClient([r1, r2]);
  const out = await runJarvis(corps([{ role: 'user', content: 'Mon agenda de demain ?' }]), client);
  assert.equal(appels.length, 2);
  const tr = appels[1].messages[2].content[0];
  assert.equal(tr.type, 'tool_result'); assert.equal(tr.tool_use_id, 'toolu_09'); assert.equal(tr.is_error, true);
  assert.match(tr.content, /AAAA-MM-JJ/);
  assert.deepEqual(appels[1].messages[1], { role: 'assistant', content: r1.content });
  assert.deepEqual(out.actions, []);
  assert.equal(out.texte, 'Je n\'ai pas pu lire l\'agenda sur ces dates.');
  assert.deepEqual(out.usage, { input: 1100, output: 80, cache: 2500 });
});

test('validation du corps : dernier message doit venir de Toufek', async () => {
  const { client, appels } = fauxClient([]);
  await assert.rejects(runJarvis(corps([{ role: 'user', content: 'Salut' }, { role: 'assistant', content: 'Salut Toufek.' }]), client), /dernier message/);
  await assert.rejects(runJarvis(corps([]), client), /messages manquants/);
  assert.equal(appels.length, 0, 'aucun appel au modèle');
});

/* ---------- Fenêtre glissante du client : elle peut commencer par une réponse de Kami ---------- */
test('historique qui commence par Kami : Kami est retiré en tête, le premier message envoyé vient de Toufek', async () => {
  const appels = [];
  const client = { beta: { messages: { create: async params => { appels.push(structuredClone(params)); return { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Bien reçu.' }], usage: { input_tokens: 10, output_tokens: 5 } }; } } } };
  const messages = [];
  for (let i = 0; i < 10; i++) { messages.push({ role: 'user', content: `question ${i}` }, { role: 'assistant', content: `réponse ${i}` }); }
  messages.push({ role: 'user', content: 'question 10' });
  const r = await runJarvis({ messages: messages.slice(-20), state: etat(), mode: 'text', aujourdhui: AUJOURDHUI, heure: '09:30' }, client);
  assert.equal(appels.length, 1);
  assert.equal(appels[0].messages[0].role, 'user');
  assert.equal(appels[0].messages[0].content, 'question 1');
  assert.equal(appels[0].messages.at(-1).content, 'question 10');
  assert.equal(r.texte, 'Bien reçu.');
});

/* ---------- Sortie sans réponse finale : pas de « C'est fait » pour ce qui n'a pas été fait ---------- */
test('réponse coupée (max_tokens) avec un outil non exécuté : le message le dit, sans « C\'est fait »', async () => {
  const client = { beta: { messages: { create: async () => ({ model: 'claude-opus-5-5', stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }, { type: 'tool_use', id: 't1', name: 'ajouter_rdv', input: {} }], usage: { input_tokens: 10, output_tokens: 5 } }) } } };
  const r = await runJarvis({ messages: [{ role: 'user', content: 'cale un rdv' }], state: etat(), mode: 'text', aujourdhui: AUJOURDHUI, heure: '09:30' }, client);
  assert.equal(r.actions.length, 0);
  assert.match(r.texte, /arrêté avant la fin/);
  assert.doesNotMatch(r.texte, /C'est fait/);
});
