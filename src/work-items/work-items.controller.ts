import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../common/auth/current-user.decorator';
import { HqRole } from '../common/auth/hq-role.enum';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import {
  CreateWorkItemDto,
  ListWorkItemsDto,
  MoveWorkItemDto,
  UpdateWorkItemDto,
  AddWorkItemCommentDto,
  AddWorkItemSubtaskDto,
  UpdateWorkItemSubtaskDto,
} from './dto/work-item.dto';
import { WorkItemsService } from './work-items.service';

@ApiBearerAuth()
@ApiTags('work-items')
@Controller('work-items')
export class WorkItemsController {
  constructor(private readonly svc: WorkItemsService) {}

  @Get()
  list(@Query() query: ListWorkItemsDto) {
    return this.svc.list(query);
  }

  @Get('board')
  board(@Query() query: ListWorkItemsDto) {
    return this.svc.board(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findDetail(id);
  }

  @Post()
  @HqRoles(HqRole.Operator)
  create(@Body() dto: CreateWorkItemDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.svc.create(dto, user?.email ?? user?.sub ?? 'unknown');
  }

  @Patch(':id')
  @HqRoles(HqRole.Operator)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkItemDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.update(id, dto, actor(user));
  }

  @Post(':id/move')
  @HqRoles(HqRole.Operator)
  move(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveWorkItemDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.move(id, dto.status, dto.position, actor(user));
  }

  @Post(':id/comments')
  @HqRoles(HqRole.Operator)
  comment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddWorkItemCommentDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.addComment(id, dto, actor(user));
  }

  @Post(':id/subtasks')
  @HqRoles(HqRole.Operator)
  addSubtask(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddWorkItemSubtaskDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.addSubtask(id, dto, actor(user));
  }

  @Patch('subtasks/:id')
  @HqRoles(HqRole.Operator)
  updateSubtask(
    @Param('id') id: string,
    @Body() dto: UpdateWorkItemSubtaskDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.updateSubtask(id, dto, actor(user));
  }
}

function actor(user?: AuthenticatedUser): string {
  return user?.email ?? user?.sub ?? 'unknown';
}
