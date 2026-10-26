# Kami Groupe — Tableau de bord (KGD)

Tableau de bord personnel pour piloter toutes les activités du groupe :

- **KamiFood** — abonnements des restaurants et RDV inclus dans la souscription
- **CEE** — certificats d'économie d'énergie
- **Énergie** — négociation des fournitures énergétiques pour les pros
- **Foncier & CFE** — récupération de taxe foncière et de CFE pour les professionnels

## Fonctionnalités

- **Parle, je note** (le cœur de l'appli, en tête de l'accueil) : un toucher, Noter s'ouvre et l'écoute démarre. La note dictée est comprise avec le contexte : une prise de contact remplit la fiche en entier (qui, de quoi, ce qui est déjà fait, rappel, prochain RDV) et « Enregistrer » crée tout ; un RDV à poser ou déplacer, un dossier qui avance ou un abonné part chez Kami, qui agit avec le planning et les dossiers sous les yeux, « Annuler » à portée. Sans reconnaissance vocale (iPhone en appli installée), la touche micro du clavier prend le relais.
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

`api/jarvis.js` est une fonction Vercel qui appelle l'API Claude (`claude-opus-5-5`, thinking adaptatif, repli serveur activé).
Le tableau de bord lui envoie la conversation et une projection de ses données ; le cerveau exécute ses outils
(chercher, agenda, ajouter/modifier RDV, dossiers, abonnés, retenir, ouvrir) et renvoie le texte + les actions,
que le tableau de bord rejoue sur ses propres données. Le serveur ne stocke rien.

Variables d'environnement Vercel :

| Variable | Rôle |
|---|---|
| `ANTHROPIC_API_KEY` | clé API Anthropic (console.anthropic.com) — obligatoire |
| `JARVIS_TOKEN` | jeton partagé ; à coller aussi dans Réglages → Jarvis |
| `JARVIS_MODEL` | optionnel, défaut `claude-opus-5-5` |
| `JARVIS_EFFORT` | optionnel, `low` / `medium` (défaut) / `high` |
| `JARVIS_FALLBACKS` | `off` pour désactiver le repli serveur |

Voix : reconnaissance et synthèse du navigateur (Chrome / Edge / Safari). En mains libres, il ne réagit que si la phrase commence par son nom.
