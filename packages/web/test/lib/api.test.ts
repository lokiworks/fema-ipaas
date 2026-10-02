import { ErrorCode } from '@fema-ipaas/core-utils';
import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { api } from '@/lib/api';

function axiosError({
  status,
  data,
}: {
  status?: number;
  data?: unknown;
}): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response =
    status === undefined
      ? undefined
      : { status, statusText: '', headers: {}, config, data };
  return new AxiosError(
    `Request failed with status code ${status}`,
    undefined,
    config,
    undefined,
    response,
  );
}

describe('api.isApError', () => {
  it('matches the error code of a server response', () => {
    const error = axiosError({
      status: 400,
      data: { code: ErrorCode.VALIDATION, params: {} },
    });
    expect(api.isApError(error, ErrorCode.VALIDATION)).toBe(true);
    expect(api.isApError(error, ErrorCode.ENTITY_NOT_FOUND)).toBe(false);
  });

  it('does not throw when the request never got a response', () => {
    const error = axiosError({});
    expect(api.isApError(error, ErrorCode.VALIDATION)).toBe(false);
  });

  it('does not throw when the response has no body', () => {
    const error = axiosError({ status: 502 });
    expect(api.isApError(error, ErrorCode.VALIDATION)).toBe(false);
  });

  it('rejects errors that did not come from axios', () => {
    expect(api.isApError(new Error('boom'), ErrorCode.VALIDATION)).toBe(false);
  });
});

describe('api.extractServerErrorMessage', () => {
  it('prefers the message the server attached to the error', () => {
    const error = axiosError({
      status: 400,
      data: {
        code: ErrorCode.VALIDATION,
        params: { message: 'Name is taken' },
      },
    });
    expect(api.extractServerErrorMessage(error, 'fallback')).toBe(
      'Name is taken',
    );
  });

  it('uses the fallback instead of the raw axios status line', () => {
    const error = axiosError({ status: 500, data: { statusCode: 500 } });
    expect(api.extractServerErrorMessage(error, 'fallback')).toBe('fallback');
  });

  it('uses the fallback when the request never got a response', () => {
    expect(api.extractServerErrorMessage(axiosError({}), 'fallback')).toBe(
      'fallback',
    );
  });

  it('keeps the message of an ordinary error', () => {
    expect(
      api.extractServerErrorMessage(new Error('Disk is full'), 'fallback'),
    ).toBe('Disk is full');
  });

  it('uses the fallback for values that are not errors', () => {
    expect(api.extractServerErrorMessage('boom', 'fallback')).toBe('fallback');
  });
});
