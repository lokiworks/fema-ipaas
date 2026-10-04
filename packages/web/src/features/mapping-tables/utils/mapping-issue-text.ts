import {
  MappingFieldType,
  MappingIssue,
  MappingIssueCode,
} from '@fema-ipaas/core-utils';
import { t } from 'i18next';

function describe(found: MappingIssue): string {
  const position = found.params['index'];
  const prefix =
    position !== undefined && found.code !== MappingIssueCode.ITEM_FIELD_MISSING
      ? `${t('Item {index}', { index: position })}: `
      : '';
  return `${prefix}${describeCode(found)}`;
}

function describeCode(found: MappingIssue): string {
  const params = found.params;
  const field = params['label'] ?? found.target;
  switch (found.code) {
    case MappingIssueCode.TARGET_EMPTY:
      return t('This row has a source but no target field name');
    case MappingIssueCode.DUPLICATE_TARGET:
      return t('Target field {field} is mapped more than once', {
        field: found.target,
      });
    case MappingIssueCode.REQUIRED_UNMAPPED:
      return t('Required field {field} has no source yet', { field });
    case MappingIssueCode.REQUIRED_EMPTY:
      return t('Required field {field} is empty for this sample', { field });
    case MappingIssueCode.UNKNOWN_TARGET:
      return t(
        'The target has no field {field}; it may have been renamed or removed',
        { field: found.target },
      );
    case MappingIssueCode.TYPE_MISMATCH:
      return `${t(
        'Type mismatch: {expected} expected, got {actual} ({value})',
        {
          expected: typeLabel(params['expected']),
          actual: typeLabel(params['actual']),
          value: params['value'] ?? '',
        },
      )}${typeAdvice(params['expected'])}`;
    case MappingIssueCode.OPTION_NOT_ALLOWED:
      return t('{value} is not one of the allowed options ({options})', {
        value: params['value'] ?? '',
        options: params['options'] ?? '',
      });
    case MappingIssueCode.NUMBER_INVALID:
      return t('{value} is not a number', { value: params['value'] ?? '' });
    case MappingIssueCode.DATE_INVALID:
      return t('{value} is not a valid date', { value: params['value'] ?? '' });
    case MappingIssueCode.DATE_PATTERN_INVALID:
      return t(
        'The date format {pattern} is not recognised. Use tokens such as YYYY-MM-DD or YYYY/MM/DD HH:mm:ss (YYYY year, MM month, DD day, HH hour, mm minute, ss second; case matters)',
        { pattern: params['pattern'] ?? '' },
      );
    case MappingIssueCode.LOOKUP_MISS:
      return t(
        '{value} is not in mapping table {table}. Add it to the table, then retry',
        { value: params['value'] ?? '', table: params['table'] ?? '' },
      );
    case MappingIssueCode.LOOKUP_TABLE_NOT_FOUND:
      return t('The mapping table was deleted or does not exist');
    case MappingIssueCode.LOOKUP_TABLE_NOT_SELECTED:
      return t('Choose a mapping table for the lookup');
    case MappingIssueCode.SOURCE_NOT_LIST:
      return t('The source is not a list');
    case MappingIssueCode.ITEM_FIELD_MISSING:
      return t('Item {index} is missing {path}', {
        index: params['index'] ?? '',
        path: params['path'] ?? params['field'] ?? '',
      });
  }
}

function typeLabel(type: string | undefined): string {
  switch (type) {
    case MappingFieldType.STRING:
      return t('Text');
    case MappingFieldType.NUMBER:
      return t('Number');
    case MappingFieldType.BOOLEAN:
      return t('Boolean');
    case MappingFieldType.DATE:
      return t('Date');
    case MappingFieldType.ARRAY:
      return t('List');
    case MappingFieldType.OBJECT:
      return t('Object');
    default:
      return t('Any type');
  }
}

function typeAdvice(expected: string | undefined): string {
  switch (expected) {
    case MappingFieldType.NUMBER:
      return `. ${t('Add the To number transform')}`;
    case MappingFieldType.STRING:
      return `. ${t('Add the To text transform')}`;
    case MappingFieldType.DATE:
      return `. ${t('Add the Date format transform')}`;
    default:
      return '';
  }
}

export const mappingIssueText = {
  describe,
  typeLabel,
};
