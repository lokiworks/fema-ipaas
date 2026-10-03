import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { feishuContacts } from '../common/contacts';

export const getUser = createAction({
  auth: feishuAuth,
  name: 'get_user',
  displayName: 'Get Employee',
  description: 'Read the department, manager, job title and suspension state of a Feishu account',
  audience: 'both',
  classification: 'READ',
  aiMetadata: {
    description:
      'Read one Feishu/Lark member by open_id and return their departments, manager, job title and whether the account is suspended or resigned. Pick this to check what Feishu really holds after a provisioning, transfer or suspension step, or to branch on the current state of an account. It only reads, and needs the permission to read contact user information.',
    idempotent: true,
  },
  props: {
    openId: Property.ShortText({
      displayName: 'Member Open ID',
      description: 'The open_id of the member to read, from Find User or Provision Employee Account.',
      required: true,
    }),
    departmentId: Property.ShortText({
      displayName: 'Department ID Format',
      description: 'Optional. Give a department ID of the format you work with, for example one starting with od-, and the departments come back in that format. Empty returns open_department_id values.',
      required: false,
    }),
  },
  async run(context) {
    const { openId, departmentId } = context.propsValue;
    return feishuContacts.getUser({ auth: context.auth, input: { openId, departmentId } });
  },
});
