import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Vérifie qu'une livraison vient bien de GitHub.
 *
 * L'URL du webhook est publique : n'importe qui peut y poster. La signature
 * est la seule chose qui distingue GitHub d'un inconnu, et tout ce que HQ
 * fera de la charge utile en dépend.
 *
 * Trois points sur lesquels une implémentation naïve se trompe, et qui sont
 * la raison d'être de ce module :
 *
 *  - **Le corps brut, pas le JSON reparsé.** GitHub signe les octets qu'il a
 *    envoyés. Re-sérialiser l'objet analysé change l'ordre des clés et
 *    l'échappement : la signature ne correspond plus, ou pire, correspond
 *    pour un contenu qui n'est pas celui reçu.
 *  - **Une comparaison à temps constant.** `===` s'arrête au premier octet
 *    différent ; la durée de la réponse révèle alors combien d'octets étaient
 *    justes, et un attaquant devine la signature octet par octet.
 *  - **Fermer en cas d'absence.** Pas de secret configuré ne veut pas dire
 *    « accepter tout le monde ».
 */

export type SignatureVerdict =
  | { ok: true }
  | { ok: false; reason: 'missing-secret' | 'missing-signature' | 'malformed-signature' | 'mismatch' };

/** GitHub n'émet plus que du SHA-256 ; `sha1` existe encore et ne vaut rien. */
const PREFIX = 'sha256=';

export function verifyGithubSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string | undefined,
): SignatureVerdict {
  if (!secret) return { ok: false, reason: 'missing-secret' };
  if (!signatureHeader) return { ok: false, reason: 'missing-signature' };
  if (!signatureHeader.startsWith(PREFIX)) return { ok: false, reason: 'malformed-signature' };

  const received = signatureHeader.slice(PREFIX.length);
  // 64 caractères hexadécimaux, sinon `Buffer.from(…, 'hex')` tronque
  // silencieusement et une signature tronquée se comparerait à une expected
  // tronquée de la même façon.
  if (!/^[0-9a-f]{64}$/i.test(received)) return { ok: false, reason: 'malformed-signature' };

  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const provided = Buffer.from(received, 'hex');

  // Les deux font 32 octets ici, mais `timingSafeEqual` lève sur des
  // longueurs différentes — et une exception est aussi un canal temporel.
  if (expected.length !== provided.length) return { ok: false, reason: 'mismatch' };

  return timingSafeEqual(expected, provided) ? { ok: true } : { ok: false, reason: 'mismatch' };
}

/** Ce qu'on répond à qui n'a pas prouvé son identité — jamais plus précis. */
export const SIGNATURE_REJECTION_MESSAGES: Record<
  Exclude<SignatureVerdict, { ok: true }>['reason'],
  string
> = {
  'missing-secret': "Les webhooks GitHub ne sont pas configurés sur ce backend.",
  'missing-signature': 'Signature absente.',
  'malformed-signature': 'Signature absente.',
  mismatch: 'Signature absente.',
};
