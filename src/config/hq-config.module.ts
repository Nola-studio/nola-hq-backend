import { Global, Module } from '@nestjs/common';
import { HqConfigService } from './hq-config.service';

@Global()
@Module({
  providers: [HqConfigService],
  exports: [HqConfigService],
})
export class HqConfigModule {}
