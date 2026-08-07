# Retirer les projets Studio semés (YEK / NOLA / STU) en production

- **Contexte** : `StudioService.onModuleInit()` semait ces 3 projets par
  défaut à chaque démarrage. Ce seed a été retiré (`feat/studio-section`) —
  les projets sont désormais entièrement gérés depuis l'app (écran
  « Projets », `POST/PATCH /studio/projects`). S'ils existent déjà en prod,
  ce sont maintenant des lignes ordinaires, sans code qui en dépende.

## Ce qui bloque une suppression brute

`studio_tasks.project_id` a une contrainte `FOREIGN KEY ... ON DELETE NO
ACTION` vers `studio_projects` (migration `1786000000000-Studio.ts`).
Concrètement : Postgres **refuse** un `DELETE FROM studio_projects` tant
qu'une tâche référence encore la ligne — pas de suppression silencieuse
possible, ni de perte accidentelle de tâches.

Autre point à ne jamais perdre de vue : `identifier` (`YEK-42`) est écrit en
dur dans chaque tâche au moment de sa création — il ne se met pas à jour si
on change `projectId` après coup. Réassigner une tâche `YEK-42` vers un autre
projet ne renomme pas son identifiant ; elle reste affichée comme `YEK-42`
sous un projet dont la clé ne correspond plus. C'est la raison pour laquelle
il n'y a pas d'endpoint de suppression de projet, seulement l'archivage.

## Étape 1 — vérifier ce qu'il y a réellement en base

```sql
SELECT sp.key, sp.id, sp.status,
       (SELECT count(*) FROM studio_tasks st WHERE st.project_id = sp.id) AS task_count,
       (SELECT count(*) FROM studio_tasks st WHERE st.project_id = sp.id AND st.status <> 'done') AS open_task_count
FROM studio_projects sp
WHERE sp.key IN ('YEK', 'NOLA', 'STU');
```

## Étape 2 — selon le résultat

**`task_count = 0`** (aucune tâche n'a jamais été créée sous ce projet) :
suppression directe sans risque, deux options équivalentes :
- SQL direct : `DELETE FROM studio_projects WHERE key = 'XXX';`
  (la FK refusera si vous vous trompez et qu'une tâche existe réellement)
- ou simplement laisser la ligne : elle n'apparaît que si vous la
  réutilisez, et l'écran « Projets » permet de l'archiver pour qu'elle
  disparaisse du sélecteur de la Task Composer sans toucher la base.

**`task_count > 0`** : ne pas supprimer. Chemin recommandé :
1. Ouvrir l'écran **Studio → Projets**.
2. Archiver le projet (`POST /studio/projects/:id/archive`).
   - Si `open_task_count > 0`, l'archivage est **bloqué** avec un message
     listant le nombre de tâches encore ouvertes — c'est voulu (voir
     `StudioService.archiveProject`) : un projet archivé disparaît du
     sélecteur de la Task Composer, donc archiver un projet qui a encore du
     travail en cours le laisserait orphelin de tout nouveau suivi.
   - Terminez ou déplacez ces tâches vers un vrai projet, puis réessayez.
3. Une fois archivé : le projet et son historique de tâches (`YEK-1`,
   `YEK-2`, …) restent visibles et intacts partout (Liste, drawer,
   dashboard), il disparaît seulement du sélecteur de création de nouvelles
   tâches. C'est réversible (`POST /studio/projects/:id/unarchive`) si besoin.

## Ce qu'il ne faut pas faire

- Ne pas réassigner en masse les tâches `YEK-*` vers un autre projet dans
  l'espoir de « libérer » la clé `YEK` puis supprimer la ligne — leurs
  `identifier` resteront `YEK-*` sous un projet dont la clé ne correspond
  plus, ce qui est plus confus que de simplement archiver.
- Ne pas modifier `key` directement en base pour la « renommer » — c'est
  immuable côté app précisément parce que l'identifiant de chaque tâche déjà
  créée le fige.
