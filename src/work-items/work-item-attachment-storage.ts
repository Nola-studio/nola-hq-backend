import { mkdir, readFile, rm, unlink, writeFile } from 'fs/promises';
import { join } from 'path';

/** Same `DB_PATH`-style env-var fallback as `data-source.ts` — a Railway volume mounts here in prod. */
export function attachmentsDir(): string {
  return process.env.ATTACHMENTS_DIR ?? './data/attachments';
}

/**
 * Boot-time check: `mkdir(..., { recursive: true })` never throws for a
 * missing-but-creatable path, so a bad `ATTACHMENTS_DIR` (wrong mount,
 * read-only fs) would otherwise go unnoticed until a user's upload 500s.
 * Writes and removes a marker file to prove the directory is actually
 * writable, not just resolvable.
 */
export async function assertAttachmentsDirWritable(): Promise<void> {
  const dir = attachmentsDir();
  const marker = join(dir, '.write-check');
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(marker, 'ok');
    await rm(marker, { force: true });
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[nola-hq] ATTACHMENTS_DIR ("${dir}") is not writable: ${cause}`,
    );
  }
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TICKET = 5;

/** Allow-list, not a block-list — anything not named here is rejected. */
export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

/**
 * The on-disk name is always the attachment's own DB id — never derived
 * from the client-supplied filename — so there is no path-traversal
 * surface. `originalName` is DB metadata only, used for the download's
 * `Content-Disposition` header.
 */
export async function saveAttachmentFile(id: string, buffer: Buffer): Promise<void> {
  await mkdir(attachmentsDir(), { recursive: true });
  await writeFile(join(attachmentsDir(), id), buffer);
}

export async function readAttachmentFile(id: string): Promise<Buffer> {
  return readFile(join(attachmentsDir(), id));
}

export async function deleteAttachmentFile(id: string): Promise<void> {
  await unlink(join(attachmentsDir(), id)).catch(() => {});
}
