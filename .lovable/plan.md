Je comprends ta frustration. On arrête de tourner en rond : on continue ici, de manière cadrée. Je ne peux pas créer moi-même une nouvelle conversation dans ton interface, et si le bouton n’apparaît pas, le plus efficace est de finir directement dans ce fil.

Point important côté crédits : en mode Plan, chaque message consomme 1 crédit. Pour économiser, je propose de faire une seule passe d’implémentation après ton approbation, avec vérification intégrée, au lieu de rediscuter longtemps.

Plan d’action immédiat

1. Finaliser l’historique visible et utile

- Garder le `HistoryPanel` déjà présent sur `/ma-commune` et `/carte`.
- L’améliorer pour qu’il ne donne plus l’impression de “0 historique” :
  - afficher un résumé clair : nombre de coupures archivées, période couverte, communes concernées ;
  - ajouter un état vide plus honnête selon le cas : pas de favoris, pas de données sur la fenêtre du plan, ou historique disponible ailleurs ;
  - mieux présenter les lignes : commune, date, heures, durée, source/cause si disponible ;
  - corriger le libellé incohérent sur la carte : gratuit = 7 jours, Pro = 1 an, Business = 5 ans.

2. Stabiliser les prévisions

- Ajuster le moteur statistique actuel pour éviter les prévisions trop extrêmes ou trop peu nombreuses.
- Objectif : afficher quelque chose de crédible même quand le planning officiel de la semaine suivante n’est pas encore publié.
- Modifier le tuning :
  - plafonner les probabilités statistiques à un niveau plus raisonnable sauf planning officiel ;
  - réduire l’effet qui donne 95% trop facilement sur certaines communes ;
  - garder les plannings officiels SMGEAG prioritaires avec forte confiance ;
  - élargir légèrement les prévisions statistiques pour couvrir plus de communes/jours, mais avec des labels “risque faible / modéré / élevé” plutôt qu’un faux sentiment de certitude.

3. Vérification base de données

- Vérifier les volumes après correction :
  - `outage_history` contient déjà environ 940 lignes avec historique depuis 2020 ;
  - `forecasts` contient déjà des prévisions jusqu’au 9 mai ;
  - les politiques de lecture sont publiques pour historique/prévisions, donc l’affichage ne devrait pas être bloqué par les droits.
- Lancer/réutiliser le job de génération des prévisions si nécessaire pour remplir les nouvelles valeurs.
- Contrôler qu’on obtient bien :
  - historique non vide sur les communes ayant des données ;
  - prévisions sur les 14 prochains jours ;
  - pas de doublons évidents.

4. Vérification UI

- Vérifier les pages principales :
  - `/carte` : timeline aujourd’hui, 7 derniers jours, prévisions, HistoryPanel détaillé ;
  - `/ma-commune` : favoris, timeline, prévisions si Pro/essai, historique ;
  - `/` : aperçu prévisions si accès autorisé, teaser sinon.
- Vérifier particulièrement :
  - aucune superposition majeure dans les timelines ;
  - les états vides expliquent quoi faire ;
  - gratuit/Pro/Business affichent les bonnes limites ;
  - mobile et desktop restent lisibles.

5. page "carte"
  cette page a tout le temps un probleme, elle ne suit jamais les rgeles des autres pages... il y a une liste horrible des 7 dernieres jours, cela rend la page immense et illisible, il faut que ca soit comme dans "ma commune", ca doit etre une seule time line (avec listse exhaustive des communes choisies) et la possibilités de choisir ces jours, tout simplement. cette time lige permet TOUT avec les jours passées (sur 7 jours), les jours futurs (prévisions), et on choisis le jours avec une liste horizontal juste au dessus (exactemnt comme dans "ma commune) mais on rajoute les 7 derniers jours juste avant. evidemant selon les plans choisis par l'utilisateur. respecte les acces pour chaque plan !!!  tu les as deja. et tu fais ca pour TOUTTTTTEEEES les time line du site. pas d'exception. (attention je ne parle pas de l'historique sur 1 an pour pro et 3 pour business, ca cest autre chose) pareil pour quand un uttilisateurs est pas connecté. il voit tout avec des listes sans noms incompréhensible. 
6. verifie bien que chaque texte amenant a donné une info sur un plan soit bonne pour chaque endroit du site, par exmple jai trouvé  au hasard un endroit ou tu dis que les pros ont 6 mis d'historique. ce qui est faux.

Détails techniques

- Fichiers principaux à modifier :
  - `src/components/history/HistoryPanel.tsx`
  - `src/server/jobs/generate_forecasts.ts`
  - éventuellement `src/routes/carte.tsx` pour les libellés et l’intégration visuelle.
- Pas besoin d’ajouter d’IA payante pour cette étape : on reste sur un moteur statistique local basé sur les données déjà stockées.
- Pas besoin de nouvelle table sauf découverte d’un blocage pendant l’implémentation.

Résultat attendu

- L’utilisateur ne voit plus “0 historique” alors que la base contient des données.
- Les prévisions sont présentes, lisibles et moins absurdes.
- Les timelines restent stables.
- On sort de la boucle avec une app AquaGwada utilisable sur historique + prévisions.