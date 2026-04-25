Je comprends : les captures montrent que le résultat ne correspond pas à ce qui avait été annoncé. Je vais corriger précisément les points visibles au lieu de repartir dans une grosse refonte.

Ce que j’ai constaté dans le code et la base :

- La base contient bien environ 940 entrées d’historique et 61 prévisions, donc le problème est surtout UI/filtrage, pas absence de données.
- Les règles de lecture sont ouvertes pour `outage_history` et `forecasts`, donc ce n’est pas un blocage de permissions.
- Le panneau `HistoryPanel` est encore trop limité : il ne charge que 20 lignes et son état vide peut donner l’impression que rien n’existe.
- Sur `/carte`, en visiteur ou business, la timeline affiche encore une ligne par commune de Guadeloupe, ce qui crée la “liste infinie”.
- Sur `/ma-commune`, le label Pro peut encore venir d’anciennes données de plan côté base/abonnements, d’où le “1 an” vu dans les captures.
- Les captures contiennent des textes qui ne sont plus dans certains fichiers, donc il y a probablement aussi un souci de build/preview pas totalement à jour ; je vérifierai par typecheck et cohérence des chaînes de texte.

Plan d’action immédiat :

1. Supprimer la “liste infinie” des timelines

- Sur `/carte`, ne plus afficher une ligne pour toutes les communes par défaut.
- Remplacer la timeline multi-lignes globale par une vue compacte : uniquement les communes qui ont une coupure/prévision le jour sélectionné.
- Si aucune donnée ce jour-là : afficher un vrai état vide clair.
- Garder `/ma-commune` en multi-lignes seulement pour les communes favorites, car là c’est pertinent.

2. Rendre l’historique réellement exploitable

- Modifier `HistoryPanel` pour afficher une liste paginée/chargeable, pas seulement les 20 premières lignes.
- Ajouter un résumé fiable : total, communes touchées, période réellement couverte.
- Corriger les messages vides pour distinguer : aucune favorite, filtre trop restrictif, ou aucune coupure dans la période.
- Uniformiser les labels : Gratuit = 7 jours, Pro = 1 an, Business = 3 ans.

3. Corriger les labels incohérents “1 an d’historique”

- Remplacer les textes restants qui affichent 6 mois pour Pro par 1 an, et 5 ans pour Business par 3 ans.
- Vérifier `abonnements` et les composants qui formatent les durées afin qu’ils utilisent la même vérité que `PLAN_CAPS`.

4. Stabiliser les prévisions dans l’UI

- Afficher les prévisions uniquement sur les jours futurs, avec un libellé lisible : officiel vs statistique, risque faible/modéré/élevé.
- Éviter d’afficher des prévisions statistiques comme si elles étaient certaines.
- Garder les plannings officiels avec une confiance élevée.

5. Vérification finale obligatoire

- Lancer le contrôle TypeScript.
- Vérifier par requête DB : volume historique, prévisions sur 14 jours, dates min/max.
- Vérifier dans le code qu’il ne reste plus les anciens libellés visibles dans tes captures.
- Vérifier les deux écrans clés : `/carte` et `/ma-commune`, en mode visiteur et connecté/non-visiteur.

Résultat attendu :

- Plus de grande liste verticale de communes inutiles.
- L’historique affiche enfin des données quand il y en a, avec pagination/chargement.
- Les prévisions sont visibles et compréhensibles pour les plans autorisés.
- Les labels d’offre sont cohérents partout.