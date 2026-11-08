import { ErrorCode } from '@fema-ipaas/core-utils';
import { t } from 'i18next';

import { api } from '@/lib/api';

function readBody(error: unknown): {
  code: unknown;
  params: Record<string, unknown>;
} {
  if (!api.isError(error)) {
    return { code: undefined, params: {} };
  }
  const data: unknown = error.response?.data;
  if (typeof data !== 'object' || data === null) {
    return { code: undefined, params: {} };
  }
  const code = 'code' in data ? data.code : undefined;
  const params =
    'params' in data && typeof data.params === 'object' && data.params !== null
      ? Object.fromEntries(Object.entries(data.params))
      : {};
  return { code, params };
}

function parse(error: unknown): LoginChallenge | null {
  const { code, params } = readBody(error);
  const challengeToken = params['challengeToken'];
  const selectionToken = params['selectionToken'];
  if (code === ErrorCode.MFA_REQUIRED && typeof challengeToken === 'string') {
    return { kind: 'mfa', challengeToken };
  }
  if (
    code === ErrorCode.MFA_ENROLLMENT_REQUIRED &&
    typeof challengeToken === 'string'
  ) {
    return { kind: 'mfa-enrollment', challengeToken };
  }
  if (
    code === ErrorCode.TENANT_SELECTION_REQUIRED &&
    typeof selectionToken === 'string'
  ) {
    return { kind: 'tenant-selection', selectionToken };
  }
  return null;
}

function errorCode(error: unknown): string | undefined {
  const { code } = readBody(error);
  return typeof code === 'string' ? code : undefined;
}

function messageFor(error: unknown): string | null {
  switch (errorCode(error)) {
    case ErrorCode.TENANT_SUSPENDED:
      return t(
        'This organization has been suspended. Contact the organization administrator.',
      );
    case ErrorCode.SMS_NOT_CONFIGURED:
      return t('Sign-in with a phone number is not available here.');
    case ErrorCode.INVALID_MFA_CODE:
      return t('That code is not correct. Try again.');
    default:
      return null;
  }
}

function isForbidden(error: unknown): boolean {
  return errorCode(error) === ErrorCode.AUTHORIZATION;
}

export const loginChallengeUtils = {
  parse,
  errorCode,
  messageFor,
  isForbidden,
};

export type LoginChallenge =
  | { kind: 'mfa'; challengeToken: string }
  | { kind: 'mfa-enrollment'; challengeToken: string }
  | { kind: 'tenant-selection'; selectionToken: string };
