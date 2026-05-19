import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { NotificationsService } from './notifications.service';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

class SendTestNotificationDto {
  @IsIn(['email', 'sms', 'whatsapp'])
  channel!: 'email' | 'sms' | 'whatsapp';

  @IsEmail()
  to!: string;

  /**
   * Either a named template seeded in notify DB (e.g. `account_invited`,
   * `payment_succeeded`) or the `_inline` sentinel — in which case
   * `variables.subject` + `variables.body` are used verbatim.
   */
  @IsString()
  @MaxLength(80)
  template!: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}

@ApiBearerAuth()
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  /**
   * Operator test: publishes `nola.commands.notify.send` on the cross-app
   * bus. Requires `hq:operator` (or higher) — viewers can't trigger
   * real-world side effects from the HQ console.
   */
  @Post('test')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Send a test notification through nola-notify' })
  test(@Body() dto: SendTestNotificationDto, @Req() req: { user?: { email?: string } }) {
    return this.svc.sendTest({
      channel: dto.channel,
      to: dto.to,
      template: dto.template,
      variables: dto.variables,
      issuedBy: req.user?.email,
    });
  }
}
