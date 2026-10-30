/// <reference types="vitest/globals" />

import http from 'node:http';
import { createMockActionContext } from '@fema-ipaas/connector-sdk';
import { HttpError, HttpMethod } from '@fema-ipaas/connector-common';
import { httpSendRequestAction } from '../src/lib/actions/send-http-request-action';

let server: http.Server;
let baseUrl: string;
let status = 200;
let requestCount = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      requestCount += 1;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: `status ${status}` }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/`;
});

afterAll(() => server.close());

beforeEach(() => {
  status = 200;
  requestCount = 0;
});

const send = (propsValue: Record<string, unknown>) =>
  httpSendRequestAction.run(
    createMockActionContext({
      propsValue: { method: HttpMethod.GET, url: baseUrl, headers: {}, queryParams: {}, ...propsValue },
    })
  );

describe('Send HTTP request failure handling', () => {
  test('leaves retry and the failure branch to the shared error handling page', () => {
    expect(httpSendRequestAction.errorHandlingOptions?.continueOnFailure?.hide ?? false).toBe(false);
    expect(httpSendRequestAction.errorHandlingOptions?.retryOnFailure?.hide ?? false).toBe(false);
  });

  test('orders the inputs method, URL, headers, query params and defaults the method to GET', () => {
    expect(Object.keys(httpSendRequestAction.props).slice(0, 4)).toEqual(['method', 'url', 'headers', 'queryParams']);
    expect(httpSendRequestAction.props.method.defaultValue).toBe(HttpMethod.GET);
  });

  test('only offers the non-legacy failure modes for new steps', () => {
    const selectable = httpSendRequestAction.props.failureMode.options.options
      .filter((option) => option.disabled !== true)
      .map((option) => option.value);
    expect(selectable).toEqual(['continue_none', 'continue_4xx', 'continue_all']);
  });

  test('fails the step once on an error response so the engine can route it', async () => {
    status = 503;
    const error = await send({ failureMode: 'continue_none' }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpError);
    expect(error instanceof HttpError ? error.response.status : null).toBe(503);
    expect(requestCount).toBe(1);
  });

  test('returns 4xx responses as output and fails on 5xx without retrying inside the step', async () => {
    status = 404;
    await expect(send({ failureMode: 'continue_4xx' })).resolves.toMatchObject({ response: { status: 404 } });
    requestCount = 0;
    status = 500;
    await expect(send({ failureMode: 'continue_4xx' })).rejects.toBeInstanceOf(HttpError);
    expect(requestCount).toBe(1);
  });

  test('keeps the legacy in-step retry for steps saved with it', async () => {
    status = 500;
    await expect(send({ failureMode: 'retry_all' })).rejects.toBeInstanceOf(HttpError);
    expect(requestCount).toBe(3);
  });
});
