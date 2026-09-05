#!/usr/bin/env bash
#
# Dépose un référentiel d'exécution dans Nolaa HQ et en génère le backlog.
#
#   ./scripts/import-referentiel.sh <fichier.md> [version]
#
# Trois façons de s'authentifier, de la meilleure à la moins bonne :
#
#   HQ_TOKEN    jeton client_credentials émis par Nola Auth. Le script vise la
#               surface publique (/public/v1). C'est l'option pour tout ce qui
#               est automatisé : le service account porte ses propres scopes
#               (execution-reference:write, :parse, backlog:preview, :write) et
#               se révoque sans toucher au compte de personne.
#
#   HQ_SESSION  identifiant de session d'une console déjà ouverte, envoyé en
#               `Authorization: Bearer`. L'option pour un import ponctuel :
#               aucun mot de passe ne transite ni ne traîne dans un
#               historique de shell. Se récupère dans le navigateur, cookie
#               `nola_hq_session`, ou dans la réponse de /auth/login.
#
#   HQ_EMAIL    en dernier recours, quand il n'y a ni service account ni
#   HQ_PASSWORD session sous la main. Le script ouvre une session lui-même.
#
#   HQ_API      base de l'API, sans slash final
#               (défaut : https://dev.api.nolaastudio.com/api/v1)
#   HQ_KEY      clé stable du référentiel (défaut : REF-NOLAAHQ)
#
# Le script s'arrête avant d'écrire quoi que ce soit dans le backlog : il
# affiche la prévisualisation et demande confirmation. Un import touche des
# dizaines de tickets, ce n'est pas une commande qu'on lance distraitement.
#
# Prérequis côté plateforme : les migrations des lots 1.0 à 1.6 doivent être
# déployées. Sans elles les tables `domains`, `execution_references` et les
# routes /execution-references n'existent pas, et le script tombera sur un 404.

set -euo pipefail

FILE="${1:?usage: import-referentiel.sh <fichier.md> [version]}"
VERSION="${2:-}"
HQ_API="${HQ_API:-https://dev.api.nolaastudio.com/api/v1}"
HQ_KEY="${HQ_KEY:-REF-NOLAAHQ}"
COOKIES="$(mktemp)"
trap 'rm -f "$COOKIES"' EXIT

