import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

@ApiBearerAuth()
@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  /**
   * Lists subscriptions in billing. Useful in the HQ overview where the
   * operator wants every active sub regardless of tenant.
   */
  @Get()
  @ApiQuery({ name: 'app', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'tenantId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @Query('app') app?: string,
    @Query('status') status?: string,
    @Query('tenantId') tenantId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.subs.list({
      app,
      status,
      tenantId,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  /**
   * Single subscription lookup by (tenant, app). Used by TenantDetail
   * to show the current plan and offer the change-plan dropdown.
   */
  @Get(':tenantId/:app')
  get(@Param('tenantId') tenantId: string, @Param('app') app: string) {
    return this.subs.get(tenantId, app);
  }

  /**
   * Change the active plan on a subscription. `newPlanId` accepts a
   * billing plan UUID or its name (`kelasi:growth`). The billing side
   * emits `subscription.upgraded` / `.downgraded` so kelasi-gateway
   * picks up the new plan slug for runtime gating without a redeploy.
   *
   * Requires Operator role.
   */
  @Post(':tenantId/:app/change-plan')
  @HqRoles(HqRole.Operator)
  changePlan(
    @Param('tenantId') tenantId: string,
    @Param('app') app: string,
    @Body() body: { newPlanId?: string; reason?: string },
  ) {
    if (!body?.newPlanId) {
      throw new BadRequestException('newPlanId is required');
    }
    return this.subs.changePlan({
      tenantId,
      app,
      newPlanId: body.newPlanId,
      reason: body.reason,
    });
  }

  /**
   * Cancel a tenant's subscription on a given app. Doesn't delete the
   * row — just marks it cancelled (kept for audit). Requires Owner
   * because it removes the tenant's access to the app.
   */
  @Post(':tenantId/:app/cancel')
  @HqRoles(HqRole.Owner)
  cancel(@Param('tenantId') tenantId: string, @Param('app') app: string) {
    return this.subs.cancel({ tenantId, app });
  }
}
