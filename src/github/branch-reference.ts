import { BRANCH_PREFIXES } from './branch-name';

/**
 * Retrouver le ticket depuis le nom d'une branche.
 *
 * C'est l'inverse de `branchNameFor`, et c'est ce qui donne son sens à la
 * convention : une branche poussée depuis un terminal doit pouvoir rejoindre
 * son ticket sans que personne ne les relie à la main.
 *
 * On ne devine pas la clé — on propose des candidats et on laisse la base
 * trancher. `feature/US-GOV-01-1-consulter-la-structure` pourrait désigner
 * `US-GOV-01-1`, `US-GOV-01`, `US-GOV` ou `US` : seule la table des tickets
 * sait lequel existe. Les candidats sortent donc du plus long au plus court,
 * pour qu'une user story l'emporte sur son epic.
 */

const PREFIX_PATTERN = new RegExp(`^(?:${BRANCH_PREFIXES.join('|')})/`, 'i');

/** `refs/heads/feature/GOV-01-x` et `feature/GOV-01-x` désignent la même branche. */
export function stripRefsHeads(ref: string): string {
  return ref.replace(/^refs\/heads\//, '');
}

/**
 * Les clés que ce nom de branche pourrait porter, de la plus longue à la
 * plus courte.
 *
 * Une clé de ticket se termine par un nombre (`GOV-01`, `US-GOV-01-1`), et
 * c'est ce qui permet de la séparer du slug qui suit : on coupe après chaque
 * groupe de chiffres, et on rend chaque préfixe ainsi obtenu.
 */
export function referenceCandidatesFrom(branchName: string): string[] {
  const withoutRef = stripRefsHeads(branchName.trim());
  const body = withoutRef.replace(PREFIX_PATTERN, '');
  if (!body) return [];

  const candidates: string[] = [];
  const pattern = /\d+/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(body)) !== null) {
    const candidate = body.slice(0, match.index + match[0].length);
    // Une clé est faite de lettres, de chiffres et de tirets — rien d'autre.
    if (/^[A-Za-z0-9-]+$/.test(candidate)) candidates.push(candidate);
  }

  // Du plus long au plus court : `US-GOV-01-1` avant `US-GOV-01`, pour qu'une
  // user story ne soit pas rattachée à l'epic dont elle porte la clé.
  return candidates.reverse();
}

/**
 * Le premier candidat qui existe réellement.
 *
 * `known` est une recherche, pas une liste : la table des tickets peut être
 * grande, et on ne la charge pas pour reconnaître une branche.
 */
export async function matchReference(
  branchName: string,
  known: (reference: string) => Promise<boolean>,
): Promise<string | null> {
  for (const candidate of referenceCandidatesFrom(branchName)) {
    if (await known(candidate)) return candidate;
  }
  return null;
}
