# FINALS HQ

Tracker non officiel pour THE FINALS : classements, profils de joueurs et un rating propriétaire
(FINALS HQ Rating) calculé à partir des classements publics. Projet de fans, sans lien avec Embark Studios.

Les données proviennent de l'API communautaire `api.the-finals-leaderboard.com` ; les instantanés sont
collectés dans le dépôt public [finals-hq-data](https://github.com/gojoziaa-debug/finals-hq-data).

## Organisation

| Dossier | Rôle |
| --- | --- |
| `packages/core` | Logique métier pure et testée (rating, statistiques). Aucune dépendance d'exécution. |
| `packages/db` | Schéma Postgres (Drizzle), migrations SQL, catalogue des 82 classements, certificat racine Supabase. |
| `apps/worker` | Ingestion des instantanés vers la base, import des archives, état de la chaîne (`apps/worker/README.md`). |
| `apps/web` | Site Next.js : classements, recherche, état des données (`apps/web/README.md`). |

## Démarrer

```bash
corepack enable
pnpm install
pnpm test        # tests unitaires (vitest ; la base est PGlite, Postgres en mémoire)
pnpm typecheck   # tsc strict sur chaque package
pnpm worker status   # état de la base (DATABASE_URL requise, voir apps/worker/.env.example)
pnpm --filter @finals-hq/web dev   # le site sur http://localhost:3000 (DATABASE_URL dans apps/web/.env.local)
```

Base de données : Supabase Postgres (offre gratuite). Les migrations sont dans `packages/db/migrations`
et s'appliquent avec `pnpm worker migrate`. Le workflow `ingest.yml` les applique avant chaque ingestion.

Simulation du rating sur un instantané réel (fichier `full-*.json.gz` du dépôt de données) :

```bash
node --experimental-strip-types packages/core/scripts/simulate.ts <snapshot.json.gz> <dossier de sortie>
```

## Règles du projet

- Aucune donnée inventée : en développement, les données fictives sont marquées comme telles.
- Aucune collecte côté client qui touche au processus du jeu.
- Aucun secret dans le code : les variables d'environnement sont documentées dans `.env.example` de chaque app.
- TypeScript strict partout, `exactOptionalPropertyTypes` et `noUncheckedIndexedAccess` compris.
