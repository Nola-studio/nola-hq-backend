import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { StudioRequestsService } from './studio-requests.service';
import { CreateStudioRequestDto } from './dto/create-studio-request.dto';
import { UpdateStudioRequestDto } from './dto/update-studio-request.dto';
import { UpdateStudioRequestStatusDto } from './dto/update-studio-request-status.dto';
import { ListStudioRequestsDto } from './dto/list-studio-requests.dto';
import { ConvertStudioRequestDto } from './dto/convert-studio-request.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';
import { CurrentUser, type AuthenticatedUser } from '../common/auth/current-user.decorator';

/**
 * Bugs, suggestions and standalone requests — deliberately separate from
 * `/studio/tasks`. Reads need `hq:viewer`, filing a request needs only to be
 * authenticated (no `@HqRoles`), status changes need `hq:operator`.
 */
@ApiBearerAuth()
@ApiTags('studio')
@Controller('studio/requests')
export class StudioRequestsController {
  constructor(private readonly svc: StudioRequestsService) {}

  @Get()
  @HqRoles(HqRole.Viewer)
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'priority', required: false, type: String })
  @ApiQuery({ name: 'project', required: false, type: String })
  @ApiQuery({ name: 'assignee', required: false, type: String })
  @ApiQuery({ name: 'author', required: false, type: String })
  findAll(@Query() query: ListStudioRequestsDto) {
    return this.svc.findAll(query);
  }

  @Get(':id')
  @HqRoles(HqRole.Viewer)
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'File a request — any authenticated user, not just operators' })
  create(@Body() dto: CreateStudioRequestDto, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.create(dto, user.email);
  }

  @Patch(':id')
  @HqRoles(HqRole.Operator)
  update(@Param('id') id: string, @Body() dto: UpdateStudioRequestDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/status')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'The only way to move a request through its lifecycle' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStudioRequestStatusDto) {
    return this.svc.updateStatus(id, dto);
  }

  @Post(':id/convert')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Files the ticket a request resolves into and links the two, setting status to acceptee' })
  convert(@Param('id') id: string, @Body() dto: ConvertStudioRequestDto, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.convert(id, dto, user.email);
  }

  @Delete(':id')
  @HttpCode(204)
  @HqRoles(HqRole.Operator)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
