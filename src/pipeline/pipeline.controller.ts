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

@ApiBearerAuth()
@ApiTags('pipeline')
@Controller('pipeline')
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
  create(@Body() dto: UpsertPipelineItemDto) {
    return this.svc.create(dto);
  }

  @Patch('items/:id')
  update(@Param('id') id: string, @Body() dto: UpsertPipelineItemDto) {
    return this.svc.update(id, dto);
  }

  @Post('items/:id/move')
  move(@Param('id') id: string, @Body() dto: MoveStageDto) {
    return this.svc.move(id, dto.stage);
  }

  @Delete('items/:id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
