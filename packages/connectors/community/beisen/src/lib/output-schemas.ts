import type { OutputSchema, OutputSchemaField } from '@fema-ipaas/connector-sdk';

export const beisenOutputSchemas = {
  employeeRecord: schema({ fields: employeeRecordFields() }),
  searchChangedEmployees: schema({
    fields: [
      { key: 'records', label: 'Employees', listItems: employeeRecordFields() },
      { key: 'count', label: 'Count In This Batch', format: 'number' },
      { key: 'scroll_id', label: 'Scroll ID', description: 'Pass it back within 10 seconds to read the next batch.' },
      { key: 'has_more', label: 'Has More', format: 'boolean' },
    ],
  }),
  listOrganizationEmployees: schema({
    fields: [
      { key: 'employees', label: 'Employees', listItems: employeeRecordFields() },
      { key: 'count', label: 'Count', format: 'number' },
    ],
  }),
  findEmployeeByEmail: schema({
    fields: [
      { key: 'found', label: 'Found', format: 'boolean' },
      { key: 'user_id', label: 'User ID', description: 'The Beisen UserID of the employee, empty when nobody has that email.' },
    ],
  }),
  findApplicant: schema({
    fields: [
      { key: 'applicant_ids', label: 'Applicant IDs' },
      { key: 'count', label: 'Count', format: 'number' },
      { key: 'found', label: 'Found', format: 'boolean' },
    ],
  }),
};

function employeeRecordFields(): OutputSchemaField[] {
  return [
    {
      key: 'employeeInfo',
      label: 'Employee',
      children: [
        { key: 'userID', label: 'User ID' },
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email', format: 'email' },
        { key: 'workEmail', label: 'Work Email', format: 'email' },
        { key: 'mobilePhone', label: 'Mobile' },
        { key: 'activationState', label: 'Activation State' },
        { key: 'objectId', label: 'Object ID' },
        { key: 'stdIsDeleted', label: 'Deleted', format: 'boolean' },
        { key: 'customProperties', label: 'Custom Fields' },
      ],
    },
    {
      key: 'recordInfo',
      label: 'Employment Record',
      children: [
        { key: 'userID', label: 'User ID' },
        { key: 'jobNumber', label: 'Job Number' },
        { key: 'oIdDepartment', label: 'Department OId' },
        { key: 'oIdOrganization', label: 'Organization OId' },
        { key: 'employeeStatus', label: 'Employee Status', description: '1 upcoming, 2 probation, 3 regular, 7 re-employed retiree, 8 departed.' },
        { key: 'employType', label: 'Employment Type' },
        { key: 'approvalStatus', label: 'Approval Status' },
        { key: 'changeTypeOID', label: 'Change Type', description: '2 means a rehire.' },
        { key: 'startDate', label: 'Effective From', format: 'datetime' },
        { key: 'stopDate', label: 'Effective Until', format: 'datetime' },
        { key: 'entryDate', label: 'Entry Date', format: 'datetime' },
        { key: 'lastWorkDate', label: 'Last Work Date', format: 'datetime' },
        { key: 'isCurrentRecord', label: 'Current Record', format: 'boolean' },
        { key: 'pOIdEmpAdmin', label: 'Manager User ID' },
        { key: 'customProperties', label: 'Custom Fields' },
      ],
    },
  ];
}

function schema(value: OutputSchema): OutputSchema {
  return value;
}
