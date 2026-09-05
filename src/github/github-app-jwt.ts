import { createSign } from 'node:crypto';

/**
 * Le jeton que Nolaa HQ présente à GitHub pour dire « je suis cette App ».
 *
 * C'est un JWT RS256 signé avec la clé privée de l'App. Il ne donne accès à
 * aucun dépôt : il sert uniquement à demander un jeton d'installation, qui
 * lui est limité aux dépôts où l'App est installée. Deux niveaux, et c'est
 * volontaire — un secret compromis au premier niveau ne lit toujours rien.
 *
 * Écrit avec `node:crypto` plutôt qu'une bibliothèque : trois champs, un
 * algorithme, une signature. Une dépendance de plus pour ça se paierait en
 * mises à jour de sécurité sans rien simplifier.
 */

/**
 * GitHub refuse un JWT de plus de dix minutes. On vise neuf : la marge
 * absorbe le temps de vol sans jamais s'approcher du refus.
 */
export const APP_JWT_TTL_SECONDS = 9 * 60;

/**
 * GitHub refuse aussi un `iat` dans le futur, et les horloges dérivent. Reculer
 * la date d'émission d'une minute est la parade que GitHub documente
 * lui-même.
 */
export const APP_JWT_CLOCK_SKEW_SECONDS = 60;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface AppJwt {
  token: string;
  /** Epoch en secondes — ce que le cache lit pour savoir quand renouveler. */
  expiresAt: number;
}

export function buildAppJwt(appId: string, privateKeyPem: string, now = Date.now()): AppJwt {
  const issuedAt = Math.floor(now / 1000) - APP_JWT_CLOCK_SKEW_SECONDS;
  const expiresAt = issuedAt + APP_JWT_TTL_SECONDS;

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iat: issuedAt, exp: expiresAt, iss: appId }));
  const signingInput = `${header}.${payload}`;

  const signature = base64url(createSign('RSA-SHA256').update(signingInput).sign(privateKeyPem));

  return { token: `${signingInput}.${signature}`, expiresAt };
}

/**
 * Remet une clé privée dans la forme que `crypto` accepte.
 *
 * Une clé PEM voyage mal dans une variable d'environnement : selon la
 * plateforme elle arrive avec de vraies sauts de ligne, avec des `\n`
 * littéraux, ou encodée en base64 pour éviter la question. Les trois sont des
 * façons raisonnables de s'y prendre, et échouer sur la mauvaise donne une
 * erreur de signature illisible plutôt qu'un « votre clé est mal collée ».
 */
export function normalisePrivateKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Clé privée vide.');

  // Base64 : ni en-tête PEM, ni saut de ligne.
  if (!trimmed.includes('-----BEGIN')) {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    if (!decoded.includes('-----BEGIN')) {
      throw new Error(
        'Clé privée illisible : attendu un PEM (-----BEGIN …) ou ce même PEM encodé en base64.',
      );
    }
    return decoded.trim();
  }

  // `\n` littéraux — le cas des variables d'environnement sur une seule ligne.
  // Re-trim ensuite : un `\n` final devient un vrai saut de ligne, et deux
  // clés identiques ne doivent pas différer par lui.
  return trimmed.includes('\\n') ? trimmed.replace(/\\n/g, '\n').trim() : trimmed;
}
