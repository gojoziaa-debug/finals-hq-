# Changement de saison (ex. S12 → S13)

Répété le 7 novembre 2026 sur une copie locale de la base (données réelles, fausse saison 13 de 5 000 joueurs par classement).
La répétition a trouvé deux bugs, corrigés dans la même PR que ce document :

- `import-archives` ignorait un classement dès qu'il avait **un** snapshot en base. Une saison qui vient de finir a toute sa chaîne en direct dans `snapshots` : son classement final n'aurait jamais été importé (S12 vide dans les archives, carrières des profils sans S12).
- Les lignes `leaderboard_current` de la saison finie restaient en base : poids mort, et elles apparaissaient comme « en cours » sur les profils. Elles sont maintenant supprimées à l'import de l'archive, et `ingest` ignore la chaîne d'un classement dont la saison n'est plus en direct.

Mesures de la répétition (base locale compactée) : 329 Mo avant, 333 Mo après bascule + archive S12 + nouvelle saison. Les événements `rs_events` de la S12 partent seuls après 8 jours.

## Avant le jour J

1. Vérifier que l'API répond pour la nouvelle saison : `https://api.the-finals-leaderboard.com/v1/leaderboard/s13/crossplay` et les ids des modes (ils changent d'une saison à l'autre : comparer avec le dépôt leonlarsson/the-finals-api).
2. Vérifier les champs de la ligne ranked (rankScore, leagueNumber, league…) : si le format change, nouvelle version de schéma dans `RANKED_SCHEMA`.

## Le jour J, dans l'ordre

| # | Où | Quoi |
|---|---|---|
| 1 | dépôt app, PR | `packages/db/src/catalog.ts` : ajouter la saison (`SEASONS`, ordinal suivant, `isLive: true`), passer l'ancienne à `isLive: false`, ajouter ses ids dans `SEASON_IDS` et `RANKED_SCHEMA`. Nouveau mode : l'ajouter **en fin** de `MODE_ORDER` et dans `MODE_NAMES`. |
| 2 | dépôt data, PR | `config/leaderboards.json` : remplacer les ids `s12*` par les `s13*`. `config/archives.json` : ajouter les 8 classements `s12*` (crossplay). |
| 3 | les deux | Merger les deux PR à quelques minutes d'écart (app d'abord). Entre les deux, un ingest peut finir en erreur « classement absent du catalogue » : sans gravité, les fichiers sont repris au passage suivant. |
| 4 | dépôt data, Actions | `import-archives` → Run workflow (vide = tous les manquants) : télécharge le classement final S12 dans `seasons/`. |
| 5 | dépôt app, Actions | `ingest` → Run workflow, commande `import-archives` : importe la S12 dans `season_results` et supprime ses lignes en direct. |
| 6 | site | Vérifier : accueil « Saison 13 », `/fr/leaderboards/s12/ranked` affiche « Saison terminée », un profil montre S12 dans la carrière et S13 en cours, `/fr/status` vert. |

## À surveiller les jours suivants

- La taille de la base sur `/fr/status` (alerte à 450 Mo).
- Le Rating : en début de saison personne n'est au-dessus des derniers paliers, le niveau A est volontairement plat (voir `packages/core/src/rating/level.ts`).
- Les seuils de ligue déduits (`apps/web/src/lib/league.ts`, `DEDUCED_THRESHOLDS_S12`) : à revérifier sur la nouvelle saison.
