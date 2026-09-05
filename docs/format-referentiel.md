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

Auteur : Greg · septembre 2026

# EPIC BIL-01 — Générer les factures d'abonnement avant l'échéance

Priorité : P0
Domaine : D08

Chaque abonnement doit produire sa facture trois jours avant le
renouvellement, et l'envoyer au contact de facturation du tenant.

Stories :

1. En tant que gestionnaire, je veux voir les factures à venir des sept prochains jours.
2. En tant que client, je veux recevoir ma facture par courriel avant le prélèvement.
3. En tant que gestionnaire, je veux relancer une génération qui a échoué.

# EPIC BIL-02 — Annuler une facture émise par erreur

Priorité : P1

Stories :

- En tant que gestionnaire, je veux annuler une facture en donnant un motif.
- En tant qu'auditeur, je veux retrouver qui a annulé quoi et quand.
```

Ce document produit **2 epics et 5 stories**. `BIL-01` est classé en D08,
`BIL-02` reste non classé — et c'est valide : il se classera dans HQ, sur le
ticket, où le domaine et le projet se choisissent.

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
scripts/import-referentiel.sh chemin/vers/mon-lot.md
```

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

Une anomalie de niveau *avertissement* n'empêche pas l'import ; une *erreur*
l'arrête. Le rapport les nomme toutes, avec leur ligne.
