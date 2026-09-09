import Crypto from 'crypto';

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    record[key] = Reflect.get(value, key);
  }
  return record;
}

function decrypt(encrypted: string, encryptKey: string): string {
  const key = Crypto.createHash('sha256').update(encryptKey).digest();
  const buffer = Buffer.from(encrypted, 'base64');
  const decipher = Crypto.createDecipheriv('aes-256-cbc', key, buffer.subarray(0, 16));
  return Buffer.concat([decipher.update(buffer.subarray(16)), decipher.final()]).toString('utf8');
}

function decode({ payload, encryptKey }: DecodeParams): Record<string, unknown> {
  const body = asRecord(payload);
  const encrypted = body['encrypt'];
  if (typeof encrypted !== 'string') {
    return body;
  }
  if (!encryptKey) {
    throw new Error(
      'Feishu sent an encrypted event but no Encrypt Key is configured on this trigger',
    );
  }
  return asRecord(JSON.parse(decrypt(encrypted, encryptKey)));
}

function challenge(body: Record<string, unknown>): string {
  const value = body['challenge'];
  return typeof value === 'string' ? value : '';
}

function token(body: Record<string, unknown>): string | undefined {
  const fromHeader = asRecord(body['header'])['token'];
  if (typeof fromHeader === 'string') {
    return fromHeader;
  }
  const fromBody = body['token'];
  return typeof fromBody === 'string' ? fromBody : undefined;
}

function eventType(body: Record<string, unknown>): string | undefined {
  const fromHeader = asRecord(body['header'])['event_type'];
  if (typeof fromHeader === 'string') {
    return fromHeader;
  }
  const legacy = asRecord(body['event'])['type'];
  return typeof legacy === 'string' ? legacy : undefined;
}

export const eventPayload = {
  decode,
  challenge,
  token,
  eventType,
};

type DecodeParams = {
  payload: unknown;
  encryptKey: string | undefined;
};
