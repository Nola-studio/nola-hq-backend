import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { HqRole } from '../common/auth/hq-role.enum';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { BusinessService } from './business.service';
import {
  CreateBusinessClientDto,
  CreateBusinessContractDto,
  CreateBusinessExpenseDto,
  CreateBusinessInvoiceDto,
  CreateBusinessOpportunityDto,
  MarkInvoicePaidDto,
  UpdateBusinessClientDto,
  UpdateBusinessContractDto,
  UpdateBusinessExpenseDto,
  UpdateBusinessInvoiceDto,
  UpdateBusinessOpportunityDto,
  UpsertProjectBudgetDto,
  ListProjectPortfolioDto,
} from './dto/business.dto';

@ApiBearerAuth()
@ApiTags('business')
@Controller('business')
export class BusinessController {
  constructor(private readonly svc: BusinessService) {}

  @Get('dashboard')
  dashboard(@Query('projectId') projectId?: string) {
    return this.svc.dashboard(projectId);
  }

  @Get('project-profitability')
  projectProfitability() {
    return this.svc.projectProfitability();
  }

  @Get('project-portfolio')
  @ApiQuery({ name: 'scope', required: false, enum: ['project', 'initiative'] })
  projectPortfolio(@Query() query: ListProjectPortfolioDto) {
    return this.svc.projectPortfolio(query.scope);
  }

  @Get('clients')
  clients(@Query('status') status?: string) {
    return this.svc.listClients(status);
  }

  @Post('clients')
  @HqRoles(HqRole.Operator)
  createClient(@Body() dto: CreateBusinessClientDto) {
    return this.svc.createClient(dto);
  }

  @Patch('clients/:id')
  @HqRoles(HqRole.Operator)
  updateClient(@Param('id') id: string, @Body() dto: UpdateBusinessClientDto) {
    return this.svc.updateClient(id, dto);
  }

  @Get('opportunities/board')
  opportunityBoard() {
    return this.svc.opportunityBoard();
  }

  @Get('opportunities')
  opportunities(
    @Query('clientId') clientId?: string,
    @Query('projectId') projectId?: string,
    @Query('stage') stage?: string,
  ) {
    return this.svc.listOpportunities({ clientId, projectId, stage });
  }

  @Post('opportunities')
  @HqRoles(HqRole.Operator)
  createOpportunity(@Body() dto: CreateBusinessOpportunityDto) {
    return this.svc.createOpportunity(dto);
  }

  @Patch('opportunities/:id')
  @HqRoles(HqRole.Operator)
  updateOpportunity(@Param('id') id: string, @Body() dto: UpdateBusinessOpportunityDto) {
    return this.svc.updateOpportunity(id, dto);
  }

  @Get('contracts')
  contracts(
    @Query('clientId') clientId?: string,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.listContracts({ clientId, projectId, status });
  }

  @Post('contracts')
  @HqRoles(HqRole.Operator)
  createContract(@Body() dto: CreateBusinessContractDto) {
    return this.svc.createContract(dto);
  }

  @Patch('contracts/:id')
  @HqRoles(HqRole.Operator)
  updateContract(@Param('id') id: string, @Body() dto: UpdateBusinessContractDto) {
    return this.svc.updateContract(id, dto);
  }

  @Get('budgets/:projectId')
  budget(@Param('projectId') projectId: string) {
    return this.svc.getBudget(projectId);
  }

  @Put('budgets/:projectId')
  @HqRoles(HqRole.Operator)
  upsertBudget(@Param('projectId') projectId: string, @Body() dto: UpsertProjectBudgetDto) {
    return this.svc.upsertBudget(projectId, dto);
  }

  @Get('expenses')
  expenses(@Query('projectId') projectId?: string) {
    return this.svc.listExpenses(projectId);
  }

  @Post('expenses')
  @HqRoles(HqRole.Operator)
  createExpense(@Body() dto: CreateBusinessExpenseDto) {
    return this.svc.createExpense(dto);
  }

  @Patch('expenses/:id')
  @HqRoles(HqRole.Operator)
  updateExpense(@Param('id') id: string, @Body() dto: UpdateBusinessExpenseDto) {
    return this.svc.updateExpense(id, dto);
  }

  @Get('invoices')
  invoices(@Query('projectId') projectId?: string, @Query('clientId') clientId?: string) {
    return this.svc.listInvoices(projectId, clientId);
  }

  @Post('invoices')
  @HqRoles(HqRole.Operator)
  createInvoice(@Body() dto: CreateBusinessInvoiceDto) {
    return this.svc.createInvoice(dto);
  }

  @Patch('invoices/:id')
  @HqRoles(HqRole.Operator)
  updateInvoice(@Param('id') id: string, @Body() dto: UpdateBusinessInvoiceDto) {
    return this.svc.updateInvoice(id, dto);
  }

  @Post('invoices/:id/mark-paid')
  @HqRoles(HqRole.Operator)
  markInvoicePaid(@Param('id') id: string, @Body() dto: MarkInvoicePaidDto) {
    return this.svc.markPaid(id, dto);
  }
}
