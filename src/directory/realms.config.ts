/**
 * Mapping statique realm ↔ apps. La page Auth de la console listait
 * déjà cette segmentation en dur — on la centralise ici pour que
 * backend et front partagent la même source de vérité.
 *
 * Chaque realm Keycloak héberge les identités d'un ou plusieurs apps
 * de l'écosystème. Un tenant (une organisation cliente) est
 * matérialisé par un *group* Keycloak sous `/tenants/{tenantId}` dans
 * son realm.
 */
export interface RealmDef {
  id: string;
  label: string;
  apps: string[];
  description: string;
}

export const REALMS: RealmDef[] = [
  {
    id: 'realm-edu',
    label: 'Realm éducation',
    apps: ['kelasi'],
    description: 'Écoles, profs et élèves (Kelasi)',
  },
  {
    id: 'realm-rh',
    label: 'Realm RH',
    apps: ['mycv'],
    description: 'Recruteurs et candidats (MyCVMatcher)',
  },
  {
    id: 'realm-sme',
    label: 'Realm PME',
    apps: ['stock', 'vente'],
    description: 'PME et commerçants (Nola Stock, Vente)',
  },
  {
    id: 'realm-internal',
    label: 'Realm interne',
    apps: ['nola-hq'],
    description: 'Équipe Nola Studio (console HQ)',
  },
];

export function realmForApp(appId: string): RealmDef | undefined {
  return REALMS.find((r) => r.apps.includes(appId));
}

export function realmById(id: string): RealmDef | undefined {
  return REALMS.find((r) => r.id === id);
}
