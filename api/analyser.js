/*
 * Analyse d'une note de prise de contact : Kami lit la phrase de Toufek
 * (« croisé Karim de Karim SARL, on a parlé du KGD Pro, je lui envoie le dossier,
 * rappelle-moi dans 3 jours, à voir début 2027 ») et renvoie les champs du formulaire.
 * Protégé par le jeton Kami ; ne stocke rien.
 */
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.JARVIS_MODEL || 'claude-opus-5-5';
const SECTEURS = ['kamifood', 'kgdpro', 'cee', 'energie', 'foncier', 'perso'];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intention', 'nom', 'entreprise', 'activite', 'sujet', 'fait', 'faitDate', 'attente', 'rappel', 'creneau', 'objet', 'tel', 'resume'],
  properties: {
    intention: { type: 'string', enum: ['contact', 'planning', 'dossier', 'abonne', 'autre'], description: "contact = Toufek a vu, appelé ou doit suivre quelqu'un (prise de contact) ; planning = poser, déplacer, annuler ou cocher un RDV ou une tâche, sans personne à suivre ; dossier = un dossier d'apport déjà ouvert avance (signé, payé, perdu, commission, relance) ; abonne = un restaurant KamiFood (formule, résiliation) ; autre = mémo, question, heures, tout le reste" },
    nom: { type: 'string', description: 'prénom et/ou nom de la personne, vide si inconnu' },
    entreprise: { type: 'string', description: 'entreprise ou restaurant, vide si inconnu' },
    activite: { type: 'string', enum: SECTEURS, description: 'service à présenter : kamifood (logiciel restaurants), kgdpro (organisation par abonnement pour entreprises), cee (certificats d\'économie d\'énergie), energie (négociation fournitures énergétiques), foncier (taxe foncière et CFE), perso sinon' },
    sujet: { type: 'string', description: 'de quoi ils ont parlé, reformulé en une phrase courte, à la première personne de Toufek' },
    fait: { type: 'string', description: "ce qui a déjà été fait ou s'est déjà passé avec cette personne avant cette note (devis envoyé, visite faite, appel passé), en quelques mots, vide si rien n'est raconté" },
    faitDate: { type: 'string', description: 'AAAA-MM-JJ : date de ce qui a déjà été fait si elle est dite (« lundi dernier », « la semaine dernière » = le lundi de cette semaine-là), sinon vide' },
    attente: { type: 'string', enum: ['', 'lui', 'moi'], description: "'lui' si Toufek attend quelque chose de la personne, 'moi' si Toufek doit lui envoyer ou faire quelque chose, '' sinon" },
    rappel: { type: 'string', description: 'date de rappel AAAA-MM-JJ si Toufek en donne une, sinon vide (le tableau de bord pose alors un rappel 3 jours ouvrés plus tard)' },
    creneau: {
      type: 'object', additionalProperties: false, required: ['type', 'date', 'heure', 'du', 'au'],
      properties: {
        type: { type: 'string', enum: ['aucun', 'date', 'semaine', 'periode'], description: 'date = jour précis ; semaine = une semaine donnée ; periode = fenêtre de plusieurs semaines ou mois (« début 2027 » = periode) ; aucun si rien n\'est dit' },
        date: { type: 'string', description: 'AAAA-MM-JJ si type=date, sinon vide' },
        heure: { type: 'string', description: 'HH:MM si donnée, sinon vide' },
        du: { type: 'string', description: 'AAAA-MM-JJ : lundi de la semaine si type=semaine, début si type=periode, sinon vide' },
        au: { type: 'string', description: 'AAAA-MM-JJ : fin si type=periode, sinon vide' },
      },
    },
    objet: { type: 'string', description: 'objet du créneau, ex. « Présentation des services », vide si aucun créneau' },
    tel: { type: 'string', description: 'numéro de téléphone si présent, sinon vide' },
    resume: { type: 'string', description: 'une phrase de confirmation pour Toufek, au tutoiement' },
  },
};

