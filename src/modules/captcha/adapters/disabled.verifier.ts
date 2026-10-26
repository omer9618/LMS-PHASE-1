import type { CaptchaVerifier } from './captcha-verifier';

/** The one token the disabled verifier rejects, so tests can exercise the failure path. */
export const DISABLED_CAPTCHA_REJECT_TOKEN = 'invalid-captcha';

/** Development and tests only (refused in production by the env schema). */
export class DisabledCaptchaVerifier implements CaptchaVerifier {
  async verify(token: string): Promise<boolean> {
    return token.length > 0 && token !== DISABLED_CAPTCHA_REJECT_TOKEN;
  }
}
