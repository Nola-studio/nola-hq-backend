import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BroadcastService } from './broadcast.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../common/auth/current-user.decorator';

@ApiBearerAuth()
@ApiTags('broadcast')
@Controller('broadcasts')
export class BroadcastController {
  constructor(private readonly svc: BroadcastService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateBroadcastDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.svc.create(dto, user.sub);
  }

  @Post(':id/send')
  send(@Param('id') id: string) {
    return this.svc.send(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
