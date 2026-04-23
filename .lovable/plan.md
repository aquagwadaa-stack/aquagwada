# Plan complet — finitions UI + roadmap opérationnelle

## Partie A — Ce que je fais maintenant (code)

### 1. Timelines : ligne par commune favorite + heures pointillées + état vide cliquable

Modification de `DayTimeline` pour supporter un nouveau mode "par commune" :

- Si on lui passe une liste de communes (favoris), il rend **une ligne horizontale par commune**, dans l'ordre des favoris, avec le nom de la commune à gauche, même si aucune coupure ce jour-là.
- Sur chaque ligne, les coupures et prévisions de cette commune se positionnent normalement.
- **Pointillés horaires légers** : grille verticale toutes les heures (24 lignes très discrètes `border-l border-dashed border-border/30`), au-dessus des barres horaires existantes tous les 3h.
- Si la liste de communes est vide → bloc CTA centré "Ajoutez votre commune favorite pour voir vos timelines" → bouton vers `/ma-commune`.
- Le verrouillage "futur du jour" (1h de teaser) reste appliqué identiquement par-dessus toutes les lignes.

### 2. Branchement des favoris sur **toutes** les timelines du site

- **Accueil (`/`)** : timeline déjà filtrée par favoris, mais en une seule ligne. Je passe en mode multi-lignes avec la liste des favoris (visiteur non connecté → mode actuel agrégé Guadeloupe en teaser).
- **Carte (`/carte`)** : même chose, multi-lignes avec favoris.
- **Ma commune (`/ma-commune`)** : déjà restreint aux favoris ; je passe également en mode multi-lignes pour cohérence.
- Visiteurs non connectés : ligne unique "Guadeloupe" agrégée + CTA "Créer un compte pour suivre vos communes".

### 3. Vérifications globales pendant la passe

- Préférences notifications : confirmer que le job dispatcher respecte bien chaque toggle (déjà le cas dans `dispatch_notifications.ts`, je documente le tableau de skip).
- Texte d'aide sur le bandeau "Pro = jusqu'à 5 communes" cohérent partout.

## Partie B — Roadmap opérationnelle (ce que **toi** tu dois faire, étape par étape)

Pour chaque chantier : ce que tu dois faire côté humain, et ce que je ferai automatiquement après.

### B1. IA de prévisions fiables

**État actuel** : moteur statistique v2 déjà en place (`generate_forecasts.ts`) — détecte patterns jours de semaine, plages horaires, tendances. Mais il a besoin d'historique réel pour devenir fiable.

**Ce que tu dois faire** :

1. Décider la stratégie de seed historique (voir B2).
2. Une fois la base d'historique remplie (≥ 200 coupures réelles sur 6 mois minimum), me demander d'activer le job `generate-forecasts` en cron quotidien.
3. Optionnellement : me demander d'ajouter un moteur ML (Lovable AI, Gemini) qui prendra l'historique en entrée et produira des prévisions enrichies (cause probable, communes voisines à risque).

**Ce que je ferai** :

- Cron quotidien `generate-forecasts` (3h du matin).
- Si tu veux un boost ML : j'ajouterai un appel à `google/gemini-2.5-flash` via `LOVABLE_API_KEY` (déjà dispo, pas de clé à fournir). oui je veux 

### B2. Base de données historique des coupures

**État actuel** : table `outage_history` existe + trigger `archive_resolved_outages` qui archive automatiquement chaque coupure résolue. Mais elle est vide aujourd'hui car aucune source ne pousse de données.

**Trois options pour remplir l'historique, à choisir** :


| Source                             | Ce que **toi** tu dois faire                                                                                                     | Ce que je ferai                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **SMGEAG** (site officiel)         | Me confirmer l'URL exacte de la page "travaux/coupures" + me dire si tu as un contact qui peut donner accès à un export CSV/JSON | Finir le parser HTML dans `scraper_smgeag.ts` (déjà stub) + cron 15 min                        |
| **Page Facebook Karu'Eaux/SMGEAG** | Créer une app Facebook Developer + me fournir un `FACEBOOK_PAGE_ACCESS_TOKEN` (Graph API, scope `pages_read_engagement`)         | Job `scraper_facebook.ts` qui lit les posts et extrait via Lovable AI les coupures structurées |
| **Seed manuel CSV**                | M'envoyer un CSV avec colonnes `commune,starts_at,ends_at,cause` (même 1 an d'archive Excel/notes)                               | Script d'import one-shot                                                                       |


