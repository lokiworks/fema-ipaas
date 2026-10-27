/// <reference types="vitest/globals" />

import { httpSendRequestAction } from '../src/lib/actions/send-http-request-action';

describe('Send HTTP request optional props', () => {
  test.each(['headers', 'queryParams'] as const)(
    '%s is optional so a request can be published without it',
    (name) => {
      expect(httpSendRequestAction.props[name].required).toBe(false);
    },
  );

  test.each(['method', 'url', 'authType'] as const)(
    '%s stays required',
    (name) => {
      expect(httpSendRequestAction.props[name].required).toBe(true);
    },
  );
});
