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
import { StudioProjectsProxyService } from './studio-projects-proxy.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ListStudioProjectsDto } from './dto/list-studio-projects.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';
import { CurrentUser, type AuthenticatedUser } from '../common/auth/current-user.decorator';

/**
 * Studio's project/task board. `/studio/projects*` and `/studio/tasks*`
 * keep their original shape for the Studio frontend, but every read/write
 * now goes through `roadmap_initiatives`/`work_items` via
 * `StudioProjectsProxyService` — `studio_projects`/`studio_tasks` are
 * retired. Reads need `hq:viewer` (or above), mutations need
 * `hq:operator`.
 */
@ApiBearerAuth()
@ApiTags('studio')
@Controller('studio')
export class StudioProjectsProxyController {
  constructor(private readonly svc: StudioProjectsProxyService) {}

  @Get('projects')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'Every workstream tasks are filed under, active and archived alike' })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['project', 'initiative'],
    description: 'Omit for both (task composer picker); pass to get only one (the /projects screen).',
  })
  listProjects(@Query() query: ListStudioProjectsDto) {
    return this.svc.listProjects(query);
  }

  @Get('projects/:id')
  @HqRoles(HqRole.Viewer)
  findProject(@Param('id') id: string) {
    return this.svc.findProject(id);
  }

  @Post('projects')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Add a new workstream — its key prefixes every task identifier it files' })
  createProject(@Body() dto: CreateProjectDto) {
    return this.svc.createProject(dto);
  }

  @Patch('projects/:id')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: "Edit everything but the key (immutable — it's baked into task identifiers)" })
  updateProject(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.svc.updateProject(id, dto);
  }

  @Post('projects/:id/archive')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Archive — blocked while the project has open (non-done) tasks' })
  archiveProject(@Param('id') id: string) {
    return this.svc.archiveProject(id);
  }

  @Post('projects/:id/unarchive')
  @HqRoles(HqRole.Operator)
  unarchiveProject(@Param('id') id: string) {
    return this.svc.unarchiveProject(id);
  }

  @Get('tasks')
  @HqRoles(HqRole.Viewer)
  @ApiQuery({ name: 'assignee', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'project', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'late', required: false, type: Boolean })
  listTasks(@Query() query: ListTasksDto) {
    return this.svc.findAllTasks(query);
  }

  @Get('tasks/:id')
  @HqRoles(HqRole.Viewer)
  findTask(@Param('id') id: string) {
    return this.svc.findOneTask(id);
  }

  @Post('tasks')
  @HqRoles(HqRole.Operator)
  createTask(@Body() dto: CreateTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.createTask(dto, user.email);
  }

  @Patch('tasks/:id')
  @HqRoles(HqRole.Operator)
  updateTask(@Param('id') id: string, @Body() dto: UpdateTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.updateTask(id, dto, user.email);
  }

  @Post('tasks/:id/move')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Move a task to a column/position (reorders it)' })
  moveTask(@Param('id') id: string, @Body() dto: MoveTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.moveTask(id, dto, user.email);
  }

  @Delete('tasks/:id')
  @HttpCode(204)
  @HqRoles(HqRole.Operator)
  async removeTask(@Param('id') id: string) {
    await this.svc.removeTask(id);
  }
}
