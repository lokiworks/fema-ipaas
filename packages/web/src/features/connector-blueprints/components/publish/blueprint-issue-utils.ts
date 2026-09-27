import {
  BlueprintIssueCode,
  BlueprintIssueSection,
  BlueprintIssueView,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

function textOf(issue: BlueprintIssueView): string {
  switch (issue.code) {
    case BlueprintIssueCode.NAME_MISSING:
      return t('Connector name is not filled in');
    case BlueprintIssueCode.NAME_TOO_LONG:
      return t('Name is longer than 30 characters');
    case BlueprintIssueCode.DESCRIPTION_MISSING:
      return t('Connector description is not filled in');
    case BlueprintIssueCode.BASE_URL_INVALID:
      return t('Base URL is not configured or is invalid');
    case BlueprintIssueCode.NO_OPERATIONS:
      return t('At least one operation or trigger is required');
    case BlueprintIssueCode.AUTH_NOT_PUBLISHED:
      return t('Authentication has not been published yet');
    case BlueprintIssueCode.STATUS_INVALID:
      return t('Status code configuration is invalid');
    case BlueprintIssueCode.OPERATION_INVALID:
      return t('Operation "{name}" is not fully configured', {
        name: issue.name ?? issue.key ?? '',
      });
    case BlueprintIssueCode.TRIGGER_INVALID:
      return t('Trigger "{name}" is not fully configured', {
        name: issue.name ?? issue.key ?? '',
      });
  }
}

function routeOf({
  issue,
  blueprintId,
}: {
  issue: BlueprintIssueView;
  blueprintId: string;
}): string {
  const base = `/tenant/connectors/development/${blueprintId}`;
  switch (issue.section) {
    case BlueprintIssueSection.BASIC:
      return `${base}/basic`;
    case BlueprintIssueSection.AUTH:
      return `${base}/auth/dev`;
    case BlueprintIssueSection.STATUS:
      return `${base}/status`;
    case BlueprintIssueSection.OPERATION:
      return `${base}/op/${issue.key ?? ''}`;
    case BlueprintIssueSection.TRIGGER:
      return `${base}/trigger/${issue.key ?? ''}`;
  }
}

function describe({
  issue,
  blueprintId,
}: {
  issue: BlueprintIssueView;
  blueprintId: string;
}): { text: string; to: string } {
  return { text: textOf(issue), to: routeOf({ issue, blueprintId }) };
}

export const blueprintIssueUtils = {
  describe,
};
