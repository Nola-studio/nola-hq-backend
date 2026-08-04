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
import { StudioTasksService } from './studio-tasks.service';
import { StudioService } from './studio.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';
import { CurrentUser, type AuthenticatedUser } from '../common/auth/current-user.decorator';

/**
 * Studio's internal task board: 6-column kanban filed under user-managed
 * workstreams (`GET /studio/projects`). Reads need `hq:viewer` (or above),
 * mutations need `hq:operator`.
 */
@ApiBearerAuth()
@ApiTags('studio')
@Controller('studio')
export class StudioTasksController {
  constructor(
    private readonly tasksSvc: StudioTasksService,
    private readonly studioSvc: StudioService,
  ) {}

  @Get('projects')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'Every workstream tasks are filed under, active and archived alike' })
  listProjects() {
    return this.studioSvc.listProjects();
  }

  @Get('projects/:id')
  @HqRoles(HqRole.Viewer)
  findProject(@Param('id') id: string) {
    return this.studioSvc.findProject(id);
  }

  @Post('projects')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Add a new workstream — its key prefixes every task identifier it files' })
  createProject(@Body() dto: CreateProjectDto) {
    return this.studioSvc.createProject(dto);
  }

  @Patch('projects/:id')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: "Edit everything but the key (immutable — it's baked into task identifiers)" })
  updateProject(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.studioSvc.updateProject(id, dto);
  }

  @Post('projects/:id/archive')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Archive — blocked while the project has open (non-done) tasks' })
  archiveProject(@Param('id') id: string) {
    return this.studioSvc.archiveProject(id);
  }

  @Post('projects/:id/unarchive')
  @HqRoles(HqRole.Operator)
  unarchiveProject(@Param('id') id: string) {
    return this.studioSvc.unarchiveProject(id);
  }

  @Get('tasks')
  @HqRoles(HqRole.Viewer)
  @ApiQuery({ name: 'assignee', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'project', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'late', required: false, type: Boolean })
  listTasks(@Query() query: ListTasksDto) {
    return this.tasksSvc.findAll(query);
  }

  @Get('tasks/:id')
  @HqRoles(HqRole.Viewer)
  findTask(@Param('id') id: string) {
    return this.tasksSvc.findOne(id);
  }

  @Post('tasks')
  @HqRoles(HqRole.Operator)
  createTask(@Body() dto: CreateTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksSvc.create(dto, user.email);
  }

  @Patch('tasks/:id')
  @HqRoles(HqRole.Operator)
  updateTask(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksSvc.update(id, dto);
  }

  @Post('tasks/:id/move')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Move a task to a column/position (reorders it)' })
  moveTask(@Param('id') id: string, @Body() dto: MoveTaskDto) {
    return this.tasksSvc.move(id, dto);
  }

  @Delete('tasks/:id')
  @HttpCode(204)
  @HqRoles(HqRole.Operator)
  async removeTask(@Param('id') id: string) {
    await this.tasksSvc.remove(id);
  }
}
