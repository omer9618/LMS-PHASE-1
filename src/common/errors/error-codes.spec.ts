import { ERROR_DEFINITIONS, ErrorCode } from './error-codes';

// The web app keeps its own copy of the error catalogue (web/src/lib/api/errors.ts) so it can
// type and word every error. This keeps the two in step.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const web = require('../../../web/src/lib/api/errors') as {
  ERRORS: Record<string, { status: number }>;
};

const CLIENT_ONLY = ['NETWORK_ERROR', 'BAD_RESPONSE'];

describe('web and API error catalogues', () => {
  it('the web knows every API error code, with the same HTTP status', () => {
    const mismatches = Object.values(ErrorCode).filter(
      (code) => web.ERRORS[code]?.status !== ERROR_DEFINITIONS[code].status,
    );
    expect(mismatches).toEqual([]);
  });

  it('the web lists no code the API does not send, apart from its own client-side ones', () => {
    const api = new Set<string>(Object.values(ErrorCode));
    const extra = Object.keys(web.ERRORS).filter((c) => !api.has(c) && !CLIENT_ONLY.includes(c));
    expect(extra).toEqual([]);
  });
});
