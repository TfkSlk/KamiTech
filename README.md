# Kami Groupe — Tableau de bord

Tableau de bord personnel pour piloter toutes les activités du groupe :

- **KamiFood** — abonnements des restaurants et RDV inclus dans la souscription
- **CEE** — certificats d'économie d'énergie
- **Énergie** — fournisseurs d'énergie pour les pros
- **Taxe foncière** — récupération pour les professionnels

## Fonctionnalités

- **Accueil** : gains de la période, tendance sur 6 mois, camembert par secteur, charge de la semaine, agenda du jour, retards, 7 prochains jours.
- **Planning** : vues Jour / Semaine / Mois, grille horaire (clic sur un créneau pour ajouter), charge par jour et par secteur, relances affichées automatiquement.
- **Apport** : suivi des prospects et clients (Prospect → RDV → Étude → Signé → Payé / Perdu), filtres et recherche.
- **KamiFood** : abonnés, formules, revenu récurrent mensuel, RDV inclus planifiés automatiquement.
- **Gains et temps** : répartition des gains et du temps (camemberts), gains par mois sur 6 mois, tableau par secteur avec € par heure.
- **Jarvis** : le cerveau (Claude) qui connaît tes données, parle français, ajoute/modifie RDV, dossiers, abonnés, mémorise, et répond à la voix (mot d'activation configurable, « Jarvis » ou « Kami »).
- **Réglages** : nom, formules KamiFood, RDV inclus, export / import de sauvegarde.

## Utilisation

En ligne sur Vercel (projet `kami-groupe-dashboard`), ou ouvrir `index.html` dans un navigateur.

Les données sont enregistrées **uniquement dans le navigateur** (localStorage). Exporter régulièrement une sauvegarde depuis Réglages.

## Jarvis (le cerveau)

`api/jarvis.js` est une fonction Vercel qui appelle l'API Claude (`claude-opus-5`, thinking adaptatif, repli serveur activé).
Le tableau de bord lui envoie la conversation et une projection de ses données ; le cerveau exécute ses outils
(chercher, agenda, ajouter/modifier RDV, dossiers, abonnés, retenir, ouvrir) et renvoie le texte + les actions,
que le tableau de bord rejoue sur ses propres données. Le serveur ne stocke rien.

Variables d'environnement Vercel :

| Variable | Rôle |
|---|---|
| `ANTHROPIC_API_KEY` | clé API Anthropic (console.anthropic.com) — obligatoire |
| `JARVIS_TOKEN` | jeton partagé ; à coller aussi dans Réglages → Jarvis |
| `JARVIS_MODEL` | optionnel, défaut `claude-opus-5` |
| `JARVIS_EFFORT` | optionnel, `low` / `medium` (défaut) / `high` |
| `JARVIS_FALLBACKS` | `off` pour désactiver le repli serveur |

Voix : reconnaissance et synthèse du navigateur (Chrome / Edge / Safari). En mains libres, il ne réagit que si la phrase commence par son nom.
