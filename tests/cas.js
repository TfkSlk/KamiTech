/*
 * Banc d'essai du lecteur local (lire.js) : des phrases comme Toufek les tape ou les dicte après une rencontre,
 * avec ce que Lire.lireNote doit en tirer. Référence : samedi 10 octobre 2026.
 * Chargé par tests/lire.html (tableau vert / rouge) et par tests/lire.test.mjs (node, code 1 si un cas échoue).
 * Chaque cas : { note, attendu, connus?, ignores? }. Seuls les champs cités dans attendu sont comparés.
 * attendu.jetons : liste de { cle, texte } : le jeton doit exister et couvrir exactement ce morceau de la note.
 */
(function (racine) {
  'use strict';
  const REF = '2026-10-10';
  const AUCUN = { type: 'aucun', date: '', heure: '', du: '', au: '' };
  const date = (d, heure = '') => ({ type: 'date', date: d, heure, du: '', au: '' });
  const semaine = du => ({ type: 'semaine', date: '', heure: '', du, au: '' });
  const periode = (du, au) => ({ type: 'periode', date: '', heure: '', du, au });
  const ROTH = [{ type: 'c', id: 'x1', nom: 'Mme Roth', activite: 'foncier' }];
  const CONNUS = [
    { type: 'c', id: 'c1', nom: 'Mme Roth', entreprise: 'Pharmacie de la Gare', activite: 'foncier' },
    { type: 'c', id: 'c2', nom: 'Julien', entreprise: 'Pizzeria Nova', activite: 'kamifood' },
    { type: 'a', id: 'a1', nom: 'Sophie', entreprise: 'Le Petit Zinc', activite: 'kamifood' },
    { type: 'a', id: 'a2', nom: 'Karim', entreprise: 'Brasserie du Port', activite: 'kamifood' },
    { type: 'd', id: 'd1', nom: 'M. Martin', entreprise: 'Boulangerie Martin', activite: 'energie' },
    { type: 'd', id: 'd2', nom: 'Direction', entreprise: 'Hôtel du Parc', activite: 'energie' },
  ];

  const CAS = [
    /* Critères d'acceptation de l'item N1 */
    { note: 'rappelle-moi dans 3 jours', attendu: { rappel: '2026-10-13', creneau: AUCUN, sujet: '', jetons: [{ cle: 'rappel', texte: 'rappelle-moi dans 3 jours' }] } },
    { note: 'jeudi 14h', attendu: { creneau: date('2026-10-15', '14:00'), rappel: '' } },
    { note: 'semaine prochaine', attendu: { creneau: semaine('2026-10-12') } },
    { note: 'à voir début 2027', attendu: { creneau: periode('2027-01-04', '2027-02-28'), sujet: '' } },
    { note: 'fin octobre', attendu: { creneau: periode('2026-10-20', '2026-10-31') } },
    { note: 'mi-novembre', attendu: { creneau: periode('2026-11-11', '2026-11-20') } },
    {
      note: 'croisé Karim de Karim SARL, on a parlé du KGD Pro, je lui envoie le dossier, rappelle-moi dans 3 jours, à voir début 2027',
      attendu: {
        nom: 'Karim', entreprise: 'Karim SARL', activite: 'kgdpro', attente: 'moi', rappel: '2026-10-13', creneau: periode('2027-01-04', '2027-02-28'),
        sujet: 'croisé Karim de Karim SARL, on a parlé du KGD Pro, je lui envoie le dossier', tel: '', important: false, existant: null,
        resume: 'Karim · KGD Pro · tu lui dois quelque chose · rappel mar. 13 oct. · à voir du 4 janv. au 28 févr. 2027',
        jetons: [{ cle: 'nom', texte: 'Karim' }, { cle: 'entreprise', texte: 'Karim SARL' }, { cle: 'activite', texte: 'KGD Pro' }, { cle: 'attente', texte: 'je lui envoie' }, { cle: 'creneau', texte: 'à voir début 2027' }],
      },
    },
    { note: "il m'envoie ses avis de taxe foncière", attendu: { activite: 'foncier', attente: 'lui', rappel: '2026-10-13', nom: '', creneau: AUCUN } },
    { note: 'Julien de la Pizzeria Nova, démo KamiFood, je lui envoie le lien', attendu: { nom: 'Julien', entreprise: 'Pizzeria Nova', activite: 'kamifood', attente: 'moi', rappel: '2026-10-13', creneau: AUCUN } },
    { note: '06 12 34 56 78', attendu: { tel: '06 12 34 56 78', sujet: '', rappel: '' } },
    { note: "signature le jour de l'annonce des prix", attendu: { important: true, creneau: AUCUN, rappel: '' } },
    { note: "Mme Roth m'envoie ses avis", connus: ROTH, attendu: { nom: 'Mme Roth', existant: { type: 'c', id: 'x1' }, activite: 'foncier', attente: 'lui' } },
    { note: 'croisé Paul pour la CEE de son entrepôt', ignores: ['activite'], attendu: { activite: '', nom: 'Paul', sujet: 'croisé Paul pour la CEE de son entrepôt', jetons: [{ cle: 'activite', texte: 'CEE' }] } },

    /* Dates : jours de la semaine, relatifs, abréviations */
    { note: 'rappelle-moi jeudi', attendu: { rappel: '2026-10-15', creneau: AUCUN, sujet: '' } },
    { note: 'rappelle-moi jeudi prochain', attendu: { rappel: '2026-10-15' } },
    { note: 'rappel lundi', attendu: { rappel: '2026-10-12' } },
    { note: 'relancer samedi', attendu: { rappel: '2026-10-17' } },
    { note: 'rappelle-moi demain', attendu: { rappel: '2026-10-11' } },
    { note: 'à relancer après-demain', attendu: { rappel: '2026-10-12', sujet: '' } },
    { note: "rappelle-moi aujourd'hui", attendu: { rappel: '2026-10-10' } },
    { note: 'rappelle-moi dans une semaine', attendu: { rappel: '2026-10-19' } },
    { note: 'relance dans deux semaines', attendu: { rappel: '2026-10-26' } },
    { note: 'rappelle-moi dans un mois', attendu: { rappel: '2026-11-10' } },
    { note: 'rappelle-moi dans quinze jours', attendu: { rappel: '2026-10-26' } },
    { note: 'rappel 3j', attendu: { rappel: '2026-10-13', sujet: '' } },
    { note: 'à rappeler 2s', attendu: { rappel: '2026-10-26' } },
    { note: 'relance 1m', attendu: { rappel: '2026-11-10' } },
    { note: 'rappel 1 semaine', attendu: { rappel: '2026-10-19', sujet: '' } },
    { note: 'jeudi dernier on a parlé de la PAC', attendu: { rappel: '', creneau: AUCUN, activite: 'cee' } },

    /* Dates : jour du mois, numériques, mois en lettres */
    { note: 'rappelle-moi le 12', attendu: { rappel: '2026-10-12' } },
    { note: 'rappelle-moi le 5', attendu: { rappel: '2026-11-05' } },
    { note: 'rappelle-moi le 12/11', attendu: { rappel: '2026-11-12' } },
    { note: 'rappelle-moi le 3 novembre', attendu: { rappel: '2026-11-03' } },
    { note: 'relancer le 1er décembre', attendu: { rappel: '2026-12-01' } },
    { note: 'rappel le 3 octobre', attendu: { rappel: '2027-10-03' } },
    { note: 'RDV le 15/10 à 14h30', attendu: { creneau: date('2026-10-15', '14:30'), rappel: '', objet: 'Présentation des services', sujet: '' } },
    { note: 'rdv le 3 nov. à 10h', attendu: { creneau: date('2026-11-03', '10:00') } },

    /* Créneaux : heure, RDV, semaine, période */
    { note: 'rdv jeudi prochain à 9h', attendu: { creneau: date('2026-10-15', '09:00') } },
    { note: 'visio lundi 10h30', attendu: { creneau: date('2026-10-12', '10:30') } },
    { note: 'on se voit mardi midi', attendu: { creneau: date('2026-10-13', '12:00') } },
    { note: 'demain matin', attendu: { creneau: date('2026-10-11', '09:00') } },
    { note: "visio lundi l'aprèm", attendu: { creneau: date('2026-10-12', '14:00') } },
    { note: 'mercredi après-midi pour signer', attendu: { creneau: date('2026-10-14', '14:00') } },
    { note: 'rdv mercredi', attendu: { creneau: date('2026-10-14', ''), rappel: '' } },
    { note: 'démo KamiFood vendredi 15:00', attendu: { creneau: date('2026-10-16', '15:00'), objet: 'Démo KamiFood', activite: 'kamifood' } },
    { note: 'à caler semaine pro', attendu: { creneau: semaine('2026-10-12') } },
    { note: 'rdv la semaine du 19', attendu: { creneau: semaine('2026-10-19') } },
    { note: 'à voir fin du mois', attendu: { creneau: periode('2026-10-20', '2026-10-31') } },
    { note: 'plutôt début novembre', attendu: { creneau: periode('2026-11-01', '2026-11-10') } },
    { note: 'à revoir mi-janvier', attendu: { creneau: periode('2027-01-11', '2027-01-20') } },
    { note: 'brasserie sympa, à revoir en mars', attendu: { activite: 'kamifood', creneau: periode('2027-03-01', '2027-03-31'), sujet: 'brasserie sympa' } },
    { note: "d'ici fin d'année", attendu: { creneau: periode('2026-11-15', '2026-12-31') } },
    { note: 'rappelle-moi fin octobre', attendu: { rappel: '2026-10-20', creneau: AUCUN } },

    /* Secteurs */
    { note: "devis isolation et pompe à chaleur pour l'atelier", attendu: { activite: 'cee' } },
    { note: 'il veut passer ses bureaux en LED', attendu: { activite: 'cee' } },
    { note: 'contrat de fourniture à renégocier avant janvier', attendu: { activite: 'energie' } },
    { note: "ses factures d'électricité ont doublé", attendu: { activite: 'energie' } },
    { note: 'la CFE de ses locaux est trop chère', attendu: { activite: 'foncier' } },
    { note: 'resto de 40 couverts, il cherche un logiciel', attendu: { activite: 'kamifood' } },
    { note: 'Julien de la Pizzeria Nova pour la taxe foncière', attendu: { activite: 'foncier', entreprise: 'Pizzeria Nova' } },
    { note: 'on a parlé de ses vacances', attendu: { activite: '', attente: '', rappel: '', creneau: AUCUN, nom: '' } },

    /* Qui attend quoi */
    { note: 'je dois lui envoyer un devis', attendu: { attente: 'moi', rappel: '2026-10-13' } },
    { note: 'je le rappelle lundi', attendu: { attente: 'moi', rappel: '2026-10-12', sujet: 'je le rappelle' } },
    { note: "j'attends son retour, rappelle-moi le 20", attendu: { attente: 'lui', rappel: '2026-10-20' } },
    { note: 'il doit me renvoyer le contrat signé', attendu: { attente: 'lui', rappel: '2026-10-13' } },
    { note: 'elle me renvoie le bail', attendu: { attente: 'lui' } },

    /* Noms et entreprises */
    { note: 'croisé Jean Dupont de Dupont Frères SAS, isolation des combles, il m\'envoie le plan, rdv semaine pro', attendu: { nom: 'Jean Dupont', entreprise: 'Dupont Frères SAS', activite: 'cee', attente: 'lui', rappel: '2026-10-13', creneau: semaine('2026-10-12') } },
    { note: "M. Martin de la Boulangerie Martin, factures d'électricité, rdv mardi 10h", attendu: { nom: 'M. Martin', entreprise: 'Boulangerie Martin', activite: 'energie', creneau: date('2026-10-13', '10:00') } },
    { note: 'vu Sophie du Petit Zinc, elle veut passer en Premium', connus: CONNUS, attendu: { nom: 'Sophie', entreprise: 'Petit Zinc', existant: { type: 'a', id: 'a1' }, activite: 'kamifood' } },
    { note: 'Karim de chez Orange, fibre', attendu: { nom: 'Karim', entreprise: 'Orange' } },
    { note: 'rencontré Claire avec Paul', attendu: { nom: 'Claire' } },

    /* Téléphone et important */
    { note: 'Paul, tél : 06 11 22 33 44, CEE', attendu: { tel: '06 11 22 33 44', nom: 'Paul', activite: 'cee', sujet: 'Paul, CEE' } },
    { note: 'appelle-le au +33 6 12 34 56 78 demain', attendu: { tel: '+33 6 12 34 56 78', rappel: '2026-10-11', sujet: 'appelle-le' } },
    { note: 'relancer le 07.12.34.56.78 lundi', attendu: { tel: '07.12.34.56.78', rappel: '2026-10-12' } },
    { note: 'signature jeudi 10h !', attendu: { important: true, creneau: date('2026-10-15', '10:00'), objet: 'Signature' } },
    { note: 'urgent : il attend une réponse avant ce soir !', attendu: { important: true, attente: 'moi', rappel: '2026-10-10' } },

    /* Contacts déjà connus */
    { note: 'Mme Roth de la Pharmacie de la Gare, on se voit le 20 à 11h', connus: CONNUS, attendu: { existant: { type: 'c', id: 'c1' }, creneau: date('2026-10-20', '11:00') } },
    { note: 'croisé Karim de Karim SARL pour les CEE', connus: CONNUS, attendu: { existant: null, activite: 'cee' } },
    { note: "vu la direction de l'Hôtel du Parc pour l'électricité", connus: CONNUS, attendu: { existant: { type: 'd', id: 'd2' }, activite: 'energie' } },
    { note: 'Roth veut la simulation', connus: CONNUS, attendu: { existant: { type: 'c', id: 'c1' }, activite: 'foncier' } },
    { note: 'croisé Julien, il a signé', connus: CONNUS, ignores: ['existant'], attendu: { existant: null, nom: 'Julien' } },

    /* Morceaux ignorés : le champ reste vide, le texte reste dans le sujet */
    { note: 'rappelle-moi jeudi', ignores: ['rappel'], attendu: { rappel: '', sujet: 'rappelle-moi jeudi', jetons: [{ cle: 'rappel', texte: 'rappelle-moi jeudi' }] } },
    { note: 'Paul au 06 12 34 56 78', ignores: ['tel'], attendu: { tel: '', sujet: 'Paul au 06 12 34 56 78' } },
    { note: 'à voir début 2027', ignores: ['creneau'], attendu: { creneau: AUCUN, sujet: 'à voir début 2027' } },
    { note: "je lui envoie le devis", ignores: ['attente'], attendu: { attente: '', rappel: '' } },
  ];

  /* Compare ce que Lire a lu à l'attendu : renvoie la liste des écarts (vide si le cas est vert) */
  function comparer(note, obtenu, attendu) {
    const ecarts = [];
    const voir = v => JSON.stringify(v);
    for (const [k, v] of Object.entries(attendu)) {
      if (k === 'jetons') {
        for (const j of v) {
          const ok = (obtenu.jetons || []).some(x => x.cle === j.cle && note.slice(x.debut, x.fin) === j.texte);
          if (!ok) ecarts.push(`jeton ${j.cle} « ${j.texte} » absent (obtenu : ${(obtenu.jetons || []).map(x => `${x.cle} « ${note.slice(x.debut, x.fin)} »`).join(', ') || 'aucun'})`);
        }
      } else if (voir(obtenu[k]) !== voir(v)) ecarts.push(`${k} : attendu ${voir(v)}, obtenu ${voir(obtenu[k])}`);
    }
    return ecarts;
  }
  /* Lance tous les cas avec le lecteur donné */
  function executer(Lire) {
    return CAS.map(c => {
      const resultat = Lire.lireNote(c.note, REF, c.connus || [], c.ignores || []);
      return { ...c, resultat, ecarts: comparer(c.note, resultat, c.attendu) };
    });
  }
  /* Phrase de 200 caractères pour la mesure de vitesse */
  const PHRASE_200 = 'croisé Karim de Karim SARL au salon, on a parlé du KGD Pro et de la CEE, je lui envoie le dossier, il me renvoie ses factures, rappelle-moi dans 3 jours, rdv jeudi 14h30, à voir début 2027, 0612345678';

  racine.CAS_LIRE = { ref: REF, cas: CAS, comparer, executer, phrase200: PHRASE_200 };
})(typeof window !== 'undefined' ? window : globalThis);
