# @finals-hq/web

Le site FINALS HQ : Next.js 15 (App Router), Tailwind avec les tokens du design system (phase E), next-intl
(FR et EN, préfixe d'URL, slugs anglais), lecture seule de la base Postgres remplie par `apps/worker`.

## Pages

| Adresse | Contenu | Cache |
| --- | --- | --- |
| `/fr`, `/en` | accueil : top 10, ligne top 500, en forme, répartition par division | ISR 60 s |
| `/[locale]/leaderboards` | tous les classements (catalogue) | statique |
| `/[locale]/leaderboards/[season]/[board]` | classement complet : `s12/ranked`, `s12/worldtour`, `s1/ranked-steam`, `events/ce44`… | ISR 60 s (archives : données en cache 24 h) |
| `/[locale]/search?q=` | recherche (même moteur que la palette Ctrl K) | dynamique, CDN 60 s sur l'API |
| `/[locale]/players/[name]` | profil (`GOJO-6255` pour `GOJO#6255`) : en-tête, courbe RS / rang (ECharts chargé à la demande), KPI, activité, répartition, onglet Carrière (archives, records, badges, Legacy) ; états masqué, hors top 10 000, inconnu | ISR 120 s à la demande |
| `/[locale]/following` | joueurs suivis, liste stockée dans le navigateur (`hq-following`), export / import JSON | statique, état chargé par `/api/following?ids=` |
| `/[locale]/top-500` | ligne top 500 : RS du 500e (relevé par heure depuis `cutoff_history`), courbe, projection Theil-Sen dès 7 jours de relevés (`src/lib/cutoff.ts`), joueurs des rangs 495 à 505, joueurs suivis face à la ligne, seuils des saisons passées (S3 et après) ; libellé « Ruby » si la ligue 21 apparaît | ISR 60 s |
| `/[locale]/clubs` | classement des clubs par tag, agrégats des membres présents dans le top 10 000 ; `?q=`, `?sort=total|avg|members|d7|best`, `?show=` | à la demande, données en cache 60 s |
| `/[locale]/clubs/[tag]` | page club : KPI, membres classés avec leur ligue ; état « aucun membre classé » depuis la table `clubs` | ISR 60 s à la demande |
| `/[locale]/compare?p=A-0001,B-0002` | comparaison de 2 à 4 joueurs (`src/lib/compare.ts`), meilleur de chaque ligne surligné, courbes superposées ; l'URL se partage | à la demande |
| `/[locale]/movers?w=24h|7d|season&dir=up|down` | plus fortes progressions et plus grosses chutes de RS (100 premiers) | à la demande, données en cache 60 s |
| `/[locale]/more` | onglet « Plus » du téléphone | statique |
| `/[locale]/status` | fraîcheur par classement, passages du worker, taille de la base | ISR 60 s |
| `/[locale]/styleguide` | tokens et composants dans leurs états | dev et prévisualisations seulement |
| `/api/boards/[id]` | classement complet en colonnes (≈ 445 Ko, ≈ 160 Ko compressé) | CDN 60 s |
| `/api/search?q=` | 8 meilleurs résultats, 20 requêtes par minute et par IP | CDN 60 s |
| `/api/health` | 200 si la base répond | aucun |
| `/[locale]/about`, `/privacy`, `/legal` | à propos, confidentialité (RGPD), mentions légales ; identité de l'éditeur lue dans `LEGAL_*` | ISR 1 h |
| `/[locale]/privacy/request` | formulaire de masquage (`?player=GOJO-6255` le préremplit) | ISR 1 h |
| `/api/og/player/[slug]?l=fr&f=story` | carte de partage 1200×630, ou story 1080×1920 avec `f=story` (`&dl=1` pour la télécharger) | CDN 10 min |
| `/api/og/club/[tag]`, `/api/og/compare?p=`, `/api/og/site` | cartes du club, de la comparaison, du site | CDN 10 min (site : 24 h) |
| `/api/privacy-request` (POST) | enregistre une demande de masquage « pending », 5 par heure et par IP | aucun |
| `/api/hit` (POST) | compteur d'audience du jour (`profile_view`, `follow`, `search_empty`, `share`), 60 par minute et par IP | aucun |
| `/sitemap.xml`, `/sitemaps/{pages,players,clubs}.xml` | sitemaps avec hreflang (≈ 20 000 profils, ≈ 9 000 clubs) | CDN 1 h |
| `/robots.txt` | tout fermé hors domaine définitif, sauf `/api/og/` | dynamique |

## Le tableau de classement

- Les 100 premières lignes sont rendues côté serveur (lisibles sans JavaScript, élément LCP) ; les 10 000 lignes
  arrivent ensuite par `/api/boards/[id]` quand le navigateur est libre.
- Virtualisé (TanStack Virtual) : une trentaine de lignes dans le DOM quelle que soit la position, colonnes rang et
  joueur collées à gauche, en-tête collé, défilement horizontal des chiffres sur téléphone.
- Tri, filtres (ligue, tag de club, pseudo) et position dans l'URL : `?league=d1&club=XYZ&sort=change24h&page=15`.
- Rang affiché d'un classement en cours = ordre des scores du dernier relevé (les rangs stockés sont ceux du dernier
  relevé complet). Archives : rang final de l'API, sans colonnes de variation.

