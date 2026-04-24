## Ce qu'on va faire (4 blocs bien carrés)

---

### Bloc 1 — Ton domaine `aquagwada.fr` (OVH) : explication + étapes

Tu as **acheté** le domaine, mais pour l'instant il ne pointe sur **rien**. Pour qu'il affiche AquaGwada, il faut faire 2 choses, dans cet ordre :

**Étape A — Publier le site (chez Lovable)**
Tant que le projet n'est pas publié, on ne peut pas y attacher ton domaine. → Tu cliques sur **Publish** en haut à droite de l'éditeur. Ça crée un sous-domaine type `aquagwada.lovable.app`. Tu n'as **rien à faire** côté code, c'est un clic.

**Étape B — Connecter `aquagwada.fr` à ce site publié**
Dans Lovable : **Project Settings → Domains → Connect Domain → aquagwada.fr**. Lovable te donnera 3 enregistrements DNS à recopier dans **OVH → Espace Client → Domaines → aquagwada.fr → Zone DNS** :

- 1 enregistrement **A** : `@` → `185.158.133.1`
- 1 enregistrement **A** : `www` → `185.158.133.1`
- 1 enregistrement **TXT** : `_lovable` → la valeur affichée par Lovable

Tu sauvegardes chez OVH, et dans 1 à 24h le site est en HTTPS sur `aquagwada.fr`. SSL automatique, rien à faire de plus.

> **Tu n'as PAS besoin d'un hébergement OVH ni d'une box mail OVH pour le moment.** Tu utilises juste leur "registrar" (gestion du nom de domaine).

Je te ferai un récap à l'écran le jour J.

---

### Bloc 2 — Cron côté Lovable Cloud : pourquoi rien ne s'affiche, comment réparer

**Le diagnostic** : aujourd'hui en base il n'y a **0 historique**, **3 prévisions de test**, **0 run de scraper**. Raison : les extensions `pg_cron` et `pg_net` ne sont **pas activées** dans la base, donc **aucun job ne tourne**. Les routes `/api/public/jobs/*` existent côté code mais personne ne les appelle.

**Ce que je fais (côté code, automatique) :**

1. Activer les extensions `pg_cron` et `pg_net` via une migration SQL.
2. Programmer **5 jobs cron** qui appelleront tes routes existantes :
  - `**scrape-smgeag**` → toutes les **30 min** (récupère les coupures officielles SMGEAG)
  - `**process-reports**` → toutes les **5 min** (transforme les signalements user en outages)
  - `**generate-forecasts**` → toutes les **6 h** (recalcule les prévisions ML)
  - `**dispatch-notifications**` → toutes les **2 min** (envoie push/email aux abonnés)
  - `**check-preventive**` + `**cleanup-history**` → 1×/h et 1×/jour
3. Lancer **manuellement** un premier `scrape-smgeag` pour amorcer la base, sinon tu attends 30 min pour voir des données.

**Ce que tu fais, toi : RIEN.** Une fois la migration appliquée, ça tourne tout seul. Tu pourras suivre dans la table `scraper_runs` (page admin à venir) si tu veux vérifier.

> Tu n'as **pas** besoin de configurer un cron Linux/serveur OVH. Tout est dans Lovable Cloud.

---

### Bloc 3 — Notifications : refonte complète du panneau

Aujourd'hui dans `/ma-commune` le panneau notifications a **deux gros défauts** :

- Le bouton "Activer push" est **séparé** du tableau de préférences → l'utilisateur ne comprend pas le lien.
- Il n'y a **pas de bouton "Sauvegarder"** : chaque clic save direct, et **rien ne dit qu'il faut installer l'app** pour que le push marche vraiment quand le navigateur est fermé.

**Ce que je refais :**

**a) Intégration push dans le tableau**
J'ajoute une **4ème colonne "Push"** dans la matrice événement × canal (à côté de Email/SMS/WhatsApp). Comme ça l'utilisateur coche "Début de coupure" + "Push" et c'est clair : il recevra une notif push quand l'eau sera coupée.

**b) Bouton "Sauvegarder mes préférences"**
Je passe d'un mode "auto-save à chaque clic" vers un mode "buffer + bouton **Sauvegarder**". Avantage : on peut intercepter le clic pour faire ce qui suit ↓

**c) Pop-up intelligent d'installation au moment du Save**
Au clic sur "Sauvegarder", **3 cas** :

- **Cas 1 — Déjà dans l'app installée (PWA standalone)** → on save direct, toast "Préférences enregistrées ✓".
- **Cas 2 — Sur navigateur, pas encore installé, push pas activé** → on ouvre une **modale** :
  > "Pour recevoir les alertes en temps réel même quand ton navigateur est fermé, **installe AquaGwada sur ton téléphone**. C'est gratuit, ça prend 5 secondes, pas besoin de l'App Store."
  > [📱 Installer maintenant] [Plus tard, sauvegarder quand même]
  > Si "Installer" → on déclenche `beforeinstallprompt` (Android/Chrome) ou on affiche les instructions iOS Safari ("Partager → Sur l'écran d'accueil"), puis on save + on active la souscription push.
- **Cas 3 — Sur navigateur, push déjà activé** → on save direct.

**d) Gestion fine des permissions**

