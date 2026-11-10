import { api } from './client';
import * as schema from './schemas/auth';
import { ignored } from './schemas/common';

/** Sign-in, registration, password reset and two-step verification. */
export const authApi = {
  login: (body: { email: string; password: string }) =>
    api.post('/auth/login', schema.loginResult, body),
  loginWithMfa: (body: { challengeToken: string; code?: string; recoveryCode?: string }) =>
    api.post('/auth/login/mfa', ignored, body),
  register: (body: unknown) => api.post('/auth/register', ignored, body),
  resendVerification: () => api.post('/auth/verify-email/resend', schema.resendVerification),
  requestPasswordReset: (email: string) =>
    api.post('/auth/password-reset/request', ignored, { email }),
  confirmPasswordReset: (body: { token: string; password: string }) =>
    api.post('/auth/password-reset/confirm', ignored, body),
  mfaStatus: (signal?: AbortSignal) => api.get('/auth/mfa', schema.mfaStatus, undefined, signal),
  mfaSetup: () => api.post('/auth/mfa/setup', schema.mfaSetup),
  mfaEnable: (code: string) => api.post('/auth/mfa/enable', schema.recoveryCodes, { code }),
  newRecoveryCodes: (code: string) =>
    api.post('/auth/mfa/recovery-codes', schema.recoveryCodes, { code }),
};
