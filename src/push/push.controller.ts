import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { PushService } from './push.service';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

class PushKeysDto {
  @IsString()
  @MaxLength(256)
  p256dh!: string;

  @IsString()
  @MaxLength(128)
  auth!: string;
}

class SubscribeDto {
  /** URL de l'endpoint push du navigateur (FCM, Mozilla autopush, APNs…). */
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  endpoint!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;
}

class UnsubscribeDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  endpoint!: string;
}

interface AuthedRequest {
  user?: { sub: string; email?: string };
}

/**
 * Web Push de la console — tout rôle authentifié (un viewer a autant
 * besoin d'être alerté d'un incident qu'un owner). Chaque route ne
 * touche que les abonnements de l'appelant ; seul le broadcast interne
 * (tickets/incidents) écrit vers tous les appareils.
 */
@ApiBearerAuth()
@ApiTags('notifications')
@Controller('notifications/push')
@HqRoles(HqRole.Viewer)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('vapid-key')
  @ApiOperation({ summary: 'Public VAPID key (null when push is disabled)' })
  vapidKey() {
    return { key: this.push.publicKey() };
  }

  @Post('subscribe')
  @HttpCode(200)
  @ApiOperation({ summary: 'Register this device for push notifications' })
  async subscribe(@Body() dto: SubscribeDto, @Req() req: AuthedRequest) {
    if (!this.push.isConfigured()) {
      throw new ServiceUnavailableException('push_not_configured');
    }
    return this.push.subscribe({
      userId: req.user?.sub ?? 'unknown',
      email: req.user?.email,
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: dto.userAgent,
    });
  }

  // POST plutôt que DELETE : le désabonnement porte l'endpoint dans le
  // corps, et les clients fetch/proxies gèrent mal les DELETE avec body.
  @Post('unsubscribe')
  @HttpCode(200)
  @ApiOperation({ summary: 'Unregister this device' })
  async unsubscribe(@Body() dto: UnsubscribeDto, @Req() req: AuthedRequest) {
    return this.push.unsubscribe(req.user?.sub ?? 'unknown', dto.endpoint);
  }

  @Post('test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a test notification to my own devices' })
  async test(@Req() req: AuthedRequest) {
    return this.push.sendTest(req.user?.sub ?? 'unknown');
  }
}
