# La tâche entre dans la taxonomie du référentiel

**Date :** 5 septembre 2026
**Statut :** conception validée, implémentation à faire
**Branche :** `feat/hq-taxonomie-task`, partie de `fix/hq-target-version-numero`

## Le problème

Les douze référentiels de domaine déclarent **940 tâches**, écrites en cases
`- [ ]` sous un bloc `Tâches :`. Aucune n'atteint HQ.

Le parser ne connaît que quatre genres — `domain`, `capability`, `epic`,
`story`. Le bloc `Tâches :` n'est même pas mentionné dans
`docs/format-referentiel.md` : toute la chaîne l'ignore. Les 940 lignes
finissent en texte brut dans la description de l'epic, avec les règles métier,
les critères d'acceptation, les permissions et l'audit. On peut les lire ;
on ne peut ni les cocher, ni les assigner, ni les compter.

C'est un manque à combler, pas un choix de conception : `work_items` porte déjà
le type `task`, et `work-item.entity.ts` annonce la chaîne complète —
*« Parent work item — epic → story → subtask, per the referential's
taxonomy »*. Le champ existe et attend d'être rempli.

## L'objectif

Que le référentiel déclare, et que HQ reçoive, la chaîne

```
Domaine → Epic → User Story → Task
```

Domaine et Capacité ne sont pas des maillons de cette chaîne : ce sont des
colonnes de classement (`work_items.domain_id`, `capability_id`). Le parent est
`parent_id`, et il descend désormais d'un cran de plus.

**La sub-task est hors périmètre.** Elle naît à l'exécution, créée par celui —
humain ou agent — qui prend la task. En rédiger d'avance reviendrait à décider
l'implémentation de la plateforme avant d'avoir ouvert le code : aux ratios du
modèle, 22 500 éléments dont l'essentiel serait périmé avant d'être atteint.

## La taxonomie cible

| Niveau | Porté par | Clé |
|---|---|---|
| Domaine | `work_items.domain_id` | `D01` |
| Capacité | `work_items.capability_id` | `D01.C1` |
| Epic | work item `type: 'epic'` | `GOV-01` |
| User Story | work item `type: 'story'`, parent = l'epic | `US-GOV-01-1` |
| Task | work item `type: 'task'`, parent = la story | `US-GOV-01-1-T1` |

Une task transverse — celle qui ne sert aucune story en particulier, comme
*« écrire la migration et sa contre-migration »* — se rattache directement à
l'epic, sous la clé `GOV-01-T1`. Forcer un rattachement arbitraire à une story
serait un mensonge d'un genre pire que l'absence de rattachement : il aurait
l'air vrai.

## Le format documentaire

L'entête ne bouge pas : `# Domaine N — …`, `### Capacité N.M — …`,
`#### EPIC XXX-NN — …` et ses lignes `Priorité`, `Domaine`, `Côté`,
`Version cible`.

Ce qui change : **la story cesse d'être une ligne d'une liste numérotée et
devient une section à clé écrite.**

```markdown
##### US-GOV-01-1 — Consulter la structure du groupe

En tant que dirigeant, je veux consulter la structure complète du groupe
afin de comprendre les liens entre la mère, les filiales, les divisions
et les marques.

Côté : frontend

Critères d'acceptation :

1. La structure de détention est visualisable à n'importe quelle date passée.
2. Une modification n'écrase jamais l'historique.

Tâches :

- [ ] T1 — exposer l'API de lecture de la structure, filtrée par permission ;
- [ ] T2 — construire la vue organigramme de détention, avec sélecteur de date ;
```

Le titre de section porte le **libellé court** ; la phrase « En tant que… »
descend dans le corps. Les tickets deviennent lisibles sur un board, et le mur
des 200 caractères s'éloigne de lui-même.

Les critères d'acceptation descendent sur la story, où le comportement attendu
se décrit. L'epic garde la possibilité d'en porter qui sont transverses.

### Pourquoi la clé est écrite et non déduite

Aujourd'hui, la clé d'une story est fabriquée ainsi :

```ts
const key = `US-${currentEpic.sourceKey}-${index}`;   // index = rang dans la liste
```

Trois lignes plus haut, le parser énonce la règle inverse :

> *« it must come from the document's own numbering, **never from a position** »*

