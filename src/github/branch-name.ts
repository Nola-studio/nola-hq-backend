import type { WorkItemType } from '../work-items/work-item.entity';

/**
 * Le nom de branche qu'un ticket mérite (ENG-08).
 *
 * La convention du référentiel : `feature/{WORK_ITEM_KEY}-{slug}`. Sa raison
 * d'être est qu'on retrouve le ticket depuis la branche — dans `git branch`,
 * dans une PR, dans six mois. Tout le reste du module en découle : la clé est
 * intouchable, le slug est du confort, et c'est le slug qu'on rogne quand il
 * faut rogner.
 *
 * Pur et sans réseau : ce qui fait échouer `git` tient dans des règles de
 * caractères, et les éprouver ne demande pas GitHub.
 */

/**
 * Le préfixe se déduit du type. `hotfix` n'y figure pas : il ne se déduit de
 * rien — c'est une décision qu'on prend dans l'urgence, et le référentiel la
 * range à part. Elle passe par une surcharge explicite.
 */
const PREFIX_BY_TYPE: Record<WorkItemType, string> = {
  feature: 'feature',
  story: 'feature',
  bug: 'fix',
  spike: 'spike',
  task: 'chore',
  ops: 'chore',
  debt: 'chore',
  // Un epic ne se code pas ; `startWork` le refuse avant d'arriver ici. Cette
  // entrée n'existe que pour que le type reste exhaustif.
  epic: 'feature',
};

export const BRANCH_PREFIXES = ['feature', 'fix', 'hotfix', 'chore', 'spike'] as const;
export type BranchPrefix = (typeof BRANCH_PREFIXES)[number];

/**
 * Git accepte des noms très longs, les humains non — et certains outils
 * tronquent à cent caractères. On vise plus court que la limite plutôt que de
 * la frôler.
 */
export const MAX_BRANCH_LENGTH = 80;

export function prefixFor(type: WorkItemType): BranchPrefix {
  return (PREFIX_BY_TYPE[type] ?? 'chore') as BranchPrefix;
}

/** Les diacritiques combinants, une fois le texte décomposé par NFD. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * L'amorce d'une user story, qui ne dit rien de ce dont il s'agit.
 *
 * « En tant que dirigeant, je veux consulter la structure du groupe » : les
 * cinq premiers mots sont une convention d'écriture, pas le sujet. Les garder
 * donne `en-tant-que-dirigeant-je-veux-consulter-la-struc`, où le rôle mange
 * la place du besoin. Les retirer donne `consulter-la-structure-du-groupe`.
 *
 * Les quatorze user stories du référentiel v1.3 suivent toutes cette forme.
 */
