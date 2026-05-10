import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Extrait `tenant_id` du contexte de la requête. Le `JwtAuthGuard` le pose
 * dans `request.tenantId` après vérification de la session. Pour le HQ
 * c'est toujours la valeur de plateforme (`nola-studio`), mais on garde
 * l'API pour rester cohérent avec Kelasi & co.
 */
export const Tenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { tenantId?: string }>();
    return req.tenantId;
  },
);
