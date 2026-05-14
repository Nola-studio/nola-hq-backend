import { Module } from '@nestjs/common';
import { NolaSdkModule } from '@nola-hq/nola-sdk';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  imports: [NolaSdkModule],
  controllers: [PlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
