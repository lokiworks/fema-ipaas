import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { beisenAuth } from '../auth';
import { beisenOutputSchemas } from '../output-schemas';
import { beisenCommon } from '../common';

export const findEmployeeByEmail = createAction({
  auth: beisenAuth,
  name: 'find_employee_by_email',
  displayName: 'Find Employee By Email',
  description: 'Exchange an employee email for the Beisen user ID',
  audience: 'both',
  outputSchema: beisenOutputSchemas.findEmployeeByEmail,
  classification: 'SEARCH',
  aiMetadata: {
    description:
      'Look up the Beisen user ID of an employee from their email address. Pick this to read an employee back from Beisen by a business key before comparing or writing to another system. The email is lowercased first as Beisen requires; employees whose record is pending approval, approved or effective are found, and found=false comes back when nobody has that email. It reads only.',
    idempotent: true,
  },
  reliability: { rateLimits: [{ bucket: 'beisen-api', scope: 'TENANT', perSecond: 50 }] },
  props: {
    email: Property.ShortText({
      displayName: 'Email',
      description: 'The work or personal email recorded on the employee.',
      required: true,
    }),
  },
  async run(context) {
    const email = context.propsValue.email.trim().toLowerCase();
    const userId = await beisenCommon.callBusinessApi<number | string>({
      auth: context.auth,
      rateLimit: context.rateLimit,
      method: HttpMethod.POST,
      path: '/TenantBaseExternal/api/v5/Employee/GetUserIDByEmail',
      body: { email },
    });
    return { found: userId !== null, user_id: userId };
  },
});
