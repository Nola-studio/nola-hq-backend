/**
 * Shape compatible avec `NolaJwtPayload` de `@kelasi/nola-sdk`. Le backend HQ
 * ne passe pas par Keycloak (les utilisateurs sont l'équipe Nola Studio
 * elle-même), mais on émet la même forme pour rester homogène avec le reste
 * de la plateforme — un service Nola qui parle au HQ peut consommer ces
 * claims sans branchement spécifique.
 */
export interface NolaJwtPayload {
  sub: string;
  realm: string;
  tenant_id: string;
  email?: string;
  name?: string;
  roles: string[];
  apps_actives: string[];
  modules_actifs: string[];
  plan: string;
  /** Présent en cas d'impersonation (RFC 8693, claim `act`). */
  impersonator?: { sub: string; email?: string };
}
