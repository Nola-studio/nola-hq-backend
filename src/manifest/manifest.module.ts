import { Global, Module } from '@nestjs/common';
import { ManifestService } from './manifest.service';
import { ManifestController } from './manifest.controller';

@Global()
@Module({
  controllers: [ManifestController],
  providers: [ManifestService],
  exports: [ManifestService],
})
export class ManifestModule {}
