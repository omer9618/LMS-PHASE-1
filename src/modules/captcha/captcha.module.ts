import { Global, Module } from '@nestjs/common';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { CAPTCHA_VERIFIER, CaptchaVerifier } from './adapters/captcha-verifier';
import { DisabledCaptchaVerifier } from './adapters/disabled.verifier';
import { TurnstileVerifier } from './adapters/turnstile.verifier';
import { CaptchaService } from './services/captcha.service';

@Global()
@Module({
  providers: [
    {
      provide: CAPTCHA_VERIFIER,
      inject: [ENV],
      useFactory: (env: Env): CaptchaVerifier =>
        env.CAPTCHA_PROVIDER === 'turnstile'
          ? new TurnstileVerifier(env.CAPTCHA_SECRET_KEY as string)
          : new DisabledCaptchaVerifier(),
    },
    CaptchaService,
  ],
  exports: [CaptchaService],
})
export class CaptchaModule {}