Le code contredit son propre commentaire. Insérer une story en position 2
décale toutes les suivantes : au ré-import, le rapprochement par `sourceKey`
donne au ticket de la story 3 le texte de la 4, et la dernière apparaît comme
« ajoutée ». Un epic entier de backlog corrompu, sans un message.

Écrire la clé supprime la classe de défaut. Une clé n'est **jamais réutilisée
ni renumérotée** : insérer une story, c'est prendre le numéro libre suivant.

C'est le moment de le faire. Rien n'a encore été importé dans le backlog, donc
changer le schéma ne coûte aucune migration. Dans six mois, ce serait une
reprise de plusieurs milliers de tickets.

## Le parser

**Il lit les deux formats, et c'est définitif.** `parse` s'exécute sur une
version *stockée*, et le module promet qu'un manifeste peut toujours être
reconstruit depuis un document immuable. Abandonner la lecture de la liste
numérotée casserait cette promesse pour toute version déjà déposée. La
cohabitation n'est donc pas une béquille de transition : c'est le contrat.

Elle a un effet secondaire utile — les douze documents se convertissent à leur
rythme, sans jamais bloquer l'analyse des autres.

**Un genre de plus.** `PARSED_ITEM_KINDS` passe de quatre à cinq avec `task`.
La colonne `kind` fait 16 caractères. `MANIFEST_SCHEMA_VERSION` passe de `'1'`
à `'2'` : le manifeste est une donnée dérivée, il se recalcule à chaque
analyse — **aucune migration de base**.

**L'héritage descend d'un cran.** La story hérite du côté et de la version
cible de son epic ; la task hérite de sa story, ou de son epic si elle est
transverse. On ne livre pas la moitié d'une story.

**Deux garde-fous**, de la même famille que celui posé sur `Version cible` :

- un titre au-delà de 200 caractères devient une anomalie nommée dans le
  rapport — pas un 500 à l'import ;
- une clé en double dans un document est une **erreur** qui arrête l'analyse.

Le premier n'est pas théorique : `execution_manifest_items.title` accepte 300
caractères, `work_items.title` n'en accepte que 200. Un titre de domaine, de
capacité ou d'epic entre les deux passe l'analyse et casse l'import — seule la
story était bornée, et en silence.

Deux stories dépassent déjà : `US-AUD-07-1` à **226** caractères et
`US-AUD-08-1` à **201**. Elles étaient invisibles parce qu'on les mesurait à
travers le parser qui les tronquait — ce que seul un test de caractérisation
entre l'ancien et le nouveau parser a fait apparaître. Une tâche sur 940
dépasse aussi.

L'empreinte porte désormais sur la phrase entière et non sur ce qu'il en reste
après la coupe : avant, corriger un titre au-delà du 200e caractère laissait
l'item « inchangé » au ré-import, et le ticket gardait l'ancienne version.

## L'import

Le tri actuel est binaire :

```ts
// Epics first: a story's parent must exist before the story is written.
[...importable].sort((a, b) => (a.kind === 'epic' ? -1 : 1) - (b.kind === 'epic' ? -1 : 1))
```

Il devient un rang de profondeur — epic 0, story 1, task 2 — et la carte
`epicWorkItemId` devient une carte de toutes les clés, pour qu'une task
retrouve sa story.

**Le piège, nommé parce qu'il est silencieux.** Aux branches « inchangé » et
« conflit », l'identifiant n'est mémorisé que `if (item.kind === 'epic')`. Une
story inchangée ne s'enregistrerait donc pas dans la carte, et **toutes ses
tasks seraient ignorées** avec le motif « parent non importé » — sur un
ré-import, c'est-à-dire le cas courant. Les deux branches doivent enregistrer
les stories aussi.

**Rien à migrer.** `work_items` porte déjà `type: 'task'`, `parent_id` et
`source_key`. Le seul changement de schéma est une chaîne de version dans le
manifeste.

**Ailleurs.** Le récapitulatif de comptage gagne `task`, donc
`scripts/import-referentiel.sh` gagne une ligne à afficher.

## La conversion des douze documents

La cible est que les douze soient au nouveau format. La partie structurelle est
mécanisable presque intégralement — mesuré sur les 625 stories réelles.