const USER_STORY_PREAMBLE =
  /^(?:en tant qu(?:e|['\u2019])\s*[^,]{0,60},?\s*)?(?:je (?:veux|souhaite|voudrais)\s+)/i;

/**
 * Le slug reste court volontairement.
 *
 * C'est la clé qui identifie le ticket ; le slug n'est qu'un rappel pour
 * l'œil. Quarante caractères en disent autant que soixante et tiennent dans
 * une ligne de terminal.
 */
const MAX_SLUG_LENGTH = 40;

/**
 * Un titre en segment de branche lisible.
 *
 * Les accents sont dépliés plutôt que supprimés — « déployé » donne
 * `deploye`, pas `dploy`. Tout le reste devient un tiret, et les tirets se
 * regroupent : `git` accepte `a--b`, un lecteur non.
 */
export function slugifyTitle(title: string): string {
  const slug = title
    .trim()
    .replace(USER_STORY_PREAMBLE, '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length <= MAX_SLUG_LENGTH) return slug;

  /**
   * Couper au dernier tiret plutôt qu'au caractère près : `…-du-group` se
   * lit comme une faute de frappe, `…-du` se lit comme une coupure. On ne
   * remonte que si un mot entier subsiste — sinon la coupure franche vaut
   * mieux qu'un slug vide.
   */
  const cut = slug.slice(0, MAX_SLUG_LENGTH);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > MAX_SLUG_LENGTH / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '');
}

export interface BranchNameInput {
  type: WorkItemType;
  /** La clé stable du ticket — `GOV-01`, `US-ENG-08-1`. Jamais rognée. */
  reference: string;
  title: string;
  /** Force le préfixe — le seul chemin vers `hotfix`. */
  prefix?: BranchPrefix;
}

/**
 * Compose le nom.
 *
 * Ordre des priorités quand la place manque : le préfixe et la clé passent
 * toujours, le slug est rogné, et il disparaît entièrement plutôt que de
 * pousser le nom au-delà de la limite. `feature/GOV-01` sans slug reste
 * retrouvable ; une branche tronquée au milieu de sa clé ne l'est plus.
 */
export function branchNameFor(input: BranchNameInput): string {
  const prefix = input.prefix ?? prefixFor(input.type);
  const key = sanitiseSegment(input.reference);
  if (!key) throw new Error('Un ticket sans clé stable ne peut pas nommer une branche.');

  const head = `${prefix}/${key}`;
  const slug = slugifyTitle(input.title);
  if (!slug) return head;

  const room = MAX_BRANCH_LENGTH - head.length - 1;
  if (room <= 1) return head;

  return `${head}-${slug.slice(0, room).replace(/-+$/, '')}`;
}

/**
 * Ce que `git check-ref-format` refuse, appliqué à un segment.
 *
 * Une clé de ticket vient de nous, mais elle vient aussi d'un référentiel
 * écrit à la main — et une clé produisant un nom invalide donnerait un 422 de
 * GitHub illisible plutôt qu'une erreur qu'on comprend.
 */
function sanitiseSegment(raw: string): string {
  return raw
    .trim()
    .replace(/[\s~^:?*[\]\\]+/g, '-')
    .replace(/\.\.+/g, '-')
    .replace(/\/+/g, '-')
    .replace(/\.lock$/i, '')
    .replace(/^[.\-]+|[.\-]+$/g, '');
}

/** Caractères de contrôle et DEL, que `git check-ref-format` refuse. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Vérifie un nom saisi à la main, pour la liaison d'une branche existante.
 *
 * On ne réécrit pas ce que quelqu'un a tapé : soit le nom est valide, soit on
 * dit pourquoi.
 */
export function validateBranchName(name: string): { ok: true } | { ok: false; reason: string } {
  if (!name || name !== name.trim()) return { ok: false, reason: 'Nom vide ou entouré d’espaces.' };
  if (name.length > 255) return { ok: false, reason: 'Nom trop long (255 caractères maximum).' };
  if (/[\s~^:?*[\]\\]/.test(name)) {
    return { ok: false, reason: 'Caractères interdits par git : espace, ~ ^ : ? * [ ] \\' };
  }
  if (name.includes('..')) return { ok: false, reason: '« .. » est interdit dans un nom de branche.' };
  if (name.includes('//')) return { ok: false, reason: 'Deux barres obliques consécutives.' };
  if (name.startsWith('/') || name.endsWith('/')) return { ok: false, reason: 'Barre oblique en bordure.' };
  if (name.endsWith('.')) return { ok: false, reason: 'Un nom de branche ne peut pas finir par un point.' };
  if (name.endsWith('.lock')) return { ok: false, reason: '« .lock » est réservé par git.' };
  if (name === '@') return { ok: false, reason: '« @ » seul est réservé par git.' };
  if (name.split('/').some((segment) => segment.startsWith('.') || segment === '')) {
    return { ok: false, reason: 'Un segment vide ou commençant par un point.' };
  }
  if (CONTROL_CHARS.test(name)) return { ok: false, reason: 'Caractères de contrôle.' };
  return { ok: true };
}
