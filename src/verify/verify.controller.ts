import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/auth/public.decorator';
import { VerifyService } from './verify.service';

@ApiTags('verify')
@Controller('verify')
export class VerifyController {
  constructor(private readonly svc: VerifyService) {}

  @Public()
  // Public + the token is the only secret in play — cap lookups well under
  // the 120/min baseline so token-guessing isn't cheap.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('receipt/:token')
  verifyReceipt(@Param('token') token: string) {
    return this.svc.verifyReceipt(token);
  }
}
