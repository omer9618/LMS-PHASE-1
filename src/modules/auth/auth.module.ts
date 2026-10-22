import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthController } from './controllers/auth.controller';
import { SessionDao } from './dao/session.dao';
import { UserDao } from './dao/user.dao';
import { AuthService } from './services/auth.service';
import { SessionCookie } from './session-cookie';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionCookie,
    SessionDao,
    UserDao,
    // Global guards, in this order: authenticate, then check roles.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  // Contract: other modules may use AuthService only.
  exports: [AuthService],
})
export class AuthModule {}