const SYSTEM = `Tu es Kami, l'assistant de Toufek (Kami Groupe, Strasbourg). Toufek dicte ou tape une note après avoir croisé quelqu'un à qui il a un service à présenter. Tu remplis la fiche de prise de contact à partir de cette note, sans rien inventer : un champ inconnu reste vide. Dates relatives (« dans 3 jours », « la semaine prochaine », « début 2027 », « d'ici fin octobre ») calculées à partir de la date du jour fournie ; semaine du lundi au dimanche ; « début 2027 » = période du 4 janvier au 28 février 2027 ; « fin octobre » = période du 20 au 31 octobre. Si Toufek dit qu'il doit envoyer, rappeler, transmettre : attente = moi. S'il attend des documents, une réponse, un retour : attente = lui. Rappel : la date demandée par Toufek (« rappelle-moi dans 3 jours », « jeudi »), sinon vide : le tableau de bord met alors 3 jours ouvrés par défaut.

La note est souvent dictée au téléphone : ponctuation absente ou approximative, nombres en lettres, homophones (« sa » / « ça », « ses » / « c'est »), hésitations (« euh », faux départs : garde la dernière version, « mardi non mercredi » = mercredi). Un numéro de téléphone dicté chiffre par chiffre ou par paires s'écrit 06 12 34 56 78. Si un nom ressemble à un nom de la liste des personnes connues (même prononciation, orthographe proche), utilise l'orthographe connue ; sinon garde ce qui est dit. N'ajoute jamais une information que la note ne contient pas.

Une prise de contact complète : qui (nom, entreprise, service), de quoi ils ont parlé (sujet), ce qui a déjà été fait avant cette note (fait, avec sa date dans faitDate : « je lui ai envoyé le devis lundi », « on s'est vus la semaine dernière », « visite faite » ; le journal du contact le garde), qui attend quoi (attente), quand le rappeler (rappel) et le prochain RDV s'il est dit (creneau, objet). Ce qui est déjà fait ne va pas dans attente ; ce qui reste à faire, si.

Classe d'abord la note (intention) : contact quand Toufek parle d'une personne à suivre (croisée, appelée, à rappeler, à qui envoyer quelque chose) ; planning pour un RDV ou une tâche à poser, déplacer, annuler ou cocher sans nouvelle personne (« décale le garage à mardi quinze heures », « mets-moi une tâche demain, le devis ») ; dossier quand un dossier déjà ouvert avance (« Karim SARL a signé le dossier CEE », « le cabinet a payé ») ; abonne pour un restaurant KamiFood (nouvelle formule, résiliation) ; autre pour un mémo, une question ou des heures. Dans le doute entre contact et le reste, choisis contact. Pour une intention autre que contact, remplis quand même sujet et resume : le tableau de bord confie alors la note à l'assistant qui a le planning et les dossiers sous les yeux.`;

export async function analyserNote({ texte, aujourdhui, connus, contact }, client) {
  /* Les noms viennent des données de Toufek : une ligne chacun, sans retour à la ligne ni point-virgule (le séparateur de la liste) */
  const propre = x => String(x).replace(/[\r\n;]+/g, ' ').replace(/\s+/g, ' ').trim();
  const liste = Array.isArray(connus) ? connus.filter(x => typeof x === 'string').map(x => propre(x).slice(0, 80)).filter(Boolean).slice(0, 150) : [];
  const qui = typeof contact === 'string' ? propre(contact).slice(0, 120) : '';
  const r = await client.beta.messages.create({
    model: MODEL, max_tokens: 4000, // la réflexion (toujours active sur Opus 5.5, courte en effort low) compte dans cette limite
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content: `Date du jour : ${aujourdhui}.${qui ? `\nLa note concerne un contact dont la fiche existe déjà : ${qui} (intention contact ; nom et entreprise déjà connus, ne les change pas).` : ''}${liste.length ? `\nPersonnes et entreprises déjà connues (pour l'orthographe des noms) : ${liste.join(' ; ')}.` : ''}\nNote : ${texte}` }],
  });
  if (r.stop_reason === 'refusal') throw new Error('Kami ne peut pas traiter cette note.');
  if (r.stop_reason === 'max_tokens') throw new Error('Note trop longue pour Kami : raccourcis-la, ou coupe-la en deux.');
  const txt = r.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const out = JSON.parse(txt);
  const dateOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  out.rappel = dateOk(out.rappel); out.faitDate = dateOk(out.faitDate); out.fait = String(out.fait || '').trim().slice(0, 200);
  out.creneau.date = dateOk(out.creneau.date); out.creneau.du = dateOk(out.creneau.du); out.creneau.au = dateOk(out.creneau.au);
  if (!/^\d{2}:\d{2}$/.test(out.creneau.heure || '')) out.creneau.heure = '';
  return { ...out, modele: r.model };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'méthode non autorisée' });
  if (!process.env.JARVIS_TOKEN) return res.status(500).json({ erreur: "JARVIS_TOKEN n'est pas défini sur Vercel." });
  if ((req.headers['x-jarvis-token'] || '') !== process.env.JARVIS_TOKEN) return res.status(401).json({ erreur: 'Jeton invalide. Vérifie-le dans Réglages.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ erreur: "ANTHROPIC_API_KEY n'est pas définie sur Vercel : ajoute-la dans Settings → Environment Variables (même procédure que la clé Stripe), puis redéploie." });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const texte = String(body.texte || '').trim().slice(0, 4000);
    if (!texte) return res.status(400).json({ erreur: 'note vide' });
    const aujourdhui = /^\d{4}-\d{2}-\d{2}$/.test(body.aujourdhui || '') ? body.aujourdhui : new Date().toISOString().slice(0, 10);
    const client = new Anthropic({ maxRetries: 2, timeout: 60_000 });
    return res.status(200).json(await analyserNote({ texte, aujourdhui, connus: body.connus, contact: body.contact }, client));
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return res.status(502).json({ erreur: 'La clé API Anthropic est refusée. Vérifie ANTHROPIC_API_KEY sur Vercel.' });
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ erreur: 'Trop de demandes, réessaie dans quelques secondes.' });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ erreur: `Erreur de l'API Claude (${e.status}) : ${e.message}` });
    return res.status(400).json({ erreur: e.message || String(e) });
  }
}
