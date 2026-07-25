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
import { MoveInitiativeDto } from './dto/move-initiative.dto';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import {
  ListInitiativesDto,
  ListObjectivesDto,
} from './dto/list-roadmap.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

/**
 * Nola Studio's internal roadmap: quarterly **objectives** → **initiatives**
 * → **milestones**. This is the studio's own strategy tool — nothing here is
 * tenant-scoped.
 *
 * Same RBAC posture as the pipeline board: reads only need authentication,
 * mutations need `hq:operator`. Deleting an **objective** is the one
 * `hq:owner` gate — it detaches every initiative planned under it.
 */
@ApiBearerAuth()
@ApiTags('roadmap')
@Controller('roadmap')
export class RoadmapController {
  constructor(private readonly svc: RoadmapService) {}

  @Get('board')
  @ApiOperation({ summary: 'Initiatives as kanban columns, ordered by position' })
  board() {
    return this.svc.board();
  }

  @Get('timeline')
  @ApiOperation({ summary: 'Initiatives bucketed by quarter (unscheduled last)' })
  timeline() {
    return this.svc.timeline();
  }

  // ── objectives ───────────────────────────────────────────────────

  @Get('objectives')
  @ApiQuery({ name: 'quarter', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  listObjectives(@Query() query: ListObjectivesDto) {
    return this.svc.listObjectives(query);
  }

  @Get('objectives/:id')
  @ApiOperation({ summary: 'One objective with its initiatives' })
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

  // ── initiatives ──────────────────────────────────────────────────

  @Get('initiatives')
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'quarter', required: false, type: String })
  @ApiQuery({ name: 'objectiveId', required: false, type: String })
  @ApiQuery({ name: 'appId', required: false, type: String })
  @ApiQuery({ name: 'kind', required: false, type: String })
  @ApiQuery({ name: 'owner', required: false, type: String })
  listInitiatives(@Query() query: ListInitiativesDto) {
    return this.svc.listInitiatives(query);
  }

  @Get('initiatives/:id')
  @ApiOperation({ summary: 'One initiative with its milestones' })
  findInitiative(@Param('id') id: string) {
    return this.svc.findInitiative(id);
  }

  @Post('initiatives')
  @HqRoles(HqRole.Operator)
  createInitiative(@Body() dto: CreateInitiativeDto) {
    return this.svc.createInitiative(dto);
  }

  @Patch('initiatives/:id')
  @HqRoles(HqRole.Operator)
  updateInitiative(@Param('id') id: string, @Body() dto: UpdateInitiativeDto) {
    return this.svc.updateInitiative(id, dto);
  }

  @Post('initiatives/:id/move')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Move an initiative to a column/position (reorders it)' })
  move(@Param('id') id: string, @Body() dto: MoveInitiativeDto) {
    return this.svc.move(id, dto);
  }

  @Delete('initiatives/:id')
  @HttpCode(204)
  @HqRoles(HqRole.Operator)
  async removeInitiative(@Param('id') id: string) {
    await this.svc.removeInitiative(id);
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
