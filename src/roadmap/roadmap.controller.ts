import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RoadmapService } from './roadmap.service';
import { CreateObjectiveDto } from './dto/create-objective.dto';
import { UpdateObjectiveDto } from './dto/update-objective.dto';
import { CreateInitiativeDto } from './dto/create-initiative.dto';
import { UpdateInitiativeDto } from './dto/update-initiative.dto';
import { UpdateKeyPrefixDto } from './dto/update-key-prefix.dto';
import { UpdateScopeDto } from './dto/update-scope.dto';
import { BoardQueryDto } from './dto/board-query.dto';
import { MoveInitiativeDto } from './dto/move-initiative.dto';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { CreateKeyResultDto } from './dto/create-key-result.dto';
import { UpdateKeyResultDto } from './dto/update-key-result.dto';
import { CreateTrajectoryPointDto } from './dto/create-trajectory-point.dto';
import { UpdateTrajectoryPointDto } from './dto/update-trajectory-point.dto';
import {
  ListInitiativesDto,
  ListObjectivesDto,
} from './dto/list-roadmap.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';
import { CurrentUser, type AuthenticatedUser } from '../common/auth/current-user.decorator';

/**
 * Nola Studio's internal roadmap: staged **objectives** (annual → quarterly)
 * → **key results** (how the objective is measured, with a planned
 * trajectory) and **initiatives** → **milestones** (how it gets done). This
 * is the studio's own strategy tool — nothing here is tenant-scoped.
 *
 * Reads need `hq:viewer` (or above), mutations need `hq:operator` —
 * initiatives are also what `/studio/projects*`/`/studio/tasks*` serve
 * post-merge, so this controller now matches Studio's stricter posture
 * (every GET gated) rather than the pipeline board's auth-only reads.
 * Deleting an **objective** is the one `hq:owner` gate — it detaches every
 * initiative planned under it.
 */
@ApiBearerAuth()
@ApiTags('roadmap')
@Controller('roadmap')
export class RoadmapController {
  constructor(private readonly svc: RoadmapService) {}

