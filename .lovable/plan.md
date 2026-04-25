Je vais arrêter de patcher au hasard et faire une reprise solide en 3 blocs : source de données, génération prévisions, affichage timeline.

Constat vérifié
- Il y a bien des données en base : environ 1 049 lignes d'historique et 61 prévisions.
- Le dernier backfill SMGEAG échoue maintenant parce que l'analyse d'images par IA renvoie une erreur de crédits, donc les plannings ne sont plus importés automatiquement correctement.
- Les timelines se superposent parce que plusieurs coupures/prévisions d'une même commune et d'un même créneau sont dessinées sur la même ligne, sans empilement ni fusion.
- Certaines lignes sont dupliquées, par exemple mêmes créneaux SMGEAG avec secteur `null` et secteur vide, ce qui aggrave la superposition.
- L'historique peut sembler à 0 car l'UI filtre selon favoris/plan et n'a pas d'état de diagnostic clair, alors que la base contient bien des lignes.

Plan d'implémentation

1. Corriger la timeline proprement
- Remplacer le rendu actuel par un moteur de layout qui calcule des “lanes” par commune.
- Si deux événements se chevauchent, ils seront soit fusionnés si ce sont les mêmes infos officielles, soit empilés verticalement dans la ligne de la commune.
- Augmenter automatiquement la hauteur d'une commune quand plusieurs événements se chevauchent.
- Afficher un résumé clair au lieu de barres illisibles quand une commune a plusieurs secteurs coupés sur le même créneau.
- Appliquer la même logique aux coupures passées, aux coupures actuelles et aux prévisions.

2. Dédupliquer et normaliser les données SMGEAG
- Ajouter une normalisation stricte : `null`, `"null"`, secteur vide, secteur générique deviennent une seule valeur cohérente.
- Créer une clé stable par commune + date + heure début + heure fin + secteur normalisé + source.
- Dédupliquer les doublons existants dans `outages`, `outage_history` et `forecasts`.
- Corriger les coupures “infinies” : toute coupure active sans fin recevra une fin estimée et sera archivée dès qu'elle est dépassée.
- Vérifier le cas Baillif et autres anciennes coupures encore `ongoing` malgré une date passée.

3. Rendre l'historique réellement visible
- Modifier `HistoryPanel` pour afficher un état honnête : total global, total sur la période, total après filtre commune.
- Sur la page `carte`, pour la vue globale, afficher l'historique global si l'utilisateur n'a pas de favoris ou s'il est admin/business.
- Éviter le message “aucune coupure archivée” quand le problème est juste un filtre trop restrictif.
- Ajouter un petit indicateur “dernière donnée officielle importée” pour savoir si le flux est à jour.

4. Refaire le backfill SMGEAG sans dépendre uniquement de l'IA image
- Garder l'IA comme option, mais ne plus en faire le seul chemin.
- Ajouter un parseur déterministe des posts SMGEAG : récupérer les posts WordPress, extraire les images de planning, inférer la semaine depuis le titre/URL, identifier zone/commune/secteur depuis les noms d'images et textes disponibles.
- Si l'IA est disponible, elle enrichit les secteurs; si elle échoue, le job importe quand même des créneaux fiables “planning officiel” au niveau commune/zone au lieu d'insérer 0.
- Le backfill continuera automatiquement, mais en mode robuste : il ne doit plus faire “posts trouvés, 0 inséré” sans expliquer pourquoi.

5. Régénérer les prévisions de façon moins vide mais non mensongère
- Séparer deux types de prévisions :
  - Officielles SMGEAG : très haute confiance, depuis planning publié.
  - Statistiques : probabilité modérée, clairement indiquée comme estimation.
- Générer au moins des prévisions faibles/modérées pour les communes avec historique suffisant, sans faire croire à une certitude.
- Pour les communes très peu historiques, afficher “signal insuffisant” plutôt qu'une page vide.
- Protéger les prévisions officielles lors de la régénération.

6. Automatisation et monitoring
- Vérifier et corriger les jobs automatiques actuels : scrape réseau, planning, backfill, génération prévisions, archivage.
- Ajouter des logs exploitables dans `scraper_runs` : raison des échecs, nombre de posts, images, items parsés, doublons ignorés, erreurs IA, fallback utilisé.
- Faire que l'automatisation mette à jour les données sans action manuelle de ta part.

7. Validation après correction
- Requête de contrôle : nombre d'historiques par commune, derniers imports, prévisions par jour, coupures actives sans fin.
- Test des routes de jobs.
- Test visuel logique des timelines : plus de superposition, barres multi-secteurs lisibles, jours passés/futurs cohérents.

Détails techniques
- Fichiers principaux à modifier :
  - `src/components/outages/Timeline.tsx`
  - `src/components/history/HistoryPanel.tsx`
  - `src/routes/carte.tsx`
  - `src/routes/ma-commune.tsx` si nécessaire pour cohérence
  - `src/lib/queries/history.ts`
  - `src/lib/queries/outages.ts`
  - `src/lib/queries/forecasts.ts`
  - `src/server/jobs/scrape_planning.ts`
  - `src/server/jobs/generate_forecasts.ts`
  - routes `/api/public/jobs/*` si besoin
- Migration/data fix à prévoir :
  - déduplication des données existantes,
  - correction des coupures expirées,
  - index/contraintes utiles si manquants,
  - maintien des règles de lecture publique pour données coupures/prévisions/historique.

Si après cette reprise la discussion est trop longue, voici le prompt propre pour repartir dans une nouvelle discussion :

```text
Projet AquaGwada. Il faut stabiliser les données de coupures SMGEAG et les timelines.
Problèmes actuels : superpositions dans les timelines, historique visible comme vide alors que la base a des données, prévisions trop rares, backfill SMGEAG qui échoue parfois avec posts/images trouvés mais 0 insertion, coupures anciennes encore en cours ou sans fin.
Objectif : faire une reprise solide de bout en bout.
À faire :
1) auditer la base : outages, outage_history, forecasts, scraper_runs, cron jobs ;
2) corriger les coupures expirées et dédupliquer les doublons ;
3) rendre le backfill des plannings SMGEAG robuste depuis octobre 2025, avec fallback sans dépendre uniquement de l'IA image ;
4) générer des prévisions officielles quand planning présent et statistiques quand planning absent, sans inventer une certitude ;
5) refaire le composant Timeline pour empiler/fusionner les événements qui se chevauchent au lieu de les superposer ;
6) rendre l'historique visible avec diagnostics de filtres ;
7) vérifier que les jobs automatiques tournent sans clic manuel.
Ne pas éditer les fichiers Supabase auto-générés client/types. Utiliser Lovable Cloud pour migrations/data fixes. Parler à l'utilisateur simplement, en français.
```