- Si l'utilisateur a refusé les notifs au niveau système → message clair : "Tu as bloqué les notifs. Va dans les réglages de ton navigateur pour les réautoriser."
- On désactive automatiquement les cases "Push" du tableau si la permission est refusée + lien d'aide.

**e) Indicateur visuel d'état**
En haut du panneau, un **badge d'état** : ✅ "App installée + notifs activées" / ⚠️ "App installée mais notifs désactivées" / 📱 "Pas encore installée" — pour que l'utilisateur voie en 1 coup d'œil son setup.

---

### Bloc 4 — Abonnements : refonte tarifs + comparatif (anti-bâclage)

**Corrections sur les cartes prix :**

- **Pro** : affichage **"5,99 €"** (pas 6 €) avec virgule française, en gros caractères. Sous-titre : "ou 59 €/an (2 mois offerts)".
- **Business** : affichage **"À partir de 25 €/mois"** avec mention "**Sur devis selon volume SMS/WhatsApp**" très visible. Bouton "Demander un devis" (mailto déjà en place, je garde).
- **Gratuit** : "0 €" — message "Parfait pour commencer".

**Refonte du comparatif détaillé (le tableau) :**
J'ajoute **une nouvelle section juste au-dessus** du tableau, en gros, en couleur, avec icône : un **encart pédagogique "Pourquoi le Pro suffit largement à 99% des gens"** :

> **Les notifications push (incluses Gratuit + Pro) sont aussi rapides qu'un SMS, gratuites, et illimitées.**
> Tant que ton téléphone est allumé et que tu as installé AquaGwada (5 sec), tu reçois l'alerte **en temps réel**, même app fermée, même écran verrouillé. Exactement comme une notif WhatsApp ou Instagram.
>
> → **Le SMS et le WhatsApp ne sont utiles que si tu gères une entreprise** (hôtel, restaurant, syndic, mairie) qui doit prévenir un grand nombre de clients qui ne sont **pas tes utilisateurs AquaGwada**. Pour ça : Business sur devis.

**Corrections du tableau de comparaison :**

- Je remplace "180 jours" par **"1 an"** pour Pro (plus lisible).
- Je remplace "1825 jours" par **"3 ans"** pour Business.
- Je précise que tu veux : **Pro = 1 an d'historique** (au lieu de 6 mois actuels) et **Business = 3 ans** (au lieu de 5 ans actuels) → migration SQL pour passer Pro à 365 jours et Business à 1095 jours.
- Pour la ligne **"Notifications push (PWA)"** je passe de juste ✓ à : **"✓ Illimitées, temps réel"** sur les 3 plans, avec un petit badge "★ Recommandé" à côté.
- Pour la ligne **"Alertes SMS"** : je passe de juste ✓ Business à : **"Sur devis (à partir de 25€/mois)"** + petit texte gris en dessous "Pour pros uniquement".
- Pour **"Alertes WhatsApp"** : pareil, "Sur devis" + "Pour pros uniquement".
- J'ajoute une ligne **"Notifications préventives (Hxx avant)"** : ❌ Gratuit / ✓ Pro / ✓ Business (déjà en place mais je clarifie le wording).
- J'ajoute une ligne **"Recommandé pour"** en haut du tableau : "Particulier" / "Famille active / Citoyen" / "Entreprise / Collectivité".

**Encart final remplacé :**
À la place du paragraphe gris en bas, je mets un encart vert/positif :

> 💡 **Conseil :** Commence par le plan Gratuit (1 commune). Si tu veux suivre toute la famille (jusqu'à 5 communes) ou recevoir une alerte **avant** une coupure programmée → Pro à 5,99 €/mois (essai 7 jours sans CB).

---

## Détails techniques (pour info)

- **Migration SQL** : `CREATE EXTENSION pg_cron, pg_net` + `cron.schedule(...)` ×6 + `UPDATE subscription_plans SET history_days=365 WHERE tier='pro'` + `history_days=1095 WHERE tier='business'`.
- **Refacto `NotificationPreferencesPanel.tsx**` : passage en mode "dirty state + save button", ajout colonne push, nouvelle modale `InstallAndPushDialog.tsx`.
- **Détection PWA standalone** : `window.matchMedia("(display-mode: standalone)").matches`.
- **Détection iOS** (pas de `beforeinstallprompt`) : UA sniff + instructions visuelles "Partager → Sur l'écran d'accueil".
- **Refacto `abonnements.tsx**` : nouvel encart pédagogique au-dessus du tableau, FEATURE_MATRIX enrichi avec rendus custom (badge "Recommandé", texte "Sur devis").
- **Pas de changement** sur `subscription.ts` (caps déjà bons), ni sur le service worker / VAPID (déjà en place).
- **Bootstrap manuel** : après migration, j'appelle 1×la route `/api/public/jobs/scrape-smgeag` pour peupler la base immédiatement.

---

## Ce qui reste à ta charge après mon implémentation

1. Cliquer **Publish** dans Lovable.
2. Aller dans **Project Settings → Domains** et lancer la connexion `aquagwada.fr`.
3. Recopier les 3 enregistrements DNS dans OVH (zone DNS).
4. Attendre 1 à 24h. C'est tout.

Tu valides, je code ?