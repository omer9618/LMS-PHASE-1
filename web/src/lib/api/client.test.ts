import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { buildUrl, createApiClient } from './client';
import { ApiError, errorMessage, fieldErrors, isApiError } from './errors';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function clientReturning(response: Response | Error | DOMException) {
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    if (!(response instanceof Response)) throw response;
    return response;
  });
  return { client: createApiClient({ baseUrl: '/api', fetchImpl }), fetchImpl };
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected the promise to reject');
}

describe('createApiClient with a schema', () => {
  const thing = z.object({ id: z.string(), count: z.number() });

  it('resolves with the parsed data, dropping fields the schema does not name', async () => {
    const { client } = clientReturning(
      jsonResponse(200, { success: true, data: { id: 'a', count: 2, extra: true } }),
    );
    await expect(client.get('/things/a', thing)).resolves.toEqual({ id: 'a', count: 2 });
  });

  it('turns a shape mismatch into BAD_RESPONSE with the issues', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = clientReturning(
      jsonResponse(
        200,
        { success: true, data: { id: 'a', count: '2' } },
        { 'x-request-id': 'r-1' },
      ),
    );
    const error = await caught(client.get('/things/a', thing));
    expect(error.name).toBe('BAD_RESPONSE');
    expect(error.requestId).toBe('r-1');
    expect(Array.isArray(error.info)).toBe(true);
  });

  it('passes query and signal after the schema, and the body after it on writes', async () => {
    // A fresh response per call: a body can be read only once.
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(200, { success: true, data: { id: 'a', count: 1 } }),
    );
    const client = createApiClient({ baseUrl: '/api', fetchImpl });
    await client.get('/things', thing, { q: 'x' });
    expect(fetchImpl.mock.calls[0]![0]).toBe('/api/things?q=x');
    await client.post('/things', thing, { name: 'n' });
    expect(fetchImpl.mock.calls[1]![1]!.body).toBe(JSON.stringify({ name: 'n' }));
  });

  it('still accepts calls without a schema (areas not moved yet)', async () => {
    const { client } = clientReturning(jsonResponse(200, { success: true, data: { any: 1 } }));
    await expect(client.post<{ any: number }>('/x', { body: 1 })).resolves.toEqual({ any: 1 });
  });
});

describe('buildUrl', () => {
  it('joins base and path and drops empty query values', () => {
    expect(
      buildUrl('/api/', 'catalogue/courses', { q: 'phy', free: undefined, x: null, y: '' }),
    ).toBe('/api/catalogue/courses?q=phy');
    expect(buildUrl('/api', '/auth/me')).toBe('/api/auth/me');
    expect(buildUrl('/api', '/x', { limit: 24, ok: true })).toBe('/api/x?limit=24&ok=true');
  });

  it('encodes query values', () => {
    expect(buildUrl('/api', '/x', { q: 'a&b c' })).toBe('/api/x?q=a%26b+c');
  });
});

