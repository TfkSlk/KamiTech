/*
 * Lire : le lecteur local des notes de prise de contact, en français, sans réseau ni clé.
 * « croisé Karim de Karim SARL, on a parlé du KGD Pro, je lui envoie le dossier, rappelle-moi dans 3 jours, à voir début 2027 »
 * → nom, entreprise, service, qui attend quoi, rappel, créneau, téléphone, et les morceaux reconnus (jetons).
 * Même schéma que la réponse d'api/analyser.js : quand la clé Anthropic sera posée, Claude ne fera que compléter.
 * Pur : ni DOM ni état. Ses propres outils de date, en heure locale, semaine du lundi au dimanche.
 * Un seul nom exposé : window.Lire = { lireNote, normaliser, scoreFlou, jourOuvre, premierNom }.
 */
(function (racine) {
  'use strict';

  /* ---------- Dates (heure locale, à minuit) ---------- */
  const deux = n => String(n).padStart(2, '0');
  const isoJ = d => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
  const jour = (a, m, j) => new Date(a, m, j);
  const plusJours = (d, n) => jour(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const finDuMois = (a, m) => new Date(a, m + 1, 0).getDate();
  /* + n mois, jour borné au dernier jour du mois (31 janv. + 1 mois = 28 févr.) */
  const plusMois = (d, n) => { const a = d.getFullYear(), m = d.getMonth() + n; return jour(a, m, Math.min(d.getDate(), finDuMois(a, m))); };
  const lundiDe = d => plusJours(d, -((d.getDay() + 6) % 7));
  const depuisIso = s => { const [a, m, j] = s.split('-').map(Number); return jour(a, m - 1, j); };
  /* Date, horodatage ou « AAAA-MM-JJ » → Date à minuit local (aujourd'hui si illisible) */
  function versDate(x) {
    if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x)) return depuisIso(x.slice(0, 10));
    let d = x == null ? new Date() : new Date(typeof x === 'object' && typeof x.getTime === 'function' ? x.getTime() : x);
    if (isNaN(d.getTime())) d = new Date();
    return jour(d.getFullYear(), d.getMonth(), d.getDate());
  }
  /* Samedi et dimanche glissent au lundi */
  function jourOuvre(d) { const x = versDate(d), j = x.getDay(); return j === 6 ? plusJours(x, 2) : j === 0 ? plusJours(x, 1) : x; }

  /* Libellés courts, comme toLocaleDateString('fr-FR') : « mar. 13 oct. » */
  const JOURS_C = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const jourCourt = s => { const d = depuisIso(s); return `${JOURS_C[d.getDay()]} ${d.getDate()} ${MOIS_C[d.getMonth()]}`; };
  const jourMois = (s, annee) => { const d = depuisIso(s); return `${d.getDate()} ${MOIS_C[d.getMonth()]}${annee ? ' ' + d.getFullYear() : ''}`; };

  /* ---------- Texte ---------- */
  /* Minuscules, sans accents, apostrophes droites : même longueur que le texte d'origine (les positions se correspondent) */
  const CAR = Object.create(null);
  function car(c) {
    let r = CAR[c];
    if (r === undefined) {
      if ('’‘ʼ`´'.includes(c)) r = "'";
      else if ('   \t\r'.includes(c)) r = ' ';
      else if ('–—‑−'.includes(c)) r = '-';
      else {
        const x = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        r = x.length === 1 ? x : (c.toLowerCase().length === 1 ? c.toLowerCase() : c);
      }
      CAR[c] = r;
    }
    return r;
  }
  function normaliser(s) {
    s = s == null ? '' : String(s);
    let o = '';
    for (let i = 0; i < s.length; i++) o += car(s[i]);
    return o;
  }

  /* Ressemblance de 0 à 1 : identique 1 ; début de mot (mot entier 0,8 à 1, début seulement 0,6 à 0,9) ; sous-chaîne 0,4 à 0,7 ; lettres dans l'ordre 0,1 à 0,5 */
  /* Texte normalisé et resserré, mémorisé (les mêmes noms de fiches reviennent à chaque frappe) */
  const PREP = new Map();
  function prep(s) {
    s = s == null ? '' : String(s);
    let r = PREP.get(s);
    if (r === undefined) { r = normaliser(s).replace(/\s+/g, ' ').trim(); if (PREP.size > 5000) PREP.clear(); PREP.set(s, r); }
    return r;
  }
  function scoreFlou(q, cible) { return scoreN(prep(q), prep(cible)); }
  /* Même calcul sur deux textes déjà normalisés */
  function scoreN(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const r = Math.min(1, a.length / b.length);
    const lettre = c => c !== undefined && /[a-z0-9]/.test(c);
    let best = 0;
    for (let i = b.indexOf(a); i >= 0; i = b.indexOf(a, i + 1)) {
      let s;
      if (!lettre(b[i - 1])) s = lettre(b[i + a.length]) ? 0.6 + 0.3 * r : 0.8 + 0.2 * r;
      else s = 0.4 + 0.3 * r;
      if (s > best) best = s;
    }
    if (best) return Math.min(best, 0.99);
    let k = 0;
    for (let j = 0; j < b.length && k < a.length; j++) if (b[j] === a[k]) k++;
    return k === a.length ? 0.1 + 0.4 * r : 0;
  }

  /* ---------- Référentiels ---------- */
  const SECTEURS = { kamifood: 'KamiFood', kgdpro: 'KGD Pro', cee: 'CEE', energie: 'Énergie', foncier: 'Foncier & CFE', perso: 'Perso / Groupe' };
  /* Secteurs : mots entiers, sans accents ; le poids départage (le service cité l'emporte sur le type de commerce) */
  const SECTEUR_RE = [
    [/\bkami ?food\b/g, 'kamifood', 3],
    [/\bkgd[ -]?pro\b/g, 'kgdpro', 3],
    [/\bcee\b/g, 'cee', 3],
    [/\b(?:certificats? d'economies? d'energie|economies? d'energie)\b/g, 'cee', 3],
    [/\b(?:pompes? a chaleur|pac|isolation|chauffage|eclairage|leds?|relamping)\b/g, 'cee', 2],
    [/\b(?:taxes? foncieres?|foncier(?:e|es|s)?|cfe)\b/g, 'foncier', 3],
    [/\blocaux\b/g, 'foncier', 1],
    [/\b(?:contrats? de fourniture|electricite|gaz|edf|engie)\b/g, 'energie', 2],
    [/\benergies?\b/g, 'energie', 1],
    [/\b(?:restos?|restaurants?|brasseries?|pizzerias?)\b/g, 'kamifood', 1],
  ];
  /* Qui attend quoi : « moi » = Toufek doit quelque chose, « lui » = il attend quelque chose */
  const ATTENTE_RE = [
    [/\bje (?:lui|leur) (?:envoie|envoies|renvoie|transmets|fais|prepare|donne|passe|propose|dois|redis|confirme)\b/g, 'moi'],
    [/\bje dois\b/g, 'moi'],
    [/\bje (?:le|la|les) (?:rappelle|recontacte|relance)\b/g, 'moi'],
    [/\bje (?:vais|dois) (?:lui|leur)\b/g, 'moi'],
    [/\bje reviens vers (?:lui|elle|eux|elles)\b/g, 'moi'],
    [/\b(?:il|elle|ils|elles) (?:attend|attendent) (?:une|un|ma|mon|mes|le|la|les|des|notre|nos)\b/g, 'moi'],
    [/\b(?:a )?(?:lui|leur) (?:envoyer|transmettre|faire|preparer|renvoyer)\b/g, 'moi'],
    [/\b(?:il|elle|ils|elles) (?:m'|me |nous )(?:envoie|envoient|renvoie|renvoient|transmet|transmettent|fait|font|rappelle|rappellent|confirme|confirment|revient|reviennent|dit|disent)/g, 'lui'],
    [/\b(?:il|elle|ils|elles) (?:doit|doivent|va|vont) (?:me|m'|nous)/g, 'lui'],
    [/\bm'(?:envoie|envoient|envoyer|renvoie|transmet)\b/g, 'lui'],
    [/\bme (?:renvoie|renvoient|transmet|transmettent|fait parvenir|font parvenir|revient|rappelle)\b/g, 'lui'],
    [/\bj'attends?\b/g, 'lui'],
    [/\ben attente (?:de|d'|du|des)/g, 'lui'],
    [/\brevient vers moi\b/g, 'lui'],
  ];
  const ATTENTE_LIB = { moi: 'tu lui dois quelque chose', lui: 'tu attends son retour' };

  /* ---------- Téléphone ---------- */
  const TEL_RE = /(^|[^\d+])((?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4})(?!\d)/;

  /* ---------- Nom et entreprise (sur le texte d'origine : les majuscules comptent) ---------- */
  const MOT_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*['’]?|[^\s\p{L}\p{N}]/gu;
  const MAJ = /^\p{Lu}/u;
  const STOP = new Set(('croise croisee croises vu vue vus rencontre rencontree appele appelee revu revue eu avec chez rdv rendez visio demo reunion '
    + 'rappel rappelle rappeler relance relancer recontacter je j il elle on nous vous ils elles le la les l un une des du de d ce cet cette ca c '
    + 'mon ma mes ton ta tes son sa ses leur leurs notre votre aujourd aujourdhui demain hier apres avant lundi mardi mercredi jeudi vendredi samedi dimanche '
    + 'semaine mois annee debut fin mi signature devis dossier ok bon bien super top pas passe passer voir a au aux en pour dans et ou mais donc puis si '
    + 'tres plus kgd pro kamifood cee edf engie taxe contrat pizzeria restaurant resto brasserie sarl sas sasu eurl sa sci snc client cliente prospect '
    + 'appel tel telephone mail email sms message note urgent important interesse interessee besoin attention envoyer envoie faire fait qui que quoi '
    + 'parle parler discute vois attends attendre penser pense noter merci salut bonjour bonsoir hello oui non peut-etre peut faut matin midi soir').split(' '));
  const TITRES = new Set(['m', 'mme', 'mlle', 'mr', 'monsieur', 'madame', 'mademoiselle', 'me', 'dr', 'docteur', 'maitre']);
  const FORMES = new Set(['sarl', 'sas', 'sasu', 'eurl', 'sa', 'sci', 'snc', 'selarl', 'scop', 'scm', 'gie']);
  const VERBES_AVANT = new Set(['croise', 'croisee', 'croises', 'vu', 'vue', 'vus', 'rencontre', 'rencontree', 'appele', 'appelee', 'revu', 'revue', 'avec', 'chez', 'eu',
    'rappelle', 'rappeler', 'relance', 'relancer', 'appeler', 'appelle', 'contacter', 'recontacter', 'revoir']);
  /* Mots qui terminent une enseigne même avec une majuscule (début d'une autre phrase) */
  const HORS_ENSEIGNE = new Set('je j il elle on nous vous ils elles rdv rappel rappelle demain aujourd lundi mardi mercredi jeudi vendredi samedi dimanche'.split(' '));
  const LIENS_ENS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', '&', 'sur', 'en']);
  /* Types de commerce et adjectifs qui ouvrent souvent une note (« Hôtel du Parc : … », « Grosse boîte de transport ») : jamais un prénom */
  const COMMERCES = new Set(('hotel cafe bar pharmacie boulangerie boucherie charcuterie patisserie fromagerie poissonnerie epicerie superette supermarche '
    + 'tabac garage cabinet salon institut agence magasin boutique atelier entrepot usine clinique ecole college lycee creche mairie boite societe entreprise '
    + 'restaurant resto brasserie pizzeria bistrot bistro creperie traiteur auberge camping gite residence ehpad laverie pressing imprimerie menuiserie '
    + 'cave librairie fleuriste opticien optique concession station centre domaine chateau ferme cinema theatre hopital banque etude bureau bureaux local').split(' '));
  const ADJ_TETE = new Set('belle beau bel bonne bon grosse gros grand grande petite petit nouvelle nouveau nouvel vieux vieille jeune super sympa enorme'.split(' '));
  const PONCT_PHRASE = new Set(['.', ',', ';', ':', '!', '?', '(', ')', '-', '–', '—', '/']);

  function motsDe(texte) {
    const t = [];
    for (const m of texte.matchAll(MOT_RE)) {
      const s = m[0], mot = /[\p{L}\p{N}]/u.test(s[0]);
      const n = normaliser(s);
      t.push({ s, n, tete: n.split(/['-]/)[0], debut: m.index, fin: m.index + s.length, mot, maj: mot && MAJ.test(s), article: mot && /^[ldLD]['’]\p{Lu}/u.test(s) });
    }
    return t;
  }
  /* Mot qui peut être un prénom ou un nom : majuscule, pas un mot courant, pas un sigle (CEE, EDF) */
  const motNom = w => !!w && w.mot && w.maj && !STOP.has(w.tete) && !FORMES.has(w.n) && !(w.s.length >= 2 && w.s === w.s.toUpperCase() && /\p{L}{2}/u.test(w.s));
  /* Personne à la position i : civilité facultative, puis un ou deux mots à majuscule */
  function personne(t, i) {
    let j = i, debut = -1;
    const w = t[j];
    if (w && w.mot && w.maj && TITRES.has(w.n)) {
      debut = w.debut; j++;
      if (t[j] && t[j].s === '.') j++;
      if (!(t[j] && t[j].mot && t[j].maj && !STOP.has(t[j].tete))) return null;
    } else if (!motNom(w) || COMMERCES.has(w.tete) || ADJ_TETE.has(w.tete)) return null;
    if (debut < 0) debut = t[j].debut;
    let fin = t[j].fin; j++;
    if (motNom(t[j]) && t[j].debut - fin <= 2 && !COMMERCES.has(t[j].tete)) { fin = t[j].fin; j++; }
    return { debut, fin, j };
  }
  /* Enseigne à la position i : article facultatif, mots à majuscule reliés par de / la / & ; forme juridique repérée */
  function enseigne(t, i) {
    let j = i, debut = -1, fin = -1, forme = false, mots = 0;
    if (t[j] && t[j].mot && ['la', 'le', 'les'].includes(t[j].n)) j++;
    while (t[j] && mots < 7) {
      const w = t[j];
      const ok = w.mot && ((w.maj && !HORS_ENSEIGNE.has(w.tete)) || FORMES.has(w.n) || w.article);
      if (ok) {
        if (debut < 0) debut = w.article ? w.debut + 2 : w.debut;
        fin = w.fin; mots++; j++;
        if (FORMES.has(w.n)) forme = true;
        continue;
      }
      if (debut >= 0 && (LIENS_ENS.has(w.n) || w.s === '&')) {
        let k = j;
        while (t[k] && (LIENS_ENS.has(t[k].n) || t[k].s === '&')) k++;
        if (t[k] && t[k].mot && (t[k].maj || t[k].article)) { j = k; continue; }
      }
      break;
    }
    return debut < 0 ? null : { debut, fin, forme, j, mots };
  }
  /* Une note qui commence par un commerce et son nom (« Hôtel du Parc : … », « Café de la Poste, … ») : c'est l'entreprise, pas une personne */
  function commerceEnTete(t, i0) {
    const w = t[i0];
    if (!w || !w.mot || !COMMERCES.has(w.tete)) return null;
    let k = i0 + 1;
    while (t[k] && t[k].mot && LIENS_ENS.has(t[k].n)) k++;
    if (!t[k] || !t[k].mot || !(t[k].maj || t[k].article) || HORS_ENSEIGNE.has(t[k].tete)) return null;
    const e = enseigne(t, k);
    return e && { debut: w.debut, fin: e.fin, forme: e.forme, j: e.j };
  }
  /* Le mot de liaison entre la personne et son entreprise : de, d', du, de chez, chez */
  function liaison(t, j) {
    const w = t[j];
    if (!w || !w.mot) return -1;
    if (w.n === 'de' && t[j + 1] && t[j + 1].n === 'chez') return j + 2;
    if (w.n === 'de' || w.n === 'du' || w.n === 'chez') return j + 1;
    if (/^d'/.test(w.n) && w.article) return j; // « d'Atelier Nord » : l'enseigne commence dans le même mot
    return -1;
  }
  const debutDePhrase = (t, i) => i === 0 || (!t[i - 1].mot && PONCT_PHRASE.has(t[i - 1].s)) || VERBES_AVANT.has(t[i - 1].n);
  /* Nom et entreprise : « X de Y SARL » partout ; « Prénom de (la) Enseigne » en début de phrase ou après croisé / vu / avec / chez ;
     sinon un prénom après croisé / vu / avec / chez, en tête de note, ou après une civilité */
  function nomEtEntreprise(texte, t) {
    t = t || motsDe(texte);
    let i0 = 0;
    while (t[i0] && !t[i0].mot) i0++;
    /* « Hôtel du Parc : … » : le commerce est l'entreprise ; la personne, s'il y en a une, se cherche après lui */
    const tete = commerceEnTete(t, i0);
    const i1 = tete ? tete.j : 0;
    let avecEnseigne = null;
    for (let i = i1; i < t.length && !avecEnseigne; i++) {
      const p = personne(t, i);
      if (!p) continue;
      const k = liaison(t, p.j);
      if (k < 0) continue;
      const e = enseigne(t, k);
      if (e && (e.forme || debutDePhrase(t, i))) avecEnseigne = { nom: p, entreprise: e };
    }
    if (avecEnseigne) return avecEnseigne;
    for (let i = Math.max(1, i1); i < t.length; i++) {
      if (!VERBES_AVANT.has(t[i - 1].n)) continue;
      const p = personne(t, i);
      if (p) return { nom: p, entreprise: tete };
    }
    /* Le premier mot de la note, ou le premier après le commerce et sa ponctuation (« Hôtel du Parc : Paul veut… ») */
    let i2 = i1;
    while (t[i2] && !t[i2].mot) i2++;
    const p0 = !tete || i2 > i1 ? personne(t, i2) : null;
    if (p0) return { nom: p0, entreprise: tete };
    for (let i = i1; i < t.length; i++) {
      if (t[i].mot && t[i].maj && TITRES.has(t[i].n)) { const p = personne(t, i); if (p) return { nom: p, entreprise: tete }; }
    }
    return { nom: null, entreprise: tete };
  }
  /* Sans Kami : le nom deviné depuis la note, sinon le début de la note (ancien comportement de l'écran Rencontre) */
  function premierNom(note) {
    note = note == null ? '' : String(note);
    const r = nomEtEntreprise(note);
    if (r.nom) return note.slice(r.nom.debut, r.nom.fin);
    return note.split(/[,:.]/)[0].trim().slice(0, 40);
  }

  /* ---------- Dates dans le texte (sur le texte normalisé) ---------- */
  const NB = "(\\d{1,2}|une|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze)";
  const NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15 };
  const MOIS = '(janvier|janv|jan|fevrier|fevr|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|sep|octobre|oct|novembre|nov|decembre|dec)\\.?(?![a-z])';
  const JOURS = '(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)';
  const JOURS_I = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 };
  const moisDe = s => ['jan', 'fev', 'mar', 'avr', 'mai', 'juin', 'juil', 'aou', 'sep', 'oct', 'nov', 'dec'].findIndex((p, i) => s.startsWith(p) && !(i === 5 && s.startsWith('juil')));
  const nombre = s => /^\d+$/.test(s) ? Number(s) : s === '1er' ? 1 : (NOMBRES[s] || 0);
  const PAS_APRES = '(?!\\s*(?:h\\b|h\\d|heures?\\b|:\\d|\\/|\\d|%|e\\b|eme\\b|ans?\\b|euros?\\b|€|k\\b|m2\\b|personnes?\\b|couverts?\\b|salaries?\\b|sites?\\b))';
  const R_DATES = [
    /* 12 novembre, jeudi 15 octobre, le 1er déc. 2026 */
    ['dateMois', new RegExp(`(?:\\b(?:le|ce)\\s+)?(?:\\b${JOURS}\\s+)?(?:\\ble\\s+)?\\b(1er|\\d{1,2})\\s+${MOIS}(?:\\s+(\\d{4})\\b)?`, 'g')],
    /* 12/11, 12/11/2026 */
    ['dateNum', new RegExp(`(?:\\b(?:le|ce)\\s+)?(?:\\b${JOURS}\\s+)?(?:\\ble\\s+)?\\b(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{4}|\\d{2}))?(?![\\d\\/])`, 'g')],
    /* le 12, jeudi le 15 */
    ['jourNum', new RegExp(`(?:\\b${JOURS}\\s+)?\\ble\\s+(1er|\\d{1,2})\\b${PAS_APRES}`, 'g')],
    /* jeudi 15 */
    ['jourNum', new RegExp(`\\b${JOURS}\\s+(1er|\\d{1,2})\\b${PAS_APRES}`, 'g')],
    /* aujourd'hui, ce soir, demain, après-demain */
    ['relatif', /\b(aujourd' ?hui|aujourd hui|ce\s+jour|ce\s+soir|ce\s+matin|cet\s+apres[- ]?midi|cet\s+aprem|apres[- ]demain|demain)\b/g],
    /* jeudi, ce jeudi, jeudi prochain (pas « jeudi dernier ») */
    ['jourSemaine', new RegExp(`(?:\\b(?:ce|cette)\\s+)?\\b${JOURS}(?:\\s+(prochain|pro|suivant|d'apres))?\\b(?!\\s+(?:dernier|passe)\\b)`, 'g')],
    /* dans 3 jours, d'ici deux semaines, sous 15 jours, dans un mois */
    ['dans', new RegExp(`\\b(?:dans|d'ici\\s+a|d'ici|sous)\\s+${NB}\\s*(jours?|j|semaines?|sem|s|mois|m)\\b(?![²³])`, 'g')],
    /* rappel 1 semaine, rappelle-moi 3 jours, à rappeler 2s (comme les puces de rappel) */
    ['rappelDans', new RegExp(`\\b(?:rappelle[- ]?moi|a\\s+rappeler|rappeler|rappel|a\\s+relancer|relancer|relance|recontacter)\\s+(?:a\\s+|sous\\s+)?${NB}\\s*(jours?|j|semaines?|sem|s|mois|m)\\b(?![²³])`, 'g')],
    /* 3j, 2s, 1m, 2sem seuls dans leur bout de phrase (voir abregeSeul : « 80m² », « plafond à 4m » ne sont pas des dates), J+3 */
    ['abrege', /\b(\d{1,2})(j|s|m|sem)(?![a-z0-9²³'])/g],
    ['jPlus', /\bj ?\+ ?(\d{1,2})\b/g],
    /* semaine prochaine, semaine pro, la prochaine semaine, cette semaine, la semaine du 19 (octobre) */
    ['semaine', /\b(?:(?:la|une)\s+)?(?:semaine\s+(prochaine|pro|suivante|d'apres)|(prochaine)\s+semaine|(cette)\s+semaine)\b/g],
    ['semaineDu', new RegExp(`\\b(?:la\\s+)?semaine\\s+du\\s+(1er|\\d{1,2})(?:\\s+${MOIS}|\\/(\\d{1,2}))?`, 'g')],
    /* début / mi / fin + mois : du 1 au 10, du 11 au 20, du 20 au dernier jour */
    ['tiersMois', new RegExp(`\\b(debut|mi|fin)(?:\\s*-\\s*|\\s+)(?:(?:de|du)\\s+|d')?${MOIS}(?:\\s+(\\d{4})\\b)?`, 'g')],
    /* fin du mois, début du mois prochain, mi-mois */
    ['tiersMoisCourant', /\b(debut|mi|fin)(?:\s*-\s*|\s+)(?:(?:de|du)\s+)?(?:ce\s+)?mois(?:\s+(prochain|pro|suivant))?\b/g],
    /* début 2027 (du 4 janvier au 28 février), fin d'année */
    ['tiersAn', /\b(debut|mi|fin)(?:\s*-\s*|\s+)(?:d'annee\s+|de\s+l'annee\s+)?(\d{4})\b/g],
    ['tiersAnCourant', /\b(debut|mi|fin)\s+(?:d'annee|de\s+l'annee|d'an)(?:\s+(prochaine))?\b/g],
    /* en novembre, courant mars, dans le courant de juin, au mois d'avril */
    ['moisEntier', new RegExp(`\\b(?:en|courant|dans\\s+le\\s+courant\\s+(?:de\\s+|d')|au\\s+mois\\s+(?:de\\s+|d'))\\s*${MOIS}(?:\\s+(\\d{4})\\b)?`, 'g')],
    ['moisProchain', /\b(?:le\s+)?mois\s+(?:prochain|pro|suivant)\b/g],
    ['anEntier', /\b(?:en|courant)\s+(\d{4})\b/g],
    ['anProchain', /\b(?:l'annee\s+prochaine|l'an\s+prochain)\b/g],
  ];
  /* Heures : 14h, 14h30, 14:30, 9h, midi ; le matin = 9 h, l'aprèm ou l'après-midi = 14 h */
  const R_HEURES = [
    ['exacte', /\b(?:(?:a|vers|des|pour)\s+)?([01]?\d|2[0-3])\s?(?:h(?:eures?)?|:)\s?([0-5]\d)?(?![a-z0-9])/g],
    ['midi', /\b(?:a\s+)?midi\b/g],
    ['matin', /\b(?:(?:le|du|en|dans\s+la)\s+)?matin(?:ee)?\b/g],
    ['aprem', /(?:\b(?:l'|en\s+|dans\s+l'|d')|\b)(?:apres[- ]?midi|aprems?)\b/g],
  ];
  /* Ce qui précède une date et part avec elle hors du sujet : « rappelle-moi », « à voir », « pour », « le »… */
  const AVANT_DATE = /(?:\b(?:rappelle[- ]?(?:moi|le|la|les|lui)|rappel|relance|relancer|a rappeler|a relancer|a recontacter|a revoir|a voir|a caler|a prevoir|rdv|rendez[- ]vous|on se voit|on se revoit|on se rappelle|on en reparle)\s*,?\s*)?(?:\b(?:jusqu'(?:au|aux|a\s+la|a\s+le|a|en)|d'ici(?:\s+la)?|avant(?:\s+la|\s+le)?|a\s+partir\s+(?:de|du)|pour(?:\s+la|\s+le)?|vers(?:\s+la|\s+le)?|des|plutot|en|au|a\s+la|a|le|la|ce|cette)\s+)?$/;
  const MOT_RAPPEL = /\b(?:rappel\w*|relanc\w*|recontact\w*)/g;
  const MOT_RDV = /\b(?:rdv|rendez[- ]vous|visio|demo|reunion|dejeuner|dej|presentation|signature|installation|formation|cafe|rencontrer|se voir|on se (?:voit|revoit|retrouve)|je passe|passer (?:le|la|les) voir|passe (?:le|la|les) voir|sur place)\b/g;
  /* Un verbe de rencontre au passé : « vu Karim ce matin » date la rencontre, ce n'est ni un rappel ni un RDV */
  const VERBE_RENCONTRE = /\b(?:vu|vue|vus|croise|croisee|croises|rencontre|rencontree|rencontres|eu|appele|appelee|appeles|revu|revue|passe|passee|parle|discute|dejeune|echange)\b/;
  /* Ce qui fait d'« aujourd'hui » ou « ce soir » une échéance : « avant ce soir », « d'ici ce soir », « pour aujourd'hui » */
  const ECHEANCE = /\b(?:avant|d'ici|pour|des|a partir d[eu]|jusqu'a|au plus tard)(?:\s+(?:la|le|ce|cet|cette))?\s*$/;
  const OBJETS = { demo: 'Démo', signature: 'Signature', installation: 'Installation', formation: 'Formation', reunion: 'Réunion', dejeuner: 'Déjeuner', dej: 'Déjeuner', cafe: 'Café' };
  const SEPARATEURS = /[.;!?\n,]|\b(?:et|puis|mais|sinon)\b/g;

  /* Prochaine date d'un jour du mois (« le 12 ») : ce mois si elle n'est pas passée, sinon le mois suivant qui l'a */
  function prochainJourDuMois(R, j) {
    for (let k = 0; k < 13; k++) {
      const a = R.getFullYear(), m = R.getMonth() + k;
      if (j <= finDuMois(a, m)) { const d = jour(a, m, j); if (d >= R) return d; }
    }
    return null;
  }
  /* Jour et mois sans année : cette année si la date n'est pas passée, sinon l'an prochain */
  function dateAnnee(R, j, m, a) {
    if (m < 0 || m > 11 || j < 1) return null;
    if (a) { if (a < 100) a += 2000; return j <= finDuMois(a, m) ? jour(a, m, j) : null; }
    for (let y = R.getFullYear(); y <= R.getFullYear() + 4; y++) {
      if (j <= finDuMois(y, m)) { const d = jour(y, m, j); if (d >= R) return d; }
    }
    return null;
  }
  /* Période d'un mois : début (1 au 10), mi (11 au 20), fin (20 au dernier jour), ou le mois entier */
  function periodeMois(R, quoi, m, a) {
    const borne = y => {
      const der = finDuMois(y, m);
      const [d1, d2] = quoi === 'debut' ? [1, 10] : quoi === 'mi' ? [11, 20] : quoi === 'fin' ? [20, der] : [1, der];
      return [jour(y, m, d1), jour(y, m, d2)];
    };
    let y = a || R.getFullYear(), p = borne(y);
    if (!a && p[1] < R) p = borne(++y);
    return p;
  }
  /* Période d'une année : début = 4 janvier au 28 février (règle d'api/analyser.js), mi = mai-juin, fin = 15 novembre au 31 décembre */
  const periodeAn = (quoi, y) => quoi === 'debut' ? [jour(y, 0, 4), jour(y, 1, 28)] : quoi === 'mi' ? [jour(y, 4, 1), jour(y, 5, 30)] : quoi === 'fin' ? [jour(y, 10, 15), jour(y, 11, 31)] : [jour(y, 0, 1), jour(y, 11, 31)];

  /* Jour et mois sans année déjà passés cette année, depuis moins de 4 mois (« sa facture du 12/09 ») : sans mot-clé, une date de contexte */
  function passeRecent(R, j, m) {
    const y = R.getFullYear();
    if (m < 0 || m > 11 || j < 1 || j > finDuMois(y, m)) return false;
    const d = jour(y, m, j);
    return d < R && R - d < 122 * 864e5;
  }
  /* « 3j », « 2s », « 1m » sans mot-clé : seuls dans leur bout de phrase (« Paul, CEE, 3j »), ou tout à la fin de la note (sauf « m »)
     après un mot qui n'annonce pas une mesure. « entrepôt de 80m² », « plafond à 4m », « 12m de vitrine », « 20s de vidéo » ne sont pas des dates. */
  const MESURE_AVANT = new Set('de du des d a au aux en sur par fait font mesure x environ et ou plus moins pour avec dans fois'.split(' '));
  const SEP_ABREGE = ',;:.!?()/\n-';
  function abregeSeul(s, debut, fin, unite) {
    const apres = s.slice(fin), avant = s.slice(0, debut).replace(/\s+$/, '');
    if (!/^\s*(?:$|[,;:.!?()\/\n-])/.test(apres)) return false;
    if (!avant || SEP_ABREGE.includes(avant[avant.length - 1])) return true;
    if (unite === 'm' || !/^\s*[.!]?\s*$/.test(apres)) return false;
    const mot = /([a-z]+)$/.exec(avant);
    return !!mot && !MESURE_AVANT.has(mot[1]);
  }

  /* Une expression trouvée → { type: 'jour' | 'semaine' | 'periode', date | du, au, heure, relatif } (null si invalide ou passée) */
  function valeurDate(sorte, g, R) {
    const J = s => JOURS_I[s];
    switch (sorte) {
      case 'dateMois': case 'dateNum': {
        const j = sorte === 'dateMois' ? nombre(g[2]) : Number(g[2]), mo = sorte === 'dateMois' ? moisDe(g[3]) : Number(g[3]) - 1, a = g[4] ? Number(g[4]) : 0;
        const d = dateAnnee(R, j, mo, a);
        return d && { type: 'jour', date: d, passe: !a && passeRecent(R, j, mo) };
      }
      case 'jourNum': { const n = nombre(g[2]); if (n < 1 || n > 31) return null; const d = prochainJourDuMois(R, n); return d && { type: 'jour', date: d }; }
      case 'relatif': {
        const s = g[1];
        if (/^apres/.test(s)) return { type: 'jour', date: plusJours(R, 2) };
        if (s === 'demain') return { type: 'jour', date: plusJours(R, 1) };
        return { type: 'jour', date: R, heure: /matin/.test(s) ? '09:00' : /apres|aprem/.test(s) ? '14:00' : '', vague: true, auj: true };
      }
      case 'jourSemaine': {
        const w = J(g[1]);
        if (g[2]) return { type: 'jour', date: plusJours(lundiDe(R), 7 + (w + 6) % 7) };
        return { type: 'jour', date: plusJours(R, ((w - R.getDay() + 7) % 7) || 7) };
      }
      case 'dans': case 'rappelDans': case 'abrege': case 'jPlus': {
        const n = nombre(g[1]), u = sorte === 'jPlus' ? 'j' : g[2], seul = sorte === 'abrege';
        /* Plafonds : au-delà, c'est une mesure ou une faute de frappe, pas un rappel (un contact ne doit pas disparaître des années) */
        const max = /^j/.test(u) ? (seul ? 31 : 99) : /^s/.test(u) ? (seul ? 8 : 52) : (seul ? 12 : 24);
        if (!n || n > max) return null;
        if (/^j/.test(u)) return { type: 'jour', date: plusJours(R, n === 8 ? 7 : n === 15 ? 14 : n), relatif: true };
        if (/^s/.test(u)) return { type: 'jour', date: plusJours(R, 7 * n), relatif: true };
        return { type: 'jour', date: plusMois(R, n), relatif: true };
      }
      case 'semaine': return { type: 'semaine', du: g[3] ? lundiDe(R) : plusJours(lundiDe(R), 7) };
      case 'semaineDu': {
        const n = nombre(g[1]);
        const d = g[2] ? dateAnnee(R, n, moisDe(g[2]), 0) : g[3] ? dateAnnee(R, n, Number(g[3]) - 1, 0) : prochainJourDuMois(R, n);
        return d && { type: 'semaine', du: lundiDe(d) };
      }
      case 'tiersMois': case 'moisEntier': {
        const quoi = sorte === 'moisEntier' ? 'tout' : g[1], m = moisDe(sorte === 'moisEntier' ? g[1] : g[2]), a = Number(sorte === 'moisEntier' ? g[2] : g[3]) || 0;
        if (m < 0) return null;
        const [du, au] = periodeMois(R, quoi, m, a);
        return { type: 'periode', du, au };
      }
      case 'tiersMoisCourant': case 'moisProchain': {
        const quoi = sorte === 'moisProchain' ? 'tout' : g[1];
        const d = sorte === 'moisProchain' || g[2] ? plusMois(jour(R.getFullYear(), R.getMonth(), 1), 1) : R;
        const [du, au] = periodeMois(d, quoi, d.getMonth(), d.getFullYear());
        return au < R ? null : { type: 'periode', du, au };
      }
      case 'tiersAn': { const [du, au] = periodeAn(g[1], Number(g[2])); return { type: 'periode', du, au }; }
      case 'tiersAnCourant': {
        let y = R.getFullYear() + (g[2] ? 1 : 0), p = periodeAn(g[1], y);
        if (p[1] < R) p = periodeAn(g[1], ++y);
        return { type: 'periode', du: p[0], au: p[1] };
      }
      case 'anEntier': { const y = Number(g[1]); return y < R.getFullYear() || y > R.getFullYear() + 10 ? null : { type: 'periode', du: jour(y, 0, 1), au: jour(y, 11, 31) }; }
      case 'anProchain': { const y = R.getFullYear() + 1; return { type: 'periode', du: jour(y, 0, 1), au: jour(y, 11, 31) }; }
    }
    return null;
  }

  /* Morceaux qui ne se chevauchent pas : le plus long l'emporte, puis le premier */
  function sansChevauchement(liste) {
    const pris = [];
    liste.sort((a, b) => (b.fin - b.debut) - (a.fin - a.debut) || a.debut - b.debut);
    for (const c of liste) if (!pris.some(p => c.debut < p.fin && p.debut < c.fin)) pris.push(c);
    return pris.sort((a, b) => a.debut - b.debut);
  }
  /* x figure dans n en mots entiers (n et x normalisés) */
  const lettreOuChiffre = c => c !== undefined && /[a-z0-9]/.test(c);
  function motsDans(n, x) {
    for (let i = n.indexOf(x); i >= 0; i = n.indexOf(x, i + 1)) if (!lettreOuChiffre(n[i - 1]) && !lettreOuChiffre(n[i + x.length])) return true;
    return false;
  }
  /* Masque un morceau déjà lu, sans changer les positions (ni espace ni lettre : rien ne s'y accroche) */
  const masquer = (s, debut, fin) => s.slice(0, debut) + '\u0001'.repeat(fin - debut) + s.slice(fin);

  /* ---------- Lecture d'une note ---------- */
  function lireNote(texte, ref, connus, ignores) {
    texte = texte == null ? '' : String(texte);
    const R = versDate(ref);
    const ign = new Set(Array.isArray(ignores) ? ignores : []);
    const n = normaliser(texte);
    const jetons = [];
    const jeton = (cle, valeur, libelle, debut, fin) => { const j = { cle, valeur, libelle, debut, fin, ignore: ign.has(cle) }; jetons.push(j); return j; };
    const retirer = []; // morceaux à retirer du sujet (dates et téléphone retenus)

    /* Téléphone */
    let tel = '', m = n;
    const mt = TEL_RE.exec(texte);
    if (mt) {
      const debut = mt.index + mt[1].length, fin = debut + mt[2].length;
      const j = jeton('tel', mt[2], mt[2], debut, fin);
      m = masquer(m, debut, fin);
      /* « au 06… », « tél : 06… » partent avec le numéro */
      const avant = /(?:\b(?:joignable au|au|tel|telephone|numero|num|portable|mobile|son)\s*:?\s*)$/.exec(n.slice(Math.max(0, debut - 20), debut));
      if (!j.ignore) { tel = mt[2]; retirer.push([debut - (avant ? avant[0].length : 0), fin]); }
    }

    /* Important : « ! », « signature » ou « annonce des prix » */
    let important = false;
    const mi = /!|\bsignature\b|\bannonce des prix\b/.exec(n);
    if (mi) { const j = jeton('important', true, 'important', mi.index, mi.index + mi[0].length); important = !j.ignore; }

    /* Nom et entreprise */
    const mots = motsDe(texte);
    const ne = nomEtEntreprise(texte, mots);
    let nom = '', entreprise = '';
    const spansNE = [];
    if (ne.nom) { const v = texte.slice(ne.nom.debut, ne.nom.fin); const j = jeton('nom', v, v, ne.nom.debut, ne.nom.fin); if (!j.ignore) nom = v; spansNE.push([ne.nom.debut, ne.nom.fin]); }
    if (ne.entreprise) { const v = texte.slice(ne.entreprise.debut, ne.entreprise.fin); const j = jeton('entreprise', v, v, ne.entreprise.debut, ne.entreprise.fin); if (!j.ignore) entreprise = v; spansNE.push([ne.entreprise.debut, ne.entreprise.fin]); }

    /* Secteur : le plus fort, puis le premier ; un mot pris dans le nom de l'entreprise compte peu */
    let sect = null;
    for (const [re, k, poids] of SECTEUR_RE) {
      re.lastIndex = 0;
      for (const x of n.matchAll(re)) {
        const debut = x.index, fin = debut + x[0].length;
        const p = spansNE.some(([a, b]) => debut < b && a < fin) ? 0.5 : poids;
        if (!sect || p > sect.p || (p === sect.p && debut < sect.debut)) sect = { k, p, debut, fin };
      }
    }
    let activite = '';
    if (sect) { const j = jeton('activite', sect.k, SECTEURS[sect.k], sect.debut, sect.fin); if (!j.ignore) activite = sect.k; }

    /* Qui attend quoi : la première formule reconnue */
    let att = null;
    for (const [re, k] of ATTENTE_RE) {
      re.lastIndex = 0;
      const x = re.exec(n);
      if (x && (!att || x.index < att.debut)) att = { k, debut: x.index, fin: x.index + x[0].length };
    }
    let attente = '';
    if (att) { const j = jeton('attente', att.k, ATTENTE_LIB[att.k], att.debut, att.fin); if (!j.ignore) attente = att.k; }

    /* Dates */
    const cands = [];
    for (const [sorte, re] of R_DATES) {
      re.lastIndex = 0;
      for (const g of m.matchAll(re)) {
        if (sorte === 'abrege' && !abregeSeul(m, g.index, g.index + g[0].length, g[2])) continue;
        const v = valeurDate(sorte, g, R);
        if (v) cands.push({ ...v, sorte, debut: g.index, fin: g.index + g[0].length, mot: sorte === 'rappelDans' ? 'rappel' : '', avant: n.slice(Math.max(0, g.index - 30), g.index) });
      }
    }
    const dates = sansChevauchement(cands);
    let reste = m;
    for (const d of dates) reste = masquer(reste, d.debut, d.fin);
    const heures = [];
    for (const [sorte, re] of R_HEURES) {
      re.lastIndex = 0;
      for (const g of reste.matchAll(re)) {
        const heure = sorte === 'exacte' ? `${deux(Number(g[1]))}:${g[2] || '00'}` : sorte === 'midi' ? '12:00' : sorte === 'matin' ? '09:00' : '14:00';
        heures.push({ heure, vague: sorte === 'matin' || sorte === 'aprem', debut: g.index, fin: g.index + g[0].replace(/\s+$/, '').length });
      }
    }
    /* Une heure se rattache à la date du jour la plus proche (rien d'autre entre les deux qu'une virgule ou « à ») */
    for (const h of sansChevauchement(heures)) {
      let best = null, ecart = 99;
      for (const d of dates) {
        if (d.type !== 'jour') continue;
        const [a, b] = h.debut >= d.fin ? [d.fin, h.debut] : [h.fin, d.debut];
        if (b < a) continue;
        const entre = m.slice(a, b).replace(/\b(?:a|vers|des|pour|le|la|en|dans)\b/g, '').replace(/[\s,]/g, '');
        if (entre || b - a > 16) continue;
        const e = b - a + (h.debut >= d.fin ? 0 : 1);
        if (e < ecart) { best = d; ecart = e; }
      }
      if (!best || (h.vague && best.heure && !best.vague)) continue;
      best.heure = h.heure; best.vague = h.vague;
      best.debut = Math.min(best.debut, h.debut); best.fin = Math.max(best.fin, h.fin);
    }
    /* Ce qui annonce la date (« rappelle-moi », « à voir », « le ») part avec elle */
    for (const d of dates) {
      let a = Math.max(0, d.debut - 40);
      while (a > 0 && a < d.debut && /[a-z0-9']/.test(m[a - 1])) a++; // jamais au milieu d'un mot
      const avant = m.slice(a, d.debut);
      const x = AVANT_DATE.exec(avant);
      if (x && x[0]) d.debut -= x[0].length;
    }
    /* Rappel ou créneau : chaque mot-clé va à une seule date de son bout de phrase, la première qui le suit (« rappelle-moi jeudi »),
       sinon la plus proche avant (« jeudi, je le rappelle ») */
    const seps = [];
    SEPARATEURS.lastIndex = 0;
    for (const x of n.matchAll(SEPARATEURS)) seps.push(x.index);
    const bout = d => [Math.max(-1, ...seps.filter(i => i < d.debut)), Math.min(n.length, ...seps.filter(i => i >= d.fin))];
    for (const d of dates) { [d.dp, d.fp] = bout(d); d.mots = []; }
    for (const [re, k] of [[MOT_RAPPEL, 'rappel'], [MOT_RDV, 'rdv']]) {
      re.lastIndex = 0;
      for (const x of n.matchAll(re)) {
        const c = { k, s: x[0], debut: x.index, fin: x.index + x[0].length };
        let best = null, ecart = 1e9;
        for (const d of dates) {
          if (c.debut <= d.dp || c.fin > d.fp) continue;
          const e = c.debut < d.fin && d.debut < c.fin ? (k === 'rdv' ? -1 : 0) : c.fin <= d.debut ? d.debut - c.fin : 1000 + c.debut - d.fin;
          if (e < ecart) { best = d; ecart = e; }
        }
        if (best) best.mots.push({ ...c, e: ecart });
      }
    }
    for (const d of dates) {
      d.kw = d.mot ? { k: d.mot, s: 'rappel' } : d.mots.sort((a, b) => a.e - b.e)[0] || null;
      d.role = d.kw ? (d.kw.k === 'rappel' ? 'rappel' : 'creneau') : d.type === 'jour' && !d.heure ? 'rappel' : 'creneau';
      /* Sans mot-clé, une date peut n'être que du contexte : le moment de la rencontre (« vu Karim ce matin », « Karim aujourd'hui »),
         une date récente passée (« sa facture du 12/09 »), « depuis le 1er mars ». Gardés : « avant ce soir », « aujourd'hui 18h ». */
      if (!d.kw && (d.passe || /\bdepuis(?:\s+(?:le|la|ce|cette))?\s*$/.test(d.avant)
        || (d.auj && (VERBE_RENCONTRE.test(n.slice(d.dp + 1, d.debut)) || !(ECHEANCE.test(d.avant) || (d.heure && !d.vague)))))) d.role = '';
    }
    /* Les dates annoncées par un mot-clé d'abord, puis les autres dans l'ordre du texte (pour un créneau, une date à venir avant une date passée) */
    const aVenir = d => (d.type === 'jour' ? d.date : d.du) > R ? 0 : 1;
    const ordre = [...dates.filter(d => d.kw), ...dates.filter(d => !d.kw && d.role === 'rappel'),
      ...dates.filter(d => !d.kw && d.role === 'creneau').sort((a, b) => aVenir(a) - aVenir(b) || a.debut - b.debut)];
    let rappel = '', creneau = { type: 'aucun', date: '', heure: '', du: '', au: '' }, objet = '', rappelLu = false, creneauLu = false;
    for (const d of ordre) {
      const kw = d.kw;
      if (d.role === 'rappel') {
        if (rappelLu) continue;
        rappelLu = true;
        const date = d.type === 'jour' ? (d.relatif ? jourOuvre(d.date) : d.date) : jourOuvre(d.du < R && d.au >= R ? R : d.du);
        const v = isoJ(date);
        const j = jeton('rappel', v, `rappel ${jourCourt(v)}`, d.debut, d.fin);
        if (!j.ignore) { rappel = v; retirer.push([d.debut, d.fin]); }
      } else if (d.role === 'creneau') {
        if (creneauLu) continue;
        creneauLu = true;
        let c, lib;
        if (d.type === 'jour') { c = { type: 'date', date: isoJ(d.date), heure: d.heure || '', du: '', au: '' }; lib = `RDV ${jourCourt(c.date)}${c.heure ? ' ' + c.heure : ''}`; }
        else if (d.type === 'semaine') { c = { type: 'semaine', date: '', heure: '', du: isoJ(d.du), au: '' }; lib = `semaine du ${jourMois(c.du)}`; }
        else {
          const du = d.du < R && d.au >= R ? R : d.du;
          c = { type: 'periode', date: '', heure: '', du: isoJ(du), au: isoJ(d.au) };
          const memeAn = du.getFullYear() === d.au.getFullYear();
          lib = `du ${jourMois(c.du, !memeAn)} au ${jourMois(c.au, d.au.getFullYear() !== R.getFullYear())}`;
        }
        const j = jeton('creneau', c, lib, d.debut, d.fin);
        if (!j.ignore) {
          creneau = c; retirer.push([d.debut, d.fin]);
          const k = kw && kw.k === 'rdv' ? normaliser(kw.s) : '';
          objet = k === 'demo' ? `Démo${activite ? ' ' + SECTEURS[activite] : ''}` : OBJETS[k] || 'Présentation des services';
        }
      }
    }
    /* Une attente reconnue sans date de rappel : rappel dans 3 jours, jamais un week-end */
    if (attente && !rappel && !ign.has('rappel')) rappel = isoJ(jourOuvre(plusJours(R, 3)));

    /* Contact déjà connu : le meilleur score ≥ 0,8 sur le nom ou l'entreprise */
    let existant = null;
    if (!ign.has('existant') && Array.isArray(connus) && connus.length) {
      let best = null, bestS = 0;
      const qN = prep(nom), qE = prep(entreprise);
      for (const c of connus) {
        if (!c || !c.id) continue;
        const cn = prep(c.nom || ''), ce = prep(c.entreprise || '');
        const sN = qN && cn ? scoreN(qN, cn) : 0;
        const sE = qE && ce ? Math.max(scoreN(qE, ce), 0.95 * scoreN(ce, qE)) : 0;
        /* Même prénom mais autre entreprise citée : ce n'est pas la même personne */
        let s = qE && ce && sE < 0.5 ? 0.7 * sN : Math.max(sN, sE);
        if (s < 0.8) {
          const dans = x => x.length >= 3 && motsDans(n, x);
          if (!nom && !ign.has('nom') && dans(cn)) s = Math.max(s, 0.9);
          if (!entreprise && !ign.has('entreprise') && ce.length >= 4 && dans(ce)) s = Math.max(s, 0.85);
        }
        if (s > bestS) { best = c; bestS = s; }
      }
      if (best && bestS >= 0.8) {
        existant = { type: best.type, id: best.id };
        if (!activite && !ign.has('activite') && SECTEURS[best.activite]) activite = best.activite;
      }
    }

    /* Sujet : le texte sans les dates ni le téléphone retenus, nettoyé, 140 caractères au plus */
    let sujet = texte;
    for (const [a, b] of retirer.sort((x, y) => y[0] - x[0])) sujet = sujet.slice(0, a) + ' ' + sujet.slice(b);
    sujet = sujet.replace(/\s+/g, ' ')
      .replace(/\s+([,.;])/g, '$1')
      .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
      .replace(/\s+(?:et|puis)\s*([,.;:]|$)/g, '$1')
      .replace(/^[\s,;:.\-–]+/, '')
      .replace(/(?:[\s,;:\-–]|\b(?:et|puis)\b)+$/, '')
      .trim();
    if (sujet.length > 140) { const c = sujet.slice(0, 139); sujet = (c.lastIndexOf(' ') > 100 ? c.slice(0, c.lastIndexOf(' ')) : c).replace(/[\s,;:]+$/, '') + '…'; }

    /* Résumé : « Karim · CEE · tu lui dois quelque chose · rappel mar. 13 oct. » */
    const cr = jetons.find(j => j.cle === 'creneau' && !j.ignore);
    const resume = [nom || entreprise, activite && SECTEURS[activite], attente && ATTENTE_LIB[attente], rappel && `rappel ${jourCourt(rappel)}`,
      cr && (creneau.type === 'periode' ? `à voir ${cr.libelle}` : cr.libelle), tel && `tél. ${tel}`, important && 'important', existant && 'déjà dans tes contacts'].filter(Boolean).join(' · ');

    jetons.sort((a, b) => a.debut - b.debut);
    return { nom, entreprise, activite, sujet, attente, rappel, creneau, objet, tel, resume, important, existant, jetons };
  }

  racine.Lire = Object.freeze({ lireNote, normaliser, scoreFlou, jourOuvre, premierNom });
})(typeof window !== 'undefined' ? window : globalThis);
