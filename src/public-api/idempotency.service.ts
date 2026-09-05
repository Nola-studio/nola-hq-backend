import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import { IDEMPOTENCY_TTL_HOURS, IdempotencyKey } from './idempotency-key.entity';

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly keys: Repository<IdempotencyKey>,
  ) {}

  /**
   * Exécute `run` une seule fois par clé.
   *
   * Sans clé, rien n'est mémorisé : l'idempotence est un contrat que
   * l'appelant demande, pas un comportement imposé à tous.
   *
   * Une clé déjà vue rejoue la réponse enregistrée — à condition que le corps
   * soit le même. Un corps différent sous la même clé est une erreur de
   * l'appelant, pas une invitation à deviner laquelle des deux requêtes il
   * voulait vraiment.
   */
  async run<T>(
    clientId: string,
    idempotencyKey: string | undefined,
    endpoint: string,
    body: unknown,
    run: () => Promise<T>,
  ): Promise<{ result: T; replayed: boolean }> {
    if (!idempotencyKey) return { result: await run(), replayed: false };

    const requestHash = sha256(JSON.stringify(body ?? null));
    const existing = await this.keys.findOne({ where: { clientId, idempotencyKey } });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          `idempotency_key_reused: la clé « ${idempotencyKey} » a déjà servi pour une requête différente.`,
        );
      }
      return { result: JSON.parse(existing.responseBody) as T, replayed: true };
    }

    const result = await run();

    // Enregistré après coup : une commande qui échoue ne consomme pas la clé,
    // pour que l'appelant puisse réessayer avec la même.
    await this.keys.save(
      this.keys.create({
        clientId,
        idempotencyKey,
        endpoint,
        requestHash,
        statusCode: 200,
        responseBody: JSON.stringify(result ?? null),
        createdAt: new Date(),
      }),
    );

    return { result, replayed: false };
  }

  /** Purge les clés expirées. Appelée par le planificateur quotidien. */
  async purgeExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - IDEMPOTENCY_TTL_HOURS * 3600_000);
    const { affected } = await this.keys.delete({ createdAt: LessThan(cutoff) });
    return affected ?? 0;
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
