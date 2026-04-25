## Objectif

Reconstruire une **seule frise chronologique** ("Coupures au fil du temps") qui remplace, sur les pages **Accueil, Carte et Ma commune**, les blocs actuels : "Aujourd'hui", "Demain et après ?", "7 derniers jours", "14 prochains jours", anciennes Timelines.

L'historique détaillé reste un bloc indépendant (grisé pour Free, limité 1 an Pro).

Ajouter aussi : restriction d'accès pour visiteurs non connectés + retouches de copie sur l'accueil.

---

## 1. Nouveau composant `OutageTimeline` (remplace tout)

Un composant unique réutilisé partout, structuré ainsi :

```text
┌─ Coupures au fil du temps ─────────────────┐
│  ◀  [mer 23] [jeu 24] [VEN 25 ✓] ...  ▶   │   ← ruban de jours, 3 visibles
├────────────────────────────────────────────┤
│  Vendredi 25 avril                         │
│  00h   06h   12h   18h   24h               │
│  Baillif       ▓▓▓                         │
│  Le Moule         ▓▓▓▓        ░░░░ (prév)  │
│  ...                                       │
└────────────────────────────────────────────┘
```

### Ruban de jours (DayRibbon)

- Affiche **3 cases visibles** par défaut (responsive : 5 sur desktop large).
- Aujourd'hui sélectionné par défaut, **positionné en 4ème case "logique"** dans la liste totale (3 jours passés visibles à sa gauche au démarrage si possible, sinon scroll).
- Flèches `◀` / `▶` cliquables pour faire défiler la liste case par case.
- Liste totale = `backDays` (passés) + 1 (aujourd'hui) + `forwardDays` (futurs).
- Cases **futures grisées avec petit badge "Pro"** si `tier === "free"` → clic = redirection vers `/abonnements` au lieu de sélection.
- Cases passées au-delà de la fenêtre du plan également grisées "Pro".
- Le clic sur une case ouvre **la chronologie de ce jour en dessous** (multi-lignes par commune favorite, exhaustif).

### Vue du jour sélectionné

- Réutilise la logique multi-lanes existante de `DayTimeline` (mode `communes={...}`).
- Pour chaque commune favorite (ou "quelques villes au pif" pour visiteurs) : une ligne avec coupures + prévisions selon la nature du jour :
  - **Jour passé** → données de `outage_history`
  - **Aujourd'hui** → `outages` (live)
  - **Jour futur** → `forecasts`
- Bloc "verrou après maintenant" sur l'aujourd'hui pour Free : on autorise jusqu'à 1 heure aprés "maintenant" la journée d'aujourd'hui. Le verrou s'applique aussi aux **jours futurs** via les cases grisées du ruban.

### Fenêtres par plan


| Plan                    | Jours passés cliquables                         | Jours futurs cliquables                                                            |
| ----------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| Visiteur (non connecté) | aujourd'hui + 1 ou 2 jours autour, sans cliquer | uniquement aujourd'hui en aperçu avec les previsions de plus d'une heure vérouillé |
| Free connecté           | 7                                               | 0 (cases futures grisées "Pro")                                                    |
| Pro / Essai             | 365                                             | 14                                                                                 |
| Business                | 1095                                            | 14                                                                                 |


---

## 2. Suppression / fusion sur chaque page

### Accueil (`src/routes/index.tsx`)

- **Supprimer** :
  - Section "Aujourd'hui en Guadeloupe" (DayTimeline dédiée)
  - Section "Demain et après ?" (ForecastTeaserLocked / ForecastsUnlockedPreview)
- **Remplacer par** un unique bloc `<OutageTimeline />` titré "Coupures au fil du temps".
- Pour visiteur non connecté : la timeline affiche **3 communes au hasard avec comme statut l'eau coupée**  (sélection stable dans le temps via `useMemo` + sample dans `communes`), aucun jour passé / futur cliquable, et un **gros CTA conversion** au-dessus/dessous : "Créez un compte gratuit pour suivre votre commune et voir les 7 derniers jours".
- Modifier le sous-titre HERO : retirer "timeline horaire" → "carte, frise chronologique, prévisions à 14 jours, et notifications préventives ou alertes par email" (suppression "SMS et WhatsApp" car réservés Business via devis et ajouté notifications préventives).

### Carte (`src/routes/carte.tsx`)

- **Supprimer** :
  - Section "Timeline (historique)/(prévisions)/(aujourd'hui)" + DayPicker actuel
- **Remplacer par** `<OutageTimeline />` (en mode favoris pour Free/Pro, toutes communes pour Business).
- Conserver : carte, sidebar "En cours", `ReportBlock`.
- Conserver `<HistoryPanel />` indépendant (grisé Free, 1 an Pro, 3 ans Business).

### Ma commune (`src/routes/ma-commune.tsx`)

- **Supprimer** : section "Timeline" actuelle (DayPicker + DayTimeline).
- **Remplacer par** `<OutageTimeline />` (toujours en mode favoris).
- Conserver : picker de communes favorites, status cards, `ReportBlock`, `NotificationPreferencesPanel`, `HistoryPanel`, `UpsellCard`.

---

## 3. Restriction visiteur (non connecté)

Pages **Carte** et **Ma commune** :

- Si `!user`, afficher un écran "Connectez-vous" plein écran (déjà fait pour `/ma-commune`, à reproduire pour `/carte`) avec :
  - Titre, courte explication
  - Boutons "Créer un compte gratuit" et "Se connecter"
  - Mention "Inscription instantanée, plan gratuit automatique".
- Vérifier que `signUp` du `AuthProvider` assigne bien le plan `free` par défaut (sinon ajouter un trigger DB ou un insert côté client après signup).

L'**Accueil reste publique** mais tronquée comme décrit en §2.

---

## 4. Bloc Historique (inchangé dans son principe)

- Garder `<HistoryPanel />` séparé sur Carte et Ma commune.
- S'assurer du grisage pour Free (badge Lock + CTA `/abonnements`) — déjà fait, à vérifier.

---

## 5. Détails techniques (résumé)

**Nouveau fichier** : `src/components/outages/OutageTimeline.tsx`

- Props : `tier`, `mode: "visitor" | "favorites" | "all"`, `favoriteCommunes`, `allCommunes`, `visibleDays?: number` (par défaut 3, responsive).
- Gère seul : ruban scrollable, état du jour sélectionné, fetch combiné (history/outages/forecasts) selon le jour, rendu via `DayTimeline` existant en mode multi-lignes.
- Cas vide visiteur : 3 communes échantillonnées + overlay CTA "Créez un compte".

**Refactor** : extraire `DayPicker` actuel pour évoluer vers ruban à fenêtre glissante avec flèches (ou nouveau `DayRibbon`, garder l'ancien si encore utilisé ailleurs).

**Pages modifiées** : `index.tsx`, `carte.tsx`, `ma-commune.tsx` — retraits + import du nouveau composant.

`**SiteHeader**` : optionnel, masquer "Carte" / "Ma commune" pour visiteurs ou laisser et rediriger vers `/connexion` (préférence : laisser visible, redirection sur la page).

**Validation** : `tsc --noEmit` après refactor.

---

## Ce qui n'est PAS touché

- Le moteur de prévisions (`generate_forecasts.ts`)
- Le schéma DB
- Les jobs de scraping
- Les notifications, abonnements, paiements