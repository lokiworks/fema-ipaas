import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from '../auth';
import { feishuContacts } from '../common/contacts';

export const provisionUser = createAction({
  auth: feishuAuth,
  name: 'provision_user',
  displayName: 'Provision Employee Account',
  description: 'Create a Feishu account in a department, or return the existing one when the mobile or email is already in use',
  audience: 'both',
  classification: 'WRITE',
  aiMetadata: {
    description:
      'Onboard an employee into the Feishu/Lark contact directory under a given department. Safe to repeat: when a user with the same mobile or email already exists it returns that user with created=false and changes nothing, and the create call carries an idempotency token so a retried request never makes a second account. Needs the "Update contacts" and "Obtain user ID via email or mobile number" permissions, and the target department must be inside the app\'s contact scope.',
    idempotent: true,
  },
  props: {
    name: Property.ShortText({
      displayName: 'Name',
      required: true,
    }),
    mobile: Property.ShortText({
      displayName: 'Mobile',
      description: 'An 11-digit mainland number gets +86 added automatically; other regions need the country code, for example +85260000000.',
      required: true,
    }),
    departmentId: Property.ShortText({
      displayName: 'Department ID',
      description: 'The department ID shown in the Feishu admin console, or an open_department_id starting with od-. Map department names from the source system with a mapping table.',
      required: true,
    }),
    employeeType: Property.StaticDropdown({
      displayName: 'Employee Type',
      required: true,
      defaultValue: 1,
      options: {
        options: [
          { label: 'Full-time', value: 1 },
          { label: 'Intern', value: 2 },
          { label: 'Outsourced', value: 3 },
          { label: 'Contractor', value: 4 },
          { label: 'Consultant', value: 5 },
        ],
      },
    }),
    email: Property.ShortText({
      displayName: 'Email',
      required: false,
    }),
    employeeNo: Property.ShortText({
      displayName: 'Employee Number',
      description: 'For example the employee number from the HR system.',
      required: false,
    }),
    jobTitle: Property.ShortText({
      displayName: 'Job Title',
      required: false,
    }),
  },
  async run(context) {
    const { name, mobile, departmentId, employeeType, email, employeeNo, jobTitle } = context.propsValue;
    return feishuContacts.provisionUser({
      auth: context.auth,
      input: { name, mobile, departmentId, employeeType, email, employeeNo, jobTitle },
    });
  },
});
