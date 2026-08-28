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
  UpdateTicketDto,
  UpdateTicketStatusDto,
} from './dto/create-ticket.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';
import { CurrentUser, type AuthenticatedUser } from '../common/auth/current-user.decorator';

@ApiBearerAuth()
@ApiTags('tickets')
@Controller('tickets')
@HqRoles(HqRole.Viewer)
export class TicketsController {
  constructor(private readonly svc: TicketsService) {}

  @Get()
  list(@Query() query: TicketsListQuery, @CurrentUser() user?: AuthenticatedUser) {
    return this.svc.list(query, user?.roles);
  }

  @Get('summary')
  summary(@CurrentUser() user?: AuthenticatedUser) {
    return this.svc.summary(user?.roles);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: AuthenticatedUser) {
    return this.svc.findOne(id, user?.roles);
  }

  @Get(':id/events')
  getEvents(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.getEvents(id, user?.roles);
  }

  @Post()
  @HqRoles(HqRole.Operator)
  create(@Body() dto: CreateTicketDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.svc.create(dto, actor(user));
  }

  @Post(':id/replies')
  @HqRoles(HqRole.Operator)
  reply(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddReplyDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.addReply(id, dto, user?.roles);
  }

  @Patch(':id/status')
  @HqRoles(HqRole.Operator)
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.setStatus(id, dto.status, user?.roles, actor(user), dto.pendingReason);
  }

  @Patch(':id/assign')
  @HqRoles(HqRole.Operator)
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.assign(id, dto.assignee, user?.roles, actor(user));
  }

  @Patch(':id')
  @HqRoles(HqRole.Operator)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.svc.update(id, dto, user?.roles, actor(user));
  }
}

function actor(user?: AuthenticatedUser): string {
  return user?.email ?? user?.sub ?? 'unknown';
}
