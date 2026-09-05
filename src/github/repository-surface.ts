import type { WorkItemSurface } from '../work-items/work-item.entity';
import type { CodeRepository } from './repository.entity';

/**
 * Restreint les dépôts autorisés d'un ticket à ceux de son côté.
 *
 * C'est la seule chose qui manquait pour que « Start Work » cesse de poser une
 * question : un projet autorise le front et le back, le ticket dit
 * « backend », il ne reste qu'un dépôt et la branche s'ouvre là.
 *
 * Trois garde-fous, tous dans le même sens — ne jamais rendre moins que ce
 * qu'on rendait avant :
 *
 *  - Un ticket sans côté ne restreint rien. On ne devine pas un côté depuis un
 *    titre, et le silence du rédacteur n'est pas une consigne.
 *  - Tant qu'aucun dépôt n'est classé, la fonctionnalité n'est pas configurée :
 *    restreindre reviendrait à cacher des dépôts sur la foi d'une information
 *    que personne n'a donnée.
 *  - Si le filtre ne laisse rien, on rend tout. Un ticket backend dans un
 *    projet qui n'a que du front est probablement mal classé — mais bloquer la
 *    création de branche pour le dire serait une punition, pas un message.
 *
 * `fullstack` traverse : un monorepo convient à n'importe quel ticket, et un
 * ticket qui touche les deux côtés convient à n'importe quel dépôt.
 */
export function narrowBySurface<T extends Pick<CodeRepository, 'side'>>(
  candidates: T[],
  surface: WorkItemSurface | null,
): T[] {
  if (!surface || surface === 'fullstack') return candidates;
  if (!candidates.some((r) => r.side)) return candidates;

  const matching = candidates.filter((r) => r.side === surface || r.side === 'fullstack');
  return matching.length > 0 ? matching : candidates;
}
