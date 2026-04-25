## Diagnostic — pourquoi les données sont au pif

J'ai inspecté le code, l'API SMGEAG et la base. Voici ce qui se passe vraiment :

### 1. Le "fallback déterministe" a pollué toute la base
Quand l'IA était hors-crédits, `scrape_planning` est passé en mode **fallback** : il a généré une coupure **20h→07h chaque nuit, pour chaque commune de chaque zone**, sans lire les images. Résultat actuel en base :

- `outage_history` : **247 lignes "fallback"** (créneau standard 20h-07h générique) sur 1188 totales
- `forecasts` : **19 fallback + 212 statistiques** calculées sur cet historique pollué + **1 seule** issue d'une vraie extraction IA
- `outages` : 51 entrées "official" — la plupart sont des fallback marqués `ongoing`, d'où les coupures qui apparaissent au pif

### 2. Le scraper HTML SMGEAG (`scraper_smgeag.ts`) génère du faux positif
Toutes les 30 min, il trouve **10 items sur `/informations-reseau/`** mais 0 insertion → en réalité il met à jour 10 fausses entrées créées par lui-même en parsant des `<p>` de navigation/footer qui contiennent les mots "réseau" ou "distribution".

### 3. Le backfill historique n'a jamais tourné
80+ posts de planning hebdo existent sur `smgeag.fr/wp-json/wp/v2/posts` (j'ai vérifié, jusqu'à décembre 2024 minimum), avec les bonnes images. Le code `backfillPlanningHistory` existe mais n'a jamais été appelé → on n'a rien d'historique réel.

### 4. Les prévisions statistiques sont calculées sur du faux historique
`generate_forecasts` lit `outage_history` (247 fallback dedans) → patterns détectés sont les patterns du fallback (tous les jours 20h-07h) → prévisions truquées.

---

## Plan de correction — 5 étapes

### Étape 1 : Purger les données polluées (migration SQL)
- `DELETE FROM outage_history WHERE description LIKE '%créneau standard 20h-07h%'` (247 lignes fallback)
- `DELETE FROM outages WHERE description LIKE '%créneau standard 20h-07h%'` (toutes les coupures fallback en cours/programmées)
- `DELETE FROM forecasts WHERE basis LIKE '%fallback déterministe%'` (19 lignes)
- `DELETE FROM forecasts` complet (on régénérera après backfill propre)
- `DELETE FROM outages WHERE source = 'scraping' AND external_id LIKE 'smgeag_%'` (les faux positifs du scraper HTML)

### Étape 2 : Désactiver le fallback déterministe
Dans `scrape_planning.ts` :
- **Supprimer** l'appel à `persistFallbackPlanning` quand l'IA échoue. Mieux vaut ne rien afficher qu'afficher du faux. On loggera juste l'échec dans `scraper_runs` pour qu'on le voie.
- Garder la fonction de fallback en commentaire/dead-code n'a aucun intérêt → la supprimer.

### Étape 3 : Durcir le scraper HTML SMGEAG
Dans `scraper_smgeag.ts`, le parsing actuel ramasse n'importe quel `<p>` ou `<li>` qui contient "réseau". Corrections :
- Ne garder que les blocs `article` et `.elementor-post` (jeter les `main p`, `main li` génériques).
- **Exiger une date détectée** (sinon on rejette) — actuellement les items sans date sont insérés avec `now()`.
- **Exiger une plage horaire** OU une mention explicite de "coupure"/"interruption" (le simple mot "travaux" + commune ne suffit pas).
- Réduire `reliability_score` à 0.7 (vs 0.95) — ce sont des annonces texte, pas des plannings tabulaires.

### Étape 4 : Backfill 1 an d'historique réel via l'IA
Maintenant que les crédits IA sont rechargés :
- Appeler `/api/public/jobs/backfill-planning` avec `since=2025-04-01` et `maxPosts=80`
- Cela récupère ~52 plannings hebdo, lance Gemini sur chaque jeu d'images, et insère **les vraies coupures** dans `outage_history` (passé) et `outages`/`forecasts` (semaine en cours + à venir).
- Estimation : ~50 appels Gemini 2.5 Flash avec 4 images chacun → coût modéré.
- On loggera tout dans `scraper_runs` pour traçabilité.

### Étape 5 : Régénérer les prévisions sur historique propre
Après le backfill :
- Appeler `/api/public/jobs/generate-forecasts` → recalcule sur l'historique réel
- Le scrape planning hebdo cron (déjà en place) maintiendra l'à-jour sans fallback

### Bonus : Rapport de transparence dans l'UI
Pour rassurer l'utilisateur quand une donnée vient ou non de la SMGEAG, ajouter un petit badge "Source : SMGEAG officiel" / "Estimation statistique" sur les coupures et prévisions affichées dans `OutageTimeline`. Le composant `SourceBadge.tsx` existe déjà — il suffit de l'utiliser.

---

## Détails techniques

**Fichiers modifiés :**
- `src/server/jobs/scrape_planning.ts` — supprimer `persistFallbackPlanning` + retirer ses appels dans `scrapePlanning` et `backfillPlanningHistory`
- `src/server/jobs/scraper_smgeag.ts` — durcir le parsing (sélecteurs + filtres date/heure)
- `src/components/outages/OutageTimeline.tsx` — ajouter `<SourceBadge>` à chaque ligne de coupure/prévision
- Nouvelle migration SQL pour la purge

**Actions runtime (après déploiement) :**
1. Migration SQL exécutée automatiquement → DB nettoyée
2. Appel manuel `POST /api/public/jobs/backfill-planning` body `{"since":"2025-04-01","maxPosts":80}` → backfill 1 an
3. Appel manuel `GET /api/public/jobs/generate-forecasts` → prévisions recalculées
4. Le cron quotidien `scrape-planning` continuera à maintenir la semaine en cours

**Risques :**
- Le backfill consomme du crédit Lovable AI (~50 appels Gemini Flash). Si le crédit retombe à zéro, certains plannings échoueront silencieusement → on les retentera manuellement.
- Si certains posts SMGEAG ont des images de mauvaise qualité, l'IA peut rater des lignes → c'est OK, mieux vaut un trou qu'une donnée fausse.

**Garanties :**
- Plus aucune donnée "20h-07h générique" ne sera créée
- Toutes les coupures affichées viendront soit de l'IA lisant un planning officiel, soit du scraping HTML strict, soit de l'historique IA presse
- Les prévisions seront marquées clairement (officiel SMGEAG vs statistique)

---

## Question rapide avant exécution

Veux-tu que le backfill remonte à **avril 2025 (1 an)** ou plus loin (jusqu'à fin 2024, ~80 semaines) ? Plus on remonte, mieux les patterns statistiques fonctionneront, mais ça consomme plus de crédit IA. Je propose **1 an** par défaut comme bon compromis. Si tu veux plus court (6 mois) ou plus long, dis-le-moi avant de cliquer Approve, sinon je pars sur 1 an.