**Recommandation** : commencer par **SMGEAG officiel** (légal, structuré) + **Facebook** (couvre l'informel temps réel). CSV en fallback pour bootstrap.

### B3. Domaine email + envoi des notifications

**État actuel** : job `dispatch_notifications` complet, mais en **dry-run** (logs uniquement, aucun envoi réel).

**Ce que tu dois faire** :

1. **Acheter un nom de domaine** (ex : `aquagwada.app`, `aquagwada.fr`) chez OVH/Gandi/Namecheap. Coût : ~10€/an.
2. Me dire le domaine choisi → je lance le flux de configuration (boîte de dialogue) qui te demandera d'ajouter 2 enregistrements NS chez ton registrar. Délai DNS : 0 à 72h.
3. Une fois vérifié, les emails partent automatiquement (le code est déjà prêt).

**Ce que je ferai automatiquement après** :

- Templates React Email (début de coupure, retour de l'eau, préventif, fin d'essai à 12h).
- Sortir le job dispatcher du dry-run et envoyer pour de vrai.
- Cron rappel essai 12h avant expiration.

### B4. SMS et WhatsApp

**État actuel** : préférences UI prêtes (toggles, validation E.164, blocage par plan), dispatcher prêt côté code, **aucun envoi réel**.

**Ce que tu dois faire** :

1. Créer un compte **Twilio** (recommandé : gère SMS + WhatsApp dans une seule API).
2. Provisionner un numéro Twilio capable d'envoyer en France/DOM (~1€/mois + ~0.07€ par SMS vers la Guadeloupe).
3. Pour WhatsApp Business : valider un sender Twilio (procédure Meta, gratuite mais ~3 jours).
4. Me fournir 3 secrets : `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (et `TWILIO_WHATSAPP_FROM` pour WhatsApp).

**Ce que je ferai** :

- Brancher Twilio dans `dispatch_notifications.ts` côté SMS et WhatsApp.
- Compteur d'usage par utilisateur (pour facturation et plafonds anti-abus).

**Alternative moins chère pour SMS uniquement** : OVH SMS API (~0.05€/SMS vers la Guadeloupe). Dis-moi si tu préfères.

### B5. Stripe (paiements Pro/Business)

**Ce que tu dois faire** :

1. Créer un compte Stripe (gratuit, validation entreprise/auto-entrepreneur).
2. Créer 2 produits dans Stripe Dashboard :
  - "AquaGwada Pro" : prix mensuel + annuel
  - "AquaGwada Business" : prix mensuel + annuel
3. Me fournir : `STRIPE_SECRET_KEY` (côté serveur) + `STRIPE_WEBHOOK_SECRET`.
4. Décider les prix.

**Ce que je ferai** :

- Page checkout via Stripe Checkout (hosted, pas de PCI à gérer).
- Webhook `/api/public/webhooks/stripe` qui synchronise `subscriptions` (statut, période, annulations).
- Bouton "Gérer mon abonnement" → portail client Stripe.
- Conversion auto à la fin de l'essai gratuit si CB renseignée.

### B6. Notifications — vérification que TOUT est respecté

Voici ce que le dispatcher applique aujourd'hui (déjà codé) :


| Réglage utilisateur               | Comportement actuel                               |
| --------------------------------- | ------------------------------------------------- |
| `email_enabled = false`           | Aucun email envoyé                                |
| `sms_enabled = false`             | Aucun SMS                                         |
| `whatsapp_enabled = false`        | Aucun WhatsApp                                    |
| `notify_outage_start = false`     | Skip événements "début"                           |
| `notify_water_back = false`       | Skip événements "retour"                          |
| `notify_preventive = false`       | Skip événements préventifs                        |
| `preventive_hours_before` (1–48h) | Envoi à ±10 min de la cible                       |
| `quiet_hours_start/end`           | Skip notifs **non urgentes** dans la plage        |
| Téléphone vide                    | SMS/WhatsApp skip même si activés                 |
| Idempotence                       | Une seule notif par (user, outage, kind, channel) |


Je vais ajouter dans la passe en cours : un petit panneau "Logs des dernières notifications envoyées" dans `/ma-commune` pour que tu vérifies visuellement ce qui se déclenche.

## Partie C — Récap des fichiers que je modifie maintenant

- `src/components/outages/Timeline.tsx` — mode multi-communes + pointillés horaires + état vide cliquable
- `src/routes/index.tsx` — branchement multi-lignes favoris
- `src/routes/carte.tsx` — branchement multi-lignes favoris
- `src/routes/ma-commune.tsx` — passage au mode multi-lignes
- `src/components/notifications/NotificationPreferencesPanel.tsx` — petit panneau "dernières notifs envoyées (logs)"

## Partie D — Ordre conseillé pour la mise en production

1. ✅ Maintenant : timelines multi-lignes (auto)
2. 🟡 Toi : acheter le domaine email → me prévenir
3. 🟡 Toi : décider source historique (SMGEAG / Facebook / CSV) → m'envoyer ce qu'il faut
4. 🟡 Toi : créer compte Twilio → me filer les 3 secrets
5. 🟡 Toi : créer compte Stripe + produits → me filer les 2 secrets
6. ✅ Moi : tout brancher dans l'ordre, désactiver tous les dry-runs, publier

Une fois ces 4 chantiers humains démarrés en parallèle, je peux tout finaliser en une seule passe.