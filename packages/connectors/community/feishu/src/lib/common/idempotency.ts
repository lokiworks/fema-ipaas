import { createHash } from 'node:crypto';

export const feishuIdempotency = {
  uuidFrom,
  messageUuidFrom,
};

function uuidFrom({ seed }: { seed: string }): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  const variant = VARIANT_NIBBLES[parseInt(hex[16], 16) % VARIANT_NIBBLES.length];
  return [hex.slice(0, 8), hex.slice(8, 12), `4${hex.slice(13, 16)}`, `${variant}${hex.slice(17, 20)}`, hex.slice(20, 32)].join('-');
}

function messageUuidFrom({ key }: { key: string | undefined }): string | undefined {
  const trimmed = key?.trim() ?? '';
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed.length <= MESSAGE_UUID_MAX_LENGTH ? trimmed : createHash('sha256').update(trimmed).digest('hex').slice(0, MESSAGE_UUID_MAX_LENGTH);
}

const VARIANT_NIBBLES = ['8', '9', 'a', 'b'];

const MESSAGE_UUID_MAX_LENGTH = 50;
