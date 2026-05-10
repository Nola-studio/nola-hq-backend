import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AppsService } from './apps.service';
import { UpdateAppDto } from './dto/update-app.dto';

@ApiBearerAuth()
@ApiTags('apps')
@Controller('apps')
export class AppsController {
  constructor(private readonly svc: AppsService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAppDto) {
    return this.svc.update(id, dto);
  }
}
