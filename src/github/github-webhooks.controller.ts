import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator';
import { GithubWebhooksService } from './github-webhooks.service';

/**
 * L'oreille de Nolaa HQ sur GitHub.
 *
 * `@Public()` parce que GitHub n'a pas de session HQ, et une signature HMAC
 * à la place — c'est `GithubWebhooksService` qui la vérifie, avant toute
 * lecture de la charge utile.
 *
 * Exclue de Swagger : ce n'est pas une API qu'on appelle, c'est une adresse
 * qu'on donne à GitHub une fois.
 *
 * Le débit est large : GitHub peut livrer une rafale après une coupure, et
 * une rafale légitime refusée serait rejouée en boucle. Ce qui protège ici
 * n'est pas le quota, c'est la signature.
 */
@Public()
@ApiExcludeController()
@Throttle({ default: { limit: 300, ttl: 60_000 } })
@Controller('public/v1/webhooks')
export class GithubWebhooksController {
  constructor(private readonly webhooks: GithubWebhooksService) {}

  /**
   * Répond 200 dès que la livraison est conservée.
   *
   * GitHub rejoue tout ce qui n'est pas 2xx, et considère un endpoint lent
   * comme défaillant. On accuse donc réception de ce qu'on a *reçu*, pas de
   * ce qu'on aura *traité* — le traitement se lit ensuite dans le journal.
   */
  @Post('github')
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
    @Headers('x-github-delivery') deliveryId?: string,
    @Headers('x-github-event') event?: string,
  ) {
    return this.webhooks.receive({
      // `rawBody` n'existe que parce que `main.ts` crée l'app avec
      // `rawBody: true`. Sans lui, la signature ne pourrait pas être
      // vérifiée : GitHub signe les octets, pas l'objet analysé.
      rawBody: req.rawBody ?? Buffer.alloc(0),
      signature,
      deliveryId,
      event,
    });
  }
}
