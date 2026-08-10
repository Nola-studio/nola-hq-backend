import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StudioRecurringService } from './studio-recurring.service';
import { CreateRecurringDto } from './dto/create-recurring.dto';
import { UpdateRecurringDto } from './dto/update-recurring.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

@ApiBearerAuth()
@ApiTags('studio')
@Controller('studio/recurring')
export class StudioRecurringController {
  constructor(private readonly svc: StudioRecurringService) {}

  @Get()
  @HqRoles(HqRole.Viewer)
  findAll() {
    return this.svc.findAll();
  }

  @Post()
  @HqRoles(HqRole.Operator)
  create(@Body() dto: CreateRecurringDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @HqRoles(HqRole.Operator)
  update(@Param('id') id: string, @Body() dto: UpdateRecurringDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @HqRoles(HqRole.Operator)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
