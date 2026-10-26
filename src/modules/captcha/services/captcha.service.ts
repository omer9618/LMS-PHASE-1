import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '../../../common/context/request-context';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { CAPTCHA_VERIFIER, CaptchaVerifier } from '../adapters/captcha-verifier';

/** Captcha protection for public forms (#18). */
@Injectable()
export class CaptchaService {
  constructor(@Inject(CAPTCHA_VERIFIER) private readonly verifier: CaptchaVerifier) {}

  async assertHuman(token: string | undefined): Promise<void> {
    const ok = token ? await this.verifier.verify(token, RequestContext.get().ipAddress) : false;
    if (!ok) throw new AppException(ErrorCode.CAPTCHA_FAILED);
  }
}
