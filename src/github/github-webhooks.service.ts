import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { GithubWebhookDelivery, type WebhookDeliveryStatus } from './github-webhook-delivery.entity';
import { CodeRepository } from './repository.entity';
import { SIGNATURE_REJECTION_MESSAGES, verifyGithubSignature } from './webhook-signature';

/** Ce que le contrôleur extrait de la requête avant de nous la passer. */
export interface IncomingDelivery {
  rawBody: Buffer;
  signature: string | undefined;
  deliveryId: string | undefined;
  event: string | undefined;
}

export interface DeliveryOutcome {
  status: WebhookDeliveryStatus | 'duplicate';
  deliveryId: string;
  detail?: string;
}

@Injectable()
export class GithubWebhooksService {
  private readonly logger = new Logger(GithubWebhooksService.name);

  constructor(
    @InjectRepository(GithubWebhookDelivery)
    private readonly deliveries: Repository<GithubWebhookDelivery>,
    @InjectRepository(CodeRepository)
    private readonly repos: Repository<CodeRepository>,
    private readonly config: ConfigService,
  ) {}

  private secret(): string | undefined {
    return this.config.get<string>('GITHUB_WEBHOOK_SECRET') || process.env.GITHUB_WEBHOOK_SECRET;
  }

  /**
   * Reçoit une livraison : vérifie, déduplique, conserve.
   *
   * Ce lot s'arrête à conserver. Faire évoluer un ticket sur un événement
   * GitHub est ENG-09, et cela demande une politique par type de work item —
   * la précipiter ici produirait des transitions qu'on ne saurait pas
   * expliquer. Ce qui est acquis en revanche, c'est qu'aucun événement n'est
   * perdu ni compté deux fois le jour où cette politique existera.
   */
  async receive(incoming: IncomingDelivery): Promise<DeliveryOutcome> {
    const verdict = verifyGithubSignature(incoming.rawBody, incoming.signature, this.secret());
    if (!verdict.ok) {
      // Le motif est journalisé côté serveur, mais la réponse reste vague :
      // dire « signature invalide » plutôt que « absente » apprendrait à un
      // inconnu qu'il a trouvé la bonne forme.
      this.logger.warn(
        `Livraison GitHub refusée (${verdict.reason}) — event=${incoming.event ?? '?'} delivery=${incoming.deliveryId ?? '?'}`,
      );
      throw new UnauthorizedException(SIGNATURE_REJECTION_MESSAGES[verdict.reason]);
    }

    if (!incoming.deliveryId) {
      throw new UnauthorizedException('En-tête X-GitHub-Delivery absent.');
    }

    // À partir d'ici seulement : la charge utile est authentifiée, donc on
    // peut l'analyser et l'écrire.
    const payload = this.parse(incoming.rawBody);
    const slug = this.slugOf(payload);
    const externalId = this.externalIdOf(payload);
    const repository = await this.resolveRepository(slug, externalId);

    const known = Boolean(repository);
    const status: WebhookDeliveryStatus = known ? 'received' : 'ignored';

    const row = this.deliveries.create({
      deliveryId: incoming.deliveryId,
      event: (incoming.event ?? 'unknown').slice(0, 64),
      action: typeof payload.action === 'string' ? payload.action.slice(0, 64) : null,
      repositoryId: repository?.id ?? null,
      repositorySlug: slug,
      repositoryExternalId: externalId,
      status,
      detail: known
        ? null
        : `Dépôt ${slug ?? 'inconnu'} absent du registre — livraison conservée, sans effet.`,
      payload,
      receivedAt: new Date(),
    });

    try {
      await this.deliveries.save(row);
    } catch (err) {
      /**
       * GitHub rejoue toute livraison qui n'a pas répondu 200, et deux rejeux
       * peuvent se croiser. La contrainte d'unicité est donc l'autorité, pas
       * une lecture préalable qui laisserait une fenêtre entre les deux.
       */
      if (this.isDuplicate(err)) {
        return { status: 'duplicate', deliveryId: incoming.deliveryId };
      }
      throw err;
    }

    return {
      status,
      deliveryId: incoming.deliveryId,
      ...(row.detail ? { detail: row.detail } : {}),
    };
  }

  /** Le journal d'un dépôt — ce que GitHub a raconté à son sujet. */
  async listForRepository(repositoryId: string, limit = 50): Promise<GithubWebhookDelivery[]> {
    return this.deliveries.find({
      where: { repositoryId },
      order: { receivedAt: 'DESC' },
      take: Math.min(limit, 200),
    });
  }

  /** Les dernières livraisons, tous dépôts confondus — pour diagnostiquer. */
  async recent(limit = 50): Promise<GithubWebhookDelivery[]> {
    return this.deliveries.find({ order: { receivedAt: 'DESC' }, take: Math.min(limit, 200) });
  }

  private parse(rawBody: Buffer): Record<string, unknown> {
    try {
      const parsed = JSON.parse(rawBody.toString('utf8')) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      // Signature valide et JSON invalide est un cas qui ne devrait pas
      // exister ; le conserver vide vaut mieux que de perdre la trace.
      return {};
    }
  }

  private slugOf(payload: Record<string, unknown>): string | null {
    const repo = payload.repository as { full_name?: unknown } | undefined;
    return typeof repo?.full_name === 'string' ? repo.full_name.slice(0, 250) : null;
  }

  private externalIdOf(payload: Record<string, unknown>): string | null {
    const repo = payload.repository as { id?: unknown } | undefined;
    return typeof repo?.id === 'number' || typeof repo?.id === 'string' ? String(repo.id) : null;
  }

  /**
   * L'identifiant GitHub d'abord, le nom ensuite.
   *
   * Un dépôt renommé garde son identifiant : le chercher en premier reconnaît
   * l'événement là où le nom aurait échoué. Le nom reste utile pour un dépôt
   * enregistré à la main, qui n'a pas encore d'identifiant.
   */
  private async resolveRepository(
    slug: string | null,
    externalId: string | null,
  ): Promise<CodeRepository | null> {
    if (externalId) {
      const byId = await this.repos.findOne({ where: { externalId } });
      if (byId) return byId;
    }
    if (!slug || !slug.includes('/')) return null;

    const [owner, name] = slug.split('/');
    return this.repos
      .createQueryBuilder('r')
      .where('LOWER(r.owner) = :owner', { owner: owner.toLowerCase() })
      .andWhere('LOWER(r.name) = :name', { name: name.toLowerCase() })
      .getOne();
  }

  private isDuplicate(err: unknown): boolean {
    if (!(err instanceof QueryFailedError)) return false;
    const code = (err as unknown as { driverError?: { code?: string } }).driverError?.code;
    // 23505 = unique_violation (Postgres) ; SQLITE_CONSTRAINT en développement.
    return code === '23505' || String(code).startsWith('SQLITE_CONSTRAINT');
  }
}
