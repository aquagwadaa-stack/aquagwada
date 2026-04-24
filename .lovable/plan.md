# Plan d'implémentation — PWA, Notifs Push, Scraper SMGEAG, ML

Les clés VAPID sont en place. Voici tout ce que je vais coder dans la foulée, regroupé en 4 blocs.

---

## Bloc 1 — PWA installable (remplace une vraie app iOS/Android)

**Pourquoi PWA et pas Apple Store / Google Play ?**
- **PWA** = ton site devient installable depuis le navigateur (bouton "Ajouter à l'écran d'accueil"). Icône sur le téléphone exactement comme une vraie app, plein écran, fonctionne hors-ligne.
- **Pas de frais** : Apple Store = 99$/an + 30% de commission. Google Play = 25$ une fois + 15-30% commission. PWA = 0€.
- **Pas de validation** : pas besoin d'attendre 1-2 semaines de review Apple. Tu publies, c'est en ligne.
- **Notifs push** : fonctionnent sur Android (Chrome, Firefox, Edge) et iOS 16.4+ (Safari, à condition d'installer la PWA sur l'écran d'accueil).
- **Limite honnête** : sur iOS, l'utilisateur DOIT installer la PWA via Safari pour recevoir les notifs (un bandeau dans l'app expliquera comment faire).

**Ce que je crée :**
- `public/manifest.webmanifest` — déclare le nom (AquaGwada), l'icône, les couleurs, le mode plein écran
- `public/sw.js` — service worker qui gère la réception des notifs push même app fermée
- `public/icon-192.png` + `public/icon-512.png` — icônes générées (logo goutte d'eau bleue sur fond blanc)
- `src/lib/push-notifications.ts` — logique d'inscription aux notifs (demande la permission, enregistre l'endpoint en BDD)
- `src/components/InstallPWAPrompt.tsx` — bandeau "Installer AquaGwada" qui s'affiche au bon moment
- `src/routes/__root.tsx` — injection du manifest + enregistrement du SW (avec le garde-fou anti-iframe pour le preview Lovable)

---

## Bloc 2 — Edge function d'envoi des notifs push

**Comment ça marche concrètement :**
1. L'utilisateur ouvre l'app, clique "Activer les notifications" → son téléphone reçoit un endpoint unique du serveur push (Google FCM ou Apple) → on le stocke dans `push_subscriptions`.
2. Quand une nouvelle coupure SMGEAG est détectée → notre serveur envoie un message au serveur push de Google/Apple → le téléphone affiche la notif (même app fermée).
3. Coût : **0€** (les serveurs push de Google/Apple sont gratuits, illimités).

**Ce que je crée :**
- `supabase/functions/send-push-notification/index.ts` — edge function qui prend un user_id + message, récupère ses endpoints, signe avec VAPID, envoie au serveur push
- Intégration dans le flux existant : quand `outages` reçoit un INSERT pour une commune suivie, déclenche automatiquement la notif

---

## Bloc 3 — Scraper SMGEAG (4 pages) + ML boosté

**Sources scrapées toutes les 30 min via cron :**
1. `https://www.smgeag.fr/les-actualites/` — annonces officielles
2. `https://www.smgeag.fr/travaux-3/` — travaux planifiés
3. `https://www.smgeag.fr/informations-reseau/` — infos réseau temps réel
4. `https://www.smgeag.fr/` — bandeau d'urgence

**Ce que je crée :**
- `supabase/functions/scrape-smgeag/index.ts` — scraper qui parse les 4 pages, extrait communes/dates/causes, INSERT dans `outages` (déduplique avec `external_id`)
- `src/routes/api/public/hooks/scrape-smgeag.ts` — endpoint cron qui appelle le scraper
- Cron job pg_cron toutes les 30 min
- Health check : log dans `scraper_runs` (succès/erreur, nb d'éléments trouvés) → visible dans le dashboard admin

**ML boosté (`generate-forecasts`) — améliorations :**
- **Pondération sources** : SMGEAG officiel = poids 1.0, Facebook SMGEAG = 0.8, signalements users = 0.4
- **Détection de récurrence** : si une commune subit des coupures tous les mardis à 22h, l'algo le détecte et le prédit
- **Saisonnalité** : weight × 1.3 en saison sèche (carême, février-mai), × 0.7 en saison humide
- **Score de confiance affiché** : 0-100% pour chaque prévision, montré à l'utilisateur

---

## Bloc 4 — Tarifs Pro/Business + page Abonnements

Déjà fait en BDD (migration validée). Reste à mettre à jour l'UI :
- `src/routes/abonnements.tsx` :
  - **Pro 5,99€/mois** : push PWA illimité, email illimité, 5 communes, prévisions ML, historique 6 mois — **sans SMS**
  - **Business à partir de 25€/mois** : tout Pro + SMS sur devis (selon volume), WhatsApp, communes illimitées, support prioritaire, API → bouton **"Demander un devis"** au lieu de Stripe
- `src/lib/subscription.ts` — synchronisation des features avec la BDD

---

## Détails techniques

| Fichier | Action |
|---|---|
| `public/manifest.webmanifest` | créer |
| `public/sw.js` | créer (push handler + cache offline minimal) |
| `public/icon-192.png`, `public/icon-512.png` | générer via ImageMagick |
| `src/lib/push-notifications.ts` | créer |
| `src/components/InstallPWAPrompt.tsx` | créer |
| `src/components/EnablePushButton.tsx` | créer (à mettre dans Paramètres) |
| `src/routes/__root.tsx` | éditer (injection manifest + register SW avec garde iframe) |
| `src/routes/abonnements.tsx` | éditer (tarifs + bouton devis Business) |
| `src/routes/parametres.tsx` | éditer (ajout toggle push notif) |
| `src/lib/subscription.ts` | éditer (nouveaux features) |
| `supabase/functions/send-push-notification/index.ts` | créer |
| `supabase/functions/scrape-smgeag/index.ts` | créer |
| `supabase/functions/generate-forecasts/index.ts` | éditer (sources + saisonnalité + récurrence) |
| `src/routes/api/public/hooks/scrape-smgeag.ts` | créer (déclencheur cron) |
| Cron pg_cron | configurer (toutes les 30 min) |

**Dépendances npm à ajouter :** `web-push` (signature VAPID), `cheerio` (parsing HTML SMGEAG).

**Garde-fou PWA preview Lovable** : le service worker ne s'enregistre PAS quand l'app tourne dans l'iframe Lovable — sinon ça casse le preview. Tu testeras les notifs sur le site publié (`aquagwada.fr` une fois livré, ou l'URL `.lovable.app` en attendant).

---

## Ce qu'il faut de TON côté après que j'aie codé

1. **Tester l'install PWA** : ouvrir l'URL publiée sur ton tel → menu Safari/Chrome → "Ajouter à l'écran d'accueil"
2. **Activer les notifs** dans Paramètres → autoriser quand le navigateur demande
3. **Facebook** : suivre le guide que je t'ai donné (catégorie "Other" + permissions `pages_read_engagement`) — si bloqué, on bascule sur Plan B (RSS/export manuel)
4. **Domaine `aquagwada.fr`** : dès que OVH te livre, tu me passes le nom et je te donne les 4 enregistrements DNS à coller (CNAME pour pointer vers Lovable + DKIM pour les emails)

---

**Tu valides, je code tout ?**
