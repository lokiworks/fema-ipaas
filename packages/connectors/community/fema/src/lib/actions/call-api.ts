import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { femaAuth } from '../auth';
import { femaCommon } from '../common';

export const callApi = createAction({
  auth: femaAuth,
  name: 'call_api',
  displayName: 'Call FEMA API',
  description: 'Call any FEMA API as the connection application; the access token is added for you',
  audience: 'both',
  classification: 'WRITE',
  aiMetadata: {
    description:
      'Send a GET or POST request to a FEMA capability address such as rental-agreement/contract/find-all, signed in as the connection application of this tenant. Use it for anything the other FEMA steps do not cover. The data field of a FEMA response is returned; a response whose code is not SUCCESS fails the step. A POST may change data, so it is not safe to retry blindly.',
    idempotent: false,
  },
  reliability: { writeSafety: 'UNSAFE', rateLimits: [{ bucket: 'fema-api', scope: 'TENANT', perSecond: 20 }] },
  props: {
    method: Property.StaticDropdown({
      displayName: 'Method',
      description: 'FEMA uses GET for reads without a body and POST for everything else.',
      required: true,
      defaultValue: HttpMethod.POST,
      options: {
        options: [
          { label: 'POST', value: HttpMethod.POST },
          { label: 'GET', value: HttpMethod.GET },
        ],
      },
    }),
    path: Property.ShortText({
      displayName: 'Path',
      description: 'The capability address after the API URL, for example rental-agreement/contract/find-all.',
      required: true,
    }),
    queryParams: Property.Object({
      displayName: 'Query Parameters',
      required: false,
    }),
    body: Property.Json({
      displayName: 'Body',
      description: 'JSON body of a POST request.',
      required: false,
    }),
  },
  async run(context) {
    const path = context.propsValue.path.trim();
    if (path.length === 0 || path.includes('://') || path.split('/').includes('..')) {
      throw new Error(`接口路径「${path}」不对，只填 API URL 之后的部分，例如 rental-agreement/contract/find-all`);
    }
    const method = context.propsValue.method === HttpMethod.GET ? HttpMethod.GET : HttpMethod.POST;
    const queryParams = Object.fromEntries(
      Object.entries(context.propsValue.queryParams ?? {})
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]),
    );
    return femaCommon.call({
      auth: context.auth,
      method,
      path,
      queryParams,
      ...(method === HttpMethod.POST ? { body: context.propsValue.body ?? {} } : {}),
    });
  },
});
