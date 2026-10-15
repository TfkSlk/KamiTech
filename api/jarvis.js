/*
 * Jarvis — le cerveau de Kami Groupe.
 *
 * Fonction Vercel (Node, ESM). Le client (tableau de bord, voix, plus tard Telegram)
 * envoie la conversation + une projection de ses données ; le cerveau répond avec
 * Claude, exécute ses outils sur une copie de travail et renvoie :
 *   { texte, actions, modele, usage }
 * Les actions sont rejouées par le client sur ses propres données (localStorage
 * aujourd'hui, base partagée demain). Le serveur ne stocke rien.
 */
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.JARVIS_MODEL || 'claude-opus-5';
const EFFORT = process.env.JARVIS_EFFORT || 'medium';
const MAX_TOURS = 8;

/* ---------- Référentiels (identiques au tableau de bord) ---------- */
const SECTEURS = { kamifood: 'KamiFood', kgdpro: 'KGD Pro (futur produit : organisation par abonnement pour les entreprises, pilote Karim en 2027)', cee: 'CEE', energie: 'Négociation des fournitures énergétiques', foncier: 'Taxe foncière et CFE', perso: 'Perso / Groupe' };
const MODES = { place: 'Sur place', visio: 'Visio', tel: 'Téléphone', tache: 'Tâche' };
const STATUTS = { prospect: 'Prospect', rdv: 'RDV fixé', etude: 'Étude en cours', signe: 'Signé', paye: 'Payé', perdu: 'Perdu' };
const STATUTS_AB = { essai: "Période d'essai", actif: 'Actif', resilie: 'Résilié' };
const STATUTS_AV = { suivi: 'En cours', planifie: 'RDV planifié', clos: 'Clos' };
const ATTENTES = ['', 'lui', 'moi'];
const PRIORITES = ['haute', 'normale', 'basse'];
const VUES = ['dashboard', 'planning', 'contacts', 'kamifood', 'dossiers', 'gains', 'parametres', 'jarvis'];

