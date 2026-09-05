# Écrire un document d'epics et de stories

Ce document décrit le format que Nolaa HQ sait lire pour alimenter le backlog.
Il y a **deux façons** d'écrire, et la seconde suffit dans la plupart des cas.

- Le **format complet** — domaines, capacités, epics, stories — sert à déposer
  un référentiel d'ensemble, comme le référentiel v1.3.
- Le **format léger** — des epics et leurs stories — sert à déposer un lot de
  travail. **Le domaine n'y est pas obligatoire.**

Dans les deux cas, le document est du Markdown ordinaire : la prose entre les
sections est conservée telle quelle et devient la description du ticket.

---

## Le format léger

```markdown
# Lot « Facturation par échéance »

**Version :** 1.0

Projet : NolaHQ
Auteur : Greg · septembre 2026

# EPIC BIL-01 — Générer les factures d'abonnement avant l'échéance

Priorité : P0
Domaine : D08
Côté : backend
Version cible : 1.1.0

Chaque abonnement doit produire sa facture trois jours avant le
renouvellement, et l'envoyer au contact de facturation du tenant.

Stories :

1. Générer la facture trois jours avant le renouvellement.
2. Envoyer la facture au contact de facturation du tenant.
3. En tant que gestionnaire, je veux voir les factures à venir. #frontend

# EPIC BIL-02 — Annuler une facture émise par erreur

Priorité : P1
Côté : les deux

Stories :

- En tant que gestionnaire, je veux annuler une facture en donnant un motif.
- En tant qu'auditeur, je veux retrouver qui a annulé quoi et quand.
```

Ce document produit **2 epics et 5 stories**, tous rattachés au projet NolaHQ.
`BIL-01` est classé en D08, `BIL-02` reste non classé — et c'est valide : il se
classera dans HQ, sur le ticket.

---

## Les règles, une par une

### La clé d'un epic

```
# EPIC BIL-01 — Titre de l'epic
```

- `BIL-01` est la **clé**. Deux à six lettres majuscules, un tiret, un à trois
  chiffres. C'est elle qui identifie l'epic d'une version du document à la
  suivante : ré-importer un document modifié met à jour les tickets existants
  au lieu d'en créer des doublons. **Ne la renumérotez jamais** pour la seule
  raison d'avoir déplacé une section.
- Le **niveau de titre est libre** : `#`, `##`, `####` — tous acceptés.
- Le séparateur peut être `—`, `–` ou `-`.

### La version — obligatoire pour le script

```
**Version :** 1.0
```

Les astérisques comptent ici : le script la cherche sous cette forme exacte, et
s'arrête s'il ne la trouve pas. Elle peut aussi se passer en second argument
(`import-referentiel.sh mon-lot.md 1.0`), mais l'écrire dans le document est
préférable — **le numéro qui fait foi est celui que le document déclare**, pas
celui qu'on retape en ligne de commande.

Incrémentez-la à chaque dépôt d'une version modifiée du même document. C'est
elle qui permet le rapprochement : inchangé, modifié, ajouté, retiré.

### Le projet — une fois, en tête

```
Projet : NolaHQ
```

La clé du projet (`HQ`) ou son nom (`NolaHQ`), sans distinction de casse.

**C'est la ligne qui relie le document au code.** Un projet porte ses dépôts
autorisés ; sans elle, les tickets naissent sans projet et « Start Work » n'a
aucun dépôt où ouvrir leur branche — il faut alors les rattacher un par un.

Elle ne l'emporte jamais sur ce qu'un humain a posé dans HQ : un ticket ou un
référentiel déjà rattaché garde son projet. Elle sert quand personne n'a rien
dit, ce qui est le cas d'un lot qu'on vient de déposer.

Un libellé qui ne désigne aucun projet actif — ou qui en désigne deux —
n'arrête pas l'import : les tickets entrent sans projet et le rapport le dit.

### Le côté — backend ou frontend

```
Côté : backend
```

Sous un epic, hérité par ses stories. Valeurs : `backend`, `frontend`,
`les deux`. Les abréviations courantes passent : `back`, `api`, `front`, `ui`,
`fullstack`.

Quand un epic mêle les deux, la story tranche pour elle-même avec une marque en
fin de ligne :

```
1. Générer la facture trois jours avant l'échéance.
2. En tant que gestionnaire, je veux voir les factures à venir. #frontend
```

**À quoi ça sert :** un projet qui porte un dépôt front et un dépôt back
obligeait à choisir à chaque « Start Work ». Le ticket dit `backend`, le dépôt
`nola-hq-backend` est marqué backend dans « Dépôts de code », il ne reste qu'un
candidat, et la branche s'ouvre sans question.

Facultatif, comme le reste. Sans lui, rien n'est restreint — on ne devine pas
un côté depuis un titre.

### La version cible — facultative

```
Version cible : 1.1.0
```

Le numéro d'une version déclarée dans **Versions** (le registre REL-00). Le
« v » est toléré : `v1.1.0` et `1.1.0` désignent la même chose.

Le nom que porte la version est toléré derrière un tiret cadratin détaché, et
ignoré : `Version cible : 1.11 — Contrôle et gouvernance avancée` vise `1.11`.
Un tiret collé appartient au numéro — `2026-09-05` reste entier, le registre
n'imposant pas le versionnage sémantique.

Ce qui dépasse 32 caractères n'est plus un numéro : le rapport le signale et
l'epic entre sans version, plutôt que de faire échouer l'analyse.

