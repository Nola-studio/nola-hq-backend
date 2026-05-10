import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TeamMember } from '../team/team-member.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CookieConfigService } from './cookie-config';
import { SessionCipherService } from './session-cipher.service';
import { SessionStoreService } from './session-store.service';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([TeamMember])],
  controllers: [AuthController],
  providers: [
    AuthService,
    CookieConfigService,
    SessionCipherService,
    SessionStoreService,
    JwtAuthGuard,
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