/* ---------- Persona (stable → mise en cache) ---------- */
const PERSONA = `Tu es Jarvis, l'assistant personnel de Toufek, fondateur de Kami Groupe (holding, région de Strasbourg). Tu es son bras droit : tu connais ses affaires, tu gères son planning et ses clients, et tu lui parles comme un collaborateur de confiance, pas comme un robot.

# Les activités du groupe
- KamiFood : logiciel (SaaS) pour restaurants. Les restaurants s'abonnent à une formule mensuelle (Essentiel 79 €, Pro 149 €, Premium 249 € HT par site ; tarif fondateur Pro 99 €). La souscription inclut des RDV : création de l'espace, installation sur site (tablette, sondes de température, étiquettes), formation de l'équipe, activation (bot Telegram, premier récap), points de suivi.
- Apport d'affaires pour les professionnels, trois secteurs : CEE (certificats d'économie d'énergie), négociation des fournitures énergétiques (électricité, gaz : mise en concurrence des fournisseurs, prix négociés, signature le jour de l'annonce), taxe foncière et CFE (récupération du trop-payé pour les professionnels). Toufek touche des commissions des partenaires (délégataires, fournisseurs, cabinets). Un dossier suit les statuts : prospect → RDV fixé → étude en cours → signé → payé (ou perdu).
- Perso / Groupe : la holding, la compta, la vie de Toufek (il a un fils, il protège ses créneaux perso).

# Les données que tu vois
Le message système suivant contient la date du jour et une projection des données du tableau de bord : abonnés KamiFood, dossiers d'apport, RDV et tâches (planning), relances, notes mémorisées, résumé des gains. C'est la vérité du moment. Si une information n'y est pas, utilise l'outil chercher ou agenda avant de conclure qu'elle n'existe pas. N'invente jamais un client, un montant ou un RDV.

Champs : un RDV a un titre, une date (AAAA-MM-JJ), une heure (HH:MM ou vide), une durée en minutes, une date de fin optionnelle (fin : s'il y en a une, c'est une PÉRIODE qui couvre plusieurs jours, ex. « réponse des fournisseurs d'énergie du 28 sept. au 4 oct. », durée 0), un drapeau important (alerte rouge à ne pas manquer, ex. « signature requise le jour de l'annonce des prix négociés »), un drapeau aPrevoir (période dans laquelle une date reste à caler : « voir Karim début 2027 » = période du 1er janvier au 28 février avec aPrevoir=true, lien "c:<id contact>"), un mode (place = sur place, visio, tel = téléphone, tache = tâche sans RDV), un secteur (activite : kamifood, cee, energie = négociation des fournitures énergétiques, foncier = taxe foncière et CFE, perso), un lien optionnel vers un client ("a:<id>" pour un abonné KamiFood, "d:<id>" pour un dossier d'apport), un lieu optionnel (adresse ou ville ; sans précision, la ville du client lié) et un état fait (true/false). Un dossier a entreprise, activite, statut, contact, tel, email, ville, partenaire, commEstimee, commRecue, dateRelance, dateSignature, datePaiement, notes. Un abonné a restaurant, formule (id), prix mensuel HT, statut (essai, actif, resilie), debut, engagement (mois), fin (date de résiliation ; un abonné résilié a toujours une fin), finEstimee (true = fin posée automatiquement faute de date : demande la vraie date à Toufek et corrige-la avec modifier_abonne), contact, tel, email, ville, notes, interne. L'abonné d'id "moi" (interne=true) est la licence éditeur de Toufek lui-même : ce n'est pas un client, il n'est jamais facturé, il ne compte ni dans les gains ni dans les abonnés actifs ; ne le modifie pas et ne le présente jamais comme un abonné.
Les chiffres (résumé) : les gains KamiFood d'une période sont au prorata des jours d'abonnement sur la période (une semaine de 7 jours en octobre = prix × 7 / 31), ou les factures Stripe payées quand Stripe est synchronisé (resume.kamifoodGains dit lequel) ; l'attendu (resume.attenduMois) est ce qui manque pour atteindre le total au prorata de la période : une facture Stripe déjà payée (Stripe facture en début de mois) n'y est jamais recomptée ; une période d'essai ne rapporte rien, un résilié s'arrête à sa fin. Le temps planifié additionne la durée des RDV et tâches ; une période (date + fin) ne compte aucune heure. resume.alertes reprend le bandeau Alertes de l'accueil, trié par date, avec son compte à rebours (Aujourd'hui, Demain, J-N) : les RDV importants non faits des 30 prochains jours, et les périodes à prévoir dont le créneau n'est toujours pas calé à 7 jours ou moins de leur fin (pour un contact, son RDV posé, dans la période ou à venir, compte comme calé ; un contact clos n'a plus d'alerte) ; niveau « fort » = demain ou aujourd'hui. Quand Toufek demande quoi faire d'abord, commence par les alertes fortes, puis ce qui est en retard (resume.enRetard), puis les contacts à rappeler.

Les contacts (aVoir) : les gens que Toufek croise (il les connaît souvent) et à qui il a un service à présenter. Ce n'est pas un dossier : c'est un journal de prises de contact avec un rappel. Chaque contact a nom, entreprise, activite (le service à présenter : cee, energie, foncier, kamifood, perso), historique (liste de { date, texte } : chaque prise de contact et de quoi ils ont parlé, le dernier élément est le plus récent), attente ('' = rien, 'lui' = Toufek attend des informations de la personne, 'moi' = Toufek lui doit des informations), rappel (AAAA-MM-JJ : le jour où le tableau de bord doit alerter Toufek), statut (suivi = en cours, planifie = un RDV est posé, clos), priorite, tel, email, ville, lien (client lié), notes, eventId, tentatives (appels restés sans réponse depuis le dernier vrai échange : l'appli le compte quand Toufek revient d'un appel et choisit « Pas répondu » ou « Messagerie », et pose alors un rappel dans 2 jours ouvrés).
Règle d'or des contacts : jamais sans suite. Un contact en cours a toujours une suite datée : un rappel (un rappel automatique ne tombe jamais un samedi ou un dimanche, il glisse au lundi), un RDV posé (statut planifie + eventId), ou il est clos explicitement (clos = ni rappel ni attente). Quand le RDV d'un contact est fait ou supprimé, le contact repasse en suivi avec un rappel au plus tard aujourd'hui (ses outils le font tout seuls) : demande alors à Toufek quelle suite donner. Un contact « RDV planifié » dont le RDV est passé apparaît dans les rappels du jour avec « RDV passé · quelle suite ? ».

# Comment tu agis
- Tu utilises les outils pour toute modification (ajouter, modifier, supprimer, mémoriser). Ne dis jamais "c'est fait" sans avoir appelé l'outil. Après un outil, confirme en une phrase ce qui a été fait, avec la date et l'heure.
- Dates relatives ("demain", "lundi prochain", "dans deux semaines") : calcule-les à partir de la date du jour donnée dans le contexte. Semaine du lundi au dimanche. Heure par défaut : aucune si Toufek n'en donne pas ; durée par défaut : 60 min sur place, 30 min en visio ou au téléphone, 30 min pour une tâche.
- Si un RDV entre en conflit avec un autre RDV au même créneau, signale-le avant d'ajouter, sauf si Toufek a déjà dit de le faire quand même.
- Pour supprimer ou résilier, demande confirmation si ce n'est pas explicite. Pour ajouter ou modifier, agis directement.
- Quand un nouvel abonné KamiFood est créé, propose de planifier ses RDV inclus (outil ajouter_abonne avec planifier_rdv_inclus) si Toufek n'a pas précisé.
- Quand Toufek décrit une fenêtre de temps (« d'aujourd'hui à dimanche », « toute la semaine prochaine »), crée une période (date + fin, sans heure, durée 0). Quand il dit « attention », « à ne pas rater », « obligatoire », « signature requise », mets important=true. Une période et son alerte associée sont deux entrées distinctes (la période, puis l'alerte à la bonne date ; si la date de l'alerte est inconnue, mets-la au dernier jour de la période et dis-le).
- Quand Toufek raconte une rencontre (« j'ai croisé Karim, on a parlé de la taxe foncière, il m'envoie ses avis, rappelle-moi dans trois jours »), utilise prise_de_contact : nom, de quoi ils ont parlé, le service concerné, qui attend quoi, et le rappel (si Toufek ne précise rien : 3 jours ouvrés, ou le rappel futur déjà posé qui est gardé). Si Toufek dit que c'est fini (« pas intéressé », « on arrête »), passe clore=true : le contact est clos, sans rappel ni attente. Si la personne existe déjà dans les contacts, passe son id : ça ajoute une entrée au journal au lieu de créer un doublon. Quand le rappel arrive, le tableau de bord l'affiche dans « Aujourd'hui » et « À rappeler » ; il n'est en rouge que si le rappel est dépassé, ou si Toufek lui doit des informations (le rouge est réservé à l'urgent).
- Quand Toufek donne un créneau pour un contact : date précise → ajouter_rdv (lien "c:<id>") puis modifier_a_voir statut planifie + eventId ; « la semaine du 12 » ou « début 2027 » → ajouter_rdv avec date, fin et aPrevoir=true (lien "c:<id>"), et le contact garde son rappel. Quand on te demande « qui je dois rappeler » ou « qui attend quoi », appuie-toi sur les contacts : rappels dépassés et en attente d'abord.
- Quand Toufek te dit une information à retenir (préférence, fait sur un client, décision), utilise retenir.
- Priorité de Toufek : bien gérer son temps. Quand c'est utile, dis-lui ce qui est en retard, ce qui est chargé, ce qu'il gagne par secteur. Sois franc : si une semaine est trop chargée ou si un dossier dort, dis-le.

# Ton style
- Français, tutoiement, phrases courtes, ton direct et chaleureux. Pas de jargon.
- Mode voix (indiqué dans le contexte) : réponds en 1 à 3 phrases, sans liste, sans markdown, sans symboles ; dis les nombres et les heures naturellement ("dix heures et demie", "cent quarante-neuf euros"). Va à l'essentiel : ce que Toufek doit savoir ou décider.
- Mode texte : réponses courtes, markdown léger autorisé (listes courtes, gras), jamais de tableau.
- Ne répète pas la question. Ne t'excuse pas. Ne dis pas ce que tu vas faire : fais-le, puis dis-le.
- Si tu ne peux pas faire quelque chose (pas d'outil, information absente), dis-le clairement et propose la meilleure alternative.`;

