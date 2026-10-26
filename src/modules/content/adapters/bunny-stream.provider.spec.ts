import { createHash, createHmac } from 'node:crypto';
import { BunnyStreamProvider } from './bunny-stream.provider';

const config = {
  libraryId: '759',
  apiKey: 'library-api-key',
  readOnlyApiKey: 'read-only-key',
  tokenAuthKey: 'token-auth-key',
};
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const json = (status: number, body: unknown) =>
  jest.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('BunnyStreamProvider (per bunny.net/docs)', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-26T12:00:00Z')));
  afterEach(() => jest.useRealTimers());
  const now = Math.floor(new Date('2026-10-26T12:00:00Z').getTime() / 1000);

  it('creates the video with AccessKey and signs the TUS upload as sha256(library+key+expires+id)', async () => {
    const fetchImpl = json(200, { guid: 'abc-123' });
    const { providerVideoId, upload } = await new BunnyStreamProvider(
      config,
      fetchImpl,
    ).createUpload('Lesson 1', 3600);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://video.bunnycdn.com/library/759/videos');
    expect(init.method).toBe('POST');
    expect(init.headers.AccessKey).toBe('library-api-key');
    expect(JSON.parse(init.body)).toEqual({ title: 'Lesson 1' });

    expect(providerVideoId).toBe('abc-123');
    expect(upload.endpoint).toBe('https://video.bunnycdn.com/tusupload');
    expect(upload.headers).toEqual({
      AuthorizationSignature: sha256(`759library-api-key${now + 3600}abc-123`),
      AuthorizationExpire: String(now + 3600),
      VideoId: 'abc-123',
      LibraryId: '759',
    });
  });

  it('reads processing state and duration in seconds', async () => {
    const provider = new BunnyStreamProvider(config, json(200, { status: 4, length: 754 }));
    await expect(provider.getState('abc')).resolves.toEqual({
      status: 'READY',
      durationSeconds: 754,
    });
    const processing = new BunnyStreamProvider(config, json(200, { status: 3, length: 0 }));
    await expect(processing.getState('abc')).resolves.toEqual({
      status: 'PROCESSING',
      durationSeconds: null,
    });
  });

  it('fails loudly on API errors', async () => {
    await expect(
      new BunnyStreamProvider(config, json(401, {})).createUpload('x', 60),
    ).rejects.toThrow(/HTTP 401/);
  });

  it('signs embed URLs as sha256(tokenKey + videoId + expires) with expires in seconds', () => {
    const url = new URL(new BunnyStreamProvider(config).embedUrl('abc-123', 3600));
    expect(url.origin + url.pathname).toBe('https://player.mediadelivery.net/embed/759/abc-123');
    expect(url.searchParams.get('expires')).toBe(String(now + 3600));
    expect(url.searchParams.get('token')).toBe(sha256(`token-auth-key${'abc-123'}${now + 3600}`));
  });

  describe('webhooks', () => {
    const provider = new BunnyStreamProvider(config);
    const body = Buffer.from(JSON.stringify({ VideoLibraryId: 759, VideoGuid: 'abc', Status: 3 }));
    const headers = (signature: string) => ({
      'x-bunnystream-signature-version': 'v1',
      'x-bunnystream-signature-algorithm': 'hmac-sha256',
      'x-bunnystream-signature': signature,
    });
    const valid = createHmac('sha256', 'read-only-key').update(body).digest('hex');

    it('accepts a correctly signed event and maps the status', () => {
      expect(provider.parseWebhook(body, headers(valid))).toEqual({
        providerVideoId: 'abc',
        status: 'READY',
      });
    });

    it('rejects bad signatures, wrong versions and other libraries', () => {
      expect(provider.parseWebhook(body, headers('0'.repeat(64)))).toBeNull();
      expect(
        provider.parseWebhook(body, { ...headers(valid), 'x-bunnystream-signature-version': 'v2' }),
      ).toBeNull();
      const other = Buffer.from(JSON.stringify({ VideoLibraryId: 1, VideoGuid: 'abc', Status: 3 }));
      const otherSig = createHmac('sha256', 'read-only-key').update(other).digest('hex');
      expect(provider.parseWebhook(other, headers(otherSig))).toBeNull();
    });
  });
});
