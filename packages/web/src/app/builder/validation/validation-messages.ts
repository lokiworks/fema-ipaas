import { t } from 'i18next';

import { ValidationCode, ValidationIssue } from './workflow-validator';

function messageOf(issue: ValidationIssue): string {
  return MESSAGES[issue.code](issue.params);
}

export const validationMessages = {
  messageOf,
};

const MESSAGES: Record<
  ValidationCode,
  (params: Record<string, string>) => string
> = {
  [ValidationCode.TRIGGER_NOT_SELECTED]: () => t('No trigger selected'),
  [ValidationCode.OPERATION_NOT_SELECTED]: () => t('No operation selected'),
  [ValidationCode.CONNECTOR_UNAVAILABLE]: () =>
    t('The connector does not exist or was removed'),
  [ValidationCode.OPERATION_UNAVAILABLE]: () =>
    t('The selected operation is no longer available'),
  [ValidationCode.CONNECTION_REQUIRED]: () => t('No connection selected'),
  [ValidationCode.CONNECTION_UNAVAILABLE]: () =>
    t(
      'The connection was deleted, is outside this project or is not shared with you',
    ),
  [ValidationCode.CONNECTION_UNHEALTHY]: (params) =>
    t('Connection {connection} is not working', params),
  [ValidationCode.CONNECTION_EXPIRED]: (params) =>
    t(
      'Connection {connection} has expired and needs to be re-authorized',
      params,
    ),
  [ValidationCode.REQUIRED_FIELD_MISSING]: (params) =>
    t('{field} is required', params),
  [ValidationCode.STEP_INCOMPLETE]: () => t('Some settings are incomplete'),
  [ValidationCode.MAPPING_TABLE_MISSING]: (params) =>
    t('Mapping table {table} does not exist', params),
  [ValidationCode.MAPPING_DUPLICATE_TARGET]: (params) =>
    t('Target field {field} is mapped more than once', params),
  [ValidationCode.CRON_INVALID]: () => t('The Cron expression is invalid'),
  [ValidationCode.SCHEDULE_INTERVAL_INVALID]: () =>
    t('The interval must be greater than 0'),
  [ValidationCode.FORM_NO_FIELDS]: () => t('The form has no fields'),
  [ValidationCode.DEDUPE_NO_KEY]: () => t('Deduplication is on but has no key'),
  [ValidationCode.DEDUPE_KEY_INVALID]: () =>
    t('The dedupe key must reference trigger output'),
  [ValidationCode.BRANCH_NO_CONDITION]: (params) =>
    t('Branch {branch} has no condition', params),
  [ValidationCode.BRANCH_CONDITION_INCOMPLETE]: (params) =>
    t('Branch {branch} has an incomplete condition', params),
  [ValidationCode.PARALLEL_TOO_FEW_BRANCHES]: () =>
    t('A parallel branch needs at least 2 paths'),
  [ValidationCode.LOOP_ITEMS_EMPTY]: () => t('The loop has no list to iterate'),
  [ValidationCode.CODE_EMPTY]: () => t('The code is empty'),
  [ValidationCode.CODE_INPUT_NAME_EMPTY]: () =>
    t('An input parameter has no name'),
  [ValidationCode.AGENT_NO_TOOLS]: () => t('The agent has no tools'),
  [ValidationCode.AGENT_STEPS_OUT_OF_RANGE]: () =>
    t('Max steps must be between 1 and 20'),
  [ValidationCode.REFERENCE_NOT_UPSTREAM]: (params) =>
    t('{ref} references a step that is not upstream', params),
  [ValidationCode.REFERENCE_DELETED]: (params) =>
    t('{ref} references a deleted step', params),
  [ValidationCode.LOOP_VARIABLE_OUTSIDE_LOOP]: (params) =>
    t('{ref} uses a loop variable outside the loop', params),
  [ValidationCode.VARIABLE_MISSING]: (params) =>
    t('Project config {name} does not exist', params),
  [ValidationCode.AI_PENDING_REVIEW]: () =>
    t('AI-generated step not confirmed'),
  [ValidationCode.WRITE_NOT_TESTED]: (params) =>
    t(
      '{step} writes data and has not been tested since it was last edited',
      params,
    ),
};