/* ---------- Outils ---------- */
const champsDossier = {
  entreprise: { type: 'string' }, activite: { type: 'string', enum: ['cee', 'energie', 'foncier'] },
  statut: { type: 'string', enum: Object.keys(STATUTS) }, contact: { type: 'string' }, tel: { type: 'string' },
  email: { type: 'string' }, ville: { type: 'string' }, partenaire: { type: 'string' },
  commEstimee: { type: 'number', description: 'commission prévue en euros' }, commRecue: { type: 'number' },
  dateRelance: { type: 'string', description: 'AAAA-MM-JJ' }, dateSignature: { type: 'string' }, datePaiement: { type: 'string' },
  notes: { type: 'string' },
};
const champsRdv = {
  titre: { type: 'string' }, date: { type: 'string', description: 'AAAA-MM-JJ' }, heure: { type: 'string', description: 'HH:MM ou chaîne vide' },
  duree: { type: 'integer', description: 'minutes' }, mode: { type: 'string', enum: Object.keys(MODES) },
  activite: { type: 'string', enum: Object.keys(SECTEURS) }, lien: { type: 'string', description: '"a:<id abonné>", "d:<id dossier>", "c:<id contact>" ou vide' },
  notes: { type: 'string' }, fait: { type: 'boolean' },
  lieu: { type: 'string', description: 'adresse ou ville du RDV (facultatif ; par défaut la ville du client lié)' },
  fin: { type: 'string', description: 'AAAA-MM-JJ : date de fin pour une PÉRIODE qui s\'étale sur plusieurs jours (ex. fenêtre de réponse des fournisseurs). Vide pour un RDV simple.' },
  important: { type: 'boolean', description: 'true = alerte à ne pas manquer (affichée en rouge), ex. signature requise le jour de l\'annonce des prix' },
  aPrevoir: { type: 'boolean', description: 'true = période pendant laquelle une date reste à caler (ex. « voir Karim début 2027 ») ; affichée en pointillé' },
};
const champsAbonne = {
  restaurant: { type: 'string' }, formule: { type: 'string', description: 'id de formule (voir contexte)' }, prix: { type: 'number', description: 'prix mensuel HT' },
  statut: { type: 'string', enum: Object.keys(STATUTS_AB) }, debut: { type: 'string', description: 'AAAA-MM-JJ, début de facturation' },
  engagement: { type: 'integer', description: 'mois' }, fin: { type: 'string' }, contact: { type: 'string' }, tel: { type: 'string' },
  email: { type: 'string' }, ville: { type: 'string' }, notes: { type: 'string' },
};
const champsAVoir = {
  nom: { type: 'string' }, entreprise: { type: 'string' }, activite: { type: 'string', enum: Object.keys(SECTEURS), description: 'service à présenter' },
  priorite: { type: 'string', enum: PRIORITES },
  attente: { type: 'string', enum: ATTENTES, description: "'' rien, 'lui' = Toufek attend des infos de la personne, 'moi' = Toufek lui doit des infos" },
  rappel: { type: 'string', description: 'AAAA-MM-JJ, jour du rappel. Un contact en cours (suivi) garde toujours un rappel : pour arrêter le suivi, passe statut clos.' }, statut: { type: 'string', enum: Object.keys(STATUTS_AV), description: 'clos efface le rappel et l\'attente' },
  tel: { type: 'string' }, email: { type: 'string' }, ville: { type: 'string' }, lien: { type: 'string', description: '"a:<id abonné>", "d:<id dossier>", "c:<id autre contact>" ou vide' },
  notes: { type: 'string' }, eventId: { type: 'string', description: 'id du RDV posé dans le planning' },
};
const obj = (properties, required = []) => ({ type: 'object', properties, required });

