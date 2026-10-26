import { blockedUntilMarker, FixOwner, fixOwnerMarker } from '@fema-ipaas/connector-sdk';

function error(code: string): Error {
  const rule = RULES[code] ?? { owner: 'TARGET_ADMIN', hint: 'Check application permissions and request parameters.', kind: 'FAILED' };
  const message = `DingTalk ${code}: ${rule.hint}`;
  return new DingtalkError({ code, message: rule.kind === 'RATE_LIMIT' ? blockedUntilMarker.attach({ message, until: new Date(Date.now() + 30000) }) : fixOwnerMarker.attach({ message, owner: rule.owner }) });
}

export class DingtalkError extends Error {
  readonly code: string;
  constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
}

const RULES: Record<string, { kind: 'FAILED' | 'RATE_LIMIT'; owner: FixOwner; hint: string }> = {
  '40014': { kind: 'FAILED', owner: 'CONNECTION_OWNER', hint: 'The access token is invalid.' },
  '42001': { kind: 'FAILED', owner: 'CONNECTION_OWNER', hint: 'The access token expired.' },
  'InvalidAuthentication': { kind: 'FAILED', owner: 'CONNECTION_OWNER', hint: 'Check the App Key and App Secret.' },
  'InvalidParameter': { kind: 'FAILED', owner: 'WORKFLOW_OWNER', hint: 'Check required action inputs.' },
  '40001': { kind: 'FAILED', owner: 'CONNECTION_OWNER', hint: 'Check application credentials.' },
  '88': { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: 'Application authorization failed; review granted permissions.' },
  '60011': { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: 'Grant this API permission to the application.' },
  'Forbidden.AccessDenied': { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: 'Grant API permission and include the synchronized departments in the application scope.' },
  '60020': { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: 'Add the server outbound IP to the application IP allowlist.' },
  '60003': { kind: 'FAILED', owner: 'MAPPING_OWNER', hint: 'The department does not exist.' },
  '60121': { kind: 'FAILED', owner: 'MAPPING_OWNER', hint: 'The user does not exist.' },
  '60104': { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'The mobile number already belongs to another member.' },
  '40035': { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'Check user and department field values.' },
  '90002': { kind: 'RATE_LIMIT', owner: 'WAIT', hint: 'The API frequency limit was reached.' },
  'Throttling': { kind: 'RATE_LIMIT', owner: 'WAIT', hint: 'The API frequency limit was reached.' },
};
export const dingtalkErrorTable = { error, rules: () => Object.values(RULES) };
