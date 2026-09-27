import { McpServerUrlIssue } from '@fema-ipaas/shared';
import { t } from 'i18next';

function urlIssueMessage(issue: McpServerUrlIssue): string {
  switch (issue) {
    case McpServerUrlIssue.EMPTY:
      return t('Please enter the server address');
    case McpServerUrlIssue.SCHEME:
      return t('The address must start with http:// or https://');
    case McpServerUrlIssue.WHITESPACE:
      return t('The address cannot contain spaces');
    case McpServerUrlIssue.FRAGMENT:
      return t('The address cannot contain a #');
    case McpServerUrlIssue.CREDENTIALS:
      return t(
        'Do not put a username or password in the address; configure them under Authentication',
      );
    case McpServerUrlIssue.PORT:
      return t(
        'The address format is invalid; check the domain and port, which must be between 1 and 65535',
      );
    case McpServerUrlIssue.INVALID:
      return t(
        'The address format is invalid; check the domain and port, which must be between 1 and 65535',
      );
  }
}

export const mcpUrlIssueUtils = {
  urlIssueMessage,
};
