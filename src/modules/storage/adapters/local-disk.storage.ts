import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { ObjectStorage } from './object-storage';

export interface LocalFileToken {
  key: string;
  filename: string;
  contentType: string;
  expiresAt: number;
}

/**
 * Development and tests only (refused in production by the env schema). Stores files under a
 * directory and serves them through `/dev-files/:token`, where the token is an HMAC-signed,
 * expiring description of the file, mirroring how S3 presigned URLs behave.
 */
export class LocalDiskStorage implements ObjectStorage {
  private readonly root: string;

  constructor(
    rootDir: string,
    private readonly signingSecret: string,
    private readonly apiPublicUrl: string,
  ) {
    this.root = resolve(rootDir);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async signedDownloadUrl(
    key: string,
    options: { filename: string; contentType: string; expiresInSeconds: number },
  ): Promise<string> {
    const token = this.sign({
      key,
      filename: options.filename,
      contentType: options.contentType,
      expiresAt: Date.now() + options.expiresInSeconds * 1000,
    });
    return new URL(`/dev-files/${token}`, this.apiPublicUrl).toString();
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  /** Verifies a token from a signed URL; null if forged or expired. */
  verify(token: string): LocalFileToken | null {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const expected = this.hmac(payload);
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as LocalFileToken;
      return data.expiresAt > Date.now() ? data : null;
    } catch {
      return null;
    }
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  private sign(data: LocalFileToken): string {
    const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
    return `${payload}.${this.hmac(payload).toString('base64url')}`;
  }

  private hmac(payload: string): Buffer {
    return createHmac('sha256', this.signingSecret).update(payload).digest();
  }

  /** Resolves a key inside the root, refusing path traversal. */
  private pathFor(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error(`Invalid storage key: ${key}`);
    return path;
  }
}