describe('createApiClient', () => {
  it('unwraps data from a success envelope', async () => {
    const { client, fetchImpl } = clientReturning(
      jsonResponse(200, { success: true, data: { id: 'u1' } }),
    );
    await expect(client.get<{ id: string }>('/auth/me')).resolves.toEqual({ id: 'u1' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('/api/auth/me');
    expect(init?.method).toBe('GET');
    expect(init?.credentials).toBe('same-origin');
    expect(init?.body).toBeUndefined();
  });

  it('resolves null data (e.g. logout)', async () => {
    const { client } = clientReturning(jsonResponse(200, { success: true, data: null }));
    await expect(client.post('/auth/logout')).resolves.toBeNull();
  });

  it('sends JSON bodies on POST', async () => {
    const { client, fetchImpl } = clientReturning(jsonResponse(200, { success: true, data: {} }));
    await client.post('/auth/login', { email: 'a@b.c', password: 'x' });
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ email: 'a@b.c', password: 'x' }));
    expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('sends FormData as multipart, letting the browser set the boundary', async () => {
    const { client, fetchImpl } = clientReturning(jsonResponse(200, { success: true, data: {} }));
    const form = new FormData();
    form.append('name', 'x');
    await client.postForm('/teacher-applications', form);
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(form);
    expect((init?.headers as Record<string, string>)['content-type']).toBeUndefined();
  });

  it('has PATCH, PUT and DELETE helpers', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(200, { success: true, data: {} }),
    );
    const client = createApiClient({ baseUrl: '/api', fetchImpl });
    await client.patch('/a', { title: 'x' });
    await client.put('/b', { ids: [] });
    await client.delete('/c');
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init?.method, init?.body])).toEqual([
      ['/api/a', 'PATCH', '{"title":"x"}'],
      ['/api/b', 'PUT', '{"ids":[]}'],
      ['/api/c', 'DELETE', undefined],
    ]);
  });

  it('turns an error envelope into a typed ApiError', async () => {
    const { client } = clientReturning(
      jsonResponse(
        401,
        {
          success: false,
          error: {
            name: 'INVALID_CREDENTIALS',
            message: 'Wrong email or password',
            info: { a: 1 },
          },
        },
        { 'x-request-id': 'req-1' },
      ),
    );
    const error = await caught(client.post('/auth/login', {}));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.name).toBe('INVALID_CREDENTIALS');
    expect(error.message).toBe('Wrong email or password');
    expect(error.info).toEqual({ a: 1 });
    expect(error.status).toBe(401);
    expect(error.requestId).toBe('req-1');
    expect(error.is('INVALID_CREDENTIALS')).toBe(true);
    expect(isApiError(error, 'INVALID_CREDENTIALS')).toBe(true);
    expect(isApiError(error, 'NOT_FOUND')).toBe(false);
  });

  it('reports a network failure as NETWORK_ERROR', async () => {
    const { client } = clientReturning(new TypeError('Failed to fetch'));
    const error = await caught(client.get('/x'));
    expect(error.name).toBe('NETWORK_ERROR');
    expect(error.status).toBe(0);
  });

  it('lets an abort propagate untouched', async () => {
    const { client } = clientReturning(new DOMException('aborted', 'AbortError'));
    await expect(client.get('/x')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reports a non-envelope answer as BAD_RESPONSE', async () => {
    const { client } = clientReturning(new Response('<html>Bad gateway</html>', { status: 502 }));
    const error = await caught(client.get('/x'));
    expect(error.name).toBe('BAD_RESPONSE');
    expect(error.status).toBe(502);
  });

  it('keeps error codes the client does not know yet', async () => {
    const { client } = clientReturning(
      jsonResponse(409, { success: false, error: { name: 'SOMETHING_NEW', message: 'New' } }),
    );
    const error = await caught(client.get('/x'));
    expect(error.name).toBe('SOMETHING_NEW');
  });
});

describe('fieldErrors', () => {
  it('maps Zod issues by path, first message wins', () => {
    const error = new ApiError('VALIDATION_FAILED', 'Request validation failed', {
      info: {
        location: 'body',
        issues: [
          { path: 'email', code: 'invalid_format', message: 'Invalid email address' },
          { path: 'email', code: 'too_big', message: 'second' },
          { path: 'guardianPhone', code: 'invalid_format', message: 'Must be a phone number' },
        ],
      },
    });
    expect(fieldErrors(error)).toEqual({
      email: 'Invalid email address',
      guardianPhone: 'Must be a phone number',
    });
  });

  it('maps a domain rule that names one field', () => {
    const error = new ApiError('VALIDATION_FAILED', 'Password is too repetitive', {
      info: { field: 'password' },
    });
    expect(fieldErrors(error)).toEqual({ password: 'Password is too repetitive' });
  });

  it('is empty for other errors and junk info', () => {
    expect(fieldErrors(new ApiError('NOT_FOUND', 'x'))).toEqual({});
    expect(fieldErrors(new ApiError('VALIDATION_FAILED', 'x', { info: 'nope' }))).toEqual({});
    expect(fieldErrors(new Error('x'))).toEqual({});
  });
});

describe('errorMessage', () => {
  it('uses the API message, with friendly text for transport problems', () => {
    expect(errorMessage(new ApiError('CONFLICT', 'Email already registered'))).toBe(
      'Email already registered',
    );
    expect(errorMessage(new ApiError('NETWORK_ERROR', 'x'))).toMatch(/could not reach/i);
    expect(errorMessage(new ApiError('RATE_LIMITED', 'x'))).toMatch(/too many/i);
    expect(errorMessage(new Error('boom'))).toMatch(/something went wrong/i);
  });
});
