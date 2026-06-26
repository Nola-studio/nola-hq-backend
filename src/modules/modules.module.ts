import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModuleOverride } from './module-override.entity';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';
import { AppsModule } from '../apps/apps.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ModuleOverride]),
    // Manifest module catalogue comes from the live registry projection.
    AppsModule,
  ],
  controllers: [ModulesController],
  providers: [ModulesService],
  exports: [ModulesService],
})
export class ModulesModule {}
