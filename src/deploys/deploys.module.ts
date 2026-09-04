import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Deploy } from './deploy.entity';
import { Ticket } from '../tickets/ticket.entity';
import { DeploysController } from './deploys.controller';
import { DeploysService } from './deploys.service';

@Module({
  imports: [TypeOrmModule.forFeature([Deploy, Ticket])],
  controllers: [DeploysController],
  providers: [DeploysService],
  exports: [DeploysService],
})
export class DeploysModule {}
