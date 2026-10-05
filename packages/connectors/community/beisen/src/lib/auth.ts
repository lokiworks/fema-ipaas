import { ConnectorAuth, Property, tryCatch } from '@fema-ipaas/connector-sdk';

import { beisenCommon } from './common';

export const beisenAuth = ConnectorAuth.CustomAuth({
  description: "**Set up a Beisen connector**\n\n1. In Beisen iTalent, an administrator opens **Enterprise Settings > Authorization Management** and gives the account that will do the setup the **Open Application Connection** tenant-administrator role.\n2. With that account, sign in to the Beisen Open Platform admin console, open **My Connectors**, create a connector and copy its **Key** and **Secret** into the fields below.\n3. In the connector detail, add the interfaces the steps use. For employee data tick both objects **Employee Information** and **Employment Record**, or Beisen answers with a permission error:\n   - Employee Changed trigger, Search Changed Employees: **GetByTimeWindow** (employees with a single employment record)\n   - List Employees Of An Organization: **GetEmployeeOfOrganization**\n   - Get Employment Records: **GetServiceInfoByIds**; Find Employee By Email: **GetUserIDByEmail**\n   - Get Sub Organizations: **GetSubOrganizations** and **GetSubOrganizationTrees**\n   - Get Onboarding Staff: **GetStaffInfos** (recruiting); Find Applicant: **GetApplicantIds**; Get Applicant Resume: **GetResume**\n4. If your Beisen tenant restricts callers, add this server's outbound IP range under **OpenAPI trusted IPs** in the connector.\n5. Beisen limits each enterprise to 3000 calls a minute (the changed-employee query allows less) and, once the limit is hit, refuses the whole tenant until 00:00 the next day, so keep polling modest.\n\nIf **My Connectors** is missing, ask your Beisen project manager to enable Open Platform access. Saving checks the Key and Secret only; a missing interface shows up on the step that needs it.",
  props: {
    appKey: Property.ShortText({
      displayName: 'App Key',
      description: 'The Key of the Beisen connector.',
      required: true,
    }),
    appSecret: ConnectorAuth.SecretText({
      displayName: 'App Secret',
      description: 'The Secret of the Beisen connector.',
      required: true,
    }),
  },
  required: true,
  validate: async ({ auth }) => {
    const { error } = await tryCatch(() =>
      beisenCommon.obtainAccessToken({
        appKey: auth.appKey,
        appSecret: auth.appSecret,
      }),
    );
    if (error) {
      return { valid: false, error: error.message };
    }
    return { valid: true };
  },
});
