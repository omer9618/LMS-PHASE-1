import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDiskStorage } from './local-disk.storage';

describe('LocalDiskStorage', () => {
  let dir: string;
  let storage: LocalDiskStorage;
  const secret = 'x'.repeat(40);

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'lms-storage-'));
    storage = new LocalDiskStorage(dir, secret, 'http://api.test');
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('round-trips a file through a signed, expiring URL', async () => {
    await storage.put('cv/a.pdf', Buffer.from('%PDF-1.7'));
    const url = await storage.signedDownloadUrl('cv/a.pdf', {
      filename: 'cv.pdf',
      contentType: 'application/pdf',
      expiresInSeconds: 60,
    });
    expect(url.startsWith('http://api.test/dev-files/')).toBe(true);

    const token = url.split('/dev-files/')[1];
    const file = storage.verify(token);
    expect(file).toMatchObject({ key: 'cv/a.pdf', filename: 'cv.pdf' });
    expect((await storage.read('cv/a.pdf')).toString()).toBe('%PDF-1.7');
  });

  it('rejects forged, tampered and expired tokens', async () => {
    const url = await storage.signedDownloadUrl('cv/a.pdf', {
      filename: 'cv.pdf',
      contentType: 'application/pdf',
      expiresInSeconds: 60,
    });
    const token = url.split('/dev-files/')[1];
    const [payload, signature] = token.split('.');

    const otherKey = Buffer.from(
      JSON.stringify({ key: 'cv/other.pdf', filename: 'x', contentType: 'x', expiresAt: 9e15 }),
    ).toString('base64url');
    expect(storage.verify(`${otherKey}.${signature}`)).toBeNull();
    expect(storage.verify(`${payload}.AAAA`)).toBeNull();
    expect(storage.verify('garbage')).toBeNull();

    const other = new LocalDiskStorage(dir, 'y'.repeat(40), 'http://api.test');
    expect(other.verify(token)).toBeNull();

    const expired = await storage.signedDownloadUrl('cv/a.pdf', {
      filename: 'cv.pdf',
      contentType: 'application/pdf',
      expiresInSeconds: -1,
    });
    expect(storage.verify(expired.split('/dev-files/')[1])).toBeNull();
  });

  it('refuses keys that escape the storage directory', async () => {
    await expect(storage.put('../escape.txt', Buffer.from('x'))).rejects.toThrow(
      /Invalid storage key/,
    );
  });
});
