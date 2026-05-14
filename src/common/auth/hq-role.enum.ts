/**
 * Internal Nola Studio team roles, namespaced under the `hq:` prefix so
 * they don't collide with the realm/tenant roles that other apps push
 * into the same JWT (e.g. `school_admin`, `teacher`, …).
 *
 * Hierarchy is strictly nested: every owner is implicitly an operator
 * and every operator is implicitly a viewer. The `HqRolesGuard`
 * enforces this — declaring `@HqRoles(HqRole.Operator)` lets owners
 * through too.
 *
 * Set in Keycloak realm "nola-hq" as composite realm roles, assigned
 * to each team member. The JwtAuthGuard already lifts them onto
 * `req.user.roles[]`.
 */
export enum HqRole {
  Owner = 'hq:owner',
  Operator = 'hq:operator',
  Viewer = 'hq:viewer',
}

/** Ordered weakest → strongest. */
const HQ_ROLE_ORDER: HqRole[] = [HqRole.Viewer, HqRole.Operator, HqRole.Owner];

/**
 * Returns true when `userRoles` satisfies the *minimum* required role
 * (nested check, not exact). A user holding `hq:owner` passes a
 * `hq:operator` requirement.
 *
 * Falls back to `false` if the user has none of the HQ roles — even an
 * authenticated user without any `hq:*` role is treated as unauthorised
 * to mutate the platform.
 */
export function hasHqRole(userRoles: string[], required: HqRole): boolean {
  const requiredWeight = HQ_ROLE_ORDER.indexOf(required);
  if (requiredWeight < 0) return false;
  let highest = -1;
  for (const r of userRoles) {
    const idx = HQ_ROLE_ORDER.indexOf(r as HqRole);
    if (idx > highest) highest = idx;
  }
  return highest >= requiredWeight;
}
