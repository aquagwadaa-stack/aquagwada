# Plan d'implémentation — concrétisation de la roadmap

## A. Recap de tes décisions

1. **Domaine** : `aquagwada.fr` chez OVH (4,99€/an) — reçu, mise en place : aquagwada.fr
2. **Notifications** : combo PWA push + Email gratuit pour tout le monde, **pas de SMS/WhatsApp pour Pro** (push temps réel suffit), Business "à partir de 25€" avec SMS sur devis
3. **ML** : enrichi avec stats internes + scraping complet SMGEAG (4 pages)
4. **Facebook** : abandonné côté API (recommencer compte = perte de temps), je te donne quand même les étapes propres en chat ci-dessous mais on n'attend pas dessus

---

## B. Réponse à ta question PWA vs Apple Store / Google Play

**Différence concrète** :


| &nbsp;             | PWA installable                                     | App store native                      |
| ------------------ | --------------------------------------------------- | ------------------------------------- |
| Installation       | "Ajouter à l'écran d'accueil" depuis le navigateur  | Téléchargement App Store / Play Store |
| Icône sur l'écran  | Oui, identique à une vraie app                      | Oui                                   |
| Notifications push | **Oui, natives** (Android dès Android 5, iOS 16.4+) | Oui                                   |
| Frais              | **0€**                                              | 100€/an Apple + 25€ une fois Google   |
| Validation         | Aucune                                              | 1-2 semaines, peut être refusée       |
| Mise à jour        | Instantanée (refresh page)                          | Re-soumission à valider               |
| Visibilité magasin | Aucune                                              | Listée dans les stores                |


**Comment l'utilisateur reçoit les notifs PWA** :

