import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

@ApiBearerAuth()
@ApiTags('plans')
@Controller('plans')
@HqRoles(HqRole.Viewer)
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  /**
   * Returns every active plan from nola-billing. Optional `app` filter
   * scopes the list to a single product line (e.g. `?app=kelasi` returns
   * `kelasi:free`, `kelasi:starter`, …).
   */
  @Get()
  @ApiQuery({ name: 'app', required: false, type: String })
  list(@Query('app') app?: string) {
    return this.plans.listAll({ app });
  }

  /**
   * Edit a plan in billing. The billing handler flips `manuallyEdited`
   * to true automatically — pass `{ unlock: true }` to release the lock
   * and let the manifest-driven sync take over again.
   */
  @Patch(':id')
  @HqRoles(HqRole.Operator)
  update(
    @Param('id') id: string,
    @Body()
    body: {
      displayName?: string;
      price?: number;
      currency?: string;
      interval?: string;
      limits?: Record<string, unknown>;
      features?: unknown[];
      isActive?: boolean;
      unlock?: boolean;
    },
  ) {
    return this.plans.update(id, body);
  }
}