  @Get('board')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'Kanban columns, ordered by position. Omit scope for every row; Roadmap itself passes scope=initiative.' })
  @ApiQuery({ name: 'scope', required: false, enum: ['project', 'initiative'] })
  board(@Query() query: BoardQueryDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.svc.board(query.scope, user?.roles);
  }

  @Get('timeline')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'Bucketed by quarter (unscheduled last). Omit scope for every row; Roadmap itself passes scope=initiative.' })
  @ApiQuery({ name: 'scope', required: false, enum: ['project', 'initiative'] })
  timeline(@Query() query: BoardQueryDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.svc.timeline(query.scope, user?.roles);
  }

  @Get('metrics')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({
    summary: 'Metrics a key result can bind to (the console never hardcodes them)',
  })
  metrics() {
    return this.svc.metrics();
  }

  // ── objectives ───────────────────────────────────────────────────

  @Get('objectives')
  @HqRoles(HqRole.Viewer)
  @ApiQuery({ name: 'quarter', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  listObjectives(@Query() query: ListObjectivesDto) {
    return this.svc.listObjectives(query);
  }

  @Get('objectives/:id')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({
    summary: 'One objective with its key results, initiatives and children',
  })
  findObjective(@Param('id') id: string) {
    return this.svc.findObjective(id);
  }

  @Post('objectives')
  @HqRoles(HqRole.Operator)
  createObjective(@Body() dto: CreateObjectiveDto) {
    return this.svc.createObjective(dto);
  }

  @Patch('objectives/:id')
  @HqRoles(HqRole.Operator)
  updateObjective(@Param('id') id: string, @Body() dto: UpdateObjectiveDto) {
    return this.svc.updateObjective(id, dto);
  }

  @Delete('objectives/:id')
  @HttpCode(204)
  @HqRoles(HqRole.Owner)
  @ApiOperation({
    summary: 'Delete an objective (owner only); its initiatives are detached',
  })
  async removeObjective(@Param('id') id: string) {
    await this.svc.removeObjective(id);
  }

  // ── key results ──────────────────────────────────────────────────

  @Get('objectives/:id/key-results')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({
    summary: 'Key results of an objective, with current / progress / status',
  })
  listKeyResults(@Param('id') id: string) {
    return this.svc.listKeyResults(id);
  }

  @Post('objectives/:id/key-results')
  @HqRoles(HqRole.Operator)
  @ApiOperation({
    summary: 'Add a key result (a metric-bound one needs no manual entry)',
  })
  createKeyResult(@Param('id') id: string, @Body() dto: CreateKeyResultDto) {
    return this.svc.createKeyResult(id, dto);
  }

  @Patch('key-results/:id')
  @HqRoles(HqRole.Operator)
  updateKeyResult(@Param('id') id: string, @Body() dto: UpdateKeyResultDto) {
    return this.svc.updateKeyResult(id, dto);
  }

  @Delete('key-results/:id')
  @HttpCode(204)
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Delete a key result and its trajectory points' })
  async removeKeyResult(@Param('id') id: string) {
    await this.svc.removeKeyResult(id);
  }

  @Get('key-results/:id/series')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'Planned vs measured curves, sorted by date' })
  series(@Param('id') id: string) {
    return this.svc.keyResultSeries(id);
  }

  // ── trajectory points ────────────────────────────────────────────

  @Post('key-results/:id/points')
  @HqRoles(HqRole.Operator)
  @ApiOperation({
    summary: 'Plan a step of the trajectory (an existing date is updated)',
  })
  addTrajectoryPoint(
    @Param('id') id: string,
    @Body() dto: CreateTrajectoryPointDto,
  ) {
    return this.svc.addTrajectoryPoint(id, dto);
  }

  @Patch('trajectory-points/:id')
  @HqRoles(HqRole.Operator)
  updateTrajectoryPoint(
    @Param('id') id: string,
    @Body() dto: UpdateTrajectoryPointDto,
  ) {
    return this.svc.updateTrajectoryPoint(id, dto);
  }

  @Delete('trajectory-points/:id')
  @HttpCode(204)
  @HqRoles(HqRole.Operator)
  async removeTrajectoryPoint(@Param('id') id: string) {
    await this.svc.removeTrajectoryPoint(id);
  }

  // ── initiatives ──────────────────────────────────────────────────

  @Get('initiatives')
  @HqRoles(HqRole.Viewer)
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'quarter', required: false, type: String })
  @ApiQuery({ name: 'objectiveId', required: false, type: String })
  @ApiQuery({ name: 'appId', required: false, type: String })
  @ApiQuery({ name: 'kind', required: false, type: String })
  @ApiQuery({ name: 'owner', required: false, type: String })
  listInitiatives(@Query() query: ListInitiativesDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.svc.listInitiatives(query, user?.roles);
  }

  @Get('initiatives/:id')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'One initiative with its milestones' })
  findInitiative(@Param('id') id: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.svc.findInitiative(id, user?.roles);
  }

  @Post('initiatives')
  @HqRoles(HqRole.Operator)
  createInitiative(@Body() dto: CreateInitiativeDto) {
    return this.svc.createInitiative(dto, 'initiative');
  }

  @Patch('initiatives/:id')
  @HqRoles(HqRole.Operator)
  updateInitiative(
    @Param('id') id: string,
    @Body() dto: UpdateInitiativeDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.updateInitiative(id, dto, user?.roles, 'initiative');
  }

  @Patch('initiatives/:id/key-prefix')
  @HqRoles(HqRole.Owner)
  @ApiOperation({
    summary:
      'Owner-only: change an initiative\'s auto-generated keyPrefix. Blocked once any task references it.',
  })
  updateKeyPrefix(
    @Param('id') id: string,
    @Body() dto: UpdateKeyPrefixDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.updateKeyPrefix(id, dto, user?.roles);
  }

  @Patch('initiatives/:id/scope')
  @HqRoles(HqRole.Owner)
  @ApiOperation({
    summary:
      "Owner-only: reclassify between 'project' (durable product) and 'initiative' (bounded work). Works regardless of the row's current scope.",
  })
  updateScope(
    @Param('id') id: string,
    @Body() dto: UpdateScopeDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.updateScope(id, dto, user?.roles);
  }

  @Post('initiatives/:id/move')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Move an initiative to a column/position (reorders it)' })
  move(
    @Param('id') id: string,
    @Body() dto: MoveInitiativeDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.move(id, dto, user?.roles);
  }

  @Delete('initiatives/:id')
  @HttpCode(204)
  @HqRoles(HqRole.Operator)
  async removeInitiative(@Param('id') id: string, @CurrentUser() user?: AuthenticatedUser) {
    await this.svc.removeInitiative(id, user?.roles);
  }

  // ── milestones ───────────────────────────────────────────────────

  @Post('initiatives/:id/milestones')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Add a checkpoint (switches progress to derived)' })
  addMilestone(@Param('id') id: string, @Body() dto: CreateMilestoneDto) {
    return this.svc.addMilestone(id, dto);
  }

  @Patch('milestones/:id')
  @HqRoles(HqRole.Operator)
  updateMilestone(@Param('id') id: string, @Body() dto: UpdateMilestoneDto) {
    return this.svc.updateMilestone(id, dto);
  }

  @Delete('milestones/:id')
  @HttpCode(204)
  @HqRoles(HqRole.Operator)
  async removeMilestone(@Param('id') id: string) {
    await this.svc.removeMilestone(id);
  }
}
