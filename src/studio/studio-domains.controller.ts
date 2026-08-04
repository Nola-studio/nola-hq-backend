import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StudioDomainsService } from './studio-domains.service';
import { CreateDomainDto } from './dto/create-domain.dto';
import { UpdateDomainDto } from './dto/update-domain.dto';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

@ApiBearerAuth()
@ApiTags('studio')
@Controller('studio/domains')
export class StudioDomainsController {
  constructor(private readonly svc: StudioDomainsService) {}

  @Get()
  @HqRoles(HqRole.Viewer)
  findAll() {
    return this.svc.findAll();
  }

  @Post()
  @HqRoles(HqRole.Operator)
  create(@Body() dto: CreateDomainDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @HqRoles(HqRole.Operator)
  update(@Param('id') id: string, @Body() dto: UpdateDomainDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @HqRoles(HqRole.Operator)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