1. Il visite aquagwada.fr depuis son tel
2. On lui propose "Installer l'app" (bannière)
3. Il accepte → icône AquaGwada apparaît sur son écran d'accueil
4. À la première ouverture de l'app installée, on demande "Voulez-vous recevoir des notifs en cas de coupure ?"
5. Il accepte → on enregistre son endpoint push (Web Push Protocol)
6. Quand on détecte une coupure → notification système (comme un SMS, sur l'écran de verrouillage, avec son et vibration), même app fermée

**Limitation iPhone** : iOS 16.4+ requis (mars 2023, donc 95%+ des iPhones aujourd'hui), ET l'utilisateur DOIT installer la PWA d'abord (pas juste visiter le site). Sur Android : marche partout, même sans installer.

---

## C. Ce que je vais coder maintenant

### 1. Refonte du pricing (DB + UI)

**Migration SQL** sur `subscription_plans` :

- **Free** : 0€, 1 commune, 7j historique, push + email, pas de préventif
- **Pro** : **5,99€/mois** (au lieu de 7,99€), 5 communes, 365j historique, **push + email seulement** (sms_enabled=false, whatsapp_enabled=false), préventif activé, prévisions 14j
- **Business** : **affiché "à partir de 25€" avec bouton "Devis"** au lieu d'un prix fixe, 100 communes, 1825j historique, SMS/WhatsApp sur devis, API B2B

**Mettre à jour** `src/lib/subscription.ts` (`PLAN_CAPS.pro` : `smsEnabled: false`, `whatsappEnabled: false`)

**Mettre à jour** `src/routes/abonnements.tsx` :

- Carte Business → afficher "à partir de 25€" + bouton "Demander un devis" (mailto:[contact@aquagwada.fr](mailto:contact@aquagwada.fr) ou formulaire)
- Carte Pro → enlever mentions SMS/WhatsApp, mettre en avant "Notifications push instantanées"

**Mettre à jour** `NotificationPreferencesPanel.tsx` :

- Remplacer colonnes SMS/WhatsApp par **Push** + Email pour Free/Pro
- Garder SMS/WhatsApp visibles **uniquement** pour Business (colonnes verrouillées sinon avec lien "Devis Business")
- Bloc téléphone visible uniquement pour Business
- Trigger DB `reset_paid_notification_prefs` mis à jour pour aussi reset les Business → Free

### 2. PWA installable + Web Push notifications

**Manifeste + service worker minimal** (sans `vite-plugin-pwa` qui casse la preview Lovable) :

- `public/manifest.webmanifest` : nom, icônes, couleur, `display: "standalone"`
- `public/sw.js` : service worker minimal qui écoute `push` event et affiche la notif
- `<link rel="manifest">` + meta theme-color dans `__root.tsx`
- Composant `<PWAInstallPrompt>` : bannière discrète "Installer AquaGwada" (déclenche `beforeinstallprompt`)
- Composant `<PushOptIn>` dans `NotificationPreferencesPanel` : bouton "Activer les notifs push" qui demande la permission navigateur, génère subscription endpoint, et la sauve en DB

**Nouvelle table** `push_subscriptions` :

```
id, user_id, endpoint (unique), p256dh, auth, user_agent, created_at
```

RLS : own only.

**Génération clés VAPID** : je génère une paire de clés VAPID (publique/privée) et les ajoute en secrets Lovable Cloud (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).

**Edge function/server function** `send_push.ts` : utilise `web-push` (compatible Worker via API Web Push) pour envoyer une notif à un endpoint. Branchée dans `dispatch_notifications.ts` comme nouveau canal "push".

**Mise à jour** `notification_preferences` : ajouter colonne `push_enabled boolean DEFAULT true` et `notification_logs.channel` accepte `'push'`.

**Garde-fou preview Lovable** : le SW ne s'enregistre **pas** si on est dans un iframe ou sur `*.lovable.app` preview (cf. règles PWA). Il s'enregistre uniquement sur `aquagwada.fr` en prod.

### 3. Scraping SMGEAG complet (les 4 pages)

URLs scrapées toutes les 15 min :

- `https://www.smgeag.fr/les-actualites/` → annonces générales (or pour ML)
- `https://www.smgeag.fr/travaux-3/` → travaux planifiés
- `https://www.smgeag.fr/informations-reseau/` → état réseau
- `https://www.smgeag.fr/` → home (carrousel d'alertes en cours)

**Nouveau scraper** `src/server/jobs/scraper_smgeag.ts` (refonte) :

- Fetch des 4 URL en parallèle
- Parser HTML avec **regex + extraction texte** (pas de cheerio — Worker compatible : utilise `linkedom` qui marche en Worker, sinon regex sur les patterns connus)
- Pour chaque bloc trouvé : extraire `commune`, `date`, `heure_début`, `heure_fin`, `cause`, `secteur`
- **Match commune** : normaliser (minuscules, sans accents) puis chercher dans la table `communes` avec un fallback "fuzzy" (Levenshtein ≤ 2)
- **Déduplication** : `external_id = sha256(source_url + starts_at + commune_id)` → upsert sans doublon
- **Ingestion** : insérer dans `outages` (status `scheduled` si futur, `ongoing` si en cours) avec `source = 'scraping'`, `source_url`, `reliability_score = 0.85`

**Nouvelle table** `scraper_runs` :

```
id, source ('smgeag'), url, started_at, finished_at, items_found, items_inserted, ok boolean, error text
```

RLS : admin only. Pour suivre la santé du scraper.

**Cron pg_cron** : déjà en place sur `/api/public/jobs/scrape-smgeag` toutes les 15 min, je vérifie/branche.

### 4. Boost ML — enrichi par les nouvelles données scrappées

Le moteur `generate_forecasts.ts` lit déjà `outage_history` + `outages` resolved/cancelled. Avec le scraping qui alimente massivement `outages`, le ML va **automatiquement** s'enrichir au fil du temps :

- À chaque coupure scrapée qui se termine → trigger `archive_resolved_outages` la copie en `outage_history`
- Le job `generate_forecasts` (cron quotidien) re-calcule les patterns avec ces nouvelles données

**Améliorations supplémentaires du ML que j'apporte** :

- **Pondération par source** : coupures officielles SMGEAG = poids 1.0, scraping = 0.85, user_report = 0.5 (déjà partiellement géré, je consolide)
- **Pattern saisonnier** : ajout d'un signal mensuel (saison sèche déc-mai = plus de coupures en Guadeloupe)
- **Détection de récurrence** : si une commune a 3+ coupures le même jour de la semaine au même créneau → probabilité boostée
- **Confiance affichée** plus précise : intègre l'âge moyen des données

### 5. Page admin "Santé scraper"

Petit panneau `/admin/scraper` (admin only) qui montre :

- Dernière exécution de chaque source
- Nb d'items trouvés / insérés
- Erreurs récentes
- Bouton "Lancer maintenant"

(Optionnel mais utile pour ne pas voler aveugle.)

---

## D. Ordre d'exécution

1. Migration DB (pricing + push_subscriptions + scraper_runs + colonnes prefs)
2. Refonte UI abonnements + matrice notif (Pro sans SMS, Business sur devis)
3. Manifest + SW + composant PushOptIn + génération VAPID + intégration dans dispatch
4. Refonte scraper SMGEAG 4 pages + cron + page admin santé
5. Améliorations ML + re-génération initiale des forecasts

Tout dans la même passe. Ensuite on attend juste ton domaine OVH pour brancher l'envoi email réel (le push lui marche dès qu'on déploie en prod sur `aquagwada.fr`).

---

## E. Étapes Facebook (pour plus tard, si tu veux retenter)

Données en chat hors plan puisque tu m'as dit que tu repartais à zéro :

1. Va sur [https://developers.facebook.com](https://developers.facebook.com) → "Get Started"
2. Étape "About you" (ta capture) : choisis **"Autre"** (le plus neutre, évite "Développeur" qui demande parfois des infos pro)
3. Termine l'inscription
4. Crée une nouvelle app : type **"Business"**
5. Dans l'app → Add Product → **"Pages API"**
6. Dans "App Review" → Permissions → demander :
  - `pages_read_engagement`
  - `pages_manage_metadata`
  - `pages_read_user_content`
7. Génère un **Page Access Token longue durée** (60 jours, renouvelable) depuis Graph API Explorer
8. Envoie-moi le token + Page ID de SMGEAG → je branche

**Plan B sans Facebook** : tu m'envoies un export manuel des posts SMGEAG en CSV/texte une fois et je le digère pour seed l'historique. Mais avec les 4 pages SMGEAG scrappées, on a déjà 90% de la valeur.

---

## F. Ce qui reste à faire après cette passe

- 🟡 Tu m'envoies le domaine OVH dès livré → je configure DNS + active emails Lovable avec `notifications@aquagwada.fr`
- 🟡 Stripe : tu créais le compte → je branche le paiement Pro 5,99€ (Business reste sur devis manuel)
- 🟡 Facebook : optionnel, plus tard

Tu valides ce plan, je code tout d'un coup.