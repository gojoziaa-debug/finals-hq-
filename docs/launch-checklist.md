# Checklist de lancement FINALS HQ (lancement visé : 25 novembre 2026)

Cochée au fur et à mesure. « GOJO » = action dans un compte ou une décision ; « Claude » = code ou vérification.

## Avant le merge du sprint 6

- [ ] GOJO · Vercel → Settings → Environment Variables (Production + Preview) : `LEGAL_NAME`, `LEGAL_EMAIL` (adresse dédiée au site), `LEGAL_LOCATION` (« Liège, Belgique »), puis redéployer.
- [ ] GOJO · Vercel → Analytics → activer Web Analytics (gratuit, sans cookie).
- [ ] GOJO · relire /fr/privacy, /fr/legal, /fr/about sur la preview.

## Juste après le merge

- [ ] Claude · vérifier le premier ingest depuis main (migration 0005 appliquée).
- [ ] GOJO · coller un lien de profil de la production dans un salon Discord privé : la carte s'affiche.
- [ ] GOJO · Actions → privacy → Run workflow `list` : le workflow tourne (aucune demande).
- [ ] Claude · PageSpeed Insights mobile sur l'accueil, le classement et un profil de la production (objectif > 90 partout).

## Pendant le rodage (18–24 nov.)

- [ ] GOJO · Sentry (facultatif, gratuit) : projet Next.js, `NEXT_PUBLIC_SENTRY_DSN` et `SENTRY_DSN` dans Vercel.
- [ ] GOJO · lire la politique de contenu de fans d'Embark ; Claude la cite sur /about.
- [ ] GOJO · acheter finalshq.gg ; Claude donne les enregistrements DNS ; `NEXT_PUBLIC_SITE_URL=https://finalshq.gg` dans Vercel (l'indexation s'ouvre seule).
- [ ] GOJO · Google Search Console : vérifier le domaine, soumettre `https://finalshq.gg/sitemap.xml`.
- [ ] GOJO · salon Discord de test, dix testeurs ; Claude rédige le message épinglé.
- [ ] Les deux · demande de masquage test envoyée puis appliquée en moins de 48 h (critère du sprint 6).
- [ ] Claude · répétition du changement de saison sur une copie de la base.
- [ ] Les deux · page d'état verte sept jours de suite.

## Le 25 novembre

- [ ] Rating public (après la calibration du 12 nov.).
- [ ] Message au mainteneur de api.the-finals-leaderboard.com avec le lien et l'attribution.
- [ ] Annonce TikTok, Instagram, YouTube, Discord ; un post sur le subreddit du jeu.
- [ ] Les onze critères de la phase F cochés.
