import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NolaSdkModule } from '@nola-hq/nola-sdk';
import { Invoice } from './invoice.entity';
import { Product } from '../company/product.entity';
import { BusinessModule } from '../business/business.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PaymentEventsListener } from './payment-events.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, Product]),
    NolaSdkModule,
    BusinessModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService, PaymentEventsListener],
  exports: [InvoicesService],
})
export class InvoicesModule {}
