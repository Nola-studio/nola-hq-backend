import { Module } from '@nestjs/common';
import { AssistController } from './assist.controller';
import { AssistService } from './assist.service';
import { HandoffStore } from './handoff.store';
import { TenantsModule } from '../tenants/tenants.module';
import { IamModule } from '../iam/iam.module';
import { DirectoryModule } from '../directory/directory.module';

@Module({
  imports: [TenantsModule, IamModule, DirectoryModule],
  controllers: [AssistController],
  providers: [AssistService, HandoffStore],
})
export class AssistModule {}
