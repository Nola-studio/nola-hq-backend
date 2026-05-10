import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppModuleEntity } from './app-module.entity';
import { AppModulesController } from './app-modules.controller';
import { AppModulesService } from './app-modules.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppModuleEntity])],
  controllers: [AppModulesController],
  providers: [AppModulesService],
  exports: [AppModulesService],
})
export class AppModulesModule {}
