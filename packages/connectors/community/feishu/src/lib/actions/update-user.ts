import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { feishuContacts } from '../common/contacts';

export const updateUser = createAction({
  auth: feishuAuth,
  name: 'update_user',
  displayName: 'Update Employee',
  description: 'Change the department, manager, job title or name of a Feishu account',
  audience: 'both',
  classification: 'WRITE',
  aiMetadata: {
    description:
      'Update an existing Feishu/Lark member in the contact directory: move them to another department, set their direct manager, job title or name. Only the fields you fill in are sent, so empty fields change nothing, and repeating the same call leaves the same result. Replacing the department replaces every department the member is in. Look the member up with Find User first when you only hold an email or mobile number. Needs the "Update contacts" permission, and the department must be inside the app\'s contact scope.',
    idempotent: true,
  },
  props: {
    openId: Property.ShortText({
      displayName: 'Member Open ID',
      description: 'The open_id of the member to update, from Find User or Provision Employee Account.',
      required: true,
    }),
    departmentId: Property.ShortText({
      displayName: 'New Department ID',
      description: 'Replaces the member\'s departments. The department ID shown in the Feishu admin console, or an open_department_id starting with od-. Leave empty to keep the department.',
      required: false,
    }),
    leaderOpenId: Property.ShortText({
      displayName: 'Manager Open ID',
      description: 'The open_id of the new direct manager. Leave empty to keep the manager.',
      required: false,
    }),
    jobTitle: Property.ShortText({
      displayName: 'Job Title',
      required: false,
    }),
    name: Property.ShortText({
      displayName: 'Name',
      required: false,
    }),
  },
  async run(context) {
    const { openId, departmentId, leaderOpenId, jobTitle, name } = context.propsValue;
    return feishuContacts.updateUser({
      auth: context.auth,
      input: { openId, departmentId, leaderOpenId, jobTitle, name },
    });
  },
});
