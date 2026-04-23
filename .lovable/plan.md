
Objectif compris : fiabiliser enfin l’essai gratuit, empêcher les gratuits de “profiter” des prévisions du reste de la journée, transformer ce blocage en levier de conversion, et envoyer un email 12h avant la fin de l’essai.

1. Réparer l’essai gratuit à la source
- Remplacer la logique actuelle d’activation d’essai côté client par une logique serveur sécurisée.
- Cause probable actuelle : la ligne `subscriptions` existe bien en `free/active`, mais le client tente de la modifier alors que les règles d’accès n’autorisent pas l’utilisateur à mettre à jour sa propre souscription.
- Créer un flux serveur atomique pour :
  - démarrer l’essai Pro 7 jours,
  - marquer la souscription en `trialing`,
  - renseigner `trial_ends_at`, `current_period_start`, `current_period_end`,
  - empêcher un second essai si un essai/payant a déjà été utilisé.
- Ajouter une résolution “effective” serveur de l’abonnement :
  - `trialing` + date future = accès Pro réel,
  - `trialing` + date passée = retour automatique à `free/expired`,
  - statut réutilisable partout dans l’app.
- Brancher cette source de vérité sur :
  - page abonnements,
  - page ma commune,
  - verrouillages des prévisions,
  - quotas multi-communes.

2. Harmoniser le statut d’abonnement dans toute l’UI
- Afficher clairement :
  - essai actif,
  - date/heure de fin,
  - essai expiré,
  - plan effectif courant.
- Corriger les invalidations de cache après activation d’essai pour que le passage en Pro soit immédiat sans rechargement manuel.
- Réutiliser la logique d’abonnement existante mais la fiabiliser autour d’une seule fonction “effective subscription”.

3. Bloquer les prévisions du jour pour les gratuits, sans les cacher
- Modifier la timeline pour supporter un mode “preview verrouillée”.
- Règle produit proposée :
  - visiteurs/free : accès au passé + au présent,
  - à partir de “maintenant” : seule une petite fenêtre teaser reste visible,
  - le reste de la timeline du jour est masqué/verrouillé avec CTA essai gratuit,
  - jours futurs totalement verrouillés,
  - trial/pro/business : accès complet.
- Sur l’accueil :
  - remplacer la logique “24h complètes visibles” par une timeline du jour tronquée pour les non payants,
  - ajouter un overlay/teaser sur la partie future de la journée,
  - message central : “Essayez Pro 7 jours gratuitement, sans engagement”.
- Sur “Ma commune” :
  - même logique de coupure partielle du jour pour les gratuits,
  - conserver la visibilité des fonctionnalités, mais en état verrouillé,
  - garder les prévisions futures réservées au Pro.
- Je partirais sur un blocage visuel après l’heure actuelle avec un petit aperçu (~15 à 25% du reste) pour donner envie sans livrer la vraie valeur.

4. Rendre la timeline compatible avec ces règles d’accès
- Étendre `DayTimeline` avec des props de contrôle de visibilité :
  - mode complet,
  - mode verrouillé,
  - point de coupure,
  - message CTA.
- Distinguer clairement :
  - historique visible,
  - temps réel visible,
  - futur du jour teaser,
  - prévisions payantes.
- Conserver le design actuel, uniquement ajuster le comportement et les états visuels.

5. Durcir la monétisation sur les écrans clés
- Accueil :
  - verrouillage visible des prévisions et promesse d’essai gratuit.
- Ma commune :
  - quota gratuit très visible,
  - prévisions du jour partiellement bloquées,
  - SMS / WhatsApp / notifications préventives toujours visibles mais verrouillées,
  - CTA vers essai gratuit / abonnements.
- Abonnements :
  - s’assurer que l’essai déclenche immédiatement les vraies permissions Pro.

6. Email 12h avant la fin d’essai
- Mettre en place les emails applicatifs, mais il y a un prérequis : aucun domaine d’envoi n’est configuré actuellement.
- Une fois le domaine configuré, ajouter :
  - l’infrastructure email,
  - un template d’email “fin d’essai imminente”,
  - un job planifié qui détecte les essais arrivant à échéance dans 12h.
- Règle d’envoi :
  - uniquement pour `trialing`,
  - uniquement si `trial_ends_at` est entre maintenant et +12h,
  - un seul envoi par essai.
- Pour éviter les doublons, ajouter un mécanisme de traçage d’envoi :
  - soit table dédiée de logs email,
  - soit champ/événement dédié au rappel de fin d’essai.

7. Automatisation backend
- Ajouter un job dédié “trial expiry reminders”.
- Vérifier aussi le job de résolution automatique :
  - un essai expiré doit retomber proprement sur gratuit même si l’utilisateur ne recharge pas immédiatement la page.
- Réutiliser la structure de jobs existante pour rester cohérent avec l’architecture actuelle.

8. Modifications prévues
- Base de données :
  - éventuellement fonction SQL sécurisée pour démarrer l’essai,
  - éventuellement fonction SQL pour résoudre l’abonnement effectif,
  - stockage anti-doublon pour l’email de fin d’essai.
- Frontend :
  - `src/routes/index.tsx`
  - `src/routes/ma-commune.tsx`
  - `src/routes/abonnements.tsx`
  - `src/components/outages/Timeline.tsx`
  - `src/components/upsell/ForecastTeaser.tsx` si besoin
  - `src/lib/queries/subscription.ts`
- Backend / jobs :
  - nouveau job de rappel fin d’essai
  - intégration email
  - éventuelle server function/route pour activer l’essai

9. Résultat attendu après implémentation
- Cliquer sur “Démarrer mon essai” débloque réellement Pro immédiatement.
- Les gratuits ne voient plus les prévisions exploitables de la journée complète.
- Ils voient assez pour comprendre la valeur, mais pas assez pour contourner l’offre.
- Les essais expirent proprement.
- Un email est envoyé 12h avant la fin.
- Le statut d’abonnement devient fiable et cohérent dans toute l’application.

Détail technique important
- Je corrigerai l’essai côté serveur, pas côté client, pour éviter les blocages liés aux règles d’accès.
- Je ne modifierai pas le design global ; seulement la logique, les états verrouillés et les CTA.
- Pour l’email de fin d’essai, le premier pas sera la configuration du domaine d’envoi, car aucun domaine email n’est disponible actuellement.