export const TOOLS = [
  { name: 'chercher', description: 'Recherche un client, un dossier, un abonné ou un RDV par mot-clé (nom, contact, ville, titre, notes). Renvoie les correspondances avec leurs ids.', input_schema: obj({ texte: { type: 'string' } }, ['texte']) },
  { name: 'agenda', description: "Liste les RDV, tâches et relances entre deux dates incluses (AAAA-MM-JJ). À utiliser pour une période hors de la fenêtre du contexte ou pour vérifier un créneau.", input_schema: obj({ du: { type: 'string' }, au: { type: 'string' } }, ['du', 'au']) },
  { name: 'ajouter_rdv', description: 'Ajoute un RDV ou une tâche au planning.', input_schema: obj(champsRdv, ['titre', 'date', 'activite']) },
  { name: 'modifier_rdv', description: 'Modifie un RDV existant (déplacer, renommer, marquer fait...). Ne passe que les champs qui changent.', input_schema: obj({ id: { type: 'string' }, ...champsRdv }, ['id']) },
  { name: 'supprimer_rdv', description: 'Supprime un RDV ou une tâche.', input_schema: obj({ id: { type: 'string' } }, ['id']) },
  { name: 'ajouter_dossier', description: "Crée un dossier d'apport d'affaires (CEE, négociation énergie, taxe foncière et CFE).", input_schema: obj(champsDossier, ['entreprise', 'activite']) },
  { name: 'modifier_dossier', description: 'Modifie un dossier (statut, commission, relance, notes...). Ne passe que les champs qui changent.', input_schema: obj({ id: { type: 'string' }, ...champsDossier }, ['id']) },
  { name: 'ajouter_abonne', description: 'Crée un abonné KamiFood (restaurant). Avec planifier_rdv_inclus=true, planifie aussi les RDV inclus dans la souscription à partir de la date de début.', input_schema: obj({ ...champsAbonne, planifier_rdv_inclus: { type: 'boolean' } }, ['restaurant']) },
  { name: 'modifier_abonne', description: 'Modifie un abonné KamiFood (formule, prix, statut, résiliation...).', input_schema: obj({ id: { type: 'string' }, ...champsAbonne }, ['id']) },
  { name: 'prise_de_contact', description: "Note une prise de contact : Toufek a croisé ou appelé quelqu'un à qui présenter un service. Crée le contact (nom) ou ajoute une entrée au journal d'un contact existant (id). Pose le rappel et ce qui est en attente.", input_schema: obj({ id: { type: 'string', description: 'id du contact existant, sinon vide' }, nom: { type: 'string' }, entreprise: { type: 'string' }, activite: { type: 'string', enum: Object.keys(SECTEURS) }, sujet: { type: 'string', description: 'de quoi ils ont parlé' }, date: { type: 'string', description: 'AAAA-MM-JJ, date de la rencontre (défaut : aujourd\'hui)' }, attente: { type: 'string', enum: ATTENTES }, rappel_jours: { type: 'integer', description: 'rappel dans N jours (glisse au lundi s\'il tombe un week-end)' }, rappel: { type: 'string', description: 'AAAA-MM-JJ ; sans rappel ni rappel_jours : 3 jours ouvrés, ou le rappel futur déjà posé' }, clore: { type: 'boolean', description: 'true = Toufek arrête le suivi : contact clos, sans rappel ni attente' }, tel: { type: 'string' }, lien: { type: 'string' } }, ['sujet']) },
  { name: 'ajouter_a_voir', description: "Crée un contact sans prise de contact (préfère prise_de_contact quand Toufek raconte une rencontre).", input_schema: obj(champsAVoir, ['nom']) },
  { name: 'modifier_a_voir', description: "Modifie un contact (rappel, attente, statut, eventId une fois le RDV posé, coordonnées...). Ne passe que les champs qui changent.", input_schema: obj({ id: { type: 'string' }, ...champsAVoir }, ['id']) },
  { name: 'supprimer_a_voir', description: 'Supprime un contact et son journal.', input_schema: obj({ id: { type: 'string' } }, ['id']) },
  { name: 'retenir', description: 'Mémorise durablement une information (préférence, fait sur un client, décision). Une phrase courte.', input_schema: obj({ note: { type: 'string' } }, ['note']) },
  { name: 'ouvrir', description: 'Ouvre une vue du tableau de bord chez Toufek.', input_schema: obj({ vue: { type: 'string', enum: VUES } }, ['vue']) },
];

/* ---------- Utilitaires ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => Number(String(v ?? '').replace(',', '.')) || 0;
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/* Comme le tableau de bord : un rappel automatique ne tombe jamais un week-end (samedi, dimanche → lundi) */
const jourOuvre = d => { const x = new Date(d); const j = x.getDay(); if (j === 6) x.setDate(x.getDate() + 2); else if (j === 0) x.setDate(x.getDate() + 1); return x; };
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const dateOk = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s));
const nettoyer = (input, champs) => Object.fromEntries(Object.entries(input).filter(([k, v]) => k in champs && v !== undefined && v !== null));

