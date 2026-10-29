import { Property } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from './auth';
import { feishuCommon } from './common';

export const bitableProps = {
  appToken: Property.ShortText({
    displayName: 'Bitable App Token',
    description:
      'Open the Bitable and copy the characters after /base/ in the browser address bar.',
    required: true,
  }),
  tableId: Property.Dropdown({
    displayName: 'Data Table',
    description:
      'Once the App Token above is filled in, the data tables in that Bitable are listed here.',
    auth: feishuAuth,
    required: true,
    refreshers: ['appToken'],
    options: async ({ auth, appToken }) => {
      if (!auth) {
        return { disabled: true, options: [], placeholder: 'Select a Feishu connection first' };
      }
      if (typeof appToken !== 'string' || appToken.length === 0) {
        return { disabled: true, options: [], placeholder: 'Fill in the App Token first' };
      }
      const items = await feishuCommon.collectPages<{ table_id: string; name: string }>({
        auth,
        path: `/open-apis/bitable/v1/apps/${appToken}/tables`,
        queryParams: {},
        pageSize: 100,
        maxItems: 500,
      });
      if (items.length === 0) {
        return { disabled: true, options: [], placeholder: 'This Bitable has no data tables' };
      }
      return {
        disabled: false,
        options: items.map((table) => ({ label: table.name, value: table.table_id })),
      };
    },
  }),
};
