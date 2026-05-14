import { Module } from '@nestjs/common';
import { NolaSdkModule } from '@nola-hq/nola-sdk';
import { ActivityModule } from '../activity/activity.module';
import { IamClientService } from './iam-client.service';
import { IamController } from './iam.controller';
import { IamEventsListener } from './iam-events.listener';

/**
 * IAM admin module — mounts the cross-tenant query controller and the
 * `nola.events.iam.>` listener. The NolaSdkModule is already registered
 * as global in app.module.ts so we re-import it here for clarity (and so
 * IamModule remains self-contained if anyone copies it elsewhere).
 *
 * Activity feed dependency: the events listener writes a row into
 * `activity_events` for every iam event observed on the bus.
 */
@Module({
  imports: [NolaSdkModule, ActivityModule],
  controllers: [IamController],
  providers: [IamClientService, IamEventsListener],
  exports: [IamClientService],
})
export class IamModule {}
