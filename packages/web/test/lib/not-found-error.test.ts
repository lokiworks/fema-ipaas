import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { notFoundError } from '@/lib/not-found-error';

function httpError({ status, data }: { status: number; data: unknown }) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('failed', String(status), config, null, {
    status,
    statusText: '',
    headers: {},
    config,
    data,
  });
}

describe('notFoundError.isNotFound', () => {
  it('treats a 404 as not found', () => {
    expect(
      notFoundError.isNotFound(
        httpError({
          status: 404,
          data: { code: 'ENTITY_NOT_FOUND', params: { entityId: 'a' } },
        }),
      ),
    ).toBe(true);
  });

  it('treats a 400 for a malformed id in the URL as not found', () => {
    expect(
      notFoundError.isNotFound(
        httpError({
          status: 400,
          data: {
            statusCode: 400,
            code: 'FST_ERR_VALIDATION',
            error: 'Bad Request',
            message:
              'params/id Invalid string: must match pattern /^[0-9a-zA-Z]{21}$/',
          },
        }),
      ),
    ).toBe(true);
  });

  it('keeps a validation failure on the request body as an error', () => {
    expect(
      notFoundError.isNotFound(
        httpError({
          status: 400,
          data: {
            statusCode: 400,
            code: 'FST_ERR_VALIDATION',
            message: 'body/displayName Too small',
          },
        }),
      ),
    ).toBe(false);
  });

  it('keeps server errors and non HTTP errors as errors', () => {
    expect(notFoundError.isNotFound(httpError({ status: 500, data: {} }))).toBe(
      false,
    );
    expect(notFoundError.isNotFound(new Error('boom'))).toBe(false);
    expect(notFoundError.isNotFound(null)).toBe(false);
  });
});
