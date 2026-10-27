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
    english: 'a department with this name already exists under the parent',
    key: 'failureHintDepartmentNameExists',
  },
  {
    english: 'the department already exists',
    key: 'failureHintDepartmentExists',
  },
  {
    english: 'the custom department ID is already in use',
    key: 'failureHintDepartmentIdExists',
  },
  {
    english:
      'the custom department ID must not start with od-, must not be 0 and must be at most 64 characters',
    key: 'failureHintDepartmentIdFormat',
  },
  {
    english: 'the department tree exceeds 25 levels',
    key: 'failureHintDepartmentDepth',
  },
  {
    english: 'department names must not contain a slash',
    key: 'failureHintDepartmentSlash',
  },

  {
    english: 'Beisen API rate limit exceeded.',
    key: 'failureHintBeisenRateLimited',
  },
  {
    english:
      'Beisen stops answering this tenant for the rest of the day and allows calls again at 00:00 the next day (Beijing time), so retrying now will not help. Lower how often the workflow polls or how much history it replays (Beisen rate limit)',
    key: 'failureHintBeisenRateLimitDay',
  },
  {
    english:
      'Check that the connector Key and Secret are still valid in the Beisen admin console and that the connection uses them (Beisen credentials)',
    key: 'failureHintBeisenCredentials',
  },
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
  {
    english:
      'the App Secret is wrong, copy it again from Credentials & Basic Info in the Open Platform',
    key: 'failureHintWrongSecret',
  },
  {
    english:
      'the app is disabled or not installed in this organization, check the app status in the Open Platform',
    key: 'failureHintAppDisabled',
  },
  {
    english:
      'the app has an IP allowlist and this server is not on it, add the server egress IP in the Open Platform security settings',
    key: 'failureHintIpDenied',
  },
  {
    english:
      "this month's API call quota of the Feishu free edition is used up, an administrator has to upgrade the edition, retrying will not help",
    key: 'failureHintMonthlyQuota',
  },
  {
    english:
      'Bitable is still processing another change to this table, retry in a few seconds',
    key: 'failureHintBitableBusy',
  },
  {
    english:
      'the department does not exist in Feishu, check the department ID or the department mapping table',
    key: 'failureHintDepartmentMissing',
  },
  {
    english: 'this mobile number already belongs to another Feishu account',
    key: 'failureHintMobileExists',
  },
  {
    english: 'this email already belongs to another Feishu account',
    key: 'failureHintEmailExists',
  },
  {
    english: 'this member already exists in Feishu',
    key: 'failureHintMemberExists',
  },
  {
    english:
      'the mobile number and the email belong to two different Feishu accounts, use another contact or have one account cancelled',
    key: 'failureHintContactConflict',
  },
  {
    english:
      'the mobile number format is not valid, use 11 digits or a +country code number',
    key: 'failureHintMobileInvalid',
  },
  {
    english: 'the email format is not valid',
    key: 'failureHintEmailInvalid',
  },
  {
    english:
      'a mobile number is required, and outside mainland China an email is required as well',
    key: 'failureHintContactRequired',
  },
  {
    english:
      'an unverified Feishu organization only accepts mainland China (+86) mobile numbers until it passes verification',
    key: 'failureHintUnverifiedMobile',
  },
  {
    english: 'Lark does not accept +86 mobile numbers',
    key: 'failureHintLarkMobile',
  },
  {
    english: 'this employee number is already used by another Feishu member',
    key: 'failureHintEmployeeNoExists',
  },
  {
    english:
      'the member or seat limit of this Feishu organization is reached, clean up members or upgrade the edition',
    key: 'failureHintSeatLimit',
  },
  {
    english: 'the member has already resigned in Feishu and can not be changed',
    key: 'failureHintResigned',
  },
  {
    english:
      'the member has not joined Feishu yet or has left it, so the account can not be changed',
    key: 'failureHintMemberNotJoined',
  },
  {
    english: 'the creator of the Feishu organization cannot be suspended',
    key: 'failureHintFounderFrozen',
  },
  {
    english:
      'the receiver ID or a request parameter is invalid, check the receiver and the message content',
    key: 'failureHintReceiverInvalid',
  },
  {
    english:
      'the bot ability is not switched on for the app, enable it in the Open Platform and republish the app',
    key: 'failureHintBotDisabled',
  },
  {
    english:
      'the recipient is outside the availability scope of the app or has left, add them to the app availability scope and republish the app',
    key: 'failureHintAvailability',
  },
  {
    english: 'the recipient has resigned, so no message can be sent',
    key: 'failureHintRecipientResigned',
  },
  {
    english: 'the group chat has been dissolved, pick another chat',
    key: 'failureHintChatDissolved',
  },
  {
    english:
      'a column name does not exist in the data table, copy it exactly from the table header',
    key: 'failureHintFieldMissing',
  },
  {
    english: 'a value does not fit the type of its Bitable column',
    key: 'failureHintFieldType',
  },
];