[[ -f "$FILE" ]] || { echo "Fichier introuvable : $FILE" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq requis" >&2; exit 1; }

# La version se lit dans le document lui-même quand elle n'est pas donnée :
# le numéro qui fait foi est celui que le document déclare, pas celui qu'on
# retape en ligne de commande.
if [[ -z "$VERSION" ]]; then
  VERSION="$(grep -m1 -oE '^\*\*Version :\*\*[[:space:]]*[0-9]+(\.[0-9]+)*' "$FILE" \
    | grep -oE '[0-9]+(\.[0-9]+)*' || true)"
  [[ -n "$VERSION" ]] || { echo "Version absente du document — passez-la en 2e argument." >&2; exit 1; }
  echo "Version lue dans le document : $VERSION"
fi

if [[ -n "${HQ_TOKEN:-}" ]]; then
  BASE="${HQ_API%/api/v1}/public/v1"
  AUTH=(-H "Authorization: Bearer $HQ_TOKEN")
  PREVIEW_PATH="backlog/preview"; APPLY_PATH="backlog/apply"
  echo "Surface publique : $BASE (service account)"
elif [[ -n "${HQ_SESSION:-}" ]]; then
  BASE="$HQ_API"
  AUTH=(-H "Authorization: Bearer $HQ_SESSION")
  PREVIEW_PATH="import?dryRun=true"; APPLY_PATH="import"
  echo "Surface interne : $BASE (session existante)"
else
  : "${HQ_EMAIL:?HQ_EMAIL requis (ou HQ_TOKEN pour la surface publique)}"
  : "${HQ_PASSWORD:?HQ_PASSWORD requis}"
  BASE="$HQ_API"
  AUTH=()
  PREVIEW_PATH="import?dryRun=true"; APPLY_PATH="import"
  echo "Surface interne : $BASE — ouverture de session pour $HQ_EMAIL"
  echo "  (HQ_SESSION évite d'avoir à passer un mot de passe — voir l'entête)"
  curl -sS -f -X POST "$HQ_API/auth/login" -H 'Content-Type: application/json' -c "$COOKIES" \
    -d "$(jq -n --arg e "$HQ_EMAIL" --arg p "$HQ_PASSWORD" '{email:$e,password:$p}')" >/dev/null
  AUTH=(-b "$COOKIES")
fi

api() { curl -sS -f "${AUTH[@]}" -H 'Content-Type: application/json' "$@"; }

# Deux générations de l'API nomment ces compteurs différemment : le lot 1.2
# disait `created`/`updated`, le lot 1.5 les a renommés en `added`/`modified`
# et a ajouté `deprecated`/`removed`. Un script qui ne connaît qu'un seul
# vocabulaire affiche « null » face à l'autre — ce qui ressemble à un import
# raté alors que rien n'a échoué. On accepte donc les deux, et une clé absente
# vaut zéro plutôt que rien.
counts() {
  jq -r --arg verbe "$1" '
    (.counts // .result.counts // {}) as $c
    | "\($verbe) \($c.added // $c.created // 0)"
      + " · à modifier \($c.modified // $c.updated // 0)"
      + " · inchangés \($c.unchanged // 0)"
      + " · dépréciés \($c.deprecated // 0)"
      + " · retirés \($c.removed // 0)"
      + " · conflits \($c.conflict // 0)"
      + " · ignorés \($c.skipped // 0)"'
}

# 1 — déposer. Une clé déjà connue reçoit une nouvelle version plutôt qu'un
#     second référentiel : l'original n'est jamais remplacé.
PAYLOAD="$(jq -n --arg k "$HQ_KEY" --arg v "$VERSION" --rawfile c "$FILE" \
  '{key:$k, title:"Référentiel d'"'"'évolution de Nolaa HQ", version:$v, format:"markdown", content:$c}')"

if api -o /dev/null "$BASE/execution-references/$HQ_KEY" 2>/dev/null; then
  echo "→ $HQ_KEY existe : dépôt de la version $VERSION"
  api -X POST "$BASE/execution-references/$HQ_KEY/versions" \
    -H "Idempotency-Key: $HQ_KEY-$VERSION" \
    -d "$(echo "$PAYLOAD" | jq '{version,format,content}')" | jq -r '"  version \(.version // .result.version) enregistrée"'
else
  echo "→ création de $HQ_KEY en version $VERSION"
  api -X POST "$BASE/execution-references" -H "Idempotency-Key: $HQ_KEY-$VERSION" -d "$PAYLOAD" \
    | jq -r '"  \(.key // .result.key) créé"'
fi

# 2 — analyser. Rien d'opérationnel n'est écrit à cette étape.
echo "→ analyse"
api -X POST "$BASE/execution-references/$HQ_KEY/versions/$VERSION/parse" \
  | jq -r '"  \(.counts.domain) domaines · \(.counts.capability) capacités · \(.counts.epic) epics · \(.counts.story) stories · \(.issues | length) anomalie(s)"'

# 3 — prévisualiser, puis demander.
echo "→ prévisualisation"
api -X POST "$BASE/execution-references/$HQ_KEY/versions/$VERSION/$PREVIEW_PATH" | counts "  à créer"

read -r -p "Appliquer ? [oui/non] " answer
[[ "$answer" == "oui" ]] || { echo "Abandonné — rien n'a été écrit dans le backlog."; exit 0; }

echo "→ import"
api -X POST "$BASE/execution-references/$HQ_KEY/versions/$VERSION/$APPLY_PATH" \
  -H "Idempotency-Key: $HQ_KEY-$VERSION-apply" | counts "  créés"

echo
echo "Terminé. Les epics et user stories sont rattachés à leur domaine et à leur"
echo "capacité, et portent la clé du document comme identifiant (GOV-01, US-ENG-08-3)."
echo
echo "Ils n'apparaissent PAS encore dans le Kanban : ils attendent en « triage »,"
echo "qui est une boîte de réception, pas une colonne. Ouvrez"
echo "Backlog → Boîte de réception pour les relire et les accepter par lot."
