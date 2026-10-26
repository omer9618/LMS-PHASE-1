/** Checks a captcha token produced by the browser widget. */
export interface CaptchaVerifier {
  verify(token: string, remoteIp?: string): Promise<boolean>;
}

export const CAPTCHA_VERIFIER = Symbol('CAPTCHA_VERIFIER');
