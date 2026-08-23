import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PipelineService } from './pipeline.service';
import {
  MoveStageDto,
  UpsertPipelineItemDto,
} from './dto/upsert-pipeline-item.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

@ApiBearerAuth()
@ApiTags('pipeline')
@Controller('pipeline')
@HqRoles(HqRole.Viewer)
export class PipelineController {
  constructor(private readonly svc: PipelineService) {}

  @Get('board')
  board() {
    return this.svc.board();
  }

  @Get('items')
  findAll() {
    return this.svc.findAll();
  }

  @Get('items/:id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post('items')
  @HqRoles(HqRole.Operator)
  create(@Body() dto: UpsertPipelineItemDto) {
    return this.svc.create(dto);
  }

  @Patch('items/:id')
  @HqRoles(HqRole.Operator)
  update(@Param('id') id: string, @Body() dto: UpsertPipelineItemDto) {
    return this.svc.update(id, dto);
  }

  @Post('items/:id/move')
  @HqRoles(HqRole.Operator)
  move(@Param('id') id: string, @Body() dto: MoveStageDto) {
    return this.svc.move(id, dto.stage);
  }

  @Delete('items/:id')
  @HttpCode(204)
  @HqRoles(HqRole.Operator)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
