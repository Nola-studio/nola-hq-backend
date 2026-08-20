import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import type { InvoiceStatus } from './invoice.entity';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

class UpdateInvoiceStatusDto {
  @IsIn(['paid', 'pending', 'late', 'overdue'])
  status!: InvoiceStatus;

  @IsOptional() @IsString() method?: string;
}

@ApiBearerAuth()
@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly svc: InvoicesService) {}

  @Get()
  list(@Query() query: ListInvoicesDto) {
    return this.svc.list(query);
  }

  @Get('summary')
  @HqRoles(HqRole.Viewer)
  summary() {
    return this.svc.summary();
  }

  @Get('overdue')
  overdue() {
    return this.svc.overdue();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @HqRoles(HqRole.Operator)
  create(@Body() dto: CreateInvoiceDto) {
    return this.svc.create(dto);
  }

  @Patch(':id/status')
  @HqRoles(HqRole.Operator)
  setStatus(@Param('id') id: string, @Body() dto: UpdateInvoiceStatusDto) {
    return this.svc.setStatus(id, dto.status, dto.method);
  }
}
