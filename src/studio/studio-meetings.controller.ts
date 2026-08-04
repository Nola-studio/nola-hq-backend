import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StudioMeetingsService } from './studio-meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { CreateMeetingTaskDto } from './dto/create-meeting-task.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';
import { CurrentUser, type AuthenticatedUser } from '../common/auth/current-user.decorator';

@ApiBearerAuth()
@ApiTags('studio')
@Controller('studio/meetings')
export class StudioMeetingsController {
  constructor(private readonly svc: StudioMeetingsService) {}

  @Get()
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'List meetings, most recent first' })
  findAll() {
    return this.svc.findAll();
  }

  @Get(':id')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'One meeting with its linked tasks' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @HqRoles(HqRole.Operator)
  create(@Body() dto: CreateMeetingDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @HqRoles(HqRole.Operator)
  update(@Param('id') id: string, @Body() dto: UpdateMeetingDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @HqRoles(HqRole.Operator)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }

  @Post(':id/tasks')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Create a task linked to this meeting (decision → task)' })
  createTask(@Param('id') id: string, @Body() dto: CreateMeetingTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.createTask(id, dto, user.email);
  }
}
