/**
 * Scopes of the public machine-to-machine API (§5.7 of the referential).
 *
 * They travel as realm roles on the client-credentials token, not as a claim
 * HQ invents: the service account is declared in Nola Auth, its roles are
 * granted there, and HQ only verifies and authorises. That is what the D3
 * frontier asks — « Nolaa HQ ne doit pas recréer les mots de passe, sessions
 * ou mécanismes d'authentification de Nola Auth » — and it means revoking an
 * integration is done in one place, not two.
 */
export const API_SCOPES = [
  'execution-reference:read',
  'execution-reference:write',
  'execution-reference:parse',
  'execution-reference:validate',
  'backlog:preview',
  'backlog:write',
  'backlog:sync',
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/**
 * Whether a token's roles satisfy every required scope.
 *
 * Conjunctive and exact — no hierarchy, no wildcard. A route asking for
 * `backlog:write` is not satisfied by `backlog:preview`, because previewing
 * and writing are precisely what EXE-05 keeps apart.
 */
export function hasScopes(granted: readonly string[], required: readonly ApiScope[]): boolean {
  const held = new Set(granted);
  return required.every((scope) => held.has(scope));
}
