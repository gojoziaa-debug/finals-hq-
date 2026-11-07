# @finals-hq/worker

Ingestion des relevés du collecteur [finals-hq-data](https://github.com/gojoziaa-debug/finals-hq-data)
vers Postgres. Un fichier (snapshot complet ou delta) = une transaction ; un fichier déjà ingéré est
ignoré, donc le worker peut tourner aussi souvent qu'on veut.

## Commandes

```bash
pnpm --filter @finals-hq/worker worker migrate                       # applique packages/db/migrations (DIRECT_URL)
pnpm --filter @finals-hq/worker worker ingest --data-root ../../data # chaînes full + deltas de state/ ; --keep-days 8 pour la purge de rs_events
pnpm --filter @finals-hq/worker worker import-archives --data-root ../../data   # seasons/ → season_results, une fois
pnpm --filter @finals-hq/worker worker rating [--force]              # Rating v1 : au plus un calcul par heure ; rapport de calibration en Markdown
pnpm --filter @finals-hq/worker worker status                        # JSON : dernier relevé par classement, derniers passages, taille de la base
pnpm --filter @finals-hq/worker test                                 # vitest sur Postgres en mémoire (PGlite)
```

Variables : voir `.env.example`. Le worker ne lit que `DATABASE_URL`, `DIRECT_URL`, `DATA_ROOT`, `RS_EVENTS_KEEP_DAYS` et `RATING_MIN_INTERVAL_MIN` (55 par défaut).

## Ce que fait un passage `ingest`

Pour chaque classement présent dans `state/` (et dans le catalogue `packages/db/src/catalog.ts`) :

1. lit `manifest.json`, liste la chaîne (`full` puis `delta` dans l'ordre) et les fichiers d'`archive/` s'ils sont présents ;
2. saute les fichiers déjà dans `snapshots` ; rejette (et mémorise comme rejeté) un delta dont le prédécesseur n'a pas été appliqué, un fichier au format inattendu ou une ligne sans le champ de score attendu ;
3. reconstruit l'état (`leaderboard_current`), fusionne les lignes partielles des deltas, recalcule les rangs d'après les scores ;
4. résout l'identité des nouveaux noms (règles de la phase C : même nom → même joueur ; renommage détecté par nom de plateforme unique ; contradiction de plateforme → nouveau joueur + candidature ; noms sans `#` → identité propre au classement) ;
5. sur les classements dont `history = 'events'` (ranked, World Tour et sponsor de la saison en cours), écrit un `rs_events`
   par joueur dont le score, la ligue ou le club a changé ; le premier fichier d'un jour UTC ferme la veille dans
   `player_history` (un tableau par joueur et par classement, voir plus bas), et chaque fichier laisse une ligne dans `cutoff_history` ;
6. recalcule `delta_24h` / `delta_7d` sur les classements touchés : écart avec la clôture de la veille / d'il y a sept jours,
   remplacé sur les classements `events` par l'écart glissant (dernier événement au plus tard 24 h / 7 j avant le relevé)
   quand il existe ; puis journalise le passage dans `ingestion_runs` ;
7. supprime les partitions journalières de `rs_events` plus vieilles que `--keep-days` (8 par défaut, `RS_EVENTS_KEEP_DAYS`).

Les rangs de `leaderboard_current` sont ceux du dernier relevé complet pour les joueurs inactifs : le site
ordonne par score (`leaderboard_current_order_idx`) pour afficher le rang courant.

## Stockage : pourquoi le schéma est compact (sprint 1b)

Le schéma initial pesait 617 Mo après l'import des archives et grossissait de 30 à 50 Mo par jour, pour 500 Mo
de quota sur Supabase Free (moyenne mensuelle, au-delà le projet passe en lecture restreinte). La migration
`0002_compact.sql` recrée tout ce qui se recharge depuis le dépôt de données :

| Choix | Effet |
| --- | --- |
| `leaderboards.id smallint` (catalogue, jamais renuméroté) à la place de la clé texte dans toutes les tables de faits | −20 octets par ligne et par index |
| `player_history` : un tableau `scores[]`, `ranks[]`, `league_numbers[]` par (classement, joueur), élément i = clôture du jour `history_start_day + i − 1`, NULL = absent ou jour sans relevé | ≈ 8 octets par joueur et par jour au lieu d'une ligne indexée |
| `rs_events` seulement pour `history = 'events'`, partitions `rs_events_YYYY_MM_DD` supprimées après `keep-days` jours | taille bornée (≈ 8 jours), suppression sans vacuum |
| `player_names` ne garde que les noms de plateforme et les anciens noms Embark ; recherche floue sur `players.embark_name` seulement | −140 Mo d'index |
| `leaderboard_current` sans copie JSON de la ligne API (reconstruite depuis les colonnes + `extra`) | −30 Mo |

`worker status` renvoie `database.alert = true` au-delà de 450 Mo et liste les plus grosses relations et index.

## Rating (sprint 5)

`worker rating` note chaque joueur du ranked en cours (`ratedBoards()`, aujourd'hui `s12-crossplay`) avec `@finals-hq/core/rating` :

1. charge, une requête à la fois, l'état courant (rang = ordre du tableau), les clôtures de `player_history`, les événements des 31 derniers jours de `rs_events` (8 gardés en pratique) et les saisons ranked archivées ;
2. mesure les références de population (médiane et MAD par fenêtre 24 h / 7 j / 30 j, distribution des reculs moyens, seuil d'anomalie au 99,9e centile **sur les seuls relevés espacés de 20 min au plus** : après un trou de collecte une variation cumule des dizaines de matchs) ;
3. remplace `ratings` en une transaction et ajoute une ligne à `rating_runs` (références en jsonb, purgées après 60 jours) ;
4. écrit le rapport de calibration (réel vs simulation de la phase D, notes par ligue, dix premiers, joueurs suivis, variations inhabituelles) dans le journal et dans le résumé du job.

Le site ne montre la note qu'avec `RATING_PUBLIC = true` (apps/web/src/lib/rating.ts) **et** sept jours de relevés ; les previews Vercel l'affichent déjà. Mesuré en local le 6 nov. 2026 sur l'historique réel rejoué : 10 000 joueurs notés en 1,6 s.

## Demandes de masquage (sprint 6)

Le formulaire du site (`/privacy/request`) enregistre une demande `pending` dans `hidden_profiles`. Rien n'est masqué
sans décision humaine (un joueur pourrait sinon en masquer un autre).

1. Lire la demande en entier (contact, message) dans l'éditeur SQL de Supabase :
   `SELECT p.embark_name, h.* FROM hidden_profiles h JOIN players p ON p.id = h.player_id WHERE h.status = 'pending';`
2. Vérifier que le compte est bien celui de la personne (par exemple une capture de son profil en jeu envoyée en message privé).
3. GitHub → Actions → **privacy** → Run workflow : `apply` (masquer), `reject` (refuser, raison obligatoire) ou `lift`
   (lever un masquage), avec le pseudo `GOJO#6255`, le slug `GOJO-6255` ou l'identifiant.

Commandes locales : `pnpm worker privacy list [--all] [--show-contact]`, `privacy apply|reject|lift <joueur> [--reason …]`,
`privacy check` (échoue si une demande attend depuis plus de 24 h ; efface les contacts 30 jours après la décision et les
compteurs d'audience de plus de 25 mois), `privacy purge`. Les journaux d'Actions de ce dépôt sont publics : la commande
n'y écrit jamais un contact ni un message en clair (`--show-contact` est ignoré dans Actions). Le workflow lance `check`
deux fois par jour ; GitHub t'envoie un e-mail quand il échoue. Le masquage est visible partout en 2 à 10 minutes (caches).

## Workflow GitHub Actions

`.github/workflows/ingest.yml` tourne toutes les 10 minutes (3 minutes après chaque créneau du collecteur),
sur `repository_dispatch` envoyé par le collecteur si le dépôt de données possède un secret `DISPATCH_TOKEN`,
et à la main (`import-archives` pour l'import unique des archives). Le job vérifie d'abord que `DATABASE_URL`
existe, applique les migrations, ingère, puis écrit l'état en résumé du job.

### Plan B si le cron GitHub ne démarre pas

Les crons GitHub Actions sont parfois en retard ou ne démarrent pas sur un dépôt récent. Dans l'ordre :

1. Un commit sur `main` (même vide de sens, par exemple une ligne de README) réveille souvent le planificateur.
2. Créer un token à grain fin sur GitHub (Settings → Developer settings → Fine-grained tokens) limité au dépôt
   `finals-hq-` avec la permission **Contents: read and write**, l'enregistrer comme secret `DISPATCH_TOKEN` sur
   `finals-hq-data` : chaque commit du collecteur déclenche alors l'ingestion sans cron.
3. Un planificateur externe gratuit (cron-job.org) qui appelle toutes les 10 minutes
   `POST https://api.github.com/repos/gojoziaa-debug/finals-hq-/actions/workflows/ingest.yml/dispatches`
   avec `{"ref":"main"}` et un token à grain fin limité à **Actions: read and write** sur ce dépôt.
4. En dernier recours, une tâche planifiée sur le PC qui exécute `pnpm --filter @finals-hq/worker worker ingest`
   après un `git pull` du dépôt de données.

## Tests

`test/ingest.test.ts` rejoue une chaîne synthétique (snapshot complet, deltas, renommage, changement de jour,
contradiction d'identité, rupture de chaîne, nouvelle chaîne, archive, classement sans événements avec jours sans
relevé, purge des partitions) sur une base PGlite migrée avec les vrais fichiers SQL. Un test supplémentaire ingère un vrai snapshot de 10 000 lignes quand un checkout de
`finals-hq-data` existe à côté du dépôt (ignoré en CI).
