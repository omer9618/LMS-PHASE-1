import { describe, expect, it, vi } from 'vitest';
import { encodeMetadata, tusUpload, TusError } from './tus';

const TARGET = {
  endpoint: 'https://video.example/tusupload',
  headers: { AuthorizationSignature: 'sig', VideoId: 'v1' },
  metadata: { title: 'Lesson 1' },
};

/** A fake TUS server that keeps the received bytes. */
function fakeHost(options: { failPatchOnce?: boolean; createStatus?: number } = {}) {
  let received = 0;
  let failed = false;
  const calls: Array<{ method: string; url: string; headers: Record<string, string> }> = [];
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const method = init?.method ?? 'GET';
    calls.push({ method, url, headers });
    if (method === 'POST') {
      return new Response(null, {
        status: options.createStatus ?? 201,
        headers: { Location: '/tusupload/abc' },
      });
    }
    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers: { 'Upload-Offset': String(received) } });
    }
    if (method === 'PATCH') {
      if (options.failPatchOnce && !failed) {
        failed = true;
        // Half the chunk arrived before the connection dropped.
        received += Math.floor((init?.body as Blob).size / 2);
        throw new TypeError('network down');
      }
      expect(Number(headers['Upload-Offset'])).toBe(received);
      received += (init?.body as Blob).size;
      return new Response(null, { status: 204, headers: { 'Upload-Offset': String(received) } });
    }
    return new Response(null, { status: 405 });
  });
  return { fetchImpl, calls, received: () => received };
}

describe('encodeMetadata', () => {
  it('base64-encodes UTF-8 values', () => {
    expect(encodeMetadata({ title: 'Kinematics', filename: 'é.mp4' })).toBe(
      `title ${btoa('Kinematics')},filename ${btoa('Ã©.mp4')}`,
    );
  });
});

describe('tusUpload', () => {
  it('creates the upload, then sends every chunk with the signed headers', async () => {
    const host = fakeHost();
    const file = new File([new Uint8Array(25)], 'clip.mp4', { type: 'video/mp4' });
    const progress = vi.fn();
    const url = await tusUpload(file, TARGET, {
      fetchImpl: host.fetchImpl,
      chunkSize: 10,
      onProgress: progress,
    });

    expect(url).toBe('https://video.example/tusupload/abc');
    expect(host.received()).toBe(25);
    const [create, ...patches] = host.calls;
    expect(create!.method).toBe('POST');
    expect(create!.headers['Upload-Length']).toBe('25');
    expect(create!.headers['Tus-Resumable']).toBe('1.0.0');
    expect(create!.headers.AuthorizationSignature).toBe('sig');
    expect(create!.headers['Upload-Metadata']).toContain(`title ${btoa('Lesson 1')}`);
    expect(create!.headers['Upload-Metadata']).toContain(`filename ${btoa('clip.mp4')}`);
    expect(patches.map((c) => c.headers['Upload-Offset'])).toEqual(['0', '10', '20']);
    expect(patches.every((c) => c.headers.VideoId === 'v1')).toBe(true);
    expect(progress.mock.calls.map(([sent]) => sent)).toEqual([0, 10, 20, 25]);
  });

  it('resumes from the host’s offset after a dropped chunk', async () => {
    const host = fakeHost({ failPatchOnce: true });
    const file = new File([new Uint8Array(20)], 'clip.mp4');
    await tusUpload(file, TARGET, { fetchImpl: host.fetchImpl, chunkSize: 10 });
    expect(host.received()).toBe(20);
    expect(host.calls.some((c) => c.method === 'HEAD')).toBe(true);
  });

  it('fails clearly when the host refuses the upload', async () => {
    const host = fakeHost({ createStatus: 401 });
    const file = new File([new Uint8Array(5)], 'clip.mp4');
    await expect(tusUpload(file, TARGET, { fetchImpl: host.fetchImpl })).rejects.toBeInstanceOf(
      TusError,
    );
  });
});
