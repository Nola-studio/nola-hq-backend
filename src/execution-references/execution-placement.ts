import type { ExecutionManifestItem } from './execution-manifest.entity';
import type { Capability, Domain } from '../domains/domain.entity';

/**
 * Où un item du manifest se range dans le référentiel — domaine et capacité.
 *
 * Module pur, comme `execution-reference.parser` : la règle intéressante est
 * la remontée des parents, et elle doit s'éprouver sans base ni Nest.
 */

export type Placement =
  | { ok: true; domainId: string | null; capabilityId: string | null }
  | { ok: false; reason: string };

/**
 * Finds the domain and capability an item belongs to, by walking up its
 * declared parents. An epic hangs off a capability, a story off its epic, so a
 * story inherits the placement its epic resolved to.
 *
 * Ne rien trouver n'est pas une erreur. Un document qui ne déclare que des
 * epics et leurs stories — le cas courant quand on écrit un lot de travail
 * plutôt qu'un référentiel entier — n'a aucune hiérarchie à remonter : ses
 * items entrent non classés, et se classent dans HQ, où le domaine se choisit
 * sur le ticket. Les écarter les ferait disparaître en silence pour une
 * information que le rédacteur n'avait pas à donner.
 *
 * Ce qui reste une erreur, c'est un rattachement qui ment : un parent déclaré
 * qui n'existe ni dans le registre ni dans le document (« Domaine : D99 »,
 * une clé mal orthographiée) ou un cycle. Là, le document dit quelque chose
 * de faux, et l'import doit le dire plutôt que de le corriger tout seul.
 */
export function resolvePlacement(
  item: ExecutionManifestItem,
  byKey: Map<string, ExecutionManifestItem>,
  domainByCode: Map<string, Domain>,
  capabilityByCode: Map<string, Capability>,
): Placement {
  let cursor: ExecutionManifestItem | undefined = item;
  const seen = new Set<string>();

  while (cursor?.parentKey) {
    if (seen.has(cursor.sourceKey)) {
      return { ok: false, reason: `Cycle de rattachement autour de « ${cursor.sourceKey} ».` };
    }
    seen.add(cursor.sourceKey);

    const parentKey = cursor.parentKey;
    const capability = capabilityByCode.get(parentKey);
    if (capability) {
      return { ok: true, domainId: capability.domainId, capabilityId: capability.id };
    }
    const domain = domainByCode.get(parentKey);
    if (domain) {
      return { ok: true, domainId: domain.id, capabilityId: null };
    }

    const parent: ExecutionManifestItem | undefined = byKey.get(parentKey);
    if (!parent) {
      return {
        ok: false,
        reason: `« ${parentKey} » n'existe ni dans le registre des domaines ni dans le manifest.`,
      };
    }
    cursor = parent;
  }

  // Aucun parent déclaré : non classé, pas rejeté.
  return { ok: true, domainId: null, capabilityId: null };
}
