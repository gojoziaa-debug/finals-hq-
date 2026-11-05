# FINALS HQ

Tracker non officiel pour THE FINALS : classements, profils de joueurs et un rating propriétaire
(FINALS HQ Rating) calculé à partir des classements publics. Projet de fans, sans lien avec Embark Studios.

Les données proviennent de l'API communautaire `api.the-finals-leaderboard.com` ; les instantanés sont
collectés dans le dépôt public [finals-hq-data](https://github.com/gojoziaa-debug/finals-hq-data).

## Organisation

| Dossier | Rôle |
| --- | --- |
| `packages/core` | Logique métier pure et testée (rating, statistiques). Aucune dépendance d'exécution. |
| `packages/db` | Schéma Postgres (Drizzle) et migrations. À venir. |
| `apps/worker` | Ingestion des instantanés vers la base. À venir. |
| `apps/web` | Site Next.js. À venir. |

## Démarrer

```bash
corepack enable
pnpm install
pnpm test        # tests unitaires (vitest)
pnpm typecheck   # tsc strict sur chaque package
```

Simulation du rating sur un instantané réel (fichier `full-*.json.gz` du dépôt de données) :

```bash
node --experimental-strip-types packages/core/scripts/simulate.ts <snapshot.json.gz> <dossier de sortie>
```

## Règles du projet

- Aucune donnée inventée : en développement, les données fictives sont marquées comme telles.
- Aucune collecte côté client qui touche au processus du jeu.
- Aucun secret dans le code : les variables d'environnement sont documentées dans `.env.example` de chaque app.
- TypeScript strict partout, `exactOptionalPropertyTypes` et `noUncheckedIndexedAccess` compris.
