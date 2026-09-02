import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { StudioExpensesService } from './studio-expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ListExpensesDto } from './dto/list-expenses.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

@ApiBearerAuth()
@ApiTags('studio')
@Controller('studio/expenses')
export class StudioExpensesController {
  constructor(private readonly svc: StudioExpensesService) {}

  @Get()
  @HqRoles(HqRole.Viewer)
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'currency', required: false, type: String })
  @ApiQuery({ name: 'recurring', required: false, type: Boolean })
  findAll(@Query() query: ListExpensesDto) {
    return this.svc.findAll(query);
  }

  @Get('export.csv')
  @HqRoles(HqRole.Viewer)
  @ApiOperation({ summary: 'Export all expenses as CSV' })
  async exportCsv(@Res() res: Response) {
    const csv = await this.svc.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="depenses.csv"');
    res.send(csv);
  }

  @Post('generate-recurring')
  @HqRoles(HqRole.Operator)
  @ApiOperation({ summary: 'Generate concrete monthly expense rows from recurring templates' })
  generateRecurring(@Body('targetDate') targetDate?: string) {
    return this.svc.generateMonthlyRecurring(targetDate);
  }

  @Post()
  @HqRoles(HqRole.Operator)
  create(@Body() dto: CreateExpenseDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @HqRoles(HqRole.Operator)
  update(@Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @HqRoles(HqRole.Operator)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
