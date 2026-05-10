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
import { TicketsService, type TicketsListQuery } from './tickets.service';
import {
  AddReplyDto,
  AssignTicketDto,
  CreateTicketDto,
  UpdateTicketStatusDto,
} from './dto/create-ticket.dto';

@ApiBearerAuth()
@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly svc: TicketsService) {}

  @Get()
  list(@Query() query: TicketsListQuery) {
    return this.svc.list(query);
  }

  @Get('summary')
  summary() {
    return this.svc.summary();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTicketDto) {
    return this.svc.create(dto);
  }

  @Post(':id/replies')
  reply(@Param('id', ParseIntPipe) id: number, @Body() dto: AddReplyDto) {
    return this.svc.addReply(id, dto);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.svc.setStatus(id, dto.status);
  }

  @Patch(':id/assign')
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTicketDto,
  ) {
    return this.svc.assign(id, dto.assignee);
  }
}