/* ---------- Exécution des outils sur une copie de travail ---------- */
function outils(state, actions) {
  const s = state;
  const dossier = id => s.dossiers.find(d => d.id === id);
  const abonne = id => s.abonnes.find(a => a.id === id);
  const event = id => s.events.find(e => e.id === id);
  const nomLien = l => { if (!l) return ''; const [t, id] = l.split(':'); const x = t === 'a' ? abonne(id) : t === 'c' ? s.aVoir.find(v => v.id === id) : dossier(id); return x ? (x.restaurant || x.entreprise || x.nom) : ''; };
  /* Comme le tableau de bord : le lieu d'un RDV est par défaut la ville du client lié */
  const villeLien = l => { if (!l) return ''; const [t, id] = l.split(':'); const x = t === 'a' ? abonne(id) : t === 'c' ? s.aVoir.find(v => v.id === id) : dossier(id); return x && typeof x.ville === 'string' ? x.ville : ''; };
  const relances = () => s.dossiers.filter(d => d.dateRelance && ['prospect', 'rdv', 'etude', 'signe'].includes(d.statut))
    .map(d => ({ relance: true, dossierId: d.id, date: d.dateRelance, titre: `Relance · ${d.entreprise}`, activite: d.activite }));
  const add = (collection, item) => { s[collection].push(item); actions.push({ op: 'add', collection, item }); return item; };
  const update = (collection, item, fields) => { Object.assign(item, fields); actions.push({ op: 'update', collection, id: item.id, fields }); return item; };
  const rappelDans = n => iso(jourOuvre(addDays(parse(s.aujourdhui), n)));
  /* Le RDV d'un contact est fait ou supprimé : le contact repart en suivi avec un rappel au plus tard aujourd'hui */
  const liberer = e => {
    if (!String(e.lien || '').startsWith('c:')) return null;
    const v = s.aVoir.find(x => x.id === e.lien.slice(2));
    if (!v || v.eventId !== e.id || v.statut === 'clos') return null;
    update('aVoir', v, { statut: 'suivi', eventId: '', rappel: v.rappel && v.rappel > s.aujourdhui ? v.rappel : s.aujourdhui });
    return v.nom;
  };

  return {
    chercher({ texte }) {
      const q = norm(texte);
      const hit = o => Object.values(o).some(v => typeof v === 'string' && norm(v).includes(q));
      return {
        abonnes: s.abonnes.filter(hit).slice(0, 10),
        dossiers: s.dossiers.filter(hit).slice(0, 10),
        rdv: s.events.filter(e => hit(e) || norm(nomLien(e.lien)).includes(q)).slice(0, 15).map(e => ({ ...e, client: nomLien(e.lien) })),
        aVoir: s.aVoir.filter(hit).slice(0, 10),
      };
    },
    agenda({ du, au }) {
      if (!dateOk(du) || !dateOk(au)) throw new Error('dates attendues au format AAAA-MM-JJ');
      const evs = s.events.filter(e => e.date >= du && e.date <= au).map(e => ({ ...e, client: nomLien(e.lien) }));
      const rel = relances().filter(r => r.date >= du && r.date <= au);
      return [...evs, ...rel].sort((a, b) => (a.date + (a.heure || '')).localeCompare(b.date + (b.heure || '')));
    },
    ajouter_rdv(input) {
      const f = nettoyer(input, champsRdv);
      if (!dateOk(f.date)) throw new Error('date attendue au format AAAA-MM-JJ');
      if (f.lien && !nomLien(f.lien)) throw new Error(`lien inconnu : ${f.lien}`);
      const mode = f.mode || (f.lien ? 'visio' : 'tache');
      const item = { id: uid(), fait: false, heure: '', notes: '', lien: '', important: false, duree: mode === 'place' ? 60 : 30, mode, ...f };
      if (!item.lieu && item.lien) item.lieu = villeLien(item.lien);
      if (item.fin && !dateOk(item.fin)) throw new Error('fin attendue au format AAAA-MM-JJ');
      if (item.fin && item.fin <= item.date) delete item.fin;
      item.aPrevoir = !!item.aPrevoir && !!item.fin;
      item.duree = item.fin ? num(item.duree) : (num(item.duree) || 30);
      /* Comme le tableau de bord : une période sans heure est une tâche de durée 0 (elle ne compte pas d'heures) */
      if (item.fin && !item.heure) { item.mode = 'tache'; item.duree = 0; }
      return { ok: true, rdv: add('events', item), client: nomLien(item.lien) };
    },
    modifier_rdv({ id, ...rest }) {
      const e = event(id); if (!e) throw new Error(`RDV introuvable : ${id}`);
      const f = nettoyer(rest, champsRdv);
      if (f.date && !dateOk(f.date)) throw new Error('date attendue au format AAAA-MM-JJ');
      if (f.lien && !nomLien(f.lien)) throw new Error(`lien inconnu : ${f.lien}`);
      if (f.fin && !dateOk(f.fin)) throw new Error('fin attendue au format AAAA-MM-JJ');
      /* Mêmes règles qu'à la saisie : fin après la date sinon retirée, « à prévoir » seulement dans une période, période sans heure = durée 0 */
      const date = f.date ?? e.date, heure = f.heure ?? e.heure;
      if ((f.fin ?? e.fin) && (f.fin ?? e.fin) <= date) f.fin = '';
      const periode = !!((f.fin ?? e.fin) && (f.fin ?? e.fin) > date);
      if (!periode && (f.aPrevoir || (f.aPrevoir === undefined && e.aPrevoir))) f.aPrevoir = false;
      if (periode && !heure) { f.mode = 'tache'; f.duree = 0; }
      const etaitFait = !!e.fait;
      update('events', e, f);
      const contact = f.fait === true && !etaitFait ? liberer(e) : null;
      return { ok: true, rdv: e, ...(contact ? { contact_revenu_en_suivi: contact } : {}) };
    },
    supprimer_rdv({ id }) {
      const e = event(id); if (!e) throw new Error(`RDV introuvable : ${id}`);
      const contact = liberer(e);
      s.events = s.events.filter(x => x.id !== id);
      actions.push({ op: 'delete', collection: 'events', id });
      return { ok: true, supprime: e.titre, ...(contact ? { contact_revenu_en_suivi: contact } : {}) };
    },
    ajouter_dossier(input) {
      const f = nettoyer(input, champsDossier);
      const item = { id: uid(), createdAt: Date.now(), statut: 'prospect', ...f };
      if (item.statut === 'paye') { item.datePaiement = item.datePaiement || s.aujourdhui; if (!num(item.commRecue)) item.commRecue = item.commEstimee; }
      if (['signe', 'paye'].includes(item.statut)) item.dateSignature = item.dateSignature || s.aujourdhui;
      return { ok: true, dossier: add('dossiers', item) };
    },
    modifier_dossier({ id, ...rest }) {
      const d = dossier(id); if (!d) throw new Error(`dossier introuvable : ${id}`);
      const f = nettoyer(rest, champsDossier);
      if (f.statut === 'signe' && !d.dateSignature && !f.dateSignature) f.dateSignature = s.aujourdhui;
      if (f.statut === 'paye') {
        if (!d.dateSignature && !f.dateSignature) f.dateSignature = s.aujourdhui;
        if (!d.datePaiement && !f.datePaiement) f.datePaiement = s.aujourdhui;
        if (!num(d.commRecue) && !num(f.commRecue)) f.commRecue = f.commEstimee ?? d.commEstimee;
      }
      return { ok: true, dossier: update('dossiers', d, f) };
    },
    ajouter_abonne({ planifier_rdv_inclus, ...input }) {
      const f = nettoyer(input, champsAbonne);
      const formule = s.formules.find(x => x.id === f.formule) || s.formules.find(x => norm(x.nom) === norm(f.formule)) || s.formules[0];
      const item = { id: uid(), createdAt: Date.now(), statut: 'actif', debut: s.aujourdhui, engagement: 12, ...f, formule: formule?.id || '' };
      if (!num(item.prix) && formule) item.prix = formule.prix;
      if (item.statut === 'resilie' && !item.fin) item.fin = s.aujourdhui; // un résilié a toujours une fin
      add('abonnes', item);
      const rdvs = [];
      if (planifier_rdv_inclus) {
        const start = parse(item.debut);
        for (const r of s.rdvModele) {
          let d = addDays(start, num(r.jours));
          if (d.getDay() === 6) d = addDays(d, 2);
          if (d.getDay() === 0) d = addDays(d, 1);
          rdvs.push(add('events', { id: uid(), date: iso(d), heure: '10:00', duree: num(r.duree) || 60, mode: r.mode, titre: r.titre, activite: 'kamifood', lien: 'a:' + item.id, fait: false, notes: '' }));
        }
      }
      return { ok: true, abonne: item, rdv_planifies: rdvs.map(r => ({ date: r.date, titre: r.titre })) };
    },
    modifier_abonne({ id, ...rest }) {
      const a = abonne(id); if (!a) throw new Error(`abonné introuvable : ${id}`);
      const f = nettoyer(rest, champsAbonne);
      if (a.id === 'moi') {
        if ((f.statut && f.statut !== 'actif') || num(f.prix)) throw new Error("c'est la licence éditeur de Toufek : elle reste active et gratuite");
      }
      if (f.statut === 'resilie' && !a.fin && !f.fin) f.fin = s.aujourdhui;
      /* Une vraie date (ou la fin de la résiliation) remplace la date estimée */
      if (a.finEstimee && (f.fin || (f.statut && f.statut !== 'resilie'))) f.finEstimee = false;
      return { ok: true, abonne: update('abonnes', a, f) };
    },
    prise_de_contact({ id, nom, entreprise, activite, sujet, date, attente, rappel_jours, rappel, clore, tel, lien }) {
      const quand = date && dateOk(date) ? date : s.aujourdhui;
      let jour = rappel ? rappel : (Number.isInteger(rappel_jours) ? rappelDans(rappel_jours) : undefined);
      if (jour && !dateOk(jour)) throw new Error('rappel attendu au format AAAA-MM-JJ');
      if (lien && !nomLien(lien)) throw new Error(`lien inconnu : ${lien}`);
      let v = id ? s.aVoir.find(x => x.id === id) : s.aVoir.find(x => nom && norm(x.nom) === norm(nom) && (!entreprise || norm(x.entreprise || '') === norm(entreprise)));
      const entree = { date: quand, texte: String(sujet).trim().slice(0, 300) };
      if (v) {
        /* Jamais sans suite : clos explicitement, sinon un rappel (celui demandé, le rappel futur déjà posé, ou 3 jours ouvrés).
           Un « RDV planifié » repart en suivi : si un nouveau RDV est posé, modifier_a_voir (eventId) le repasse en planifie. */
        const f = { historique: [...(v.historique || []), entree], statut: clore ? 'clos' : 'suivi' };
        if (attente !== undefined) f.attente = attente;
        if (clore) { f.rappel = ''; f.attente = ''; }
        else if (jour !== undefined) f.rappel = jour;
        else if (!(v.rappel && v.rappel > s.aujourdhui)) f.rappel = rappelDans(3);
        if (activite) f.activite = activite;
        if (tel) f.tel = tel;
        return { ok: true, contact: update('aVoir', v, f), nouveau: false };
      }
      if (!nom) throw new Error('nom requis pour un nouveau contact');
      if (jour === undefined) jour = clore ? '' : rappelDans(3);
      const item = { id: uid(), createdAt: Date.now(), nom, entreprise: entreprise || '', activite: activite || 'perso', priorite: 'normale', statut: clore ? 'clos' : 'suivi', attente: clore ? '' : (attente || ''), rappel: clore ? '' : jour, tel: tel || '', lien: lien || '', notes: '', historique: [entree] };
      return { ok: true, contact: add('aVoir', item), nouveau: true };
    },
    ajouter_a_voir(input) {
      const f = nettoyer(input, champsAVoir);
      if (f.rappel && !dateOk(f.rappel)) throw new Error('rappel attendu au format AAAA-MM-JJ');
      if (f.lien && !nomLien(f.lien)) throw new Error(`lien inconnu : ${f.lien}`);
      const item = { id: uid(), createdAt: Date.now(), statut: 'suivi', priorite: 'normale', activite: 'perso', attente: '', rappel: '', historique: [], ...f };
      if (item.statut === 'clos') { item.rappel = ''; item.attente = ''; }
      else if (item.statut === 'suivi' && !item.rappel) item.rappel = rappelDans(3);
      return { ok: true, contact: add('aVoir', item) };
    },
    modifier_a_voir({ id, ...rest }) {
      const v = s.aVoir.find(x => x.id === id); if (!v) throw new Error(`contact introuvable : ${id}`);
      const f = nettoyer(rest, champsAVoir);
      if (f.rappel && !dateOk(f.rappel)) throw new Error('rappel attendu au format AAAA-MM-JJ');
      if (f.eventId && !event(f.eventId)) throw new Error(`RDV introuvable : ${f.eventId}`);
      if (f.eventId && !f.statut) f.statut = 'planifie';
      if (f.statut === 'clos' && v.statut !== 'clos') { f.rappel = ''; f.attente = ''; }
      else if ((f.statut || v.statut) === 'suivi') {
        if (f.rappel === '') throw new Error('un contact en cours garde toujours un rappel : donne une date de rappel, ou passe statut clos');
        if (f.statut === 'suivi' && v.statut !== 'suivi' && !(f.rappel || v.rappel)) f.rappel = s.aujourdhui;
      }
      return { ok: true, contact: update('aVoir', v, f) };
    },
    supprimer_a_voir({ id }) {
      const v = s.aVoir.find(x => x.id === id); if (!v) throw new Error(`contact introuvable : ${id}`);
      s.aVoir = s.aVoir.filter(x => x.id !== id);
      actions.push({ op: 'delete', collection: 'aVoir', id });
      s.events.filter(e => e.lien === 'c:' + id).forEach(e => update('events', e, { lien: '' }));
      s.aVoir.filter(x => x.lien === 'c:' + id).forEach(x => update('aVoir', x, { lien: '' }));
      return { ok: true, supprime: v.nom };
    },
    retenir({ note }) {
      const n = String(note).trim().slice(0, 300);
      s.memoire.push(n);
      actions.push({ op: 'memoire', note: n });
      return { ok: true };
    },
    ouvrir({ vue }) {
      if (!VUES.includes(vue)) throw new Error('vue inconnue');
      actions.push({ op: 'navigate', vue });
      return { ok: true };
    },
  };
}

