import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NolaSdkModule } from '@nola-hq/nola-sdk';
import { MomoEntry } from './momo-entry.entity';
import { MomoController } from './momo.controller';
import { MomoService } from './momo.service';

@Module({
  imports: [TypeOrmModule.forFeature([MomoEntry]), NolaSdkModule],
  controllers: [MomoController],
  providers: [MomoService],
  exports: [MomoService],
})
export class MomoModule {}
