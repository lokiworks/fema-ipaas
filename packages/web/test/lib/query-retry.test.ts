import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { queryRetry } from '@/lib/query-retry';

function httpError(status: number | undefined): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response =
    status === undefined
      ? undefined
      : { status, statusText: '', headers: {}, config, data: {} };
  return new AxiosError('failed', undefined, config, undefined, response);
}

describe('queryRetry.shouldRetry', () => {
  it.each([400, 401, 403, 404, 409, 422])(
    'does not retry a %i answer, because asking again cannot change it',
    (status) => {
      expect(
        queryRetry.shouldRetry({ failureCount: 0, error: httpError(status) }),
      ).toBe(false);
    },
  );

  it.each([408, 429, 500, 502, 503])(
    'retries a %i answer, because it may be transient',
    (status) => {
      expect(
        queryRetry.shouldRetry({ failureCount: 0, error: httpError(status) }),
      ).toBe(true);
    },
  );

  it('retries when no response arrived at all', () => {
    expect(
      queryRetry.shouldRetry({ failureCount: 1, error: httpError(undefined) }),
    ).toBe(true);
  });

  it('retries errors that did not come from axios', () => {
    expect(
      queryRetry.shouldRetry({ failureCount: 0, error: new Error('boom') }),
    ).toBe(true);
  });

  it('gives up after three retries', () => {
    const error = httpError(503);
    expect(queryRetry.shouldRetry({ failureCount: 2, error })).toBe(true);
    expect(queryRetry.shouldRetry({ failureCount: 3, error })).toBe(false);
  });
});
