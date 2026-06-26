import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NolaSdkModule } from '@nola-hq/nola-sdk';
import { Broadcast } from './broadcast.entity';
import { BroadcastController } from './broadcast.controller';
import { BroadcastService } from './broadcast.service';

@Module({
  imports: [TypeOrmModule.forFeature([Broadcast]), NolaSdkModule],
  controllers: [BroadcastController],
  providers: [BroadcastService],
  exports: [BroadcastService],
})
export class BroadcastModule {}
