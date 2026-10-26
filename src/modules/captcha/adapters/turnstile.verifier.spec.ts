import { TurnstileVerifier } from './turnstile.verifier';

const respond = (status: number, body: unknown) =>
  jest.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('TurnstileVerifier', () => {
  it('posts secret, token and client IP to siteverify and trusts success: true', async () => {
    const fetchImpl = respond(200, { success: true });
    await expect(new TurnstileVerifier('secret', fetchImpl).verify('tok', '1.2.3.4')).resolves.toBe(
      true,
    );
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      secret: 'secret',
      response: 'tok',
      remoteip: '1.2.3.4',
    });
  });

  it('fails closed on success: false, HTTP errors and network failures', async () => {
    await expect(
      new TurnstileVerifier('s', respond(200, { success: false })).verify('t'),
    ).resolves.toBe(false);
    await expect(new TurnstileVerifier('s', respond(500, {})).verify('t')).resolves.toBe(false);
    const broken = jest.fn().mockRejectedValue(new Error('network down'));
    await expect(new TurnstileVerifier('s', broken).verify('t')).resolves.toBe(false);
  });
});
