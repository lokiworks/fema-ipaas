import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

function decrypt({ token, encodingKey, receiver, signature, timestamp, nonce, encrypted }: CallbackParams): string {
  verify({ token, signature, timestamp, nonce, encrypted });
  const key = keyOf(encodingKey);
  const decipher = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16));
  decipher.setAutoPadding(false);
  const bytes = Buffer.concat([decipher.update(encrypted, 'base64'), decipher.final()]);
  const pad = bytes.at(-1) ?? 0;
  if (pad < 1 || pad > 32 || !bytes.subarray(-pad).every((value) => value === pad)) throw new Error('Invalid encrypted callback padding');
  const data = bytes.subarray(0, -pad);
  if (data.length < 20) throw new Error('Invalid encrypted callback length');
  const length = data.readUInt32BE(16);
  if (20 + length > data.length || data.subarray(20 + length).toString('utf8') !== receiver) throw new Error('Callback receiver does not match this connection');
  return data.subarray(20, 20 + length).toString('utf8');
}

function encrypt({ token, encodingKey, receiver, text, timestamp = String(Math.floor(Date.now() / 1000)), nonce = randomBytes(12).toString('hex') }: EncryptParams): { encrypt: string; msg_signature: string; timeStamp: string; nonce: string } {
  const key = keyOf(encodingKey);
  const content = Buffer.from(text);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(content.length);
  const data = Buffer.concat([randomBytes(16), length, content, Buffer.from(receiver)]);
  const padding = 32 - data.length % 32;
  const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16));
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([data, Buffer.alloc(padding, padding)])), cipher.final()]).toString('base64');
  return { encrypt: encrypted, msg_signature: digest({ token, timestamp, nonce, encrypted }), timeStamp: timestamp, nonce };
}

function verify({ token, signature, timestamp, nonce, encrypted }: SignatureParams): void {
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new Error('Callback timestamp is outside the allowed window');
  const expected = Buffer.from(digest({ token, timestamp, nonce, encrypted }));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error('Invalid callback signature');
}

function digest({ token, timestamp, nonce, encrypted }: Omit<SignatureParams, 'signature'>): string {
  return createHash('sha1').update([token, timestamp, nonce, encrypted].sort().join('')).digest('hex');
}

function keyOf(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]{43}$/.test(value)) throw new Error('EncodingAESKey must contain 43 base64 characters');
  const key = Buffer.from(`${value}=`, 'base64');
  if (key.length !== 32) throw new Error('Invalid callback encryption key');
  return key;
}

function xmlText({ xml, tag }: { xml: string; tag: string }): string {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(tag)) throw new Error('Invalid XML tag');
  const match = new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tag}>`).exec(xml);
  return match?.[1] ?? match?.[2] ?? '';
}

export const enterpriseCallbacks = { decrypt, encrypt, xmlText };

type SignatureParams = { token: string; signature: string; timestamp: string; nonce: string; encrypted: string };
type CallbackParams = SignatureParams & { encodingKey: string; receiver: string };
type EncryptParams = { token: string; encodingKey: string; receiver: string; text: string; timestamp?: string; nonce?: string };
