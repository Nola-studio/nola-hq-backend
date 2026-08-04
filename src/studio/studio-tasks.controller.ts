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
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';
import { CurrentUser, type AuthenticatedUser } from '../common/auth/current-user.decorator';

/**
 * Studio's internal task board: 6-column kanban filed under a fixed set of
 * workstreams (`GET /studio/projects`). Same RBAC posture as Roadmap: reads
 * only need authentication, mutations need `hq:operator`.
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
  @ApiOperation({ summary: 'The fixed set of workstreams tasks are filed under' })
  listProjects() {
    return this.studioSvc.listProjects();
  }

  @Get('tasks')
  @ApiQuery({ name: 'assignee', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'project', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'late', required: false, type: Boolean })
  listTasks(@Query() query: ListTasksDto) {
    return this.tasksSvc.findAll(query);
  }

  @Get('tasks/:id')
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
