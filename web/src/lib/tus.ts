/**
 * A small TUS 1.0 client (creation + core protocol) for direct video uploads (#36). The API hands
 * out an endpoint and signed headers; the file goes from the browser straight to the video host,
 * never through our servers. Chunked, with progress, and resumable after a dropped chunk.
 */

export interface TusTarget {
  endpoint: string;
  /** Sent with every request (the host's upload signature). */
  headers: Record<string, string>;
  metadata: Record<string, string>;
}

export interface TusOptions {
  fetchImpl?: typeof fetch;
  /** Bytes per PATCH. */
  chunkSize?: number;
  /** Retries per chunk after a network or 5xx failure. */
  retries?: number;
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
}

export class TusError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'TusError';
  }
}

const TUS_VERSION = '1.0.0';
export const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;

function base64Utf8(value: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** `Upload-Metadata`: comma-separated `key base64(value)` pairs. */
export function encodeMetadata(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key} ${base64Utf8(value)}`)
    .join(',');
}

function retryable(status: number): boolean {
  return status === 0 || status === 409 || status === 423 || status >= 500;
}

/** Uploads `file` and resolves with the upload URL. */
export async function tusUpload(
  file: Blob & { name?: string; type?: string },
  target: TusTarget,
  options: TusOptions = {},
): Promise<string> {
  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const retries = options.retries ?? 3;
  const base = { ...target.headers, 'Tus-Resumable': TUS_VERSION };

  async function send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(url, { ...init, signal: options.signal });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      return new Response(null, { status: 599 });
    }
  }

  // 1. Create the upload.
  const metadata = { ...target.metadata };
  if (file.name) metadata.filename = file.name;
  if (file.type) metadata.filetype = file.type;
  const created = await send(target.endpoint, {
    method: 'POST',
    headers: {
      ...base,
      'Upload-Length': String(file.size),
      'Upload-Metadata': encodeMetadata(metadata),
    },
  });
  const location = created.headers.get('Location');
  if (created.status !== 201 || !location) {
    throw new TusError(
      `The video host refused the upload (HTTP ${created.status})`,
      created.status,
    );
  }
  const uploadUrl = new URL(location, target.endpoint).toString();

  // 2. Send the bytes, chunk by chunk.
  let offset = 0;
  options.onProgress?.(0, file.size);
  while (offset < file.size) {
    let attempt = 0;
    for (;;) {
      const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
      const res = await send(uploadUrl, {
        method: 'PATCH',
        headers: {
          ...base,
          'Upload-Offset': String(offset),
          'Content-Type': 'application/offset+octet-stream',
        },
        body: chunk,
      });
      const serverOffset = Number(res.headers.get('Upload-Offset'));
      if (res.status === 204 && Number.isFinite(serverOffset) && serverOffset > offset) {
        offset = serverOffset;
        break;
      }
      attempt += 1;
      if (!retryable(res.status) || attempt > retries) {
        throw new TusError(`The video upload failed (HTTP ${res.status})`, res.status);
      }
      // Resume from wherever the host says it got to.
      const head = await send(uploadUrl, { method: 'HEAD', headers: base });
      const resumeAt = Number(head.headers.get('Upload-Offset'));
      if (head.ok && Number.isFinite(resumeAt)) offset = resumeAt;
    }
    options.onProgress?.(offset, file.size);
  }
  return uploadUrl;
}
