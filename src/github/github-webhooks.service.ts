import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { WorkItem } from '../work-items/work-item.entity';
import { WorkItemEvent } from '../work-items/work-item-event.entity';
import { matchReference, stripRefsHeads } from './branch-reference';
import { GithubWebhookDelivery, type WebhookDeliveryStatus } from './github-webhook-delivery.entity';
import { CodeRepository } from './repository.entity';
import { WorkItemBranch } from './work-item-branch.entity';
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
    @InjectRepository(WorkItemBranch)
    private readonly branches: Repository<WorkItemBranch>,
    @InjectRepository(WorkItem)
    private readonly items: Repository<WorkItem>,
    @InjectRepository(WorkItemEvent)
    private readonly events: Repository<WorkItemEvent>,
    private readonly config: ConfigService,
  ) {}

  private secret(): string | undefined {
    return this.config.get<string>('GITHUB_WEBHOOK_SECRET') || process.env.GITHUB_WEBHOOK_SECRET;
  }

  /**
   * Reçoit une livraison : vérifie, déduplique, conserve, puis met à jour ce
   * que l'événement rend faux.
   *
   * La frontière est nette. Ce qui est maintenu ici, c'est **l'état du lien**
   * — une branche fusionnée ou supprimée sur GitHub cesse d'être ouverte dans
   * HQ, et une branche poussée depuis un terminal rejoint son ticket. C'est
   * la synchronisation bidirectionnelle qu'ENG-06 demande, et elle ne décide
   * de rien : elle rend compte.
   *
   * Ce qui n'est **pas** fait ici, c'est faire avancer un ticket sur un
   * événement — ENG-09, qui demande une politique par type de work item. La
   * précipiter produirait des transitions qu'on ne saurait pas expliquer.
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

    // Après l'écriture, jamais avant : un événement qu'on n'a pas su
    // conserver ne doit pas modifier l'état qu'il est censé décrire.
    if (repository) {
      await this.applyToBranches(incoming.event ?? '', payload, repository);
    }

    return {
      status,
      deliveryId: incoming.deliveryId,
      ...(row.detail ? { detail: row.detail } : {}),
    };
  }

  /**
   * Ce que l'événement change dans les liens de branches.
   *
   * Trois événements suffisent à tenir l'état à jour. Le reste est conservé
   * sans être interprété — le journal reste complet, la table des liens
   * reste vraie.
   */
  private async applyToBranches(
    event: string,
    payload: Record<string, unknown>,
    repository: CodeRepository,
  ): Promise<void> {
    try {
      if (event === 'create' && payload.ref_type === 'branch') {
        await this.onBranchCreated(String(payload.ref ?? ''), repository);
      } else if (event === 'delete' && payload.ref_type === 'branch') {
        await this.onBranchDeleted(String(payload.ref ?? ''), repository);
      } else if (event === 'pull_request') {
        await this.onPullRequest(payload, repository);
      }
    } catch (err) {
      /**
       * Un échec ici ne doit pas faire répondre autre chose que 200 : GitHub
       * rejouerait la livraison, qui serait alors reconnue comme un doublon
       * et n'aurait toujours aucun effet. Mieux vaut le consigner et laisser
       * une resynchronisation manuelle rattraper.
       */
      this.logger.error(
        `Livraison ${event} conservée, mais son application a échoué : ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Une branche poussée depuis un terminal rejoint son ticket.
   *
   * C'est la moitié automatique d'ENG-08 : la convention de nommage ne sert à
   * rien si seul le bouton sait s'en servir. `created_by_hq` reste faux —
   * HQ n'a fait que reconnaître.
   */
  private async onBranchCreated(ref: string, repository: CodeRepository): Promise<void> {
    const name = stripRefsHeads(ref);
    if (!name) return;

    const already = await this.branches.findOne({ where: { repositoryId: repository.id, name } });
    if (already) return;

    const reference = await matchReference(name, async (candidate) => {
      const count = await this.items.count({ where: { reference: candidate } });
      return count > 0;
    });
    if (!reference) return;

    const item = await this.items.findOne({ where: { reference } });
    if (!item) return;

    const now = new Date();
    await this.branches.save(
      this.branches.create({
        workItemId: item.id,
        repositoryId: repository.id,
        name,
        baseBranch: repository.defaultBranch,
        baseSha: null,
        state: 'open',
        createdBy: 'github',
        createdByHq: false,
        htmlUrl: `https://github.com/${repository.owner}/${repository.name}/tree/${name}`,
        createdAt: now,
        updatedAt: now,
      }),
    );

    await this.events.save(
      this.events.create({
        workItemId: item.id,
        actor: 'github',
        action: 'branch_created',
        meta: { branch: name, repository: `${repository.owner}/${repository.name}`, createdByHq: false },
        createdAt: now,
      }),
    );
    this.logger.log(`Branche ${name} reconnue et rattachée à ${reference}.`);
  }

  /**
   * Une branche supprimée sur GitHub n'est plus ouverte ici.
   *
   * Le lien n'est pas effacé : « la suppression d'une branche ne supprime
   * jamais son historique dans Nolaa HQ ». Une branche déjà fusionnée le
   * reste — c'est l'information la plus précise des deux.
   */
  private async onBranchDeleted(ref: string, repository: CodeRepository): Promise<void> {
    const name = stripRefsHeads(ref);
    if (!name) return;
    await this.branches.update(
      { repositoryId: repository.id, name, state: 'open' },
      { state: 'deleted', updatedAt: new Date() },
    );
  }

  /**
   * Une PR fusionnée marque sa branche comme fusionnée.
   *
   * Fermée sans fusion, on ne touche à rien : la branche existe toujours et
   * le travail peut reprendre. Seule la fusion est un fait acquis.
   */
  private async onPullRequest(
    payload: Record<string, unknown>,
    repository: CodeRepository,
  ): Promise<void> {
    if (payload.action !== 'closed') return;
    const pr = payload.pull_request as { merged?: boolean; head?: { ref?: string } } | undefined;
    if (!pr?.merged || !pr.head?.ref) return;

    await this.branches.update(
      { repositoryId: repository.id, name: stripRefsHeads(pr.head.ref), state: 'open' },
      { state: 'merged', updatedAt: new Date() },
    );
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
