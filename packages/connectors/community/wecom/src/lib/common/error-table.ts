import { blockedUntilMarker, FixOwner, fixOwnerMarker } from '@fema-ipaas/connector-sdk';

function error({ code, hint }: { code: number; hint?: string }): Error {
  const rule = RULES[code] ?? { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: 'Review the application permissions and request parameters.' };
  const message = `WeCom ${code}: ${rule.hint}${hint ? ` (${hint})` : ''}`;
  return rule.kind === 'RATE_LIMIT' ? new WecomError({ code, message: blockedUntilMarker.attach({ message, until: new Date(Date.now() + 30000) }) }) : new WecomError({ code, message: fixOwnerMarker.attach({ message, owner: rule.owner }) });
}

export class WecomError extends Error {
  readonly code: number;
  constructor({ code, message }: { code: number; message: string }) { super(message); this.code = code; }
}

const RULES: Record<number, { kind: 'FAILED' | 'RATE_LIMIT'; owner: FixOwner; hint: string }> = {
  40001: { kind: 'FAILED', owner: 'CONNECTION_OWNER', hint: 'Check the application secret.' },
  40013: { kind: 'FAILED', owner: 'CONNECTION_OWNER', hint: 'Check the corporate ID.' },
  40014: { kind: 'FAILED', owner: 'CONNECTION_OWNER', hint: 'The access token is invalid.' },
  42001: { kind: 'FAILED', owner: 'CONNECTION_OWNER', hint: 'The access token expired.' },
  45009: { kind: 'RATE_LIMIT', owner: 'WAIT', hint: 'The API frequency limit was reached.' },
  48002: { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: 'Grant the application permission for this operation.' },
  60011: { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: 'Include this member or department in the application visibility scope.' },
  60020: { kind: 'FAILED', owner: 'TARGET_ADMIN', hint: 'Add the server outbound IP to the application trusted IP list in the WeCom administration console.' },
  60003: { kind: 'FAILED', owner: 'MAPPING_OWNER', hint: 'The department does not exist.' },
  60111: { kind: 'FAILED', owner: 'MAPPING_OWNER', hint: 'The member does not exist.' },
  60102: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'This user ID already exists.' },
  60104: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'This mobile number already belongs to another member.' },
  60106: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'This email already belongs to another member.' },
  60146: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'No member has this mobile number.' },
  60147: { kind: 'FAILED', owner: 'SOURCE_DATA_OWNER', hint: 'No member has this email.' },
  60123: { kind: 'FAILED', owner: 'MAPPING_OWNER', hint: 'The department ID is invalid.' },
  60124: { kind: 'FAILED', owner: 'MAPPING_OWNER', hint: 'The parent department ID is invalid.' },
};

export const wecomErrorTable = { error, rules: () => Object.values(RULES) };
