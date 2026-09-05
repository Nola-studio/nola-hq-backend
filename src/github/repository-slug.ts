/**
 * Lire un dépôt sous la forme que les gens ont sous la main.
 *
 * Personne ne retape `owner` et `name` dans deux champs : on copie l'URL de
 * la barre d'adresse, ou celle du bouton « Clone ». Accepter ces formes-là
 * évite une saisie fautive par dépôt enregistré, et les règles de nommage de
 * GitHub sont assez strictes pour qu'on puisse les vérifier avant tout appel
 * réseau.
 */

/** 1 à 39 caractères alphanumériques ou tirets, sans tiret en bordure. */
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

/** Jusqu'à 100 caractères ; `.` et `..` seuls sont refusés par GitHub. */
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

export interface RepositoryRef {
  owner: string;
  name: string;
}

export class InvalidRepositoryRef extends Error {}

/**
 * Accepte `owner/name`, une URL HTTPS, une URL SSH (`git@github.com:o/n.git`)
 * et le suffixe `.git` sous toutes ces formes.
 *
 * Ne devine rien : ce qui n'entre pas dans une de ces formes est refusé avec
 * son motif, plutôt que tronqué jusqu'à ressembler à quelque chose.
 */
export function parseRepositoryRef(input: string): RepositoryRef {
  const raw = input.trim();
  if (!raw) throw new InvalidRepositoryRef('Dépôt vide.');

  let path = raw;

  // git@github.com:owner/name.git
  const ssh = /^[^@\s]+@[^:\s]+:(.+)$/.exec(path);
  if (ssh) path = ssh[1];

  // https://github.com/owner/name — on ne garde que le chemin, et on ignore
  // ce qui suit (`/tree/main`, une ancre, une query).
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
    let url: URL;
    try {
      url = new URL(path);
    } catch {
      throw new InvalidRepositoryRef(`« ${raw} » n'est pas une URL exploitable.`);
    }
    path = url.pathname;
  }

  path = path.replace(/^\/+/, '').replace(/\/+$/, '');
  if (path.toLowerCase().endsWith('.git')) path = path.slice(0, -4);

  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new InvalidRepositoryRef(`« ${raw} » n'indique pas de propriétaire — attendu « owner/name ».`);
  }

  const [owner, name] = parts;
  if (!OWNER.test(owner)) throw new InvalidRepositoryRef(`Propriétaire « ${owner} » invalide.`);
  if (!NAME.test(name) || name === '.' || name === '..') {
    throw new InvalidRepositoryRef(`Nom de dépôt « ${name} » invalide.`);
  }

  return { owner, name };
}

/** La forme canonique, celle qu'on affiche et qu'on met en clé. */
export function repositorySlug(ref: RepositoryRef): string {
  return `${ref.owner}/${ref.name}`;
}

/**
 * GitHub ne distingue pas la casse pour retrouver un dépôt, mais la conserve
 * pour l'afficher. On compare donc en minuscules et on stocke tel quel — deux
 * enregistrements ne doivent pas cohabiter parce que l'un dit `Nola-studio`
 * et l'autre `nola-studio`.
 */
export function sameRepository(a: RepositoryRef, b: RepositoryRef): boolean {
  return (
    a.owner.toLowerCase() === b.owner.toLowerCase() && a.name.toLowerCase() === b.name.toLowerCase()
  );
}
