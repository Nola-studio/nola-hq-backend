import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessInvoice } from '../business/business-invoice.entity';
import { VerifyController } from './verify.controller';
import { VerifyService } from './verify.service';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessInvoice])],
  controllers: [VerifyController],
  providers: [VerifyService],
})
export class VerifyModule {}