/* ---------- Contexte dynamique ---------- */
function contexte(s, mode) {
  const jour = parse(s.aujourdhui).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const lignes = [
    `Toufek t'appelle « ${s.nom} ». C'est ton nom : réponds à ce nom et présente-toi ainsi.`,
    `Date du jour : ${jour} (${s.aujourdhui}), il est ${s.heure || '?'} (heure de Paris).`,
    `Mode : ${mode === 'voice' ? 'VOIX (réponse courte, orale, sans markdown)' : 'texte'}.`,
    `Résumé : ${JSON.stringify(s.resume || {})}`,
    `Formules KamiFood : ${JSON.stringify(s.formules)}`,
    `RDV inclus dans une souscription KamiFood : ${JSON.stringify(s.rdvModele)}`,
    `Notes mémorisées : ${s.memoire.length ? s.memoire.map(n => '- ' + n).join('\n') : '(aucune)'}`,
    `Abonnés KamiFood (${s.abonnes.length}) : ${JSON.stringify(s.abonnes)}`,
    `Dossiers d'apport (${s.dossiers.length}, les dossiers payés ou perdus depuis plus de 90 jours sont omis ; utilise chercher) : ${JSON.stringify(s.dossiersVisibles)}`,
    `Contacts (${s.aVoir.length} ; journal des prises de contact, rappels, attentes) : ${JSON.stringify(s.aVoir)}`,
    `Planning de J-7 à J+45 (${s.eventsVisibles.length} éléments ; au-delà, utilise agenda) : ${JSON.stringify(s.eventsVisibles)}`,
  ];
  return lignes.join('\n\n');
}

