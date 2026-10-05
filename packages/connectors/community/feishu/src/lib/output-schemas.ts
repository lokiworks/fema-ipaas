import type { OutputSchema, OutputSchemaField } from '@fema-ipaas/connector-sdk';

export const feishuOutputSchemas = {
  provisionUser: schema({
    fields: [
      { key: 'created', label: 'Newly Created', format: 'boolean', description: 'False when an account for this mobile or email already existed and was reused.' },
      { key: 'open_id', label: 'Open ID' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'matched_by', label: 'Matched By', description: 'mobile or email, when an existing account was reused.' },
      { key: 'is_frozen', label: 'Suspended', format: 'boolean' },
      { key: 'user_id', label: 'User ID' },
      { key: 'union_id', label: 'Union ID' },
    ],
  }),
  updateUser: schema({
    fields: [
      { key: 'updated', label: 'Updated', format: 'boolean' },
      { key: 'open_id', label: 'Open ID' },
      { key: 'changed', label: 'Changed Fields' },
    ],
  }),
  setSuspended: schema({
    fields: [
      { key: 'open_id', label: 'Open ID' },
      { key: 'suspended', label: 'Suspension Asked For', format: 'boolean' },
      { key: 'is_frozen', label: 'Suspended Now', format: 'boolean', description: 'What Feishu reports after the call.' },
      { key: 'confirmed', label: 'Confirmed', format: 'boolean', description: 'True when Feishu reports the state that was asked for; empty when the read back was not allowed.' },
    ],
  }),
  getUser: schema({ fields: userFields() }),
  findUser: schema({
    fields: [
      { key: 'found', label: 'Found', format: 'boolean' },
      { key: 'open_id', label: 'Open ID' },
      { key: 'email', label: 'Email', format: 'email' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'is_frozen', label: 'Suspended', format: 'boolean' },
      { key: 'is_resigned', label: 'Resigned', format: 'boolean' },
    ],
  }),
  sendMessage: schema({
    fields: [
      { key: 'message_id', label: 'Message ID' },
      { key: 'chat_id', label: 'Chat ID' },
      { key: 'message_type', label: 'Message Type' },
      { key: 'created_at', label: 'Created At', description: 'Milliseconds since 1970, as Feishu returns it.' },
    ],
  }),
  listDepartmentUsers: schema({
    fields: [
      { key: 'members', label: 'Members', labelKey: 'name', listItems: [...userFields(), { key: 'is_activated', label: 'Activated', format: 'boolean' }] },
      { key: 'count', label: 'Count', format: 'number' },
    ],
  }),
  listDepartments: schema({
    fields: [
      {
        key: 'departments',
        label: 'Departments',
        labelKey: 'name',
        listItems: [
          { key: 'open_department_id', label: 'Open Department ID' },
          { key: 'department_id', label: 'Department ID' },
          { key: 'name', label: 'Name' },
          { key: 'parent_department_id', label: 'Parent Department ID' },
          { key: 'member_count', label: 'Members', format: 'number' },
          { key: 'is_deleted', label: 'Deleted', format: 'boolean' },
        ],
      },
      { key: 'count', label: 'Count', format: 'number' },
    ],
  }),
};

function userFields(): OutputSchemaField[] {
  return [
    { key: 'open_id', label: 'Open ID' },
    { key: 'user_id', label: 'User ID' },
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email', format: 'email' },
    { key: 'mobile', label: 'Mobile' },
    { key: 'employee_no', label: 'Employee Number' },
    { key: 'department_ids', label: 'Department IDs' },
    { key: 'leader_open_id', label: 'Manager Open ID' },
    { key: 'job_title', label: 'Job Title' },
    { key: 'is_frozen', label: 'Suspended', format: 'boolean' },
    { key: 'is_resigned', label: 'Resigned', format: 'boolean' },
  ];
}

function schema(value: OutputSchema): OutputSchema {
  return value;
}
