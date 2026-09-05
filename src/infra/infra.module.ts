import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RailwayService } from './railway.service';
import { InfraController } from './infra.controller';

@Module({
  imports: [ConfigModule],
  controllers: [InfraController],
  providers: [RailwayService],
  exports: [RailwayService],
})
export class InfraModule {}
