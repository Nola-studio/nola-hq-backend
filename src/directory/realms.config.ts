/**
 * Mapping statique realm Keycloak ↔ apps Nola.
 *
 * Source de vérité : les realms réellement présents dans l'instance
 * Keycloak `keycloak-dev-3f61.up.railway.app` (constatés via l'API
 * admin). Les apps déclarées ici correspondent aux `AppId` connus
 * côté front (`kelasi`, `mycv`, `stock`, `vente`, `nola-hq`).
 *
 * Rename Kelasi → Yekoli : le realm Keycloak est passé à `yekoli`
 * (Phase 4) et l'app id l'a suivi (Phase 8, 2026-08-09) — realm et
 * app portent donc le même nom.
 *
 * Convention tenants : chaque tenant = un *group* Keycloak sous
 * `/tenants/{tenantId}` dans son realm.
 */
export interface RealmDef {
  id: string;
  label: string;
  apps: string[];
  description: string;
}

export const REALMS: RealmDef[] = [
  {
    id: 'yekoli',
    label: 'Yekoli',
    apps: ['yekoli'],
    description: 'Écoles, profs et élèves (Yekoli)',
  },
  {
    id: 'mycvmatcher',
    label: 'MyCVMatcher',
    apps: ['mycv'],
    description: 'Recruteurs et candidats (MyCVMatcher)',
  },
  {
    id: 'vantelisit',
    label: 'Vantelis IT',
    apps: ['vantelisit'],
    description: 'Services TI gérés au Québec (Vantelis IT)',
  },
  {
    id: 'nola-hq',
    label: 'Nola HQ',
    apps: ['nola-hq'],
    description: 'Console interne Nola Studio',
  },
  {
    id: 'nola-staff',
    label: 'Nola Staff',
    apps: ['nola-hq'],
    description: 'Équipes terrain Nola (support, ops)',
  },
];

export function realmForApp(appId: string): RealmDef | undefined {
  return REALMS.find((r) => r.apps.includes(appId));
}

export function realmById(id: string): RealmDef | undefined {
  return REALMS.find((r) => r.id === id);
}
