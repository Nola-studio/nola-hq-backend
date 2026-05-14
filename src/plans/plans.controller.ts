import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PlansService } from './plans.service';

@ApiBearerAuth()
@ApiTags('plans')
@Controller('plans')
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
}
