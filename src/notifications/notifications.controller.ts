import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { NotificationsService } from './notifications.service';
import { IsRecipientForChannel } from './dto/recipient-for-channel.validator';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';
import { CurrentUser, type AuthenticatedUser } from '../common/auth/current-user.decorator';
import { TeamService } from '../team/team.service';

class SendTestNotificationDto {
  @IsIn(['email', 'sms', 'whatsapp'])
  channel!: 'email' | 'sms' | 'whatsapp';

  /**
   * Recipient — validated conditionally on the channel:
   *   - `email`           → a valid email address.
   *   - `sms` / `whatsapp` → an E.164 MSISDN (`+` then 8–15 digits).
   *
   * Without this split, an SMS/WhatsApp test to a phone number was rejected
   * with an unjustified 400 because the field was always `@IsEmail()`.
   */
  @IsString()
  @IsRecipientForChannel('channel')
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
  constructor(
    private readonly svc: NotificationsService,
    private readonly teamService: TeamService,
  ) {}

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

  @Get()
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: "List the caller's own notifications" })
  async list(@CurrentUser() user: AuthenticatedUser) {
    const recipientId = await this.recipientId(user);
    return this.svc.list(recipientId);
  }

  @Patch(':id/read')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'Mark one of the caller’s own notifications as read' })
  async markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const recipientId = await this.recipientId(user);
    return this.svc.markRead(id, recipientId);
  }

  @Post('read-all')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: "Mark all of the caller's unread notifications as read" })
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    const recipientId = await this.recipientId(user);
    return this.svc.markAllRead(recipientId);
  }

  @Patch(':id/clear')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: "Clear one of the caller's own notifications" })
  async clear(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const recipientId = await this.recipientId(user);
    return this.svc.clear(id, recipientId);
  }

  /**
   * "Who am I" for the notifications feature — a caller only ever manages
   * their own notifications, never someone else's, so every route here
   * resolves the current TeamMember via TeamService rather than trusting
   * an id in the request.
   */
  private async recipientId(user: AuthenticatedUser): Promise<string> {
    const member = await this.teamService.findByEmail(user.email);
    if (!member) throw new BadRequestException('Aucun membre d’équipe associé à ce compte');
    return member.id;
  }
}
