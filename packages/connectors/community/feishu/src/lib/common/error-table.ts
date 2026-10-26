import { type FixOwner } from '@fema-ipaas/connector-sdk';

export const feishuErrorTable = {
  ruleFor,
  rules: () => Object.values(ERROR_RULES),
  nextMonthStartInBeijing,
};

function ruleFor({ code }: { code: number }): ErrorRule | undefined {
  return ERROR_RULES[code];
}

function nextMonthStartInBeijing({ now }: { now: Date }): Date {
  const beijing = new Date(now.getTime() + BEIJING_UTC_OFFSET_MS);
  const nextMonthStart = Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth() + 1, 1);
  return new Date(nextMonthStart - BEIJING_UTC_OFFSET_MS);
}

const BEIJING_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

const TOO_FAST = 'the app is calling this endpoint too fast, slow down and retry';
const TOKEN_EXPIRED = 'the tenant access token expired, retry the step';
const CREDENTIALS = 'the app credentials are not valid, check the App ID and App Secret';
const DEPARTMENT_SCOPE =
  'the department is outside the contact scope of the app, add it to the app permission scope in the Open Platform and republish the app';
const MEMBER_SCOPE =
  'the member is outside the contact scope of the app, add the member or their department to the app permission scope in the Open Platform and republish the app';
const DIRECTORY_BUSY = 'Feishu is still processing another change to the contact directory, retry in a few seconds';
const MISSING_PERMISSION = 'the app is missing the permission this endpoint needs, grant it in the Open Platform and republish the app';
const RECIPIENT = 'the receiver ID or a request parameter is invalid, check the receiver and the message content';
const BOT_NOT_IN_CHAT = 'the bot is not in that chat, add the app to the chat first';
const TABLE_MISSING = 'that Bitable or data table does not exist, check the App Token and data table';
const DEPARTMENT_MISSING = 'the department does not exist in Feishu, check the department ID or the department mapping table';
const MOBILE_EXISTS = 'this mobile number already belongs to another Feishu account';
const EMAIL_EXISTS = 'this email already belongs to another Feishu account';
const SEAT_LIMIT = 'the member or seat limit of this Feishu organization is reached, clean up members or upgrade the edition';

