# @finals-hq/worker

Ingestion des relevés du collecteur [finals-hq-data](https://github.com/gojoziaa-debug/finals-hq-data)
vers Postgres. Un fichier (snapshot complet ou delta) = une transaction ; un fichier déjà ingéré est
ignoré, donc le worker peut tourner aussi souvent qu'on veut.

## Commandes

```bash
pnpm --filter @finals-hq/worker worker migrate                       # applique packages/db/migrations (DIRECT_URL)
pnpm --filter @finals-hq/worker worker ingest --data-root ../../data # chaînes full + deltas de state/
pnpm --filter @finals-hq/worker worker import-archives --data-root ../../data   # seasons/ → season_results, une fois
pnpm --filter @finals-hq/worker worker status                        # JSON : dernier relevé par classement, derniers passages, taille de la base
pnpm --filter @finals-hq/worker test                                 # vitest sur Postgres en mémoire (PGlite)
```

Variables : voir `.env.example`. Le worker ne lit que `DATABASE_URL`, `DIRECT_URL` et `DATA_ROOT`.

## Ce que fait un passage `ingest`

Pour chaque classement présent dans `state/` (et dans le catalogue `packages/db/src/catalog.ts`) :

1. lit `manifest.json`, liste la chaîne (`full` puis `delta` dans l'ordre) et les fichiers d'`archive/` s'ils sont présents ;
2. saute les fichiers déjà dans `snapshots` ; rejette (et mémorise comme rejeté) un delta dont le prédécesseur n'a pas été appliqué, un fichier au format inattendu ou une ligne sans le champ de score attendu ;
3. reconstruit l'état (`leaderboard_current`), fusionne les lignes partielles des deltas, recalcule les rangs d'après les scores ;
4. résout l'identité des nouveaux noms (règles de la phase C : même nom → même joueur ; renommage détecté par nom de plateforme unique ; contradiction de plateforme → nouveau joueur + candidature ; noms sans `#` → identité propre au classement) ;
5. écrit un `rs_events` par joueur dont le score, la ligue ou le club a changé, le premier fichier d'un jour UTC ferme la veille dans `rank_daily`, et chaque fichier laisse une ligne dans `cutoff_history` ;
6. recalcule `delta_24h` / `delta_7d` sur les classements touchés, puis journalise le passage dans `ingestion_runs`.

Les rangs de `leaderboard_current` sont ceux du dernier relevé complet pour les joueurs inactifs : le site
ordonne par score (`leaderboard_current_order_idx`) pour afficher le rang courant.

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
contradiction d'identité, rupture de chaîne, nouvelle chaîne, archive) sur une base PGlite migrée avec les vrais
fichiers SQL. Un test supplémentaire ingère un vrai snapshot de 10 000 lignes quand un checkout de
`finals-hq-data` existe à côté du dépôt (ignoré en CI).
