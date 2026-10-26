import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditModule } from '../audit/audit.module';
import { AccountController } from './controllers/account.controller';
import { AuthController } from './controllers/auth.controller';
import { AuthTokenDao } from './dao/auth-token.dao';
import { SessionDao } from './dao/session.dao';
import { UserDao } from './dao/user.dao';
import { AccountService } from './services/account.service';
import { AuthService } from './services/auth.service';
import { SessionCookie } from './session-cookie';

@Module({
  imports: [AuditModule],
  controllers: [AuthController, AccountController],
  providers: [
    AuthService,
    AccountService,
    SessionCookie,
    SessionDao,
    UserDao,
    AuthTokenDao,
    // Global guards, in this order: authenticate, then check roles.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  // Contract: other modules may use AuthService only.
  exports: [AuthService],
})
export class AuthModule {}