const ERROR_RULES: Record<number, ErrorRule> = {
  40014: { kind: 'FAILED', status: 403, owner: 'TARGET_ADMIN', hint: DEPARTMENT_SCOPE },
  43022: { kind: 'FAILED', status: 400, owner: 'TARGET_ADMIN', hint: 'a department with this name already exists under the parent' },
  43023: { kind: 'FAILED', status: 403, owner: 'TARGET_ADMIN', hint: DEPARTMENT_SCOPE },
  43024: { kind: 'RATE_LIMIT', status: 429, hint: DIRECTORY_BUSY },
  43030: { kind: 'RATE_LIMIT', status: 429, hint: DIRECTORY_BUSY },
  43000: { kind: 'FAILED', status: 409, owner: 'MAPPING_OWNER', hint: 'the department already exists' },
  43007: { kind: 'FAILED', status: 409, owner: 'MAPPING_OWNER', hint: 'the custom department ID is already in use' },
  43008: { kind: 'FAILED', status: 400, owner: 'MAPPING_OWNER', hint: 'the custom department ID must not start with od-, must not be 0 and must be at most 64 characters' },
  43019: { kind: 'FAILED', status: 400, owner: 'SOURCE_DATA_OWNER', hint: 'the department tree exceeds 25 levels' },
  43029: { kind: 'FAILED', status: 400, owner: 'SOURCE_DATA_OWNER', hint: 'department names must not contain a slash' },
  99991663: { kind: 'TOKEN_REJECTED', status: 401, hint: TOKEN_EXPIRED },
  99991661: { kind: 'TOKEN_REJECTED', status: 401, hint: TOKEN_EXPIRED },
  99991665: { kind: 'TOKEN_REJECTED', status: 401, hint: TOKEN_EXPIRED },
  99991664: { kind: 'TOKEN_REJECTED', status: 401, hint: TOKEN_EXPIRED },
  10003: { kind: 'FAILED', owner: 'CONNECTION_OWNER', status: 401, hint: CREDENTIALS },
  10005: { kind: 'FAILED', owner: 'CONNECTION_OWNER', status: 401, hint: CREDENTIALS },
  10015: { kind: 'FAILED', owner: 'CONNECTION_OWNER', status: 401, hint: 'the App Secret is wrong, copy it again from Credentials & Basic Info in the Open Platform' },
  10014: { kind: 'FAILED', owner: 'TARGET_ADMIN', status: 403, hint: 'the app is disabled or not installed in this organization, check the app status in the Open Platform' },
  99991662: { kind: 'FAILED', owner: 'TARGET_ADMIN', status: 403, hint: 'the app is disabled or not installed in this organization, check the app status in the Open Platform' },
  99991673: { kind: 'FAILED', owner: 'TARGET_ADMIN', status: 403, hint: 'the app is disabled or not installed in this organization, check the app status in the Open Platform' },
  99991401: {
    kind: 'FAILED', owner: 'TARGET_ADMIN',
    status: 403,
    hint: 'the app has an IP allowlist and this server is not on it, add the server egress IP in the Open Platform security settings',
  },
  99991672: { kind: 'FAILED', owner: 'TARGET_ADMIN', status: 403, hint: MISSING_PERMISSION },
  99991403: {
    kind: 'MONTHLY_QUOTA',
    status: 429,
    hint: "this month's API call quota of the Feishu free edition is used up, an administrator has to upgrade the edition, retrying will not help",
  },
  99991400: { kind: 'RATE_LIMIT', status: 429, hint: TOO_FAST },
  11232: { kind: 'RATE_LIMIT', status: 429, hint: TOO_FAST },
  11247: { kind: 'RATE_LIMIT', status: 429, hint: TOO_FAST },
  230020: { kind: 'RATE_LIMIT', status: 429, hint: TOO_FAST },
  1254290: { kind: 'RATE_LIMIT', status: 429, hint: TOO_FAST },
  44025: { kind: 'RATE_LIMIT', status: 429, hint: DIRECTORY_BUSY },
  1254291: { kind: 'RATE_LIMIT', status: 429, hint: 'Bitable is still processing another change to this table, retry in a few seconds' },
  1254607: { kind: 'RATE_LIMIT', status: 429, hint: 'Bitable is still processing another change to this table, retry in a few seconds' },
  40003: { kind: 'FAILED', owner: 'TARGET_ADMIN', status: 403, hint: DEPARTMENT_SCOPE },
  40004: { kind: 'FAILED', owner: 'TARGET_ADMIN', status: 403, hint: DEPARTMENT_SCOPE },
  41050: { kind: 'FAILED', owner: 'TARGET_ADMIN', status: 403, hint: MEMBER_SCOPE },
  40015: { kind: 'FAILED', owner: 'MAPPING_OWNER', hint: DEPARTMENT_MISSING },
  41017: { kind: 'FAILED', owner: 'MAPPING_OWNER', hint: DEPARTMENT_MISSING },
  44035: { kind: 'FAILED', owner: 'MAPPING_OWNER', hint: DEPARTMENT_MISSING },
  41001: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: MOBILE_EXISTS },
  41002: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: EMAIL_EXISTS },
  41053: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'this member already exists in Feishu' },
  41003: {
    kind: 'FAILED', owner: 'SOURCE_DATA_OWNER',
    status: 409,
    hint: 'the mobile number and the email belong to two different Feishu accounts, use another contact or have one account cancelled',
  },
  41004: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'the mobile number format is not valid, use 11 digits or a +country code number' },
  41005: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'the email format is not valid' },
  41009: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'a mobile number is required, and outside mainland China an email is required as well' },
  41010: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'a mobile number is required, and outside mainland China an email is required as well' },
  44020: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'a mobile number is required, and outside mainland China an email is required as well' },
  44019: {
    kind: 'FAILED', owner: 'SOURCE_DATA_OWNER',
    hint: 'an unverified Feishu organization only accepts mainland China (+86) mobile numbers until it passes verification',
  },
  44018: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'Lark does not accept +86 mobile numbers' },
  44051: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'this employee number is already used by another Feishu member' },
  41007: { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: SEAT_LIMIT },
  41008: { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: SEAT_LIMIT },
  44023: { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: SEAT_LIMIT },
  44052: { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: SEAT_LIMIT },
  42006: { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: 'the member has already resigned in Feishu and can not be changed' },
  44010: { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: 'the member has not joined Feishu yet or has left it, so the account can not be changed' },
  44011: { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: 'the member has not joined Feishu yet or has left it, so the account can not be changed' },
  44036: { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: 'the creator of the Feishu organization cannot be suspended' },
  230001: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: RECIPIENT },
  230034: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: RECIPIENT },
  230002: { kind: 'FAILED', owner: 'TARGET_ADMIN', status: 403, hint: BOT_NOT_IN_CHAT },
  10002: { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: BOT_NOT_IN_CHAT },
  10030: { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: BOT_NOT_IN_CHAT },
  230006: { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: 'the bot ability is not switched on for the app, enable it in the Open Platform and republish the app' },
  230013: {
    kind: 'FAILED', owner: 'TARGET_ADMIN',
    hint: 'the recipient is outside the availability scope of the app or has left, add them to the app availability scope and republish the app',
  },
  230029: { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: 'the recipient has resigned, so no message can be sent' },
  232009: { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: 'the group chat has been dissolved, pick another chat' },
  1254003: { kind: 'FAILED', owner: 'MAPPING_OWNER', hint: TABLE_MISSING },
  1254004: { kind: 'FAILED', owner: 'MAPPING_OWNER', hint: TABLE_MISSING },
  1254040: { kind: 'FAILED', owner: 'MAPPING_OWNER', hint: TABLE_MISSING },
  1254041: { kind: 'FAILED', owner: 'MAPPING_OWNER', hint: TABLE_MISSING },
  1254006: { kind: 'FAILED', owner: 'MAPPING_OWNER', hint: 'that Bitable record does not exist' },
  1254043: { kind: 'FAILED', owner: 'MAPPING_OWNER', hint: 'that Bitable record does not exist' },
  1254045: { kind: 'FAILED', owner: 'MAPPING_OWNER', hint: 'a column name does not exist in the data table, copy it exactly from the table header' },
  1254015: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'a value does not fit the type of its Bitable column' },
  1254060: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'a value does not fit the type of its Bitable column' },
  1254061: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'a value does not fit the type of its Bitable column' },
  1254062: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'a value does not fit the type of its Bitable column' },
  1254063: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'a value does not fit the type of its Bitable column' },
  1254064: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'a value does not fit the type of its Bitable column' },
  1254065: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'a value does not fit the type of its Bitable column' },
  1254066: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'a value does not fit the type of its Bitable column' },
};

export type ErrorKind = 'TOKEN_REJECTED' | 'RATE_LIMIT' | 'MONTHLY_QUOTA' | 'FAILED';

export type ErrorRule = {
  kind: ErrorKind;
  hint: string;
  status?: number;
  owner?: FixOwner;
};
