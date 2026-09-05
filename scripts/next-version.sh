#!/usr/bin/env bash
#
# Calcule la prochaine version à partir des commits depuis la dernière
# étiquette, selon la convention des messages de commit.
#
#   scripts/next-version.sh [depuis]
#
# La règle, dans l'ordre où elle s'applique :
#
#   BREAKING CHANGE, ou un `!` avant les deux-points  → majeure
#   feat:                                             → mineure
#   tout le reste                                     → correctif
#
# Rien n'est écrit ici : le script imprime un numéro, et l'appelant en fait ce
# qu'il veut. C'est ce qui le rend testable sans dépôt de démonstration.
#
# Sans étiquette précédente, on part de la version du package.json — ce qui
# donne 1.0.0 la première fois, et jamais 0.0.1.

set -euo pipefail

SINCE="${1:-}"
if [[ -z "$SINCE" ]]; then
  SINCE="$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)"
fi

CURRENT="$(node -p "require('./package.json').version" 2>/dev/null || echo '0.0.0')"
if [[ -n "$SINCE" ]]; then
  CURRENT="${SINCE#v}"
  RANGE="$SINCE..HEAD"
else
  RANGE="HEAD"
fi

IFS='.' read -r MAJOR MINOR PATCH <<<"$CURRENT"
MAJOR="${MAJOR:-0}"; MINOR="${MINOR:-0}"; PATCH="${PATCH:-0}"

MESSAGES="$(git log --format='%s%n%b' "$RANGE" 2>/dev/null || true)"

# Aucun commit depuis l'étiquette : rien à livrer, on rend la version courante.
if [[ -z "${MESSAGES//[[:space:]]/}" ]]; then
  echo "$MAJOR.$MINOR.$PATCH"
  exit 0
fi

if grep -qE '^BREAKING[ -]CHANGE' <<<"$MESSAGES" \
  || grep -qE '^[a-z]+(\([^)]*\))?!:' <<<"$MESSAGES"; then
  echo "$((MAJOR + 1)).0.0"
elif grep -qE '^feat(\([^)]*\))?:' <<<"$MESSAGES"; then
  echo "$MAJOR.$((MINOR + 1)).0"
else
  echo "$MAJOR.$MINOR.$((PATCH + 1))"
fi
