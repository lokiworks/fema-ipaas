import { t } from 'i18next';

function localize(text: string): string {
  const withHints = HINT_KEYS.reduce(
    (current, { english, key }) =>
      current.includes(english) ? current.replace(english, t(key)) : current,
    text,
  );
  const withCodes = withHints.replace(FEISHU_CODE_PATTERN, (_match, code) =>
    t('(Feishu error {code})', { code }),
  );
  return localizeTail(withCodes);
}

function localizeTail(text: string): string {
  const lower = text.toLowerCase();
  const matched = TAIL_KEYS.find(({ english }) => {
    const target = english.toLowerCase();
    return lower === target || lower.endsWith(`: ${target}`);
  });
  if (!matched) {
    return text;
  }
  return `${text.slice(0, text.length - matched.english.length)}${t(
    matched.key,
  )}`;
}

export const failureText = { localize };

const FEISHU_CODE_PATTERN = /\(Feishu error (\d+)\)/;

const TAIL_KEYS = [
  { english: 'Route not found', key: 'failureRouteNotFound' },
  { english: 'Too many requests', key: 'failureTooManyRequests' },
  {
    english: 'The run timed out before this step finished',
    key: 'failureRunTimedOut',
  },
  {
    english: 'The run ran out of memory while this step was running',
    key: 'failureRunOutOfMemory',
  },
  { english: 'Bad Request', key: 'failureBadRequest' },
  { english: 'Unauthorized', key: 'failureUnauthorized' },
  { english: 'Forbidden', key: 'failureForbidden' },
  { english: 'Not Found', key: 'failureNotFound' },
  { english: 'Method Not Allowed', key: 'failureMethodNotAllowed' },
  { english: 'Request Timeout', key: 'failureRequestTimeout' },
  { english: 'Conflict', key: 'failureConflict' },
  { english: 'Unprocessable Entity', key: 'failureUnprocessable' },
  { english: 'Internal Server Error', key: 'failureServerError' },
  { english: 'Bad Gateway', key: 'failureBadGateway' },
  { english: 'Service Unavailable', key: 'failureUnavailable' },
  { english: 'Gateway Timeout', key: 'failureGatewayTimeout' },
];

const HINT_KEYS = [
  {
    english:
      'the app credentials are not valid, check the App ID and App Secret',
    key: 'failureHintCredentials',
  },
  {
    english: 'the tenant access token expired, retry the step',
    key: 'failureHintTokenExpired',
  },
  {
    english: 'the app is calling this endpoint too fast, slow down and retry',
    key: 'failureHintTooFast',
  },
  {
    english:
      'the department is outside the contact scope of the app, add it to the app permission scope in the Open Platform and republish the app',
    key: 'failureHintDepartmentScope',
  },
  {
    english:
      'the member is outside the contact scope of the app, add the member or their department to the app permission scope in the Open Platform and republish the app',
    key: 'failureHintMemberScope',
  },
  {
    english:
      'Feishu is still processing another change to the contact directory, retry in a few seconds',
    key: 'failureHintDirectoryBusy',
  },
  {
    english:
      'the app is missing the permission this endpoint needs, grant it in the Open Platform and republish the app',
    key: 'failureHintMissingPermission',
  },
  {
    english: 'the recipient does not exist, check the email or user ID',
    key: 'failureHintRecipient',
  },
  {
    english: 'the bot is not in that chat, add the app to the chat first',
    key: 'failureHintBotNotInChat',
  },
  {
    english: 'that Bitable record does not exist',
    key: 'failureHintRecordMissing',
  },
  {
    english:
      'that Bitable or data table does not exist, check the App Token and data table',
    key: 'failureHintTableMissing',
  },
];
