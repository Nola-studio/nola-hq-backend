import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Delete,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../common/auth/current-user.decorator';
import { HqRole } from '../common/auth/hq-role.enum';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { MAX_ATTACHMENT_BYTES } from './work-item-attachment-storage';
import {
  CaptureWorkItemDto,
  CreateWorkItemDto,
  ListWorkItemsDto,
  MoveWorkItemDto,
  UpdateWorkItemDto,
  AddWorkItemCommentDto,
  AddWorkItemSubtaskDto,
  UpdateWorkItemSubtaskDto,
} from './dto/work-item.dto';
import { AddWorkItemDependencyDto } from './dto/work-planning.dto';
import { WorkItemsService } from './work-items.service';
import { WorkPlanningService } from './work-planning.service';

@ApiBearerAuth()
@ApiTags('work-items')
@Controller('work-items')
export class WorkItemsController {
  constructor(
    private readonly svc: WorkItemsService,
    private readonly planning: WorkPlanningService,
  ) {}

  @Get()
  @HqRoles(HqRole.Viewer)
  list(@Query() query: ListWorkItemsDto) {
    return this.svc.list(query);
  }

  @Get('board')
  @HqRoles(HqRole.Viewer)
  board(@Query() query: ListWorkItemsDto) {
    return this.svc.board(query);
  }

  @Get(':id')
  @HqRoles(HqRole.Viewer)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findDetail(id);
  }

  @Get(':id/lineage')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: "Ancêtres, domaine et capacité — où se situe l'élément dans la taxonomie" })
  lineage(@Param('id', ParseIntPipe) id: number) {
    return this.svc.lineage(id);
  }

  @Post('capture')
  @HqRoles(HqRole.Operator)
  @ApiOperation({
    summary:
      "Dépose un besoin en un champ — il entre directement dans le backlog, sans conversion ni projet obligatoire",
  })
  capture(@Body() dto: CaptureWorkItemDto, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.capture(dto, actor(user));
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

  @Post(':id/dependencies')
  @HqRoles(HqRole.Operator)
  addDependency(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddWorkItemDependencyDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.planning.addDependency(id, dto.dependsOnId, actor(user));
  }

  @Delete('dependencies/:id')
  @HqRoles(HqRole.Operator)
  removeDependency(@Param('id') id: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.planning.removeDependency(id, actor(user));
  }

  @Get(':id/attachments')
  @HqRoles(HqRole.Viewer)
  listAttachments(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listAttachments(id);
  }

  @Post(':id/attachments')
  @HqRoles(HqRole.Operator)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES } }))
  uploadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.addAttachment(id, file, actor(user));
  }

  @Get(':id/attachments/:attachmentId')
  @HqRoles(HqRole.Viewer)
  async downloadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const { attachment, buffer } = await this.svc.getAttachmentFile(id, attachmentId);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.originalName)}"`);
    res.send(buffer);
  }

  @Delete(':id/attachments/:attachmentId')
  @HqRoles(HqRole.Operator)
  removeAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.removeAttachment(id, attachmentId, actor(user));
  }
}

function actor(user?: AuthenticatedUser): string {
  return user?.email ?? user?.sub ?? 'unknown';
}
