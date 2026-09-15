# Audit du moteur de trajets

Date : 2026-09-15  
Périmètre : `lib/travel/model.ts` (lecture seule)

## Résultat

La suite `tests/model.test.ts` couvre 16 combinaisons produites par `scenarios` et les invariants associés : contraintes train de Joël et Guillaume, origine ferroviaire de Thouars pour Élise, clés car/train, trajets incomplets, ajout du temps d'accès, classement complet puis minimax aller/retour puis moyenne, agrégation symétrique des groupes, validation des minutes et valeurs nulles/zéro.

Commande exécutée :

```text
node --experimental-strip-types --test tests/model.test.ts
```

Résultat : **19 tests réussis, 0 échec**.

## Constats et hypothèses

- `rank` considère une destination complète uniquement si chaque groupe a un aller et un retour. Les destinations incomplètes restent dans la sortie, mais sont classées après les complètes et reçoivent `max`/`mean` à `null`.
- Pour une destination complète, `max` est bien le maximum de tous les trajets aller et retour ; `mean` est la moyenne arithmétique de ces deux sens pour chaque groupe. Chaque groupe contribue donc deux observations, avec un poids égal.
- Le temps `access` est ajouté aux deux sens lorsque le mode est `train`. Cette hypothèse est cohérente avec le modèle actuel et est testée.
- `validMinutes` accepte exactement l'intervalle `[0, 2880]`, ainsi que zéro, et rejette les valeurs non numériques, négatives, infinies ou `NaN`.

## Point de vigilance

Le moteur suppose que `Leg.minutes` a déjà été validé. `rank` ne contrôle pas `NaN`, `Infinity` ou une valeur négative : un objet `Trip` mal formé peut alors produire un classement `complete` avec des statistiques invalides. Aucun bug n'a été observé avec des données conformes ; la validation doit rester garantie à la frontière d'import des données.

Score qualité : **94/100**. Les invariants demandés sont couverts et exécutables sans dépendance ; le seul risque résiduel est cette confiance dans la validation préalable de `Leg.minutes`.