## Développer

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # puis DATABASE_URL
pnpm --filter @finals-hq/web dev               # http://localhost:3000
pnpm --filter @finals-hq/web test              # vitest : requêtes sur PGlite, état du tableau, formats
```

Base locale avec de vraies données (ce qui a servi à développer le sprint 2) : un Postgres 16 local, puis
`pnpm worker migrate`, `pnpm worker ingest --data-root <checkout finals-hq-data>` et `pnpm worker import-archives`.
`LOCAL_DATABASE_URL=… pnpm --filter @finals-hq/web test` mesure alors la recherche sur 478 000 joueurs (critère : moins
de 100 ms côté base) et le classement S12 complet.

Parcours de bout en bout (téléphone et ordinateur, axe-core, captures dans `tests/e2e/out/`) sur le site lancé :

```bash
pnpm --filter @finals-hq/web build && pnpm --filter @finals-hq/web start &
BASE_URL=http://localhost:3000 pnpm --filter @finals-hq/web e2e
```

## Choix à connaître

- **Thème** : sombre par défaut, posé par un script en tête de page depuis `localStorage` (ou le thème du système)
  avant le premier rendu. La phase E prévoyait un cookie lu côté serveur ; cela rendait chaque page dynamique et
  cassait l'ISR, d'où ce script (même résultat : pas de flash).
- **Sentry** : rien sans `NEXT_PUBLIC_SENTRY_DSN`. Le SDK navigateur est chargé après la page (import dynamique) pour
  ne pas peser sur le budget de 150 Ko de JavaScript initial ; les erreurs des toutes premières secondes ne sont
  donc pas remontées côté navigateur (le serveur, lui, est couvert dès le démarrage).
- **Région** : fonctions Vercel à Francfort (`fra1`, `vercel.json`), à côté de la base Supabase (eu-central-1).
- **Robots** : indexé seulement en production **et** sur le domaine définitif (`NEXT_PUBLIC_SITE_URL` hors `*.vercel.app`,
  voir `src/lib/site.ts`) ; `HQ_INDEX=1` force l'indexation. Les cartes `/api/og/` restent ouvertes aux robots (X les lit).
- **Accent clair** : `accent-ink` passe de #5E7A00 à #567000 sur le thème clair (4,49:1 → 5,1:1 sur #F4F4F7,
  mesuré par axe-core). Le thème sombre ne change pas.

## Profil joueur (sprint 3)

- Courbe : clôtures quotidiennes de `player_history` avant le premier événement gardé, puis chaque changement de `rs_events` (8 jours), puis un point « maintenant » au dernier relevé (le rang bouge sans match). Tracé en marches : le RS tient jusqu'au changement suivant.
- Indicateurs dérivés (`src/lib/profile.ts`, purs et testés) : pic, jours joués sur les jours réellement observés, distance à la ligne top 500, variation du rang (7 jours, sinon depuis le début de la collecte avec la date affichée). Rien n'est extrapolé.
- Rang affiché partout (classement, profil, recherche, suivi) dans le même ordre : score, puis rang stocké, puis identifiant.
- Carrière : meilleur résultat ranked par saison terminée, toutes plateformes ; Legacy calculé avec `@finals-hq/core/rating`.
- Le Rating (jauge, radar) arrive au sprint 5 ; le profil affiche « en calibration » d'ici là.

## Partage, légal, qualité (sprint 6)

- **Cartes** (`src/lib/og.tsx`, next/og) : profil, club, comparaison, site ; story 1080×1920 du profil (bouton « Story » :
  menu de partage du téléphone avec l'image, sinon téléchargement). Polices auto-hébergées dans `assets/og-fonts`
  (OFL, incluses dans les fonctions par `outputFileTracingIncludes`). Profil masqué ou inconnu : carte générique, jamais le pseudo.
- **Écritures** : les seules (`src/lib/writes.ts`) sont une demande de masquage « pending » et un compteur par jour.
  Appliquer un masquage reste une décision humaine : `worker privacy apply` (voir `apps/worker/README.md`).
- **Audience** : Vercel Web Analytics (sans cookie, seulement si `VERCEL=1`) + compteurs du jour en base, sans IP ni identifiant.
- **Budget** : 150 Ko de JavaScript compressé au premier chargement de l'accueil, du classement et du profil, vérifié par le parcours e2e (132, 145 et 143 Ko mesurés le 7 nov. 2026).