Elle descend sur les stories de l'epic — on ne livre pas la moitié d'un epic.
Une version déjà posée dans HQ l'emporte : replanifier est une décision, et un
ré-import ne la révise pas.

Un numéro que le registre ne connaît pas n'arrête pas l'import : les tickets
entrent sans version et le rapport le nomme. Créer la version au passage serait
pire — planifier une livraison n'est pas un effet de bord d'un import.

### La priorité

```
Priorité : P0
```

`P0` à `P3`. Facultative. Les astérisques du gras (`**Priorité : P0**`) sont
acceptées mais inutiles. La priorité de l'epic est héritée par ses stories.

### Le domaine — facultatif

```
Domaine : D08
```

ou `Domaine : 8`, c'est la même chose. Le code désigne un domaine du registre
(D01 à D12), pas une section du document — vous n'avez donc rien à déclarer
au-dessus.

**Omettez la ligne si vous ne savez pas.** Le ticket entre non classé, apparaît
dans la boîte de réception du backlog sous « Sans domaine », et se classe d'un
menu. Écrire un domaine faux coûte plus cher que n'en écrire aucun.

### Les stories

```
Stories :

1. En tant que gestionnaire, je veux voir les factures à venir.
2. En tant que client, je veux recevoir ma facture par courriel.
```

- L'amorce peut s'écrire `Stories :` ou `User stories :`.
- La liste peut être **numérotée** (`1.`) ou **à puces** (`-`, `*`).
- La clé d'une story est dérivée de son rang : `US-BIL-01-1`, `US-BIL-01-2`…
  **Insérer une story au milieu décale les clés des suivantes** et les fait
  passer pour des tickets modifiés. Ajoutez plutôt à la fin.
- La liste s'arrête au premier paragraphe de prose ou au titre suivant ; les
  lignes vides à l'intérieur ne l'interrompent pas.

### La prose

Tout ce qui suit le titre d'un epic et n'est ni la priorité, ni le domaine, ni
la liste de stories devient la **description du ticket** : critères
d'acceptation, notes, contraintes. Elle est reprise verbatim.

---

## Le format complet

Quand le document porte un référentiel entier, la hiérarchie se déclare :

```markdown
# Domaine 8 — Finance

### Capacité 8.2 — Facturation des abonnements

#### EPIC BIL-01 — Générer les factures avant l'échéance

**Priorité : P0**

User stories :

1. En tant que gestionnaire, je veux voir les factures à venir.
```

- `# Domaine N — Titre` — le numéro fait la clé (`D08`). `Domaine 8` et
  `Domaine 08` sont la même chose.
- `### Capacité N.M — Titre` — clé `D08.C02`. Son **propre numéro** dit à quel
  domaine elle appartient : une capacité 7.1 placée sous le domaine 1 est
  rattachée à D07, et l'anomalie est signalée.
- Un epic hérite alors de la capacité, ou à défaut du domaine, qui l'englobe.
  La ligne `Domaine :` reste possible et prend le pas.

---

## Déposer le document

```bash
HQ_KEY=REF-FACTURATION \
HQ_TITLE="Facturation par échéance" \
scripts/import-referentiel.sh docs/mon-lot.md
```

### ⚠️ La clé décide de tout

`HQ_KEY` identifie le **référentiel**, pas le fichier. Déposer un document sous
une clé existante en fait une **nouvelle version de ce référentiel-là** — et le
rapprochement marque alors « retiré » tout ce que la version précédente
déclarait et que celle-ci ne déclare plus.

Autrement dit : lancer le script sans `HQ_KEY` sur un lot de facturation le
déposerait comme une v2 de `REF-NOLAAHQ`, et **retirerait les 106 tickets du
référentiel v1.3**. Rien n'est détruit — le référentiel garde ses versions, et
les tickets acceptés sont « dépréciés » plutôt que supprimés — mais c'est une
soirée à défaire.

**Un lot de travail distinct veut sa propre clé.** Une seule règle à retenir.

Le dépôt se fait en deux temps : le document est d'abord **analysé** — vous
recevez le compte d'epics et de stories, et la liste des anomalies — puis
importé dans la boîte de réception du backlog, où chaque proposition
s'accepte ou se rejette.

Ré-importer une version modifiée du même document rapproche les clés :
inchangé, modifié, ajouté, retiré. Rien n'est écrasé en silence.

---

## Ce qui est refusé

| Cas | Ce qui se passe |
|---|---|
| Aucun `EPIC` reconnu | Erreur : le document est rejeté en entier. |
| Deux epics de même clé | Erreur : le second est ignoré, le rapprochement en dépend. |
| `Domaine : D99` (inexistant) | L'item est écarté à l'import, avec son motif. |
| `Stories :` sans liste | Avertissement : l'epic entre seul. |
| Epic sans domaine | **Rien** — c'est valide. Le ticket entre non classé. |
| `Côté : mobile` (inconnu) | Avertissement : le côté est ignoré, l'item entre. |
| `Projet :` inconnu ou ambigu | Les tickets entrent sans projet, le rapport dit pourquoi. |
| Deux lignes `Projet :` | Avertissement : la première est retenue. |
| `Version cible :` inconnue du registre | Les tickets entrent sans version, le rapport la nomme. |
| `Version cible :` qui n'est pas un numéro (plus de 32 caractères) | Avertissement : l'epic entre sans version. |

Une anomalie de niveau *avertissement* n'empêche pas l'import ; une *erreur*
l'arrête. Le rapport les nomme toutes, avec leur ligne.
