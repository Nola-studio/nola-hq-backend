import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { HqRole } from '../common/auth/hq-role.enum';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import {
  CreateProjectRiskDto,
  CreateWorkSprintDto,
  UpdateProjectRiskDto,
  UpdateWorkSprintDto,
} from './dto/work-planning.dto';
import { WorkPlanningService } from './work-planning.service';

@ApiBearerAuth()
@ApiTags('work-planning')
@Controller('work-planning')
export class WorkPlanningController {
  constructor(private readonly svc: WorkPlanningService) {}

  @Get('sprints')
  listSprints(@Query('projectId') projectId?: string) {
    return this.svc.listSprints(projectId);
  }

  @Post('sprints')
  @HqRoles(HqRole.Operator)
  createSprint(@Body() dto: CreateWorkSprintDto) {
    return this.svc.createSprint(dto);
  }

  @Patch('sprints/:id')
  @HqRoles(HqRole.Operator)
  updateSprint(@Param('id') id: string, @Body() dto: UpdateWorkSprintDto) {
    return this.svc.updateSprint(id, dto);
  }

  @Get('projects/:projectId/report')
  report(@Param('projectId') projectId: string) {
    return this.svc.projectReport(projectId);
  }

  @Get('risks')
  listRisks(@Query('projectId') projectId: string) {
    return this.svc.listRisks(projectId);
  }

  @Post('risks')
  @HqRoles(HqRole.Operator)
  createRisk(@Body() dto: CreateProjectRiskDto) {
    return this.svc.createRisk(dto);
  }

  @Patch('risks/:id')
  @HqRoles(HqRole.Operator)
  updateRisk(@Param('id') id: string, @Body() dto: UpdateProjectRiskDto) {
    return this.svc.updateRisk(id, dto);
  }
}
