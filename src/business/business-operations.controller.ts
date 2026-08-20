import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, type AuthenticatedUser } from '../common/auth/current-user.decorator';
import { HqRole } from '../common/auth/hq-role.enum';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import type { BusinessDocumentEntityType } from './business-document.entity';
import { BusinessOperationsService } from './business-operations.service';
import {
  CashflowQueryDto,
  ConvertQuoteToInvoiceDto,
  CreateBusinessDocumentDto,
  CreateBusinessQuoteDto,
  CreateBusinessReminderDto,
  CreateProjectTimeEntryDto,
  UpdateBusinessQuoteDto,
  UpdateBusinessReminderDto,
  UpdateProjectTimeEntryDto,
} from './dto/business-operations.dto';

@ApiBearerAuth()
@ApiTags('business-operations')
@Controller('business')
export class BusinessOperationsController {
  constructor(private readonly svc: BusinessOperationsService) {}

  @Get('quotes')
  quotes(@Query('projectId') projectId?: string) { return this.svc.listQuotes(projectId); }

  @Get('quotes/:id/pdf')
  async quotePdf(@Param('id') id: string, @Res() response: Response) {
    const pdf = await this.svc.quotePdf(id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `inline; filename="devis-${id}.pdf"`);
    response.send(pdf);
  }

  @Get('quotes/:id')
  quote(@Param('id') id: string) { return this.svc.findQuote(id); }

  @Post('quotes')
  @HqRoles(HqRole.Operator)
  createQuote(@Body() dto: CreateBusinessQuoteDto) { return this.svc.createQuote(dto); }

  @Patch('quotes/:id')
  @HqRoles(HqRole.Operator)
  updateQuote(@Param('id') id: string, @Body() dto: UpdateBusinessQuoteDto) { return this.svc.updateQuote(id, dto); }

  @Post('quotes/:id/convert-to-invoice')
  @HqRoles(HqRole.Operator)
  convertQuote(@Param('id') id: string, @Body() dto: ConvertQuoteToInvoiceDto) { return this.svc.convertQuote(id, dto); }

  @Get('invoices/:id/pdf')
  async invoicePdf(@Param('id') id: string, @Res() response: Response) {
    const pdf = await this.svc.invoicePdf(id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `inline; filename="facture-${id}.pdf"`);
    response.send(pdf);
  }

  @Get('invoices/:id/receipt-pdf')
  async receiptPdf(@Param('id') id: string, @Res() response: Response) {
    const pdf = await this.svc.receiptPdf(id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `inline; filename="recu-${id}.pdf"`);
    response.send(pdf);
  }

  @Get('documents')
  documents(@Query('entityType') entityType?: BusinessDocumentEntityType, @Query('entityId') entityId?: string) {
    return this.svc.listDocuments(entityType, entityId);
  }

  @Post('documents')
  @HqRoles(HqRole.Operator)
  createDocument(@Body() dto: CreateBusinessDocumentDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.svc.createDocument(dto, user?.email);
  }

  @Delete('documents/:id')
  @HttpCode(204)
  @HqRoles(HqRole.Operator)
  async removeDocument(@Param('id') id: string) { await this.svc.removeDocument(id); }

  @Get('reminders')
  reminders(@Query('includeDone') includeDone?: string) { return this.svc.listReminders(includeDone === 'true'); }

  @Post('reminders')
  @HqRoles(HqRole.Operator)
  createReminder(@Body() dto: CreateBusinessReminderDto) { return this.svc.createReminder(dto); }

  @Patch('reminders/:id')
  @HqRoles(HqRole.Operator)
  updateReminder(@Param('id') id: string, @Body() dto: UpdateBusinessReminderDto) { return this.svc.updateReminder(id, dto); }

  @Get('time-entries')
  timeEntries(@Query('projectId') projectId?: string) { return this.svc.listTimeEntries(projectId); }

  @Get('time-summary')
  timeSummary(@Query('projectId') projectId?: string) { return this.svc.timeSummary(projectId); }

  @Post('time-entries')
  @HqRoles(HqRole.Operator)
  createTimeEntry(@Body() dto: CreateProjectTimeEntryDto) { return this.svc.createTimeEntry(dto); }

  @Patch('time-entries/:id')
  @HqRoles(HqRole.Operator)
  updateTimeEntry(@Param('id') id: string, @Body() dto: UpdateProjectTimeEntryDto) { return this.svc.updateTimeEntry(id, dto); }

  @Get('cashflow')
  cashflow(@Query() query: CashflowQueryDto) { return this.svc.cashflow(query); }
}
