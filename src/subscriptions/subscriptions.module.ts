import { Module } from '@nestjs/common';
import { NolaSdkModule } from '@nola-hq/nola-sdk';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [NolaSdkModule, ActivityModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
