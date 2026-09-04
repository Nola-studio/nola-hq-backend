import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DeploysService } from './deploys.service';
import { CreateDeployDto } from './dto/create-deploy.dto';
import { RailwayWebhookDto } from './dto/railway-webhook.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';
import { Public } from '../common/auth/public.decorator';

@ApiBearerAuth()
@ApiTags('deploys')
@Controller('deploys')
@HqRoles(HqRole.Viewer)
export class DeploysController {
  constructor(private readonly svc: DeploysService) {}

  @Get()
  list(@Query('app') app?: string, @Query('env') env?: string) {
    return this.svc.list(app, env);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @HqRoles(HqRole.Operator)
  create(@Body() dto: CreateDeployDto) {
    return this.svc.create(dto);
  }

  /**
   * GitHub Actions Webhook (on: push to main).
   * Creates an initial deploy row with status 'pending'.
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('webhook')
  createFromWebhook(
    @Body() dto: CreateDeployDto,
    @Headers('x-deploy-secret') deploySecret?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const secret = deploySecret ?? this.extractBearer(authHeader);
    this.svc.validateDeploySecret(secret);
    return this.svc.createFromWebhook(dto);
  }

  /**
   * Railway Project Webhook (Deployment.succeeded / Deployment.failed).
   * Matches a pending deploy by SHA and updates status to success or failed.
   */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('webhook/railway')
  handleRailwayWebhook(
    @Body() dto: RailwayWebhookDto,
    @Headers('x-railway-secret') railwaySecret?: string,
    @Headers('x-deploy-secret') deploySecret?: string,
    @Headers('authorization') authHeader?: string,
    @Query('secret') secretQuery?: string,
  ) {
    const secret =
      railwaySecret ??
      deploySecret ??
      secretQuery ??
      this.extractBearer(authHeader);
    this.svc.validateRailwaySecret(secret);
    return this.svc.handleRailwayWebhook(dto);
  }

  @Post(':id/rollback')
  @HqRoles(HqRole.Operator)
  rollback(@Param('id') id: string) {
    return this.svc.rollback(id);
  }

  private extractBearer(auth?: string): string | undefined {
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.slice('Bearer '.length).trim() || undefined;
    }
    return undefined;
  }
}
