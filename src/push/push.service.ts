import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webPush from 'web-push';

import { PushSubscription } from './push-subscription.entity';

export interface PushPayload {
  title: string;
  body: string;
  /** Chemin dans la console (ex. `/tickets`) ouvert au clic. */
  url?: string;
  /** Regroupe/remplace les notifs de même origine côté OS. */
  tag?: string;
}

export interface SubscribeInput {
  userId: string;
  email?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

/**
 * Web Push (VAPID) pour la PWA installée. Mode dégradé assumé : sans
 * `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`, les endpoints répondent
 * (clé nulle, abonnement refusé proprement) et les `broadcast()` sont
 * des no-ops — le reste de la console ne dépend jamais du push.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private configured = false;

  constructor(
    @InjectRepository(PushSubscription)
    private readonly repo: Repository<PushSubscription>,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY absents — Web Push désactivé.',
      );
      return;
    }
    const subject =
      this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:ops@nolastudio.dev';
    webPush.setVapidDetails(subject, publicKey, privateKey);
    this.configured = true;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  publicKey(): string | null {
    return this.configured
      ? (this.config.get<string>('VAPID_PUBLIC_KEY') ?? null)
      : null;
  }

  /** Upsert par endpoint — ré-abonner le même appareil ne duplique pas. */
  async subscribe(input: SubscribeInput): Promise<{ ok: boolean }> {
    if (!this.configured) return { ok: false };
    const existing = await this.repo.findOne({
      where: { endpoint: input.endpoint },
    });
    if (existing) {
      existing.userId = input.userId;
      existing.email = input.email ?? existing.email;
      existing.p256dh = input.p256dh;
      existing.auth = input.auth;
      existing.userAgent = input.userAgent ?? existing.userAgent;
      await this.repo.save(existing);
      return { ok: true };
    }
    await this.repo.save(
      this.repo.create({
        userId: input.userId,
        email: input.email ?? null,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
        createdAt: new Date(),
      }),
    );
    return { ok: true };
  }

  /** Scopé à l'utilisateur : on ne peut pas désabonner l'appareil d'un autre. */
  async unsubscribe(userId: string, endpoint: string): Promise<{ ok: boolean }> {
    await this.repo.delete({ endpoint, userId });
    return { ok: true };
  }

  /** Notif de test envoyée aux seuls appareils de l'appelant. */
  async sendTest(userId: string): Promise<{ sent: number }> {
    const subs = await this.repo.find({ where: { userId } });
    return this.dispatch(subs, {
      title: 'Nola HQ — test',
      body: 'Les notifications push fonctionnent sur cet appareil.',
      url: '/',
      tag: 'push-test',
    });
  }

  /**
   * Envoie à tous les appareils abonnés. Fire-and-forget côté appelant
   * (`void this.push.broadcast(...)`) : toute erreur est loggée, jamais
   * propagée — une notif ratée ne doit pas faire échouer un ticket.
   */
  async broadcast(payload: PushPayload): Promise<{ sent: number }> {
    if (!this.configured) return { sent: 0 };
    try {
      const subs = await this.repo.find();
      return await this.dispatch(subs, payload);
    } catch (err) {
      this.logger.warn(
        `broadcast failed: ${err instanceof Error ? err.message : err}`,
      );
      return { sent: 0 };
    }
  }

  private async dispatch(
    subs: PushSubscription[],
    payload: PushPayload,
  ): Promise<{ sent: number }> {
    if (!this.configured || subs.length === 0) return { sent: 0 };
    const body = JSON.stringify(payload);
    let sent = 0;
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
            // TTL 1h : une alerte opérationnelle plus vieille que ça n'a
            // plus de valeur — inutile que le push service la garde.
            { TTL: 3600 },
          );
          sent += 1;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // Abonnement mort (appareil désinstallé / permission retirée)
            // — le push service ne le reconnaîtra plus jamais : purge.
            await this.repo.delete({ id: sub.id });
            this.logger.log(`pruned dead subscription ${sub.id}`);
          } else {
            this.logger.warn(
              `push to ${sub.id} failed: ${
                err instanceof Error ? err.message : err
              }`,
            );
          }
        }
      }),
    );
    return { sent };
  }
}
