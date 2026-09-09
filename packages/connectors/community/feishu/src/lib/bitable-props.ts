import { HttpMethod } from '@fema-ipaas/connector-common';
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
        return { disabled: true, options: [], placeholder: 'Connect your Feishu app first' };
      }
      if (typeof appToken !== 'string' || appToken.length === 0) {
        return { disabled: true, options: [], placeholder: 'Fill in the App Token first' };
      }
      const data = await feishuCommon.callApi<TableListResponse>({
        auth,
        method: HttpMethod.GET,
        path: `/open-apis/bitable/v1/apps/${appToken}/tables`,
        queryParams: { page_size: '100' },
      });
      const items = data.items ?? [];
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

type TableListResponse = { items?: { table_id: string; name: string }[] };
