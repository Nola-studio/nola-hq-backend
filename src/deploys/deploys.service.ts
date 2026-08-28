import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Deploy, DeployStatus } from './deploy.entity';
import { CreateDeployDto } from './dto/create-deploy.dto';
import { RailwayWebhookDto } from './dto/railway-webhook.dto';

function timingSafeCompare(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

@Injectable()
export class DeploysService {
  private readonly logger = new Logger(DeploysService.name);

  constructor(
    @InjectRepository(Deploy) private readonly repo: Repository<Deploy>,
    private readonly config: ConfigService,
  ) {}

  list(app?: string, env?: string) {
    const where: Partial<Deploy> = {};
    if (app) where.app = app;
    if (env) where.env = env;
    return this.repo.find({ where, order: { id: 'DESC' }, take: 200 });
  }

  async findOne(id: string) {
    const d = await this.repo.findOne({ where: { id } });
    if (!d) throw new NotFoundException(`Déploiement ${id} introuvable`);
    return d;
  }

  async create(dto: CreateDeployDto) {
    const id = dto.id ?? (await this.nextId());
    return this.repo.save(
      this.repo.create({
        id,
        app: dto.app,
        version: dto.version,
        env: dto.env,
        author: dto.author,
        t: dto.t ?? 'à l’instant',
        status: dto.status ?? 'success',
        sha: dto.sha,
        changelog: dto.changelog,
      }),
    );
  }

  validateDeploySecret(providedSecret?: string) {
    const expected = this.config.get<string>('DEPLOY_WEBHOOK_SECRET');
    if (!expected || !timingSafeCompare(providedSecret, expected)) {
      throw new UnauthorizedException('invalid_deploy_secret');
    }
  }

  validateRailwaySecret(providedSecret?: string) {
    const expected = this.config.get<string>('RAILWAY_WEBHOOK_SECRET');
    if (!expected || !timingSafeCompare(providedSecret, expected)) {
      throw new UnauthorizedException('invalid_railway_secret');
    }
  }

  async createFromWebhook(dto: CreateDeployDto) {
    const id = dto.id ?? (await this.nextId());
    const row = this.repo.create({
      id,
      app: dto.app,
      version: dto.version,
      env: dto.env || 'production',
      author: dto.author,
      t: dto.t ?? 'à l’instant',
      status: dto.status ?? 'pending',
      sha: dto.sha,
      changelog: dto.changelog,
    });
    const saved = await this.repo.save(row);
    this.logger.log(
      `Deploy webhook: created ${saved.id} for ${saved.app} (sha: ${saved.sha}, status: ${saved.status})`,
    );
    return saved;
  }

  async handleRailwayWebhook(dto: RailwayWebhookDto) {
    const envName = dto.resource?.environment?.name?.toLowerCase();
    // Webhook fires project-wide across Nola-Core — filter strictly for production
    if (envName !== 'production') {
      this.logger.debug(
        `Railway webhook ignored: environment is '${envName}' (expected 'production')`,
      );
      return {
        matched: false,
        ignored: true,
        reason: 'non_production_environment',
      };
    }

    const rawStatus = (dto.details?.status ?? '').toUpperCase();
    const eventType = dto.type ?? '';

    let targetStatus: DeployStatus | null = null;
    if (rawStatus === 'SUCCESS' || eventType === 'Deployment.succeeded') {
      targetStatus = 'success';
    } else if (
      rawStatus === 'FAILED' ||
      rawStatus === 'CRASHED' ||
      eventType.toLowerCase().includes('failed') ||
      eventType.toLowerCase().includes('crashed')
    ) {
      targetStatus = 'failed';
    }

    if (!targetStatus) {
      this.logger.debug(
        `Railway webhook ignored: transitional or unrecognized status (status='${rawStatus}', type='${eventType}')`,
      );
      return {
        matched: false,
        ignored: true,
        reason: 'transitional_or_unrecognized_status',
      };
    }

    const commitHash = dto.details?.commitHash;
    const serviceName = dto.resource?.service?.name ?? '';

    if (!commitHash) {
      this.logger.debug(
        `Railway webhook ignored: missing commitHash in payload for service '${serviceName}'`,
      );
      return {
        matched: false,
        ignored: true,
        reason: 'missing_commit_hash',
      };
    }

    // Find pending production deploys
    const pendingDeploys = await this.repo.find({
      where: { env: 'production', status: 'pending' },
      order: { id: 'DESC' },
      take: 50,
    });

    const match = pendingDeploys.find((d) => {
      const shaMatches =
        d.sha === commitHash ||
        commitHash.startsWith(d.sha) ||
        d.sha.startsWith(commitHash.slice(0, 7));
      if (!shaMatches) return false;
      if (!serviceName) return true;

      const normApp = d.app.toLowerCase().replace(/[-_]/g, '');
      const normSvc = serviceName.toLowerCase().replace(/[-_]/g, '');
      return normApp.includes(normSvc) || normSvc.includes(normApp);
    });

    if (match) {
      match.status = targetStatus;
      await this.repo.save(match);
      this.logger.log(
        `Railway webhook: deploy ${match.id} (${match.app}, sha: ${match.sha}) updated to status '${targetStatus}'`,
      );
      return {
        matched: true,
        deployId: match.id,
        app: match.app,
        status: targetStatus,
      };
    }

    // No matching pending deploy (e.g. manual redeploy, dev push, or untracked trigger)
    this.logger.log(
      `Railway webhook received but no matching pending deploy found (service='${serviceName}', sha='${commitHash}', targetStatus='${targetStatus}')`,
    );
    return {
      matched: false,
      message: 'no_matching_pending_deploy',
      service: serviceName,
      sha: commitHash,
      status: targetStatus,
    };
  }

  async rollback(id: string) {
    const d = await this.findOne(id);
    d.status = 'rolled-back';
    return this.repo.save(d);
  }

  private async nextId() {
    const last = await this.repo
      .createQueryBuilder('d')
      .orderBy('d.id', 'DESC')
      .getOne();
    if (!last) return 'd-001';
    const num = parseInt(last.id.replace(/[^0-9]/g, ''), 10) || 0;
    return 'd-' + String(num + 1).padStart(3, '0');
  }
}