**Ce qu'un script fait, sans arbitrage :**

- transformer chaque story numérotée en section `##### US-XXX-NN-N — <titre>` ;
- **conserver les clés à l'identique** — elles sont dérivées du rang dans
  l'ordre du document, donc les écrire dans cet ordre reproduit exactement les
  mêmes ; aucune clé ne bouge ;
- dériver le titre court de la clause « je veux **X** afin de… » — **621 fois
  sur 625** ;
- descendre la phrase « En tant que… » dans le corps ;
- laisser le bloc `Tâches :` sous l'epic, en clés transverses `GOV-01-T1` —
  donc valides dès la conversion.

**Ce qui reste humain :** 4 titres courts, et les 940 arbitrages tâche → story.

Après le script, les douze documents sont **déjà au bon format et déjà
importables**. Déplacer une tâche sous sa story devient une ligne à
couper-coller dans une structure correcte, epic par epic, au rythme voulu — au
lieu d'une réécriture de 625 sections à la main.

Le script vit dans `scripts/`, pas dans une branche jetable : d'autres
référentiels seront à convertir.

**Un effet à connaître :** le titre de la story passe de la phrase entière au
libellé court, donc au premier import chaque story apparaîtra comme
« modifiée ». Rien n'ayant été importé, ça ne coûte rien aujourd'hui.

## Les tests

En TDD, rouge d'abord, dans `execution-reference.parser.spec.ts` et les specs
d'import :

- les deux formats analysés, ancien et nouveau ;
- les clés de task, transverses et sous story ;
- l'héritage du côté et de la version cible jusqu'à la task ;
- l'ordre parent-avant-enfant, **y compris le cas « story inchangée »** ;
- le garde-fou des 200 caractères ;
- les clés en double, erreur bloquante.

Plus une **caractérisation sur les documents réels**, qui ne peut pas vivre en
fixture : les douze référentiels n'appartiennent pas à ce dépôt.
`scripts/analyser-referentiel.ts` écrit l'analyse en JSON, à comparer d'une
version du parser à l'autre. Un diff vide dit que le changement ne touche que
ce qu'il prétend toucher.

Ce n'est pas une précaution théorique : c'est ce filet qui a montré que deux
stories dépassaient déjà 200 caractères — invisibles parce qu'on les mesurait à
travers le parser qui les tronquait — et que l'empreinte d'un titre long
ignorait ce qui suivait la coupe.

## Hors périmètre

Nommés pour qu'ils ne reviennent pas par la porte de derrière :

- **Sub-task** — créée à l'exécution, pas déclarée.
- **Objectif** — seul maillon que les documents ne déclarent pas. Rien à
  migrer pour autant : `roadmap_objectives` porte déjà `domain_id` et
  `capability_id`. Il manque une façon de l'écrire dans un document, et c'est
  tout.

  > **Correction du 5 septembre.** Cette section affirmait d'abord qu'Objectif
  > et Initiative étaient hors de portée, faute d'`objective_id` et
  > d'`initiative_id` sur `work_items` — « deux colonnes, une migration ». Les
  > deux moitiés étaient fausses. La chaîne existe entière en base :
  > `capabilities.domain_id`, `roadmap_objectives.capability_id`,
  > `roadmap_initiatives.objective_id`, et `work_items.project_id` qui est une
  > clé étrangère vers `roadmap_initiatives`. Mieux : la ligne `Projet :` d'un
  > document résout contre `Repository<RoadmapInitiative>` — vos référentiels
  > **déclarent déjà l'initiative**. `src/work-items/hierarchy.ts`, arrivé le
  > même jour, remonte l'arbre complet. Sur les cinq niveaux, quatre sont donc
  > alimentés par le document ; seul l'objectif ne l'est pas.
- **Bug, Spike** — les types existent, aucun document n'en déclare.
- **Risque, Décision** — n'existent pas comme types de ticket. La décision est
  précisément ce que GOV-04 propose de construire.

## L'ordre de livraison

1. Cette spec, relue et approuvée.
2. Le parser et l'import, en TDD, avec le test de caractérisation.
3. Le script de conversion, vérifié sur D01 avant les onze autres.
4. Les 940 arbitrages tâche → story, document par document, quand voulu.
