# Plan : signalements actionnables, restriction commune en gratuit, notifications fiables, perfs

## 1. Signalements utilisateurs réellement exploités

Aujourd'hui les signalements sont insérés dans `reports` mais **rien ne les lit jamais**. Aucun job, aucune requête, aucun affichage. Ils sont enterrés.

À mettre en place :

- **Confirmation d'événements existants** : si un signalement (`water_off` / `low_pressure`) tombe sur une commune où une coupure officielle est en cours → on incrémente son `confidence_score` (plafonné à 0.95). Si plusieurs utilisateurs distincts confirment en moins de 2h, le score monte plus vite.
- **Résolution d'événements** : si plusieurs signalements `water_back` arrivent sur une coupure en cours, on marque la coupure `resolved` avec `ends_at = now()` (seuil : ≥ 3 utilisateurs distincts ou 1 seul si la coupure dépassait déjà `estimated_duration_minutes`).
- **Création d'événements communautaires** : si ≥ 3 signalements `water_off` distincts arrivent sur une commune sans aucune coupure officielle dans une fenêtre de 90 min → création automatique d'une coupure avec `source = 'user_report'`, `reliability_score = 0.5`, `confidence_score` proportionnel au nombre de reports. Si une source officielle arrive plus tard, elle override (logique d'ingestion déjà en place).
- **Job dédié** : nouveau cron `process-reports` (toutes les 5 min) qui scanne les reports non traités. On ajoute une colonne `processed_at` à `reports` pour ne pas retraiter.

## 2. Bouton "Signaler" beaucoup plus visible

- **Page Carte** : remplacer le petit `<select> + bouton` du header par un **bloc CTA dédié** en haut de la sidebar droite, à côté de "En cours" :
  - icône mégaphone, fond accentué,
  - sélecteur de commune intégré,
  - bouton "Signaler maintenant" pleine largeur,
  - sous-texte "Aidez vos voisins en 10 secondes".
- **Page Ma commune** : ajouter un second point d'entrée plus gros sous le statut courant, pas seulement enterré dans la carte de statut.
- **Accueil** : ajouter une carte "Signaler une coupure / un retour d'eau" dans la section features pour donner le réflexe.

## 3. Restreindre la liste de communes en plan gratuit

Règle produit :


| &nbsp;                                          | Visiteur        | Free connecté                      | Pro / Trial / Business                                         |
| ----------------------------------------------- | --------------- | ---------------------------------- | -------------------------------------------------------------- |
| Carte interactive (markers)                     | Toutes          | Toutes                             | Toutes                                                         |
| **Liste/sidebar "En cours"**                    | Toutes          | **Sa commune favorite uniquement** | **Ses communes favorites uniquement (sauf business (toutes))** |
| **Timeline du jour et prévisions**              | Toutes (teaser) | **Sa commune uniquement**          | **Ses communes favorites uniquement (sauf business (toutes))** |
| Liste sur l'accueil "Aujourd'hui" et prévisions | Toutes          | **Sa commune uniquement**          | **Ses communes favorites uniquement (sauf business (toutes))** |


Implémentation :

- Charger `user_communes` pour les utilisateurs connectés.
- Sur `/carte` : si `tier === 'free'` ET utilisateur connecté → filtrer `ongoing` + `today24` par les `commune_id` de l'utilisateur. Afficher un bandeau : "Vous voyez uniquement *Le Gosier*. Passez à Pro pour suivre plus de communes."
- Sur `/` (accueil) : même filtre sur la timeline.
- Si utilisateur free **n'a pas encore de commune** → CTA "Choisissez votre commune" → `/ma-commune`.
- Visiteurs (non connectés) : on garde tout visible, c'est l'avant-goût (sauf les prévisions des jours suivants) .

## 4. Notifications réellement respectées

État actuel : les préférences sont **bien sauvegardées** (`upsert` propre sur `notification_preferences`), mais **aucun système d'envoi n'existe encore**, donc impossible de dire que "désactiver l'email" fonctionne en production.

À faire :

- **Côté UI** : ajouter le réglage manquant **"Délai préventif"** = combien d'heures avant la coupure on veut être prévenu. Slider/select (plusieurs sélections possible) avec valeurs `1h, 2h, 3h, 6h, 12h, 24h, 48h` → écrit dans `preventive_hours_before` (la colonne existe déjà, valeur par défaut 24h).
- **Côté job** : préparer le futur job d'envoi (`dispatch_notifications`) qui, **avant tout envoi**, lit `notification_preferences` et :
  - skip si `email_enabled = false` pour le canal email,
  - skip si `sms_enabled = false` (et tier autorise),
  - skip si `whatsapp_enabled = false`,
  - skip si l'événement (`outage_start` / `water_back` / `preventive`) est désactivé,
  - skip si l'heure courante est dans `quiet_hours_start` → `quiet_hours_end` ET événement non urgent,
  - pour le préventif : déclenche `preventive_hours_before` avant `starts_at`.
- Le job sera créé maintenant en mode "dry run" (log uniquement) tant que le domaine email n'est pas configuré, pour que la logique soit testable et que dès que le domaine est prêt, ça envoie pour de vrai sans rien refactorer.
- Ajouter une **table `notification_logs**` (idempotence) : `user_id, outage_id, channel, kind, sent_at` avec unique `(user_id, outage_id, kind, channel)` pour ne jamais doubler.

## 5. Perfs / "ça charge beaucoup"

Le ralentissement vient quasi exclusivement de la preview Lovable (HMR + iframe + tooling Vite). En prod publié c'est nettement plus rapide. Mais on peut quand même tailler :

- **Carte (Leaflet)** : `lazy(() => import())` est déjà en place ✅. Vérifier qu'on ne refait pas les markers à chaque tick (memo sur la liste).
- **Polling** : `ongoing` rafraîchit toutes les **60s** sur `/carte`. Passer à 120s (sauf reconnect).
- **Queries dupliquées** : `["outages-today", start, end]` est calculé avec `new Date()` à chaque render → la `queryKey` change toutes les ms et casse le cache. Stabiliser avec `useMemo` sur `start/end` arrondis à la minute.
- **Subscription RPC** : appelée sur 3 pages avec la même `queryKey` `["subscription", userId]` → bien cachée déjà, OK. Ajouter `staleTime: 60_000`.
- **Bundle accueil** : `framer-motion` + `OutageMap` chargés ensemble. Garder `motion` mais s'assurer que la map n'est importée que sur `/carte`.

Je documenterai dans la réponse finale que la lenteur ressentie est principalement la preview, et je donnerai les chiffres avant/après.

## 6. Fichiers impactés

**Base de données (migrations)** :

- `reports` : ajouter `processed_at timestamptz`, index sur `(commune_id, created_at) where processed_at is null`.
- `notification_logs` : nouvelle table + RLS.

**Backend / jobs** :

- `src/server/jobs/process_reports.ts` (nouveau) — confirme/résout/crée des coupures.
- `src/routes/api.public.jobs.process-reports.ts` (nouveau) — endpoint cron.
- `src/server/jobs/dispatch_notifications.ts` (nouveau, dry-run) — applique strictement les préférences.
- `src/routes/api.public.jobs.dispatch-notifications.ts` (nouveau).
- Cron pg_cron pour les deux nouveaux jobs.

**Frontend** :

- `src/components/reports/ReportBlock.tsx` (nouveau, bloc visible) — réutilisé dans `/carte` et `/ma-commune`.
- `src/routes/carte.tsx` — bloc signalement visible + filtrage commune favorite en free.
- `src/routes/index.tsx` — filtrage timeline pour free connecté + bandeau d'explication.
- `src/components/notifications/NotificationPreferencesPanel.tsx` — ajout du réglage `preventive_hours_before`.
- Stabilisation `queryKey` (memo des bornes de date).

## 7. Hors scope (à faire après validation)

- Branchement réel des emails → bloqué tant qu'aucun domaine d'envoi n'est configuré.
- Stripe → étape suivante après cette passe.