import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CountriesService } from './countries.service';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole } from '../common/auth/hq-role.enum';

@ApiBearerAuth()
@ApiTags('countries')
@Controller('countries')
@HqRoles(HqRole.Viewer)
export class CountriesController {
  constructor(private readonly svc: CountriesService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id.toUpperCase());
  }
}
