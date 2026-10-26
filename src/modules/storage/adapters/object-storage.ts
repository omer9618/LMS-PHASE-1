/** Where file bytes live. Files are private; access is always through a short-lived signed URL. */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** A URL that downloads the object until it expires, with the given download filename. */
  signedDownloadUrl(
    key: string,
    options: { filename: string; contentType: string; expiresInSeconds: number },
  ): Promise<string>;
  delete(key: string): Promise<void>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
