import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CountriesService } from './countries.service';

@ApiBearerAuth()
@ApiTags('countries')
@Controller('countries')
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