/* Normalise ce que le client envoie et prépare la copie de travail */
function preparer(body) {
  const st = body.state || {};
  const now = body.now ? new Date(body.now) : new Date();
  const aujourdhui = dateOk(body.aujourdhui) ? body.aujourdhui : iso(now);
  const s = {
    nom: String(body.nom || 'Kami').slice(0, 30),
    aujourdhui,
    heure: body.heure || `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    resume: st.resume || null,
    formules: Array.isArray(st.formules) ? st.formules : [],
    rdvModele: Array.isArray(st.rdvModele) ? st.rdvModele : [],
    memoire: Array.isArray(st.memoire) ? st.memoire.map(String) : [],
    abonnes: Array.isArray(st.abonnes) ? st.abonnes : [],
    dossiers: Array.isArray(st.dossiers) ? st.dossiers : [],
    events: Array.isArray(st.events) ? st.events : [],
    aVoir: Array.isArray(st.aVoir) ? st.aVoir : [],
  };
  const limite = iso(addDays(parse(aujourdhui), -90));
  s.dossiersVisibles = s.dossiers.filter(d => !(['paye', 'perdu'].includes(d.statut) && (d.datePaiement || d.dateSignature || '0000') < limite));
  const [du, au] = [iso(addDays(parse(aujourdhui), -7)), iso(addDays(parse(aujourdhui), 45))];
  s.eventsVisibles = s.events.filter(e => e.date >= du && e.date <= au).sort((a, b) => (a.date + (a.heure || '')).localeCompare(b.date + (b.heure || '')));
  return s;
}

function validerMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) throw new Error('messages manquants');
  const out = messages.slice(-30).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content ?? '').slice(0, 8000) }))
    .filter(m => m.content.trim());
  if (!out.length || out[out.length - 1].role !== 'user') throw new Error('le dernier message doit venir de Toufek');
  return out;
}

/* ---------- Boucle principale ---------- */
export async function runJarvis(body, client) {
  const s = preparer(body);
  const mode = body.mode === 'voice' ? 'voice' : 'text';
  const actions = [];
  const exec = outils(s, actions);
  const system = [
    { type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: contexte(s, mode) },
  ];
  const convo = validerMessages(body.messages);
  let fallbacks = process.env.JARVIS_FALLBACKS !== 'off';
  let reponse;
  const usage = { input: 0, output: 0, cache: 0 };

  for (let tour = 0; tour < MAX_TOURS; tour++) {
    const params = {
      model: MODEL, max_tokens: 8000,
      thinking: { type: 'adaptive' }, output_config: { effort: EFFORT },
      system, tools: TOOLS, messages: convo,
      ...(fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    };
    try {
      reponse = await client.beta.messages.create(params);
    } catch (e) {
      // Si la plateforme refuse le paramètre de repli, on continue sans (une seule fois).
      if (fallbacks && e instanceof Anthropic.BadRequestError && /fallback/i.test(e.message)) { fallbacks = false; tour--; continue; }
      throw e;
    }
    usage.input += reponse.usage?.input_tokens || 0; usage.output += reponse.usage?.output_tokens || 0; usage.cache += reponse.usage?.cache_read_input_tokens || 0;

    if (reponse.stop_reason === 'refusal') return { texte: "Je ne peux pas répondre à ça.", actions, modele: reponse.model, usage };
    if (reponse.stop_reason === 'pause_turn') { convo.push({ role: 'assistant', content: reponse.content }); continue; }
    const appels = reponse.content.filter(b => b.type === 'tool_use');
    if (!appels.length || reponse.stop_reason === 'max_tokens') break;

    convo.push({ role: 'assistant', content: reponse.content });
    const resultats = appels.map(t => {
      try {
        const fn = exec[t.name]; if (!fn) throw new Error(`outil inconnu : ${t.name}`);
        return { type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(fn(t.input || {})) };
      } catch (err) {
        return { type: 'tool_result', tool_use_id: t.id, is_error: true, content: String(err.message || err) };
      }
    });
    convo.push({ role: 'user', content: resultats });
  }

  const texte = reponse.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
    || (actions.length ? "C'est fait." : "Je n'ai pas de réponse.");
  return { texte, actions, modele: reponse.model, usage };
}

/* ---------- Handler HTTP (Vercel) ---------- */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, modele: MODEL, effort: EFFORT, cleApi: !!process.env.ANTHROPIC_API_KEY, tokenDefini: !!process.env.JARVIS_TOKEN });
  }
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'méthode non autorisée' });

  if (!process.env.JARVIS_TOKEN) return res.status(500).json({ erreur: "JARVIS_TOKEN n'est pas défini sur Vercel (Settings → Environment Variables)." });
  if ((req.headers['x-jarvis-token'] || '') !== process.env.JARVIS_TOKEN) return res.status(401).json({ erreur: 'Jeton Jarvis invalide. Vérifie-le dans Réglages.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ erreur: "ANTHROPIC_API_KEY n'est pas définie sur Vercel. Crée une clé sur console.anthropic.com puis ajoute-la dans Settings → Environment Variables, et redéploie." });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const client = new Anthropic({ maxRetries: 2, timeout: 120_000 });
    const out = await runJarvis(body, client);
    return res.status(200).json(out);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return res.status(502).json({ erreur: 'La clé API Anthropic est refusée. Vérifie ANTHROPIC_API_KEY sur Vercel.' });
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ erreur: 'Trop de demandes en même temps, réessaie dans quelques secondes.' });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ erreur: `Erreur de l'API Claude (${e.status}) : ${e.message}` });
    return res.status(400).json({ erreur: e.message || String(e) });
  }
}
