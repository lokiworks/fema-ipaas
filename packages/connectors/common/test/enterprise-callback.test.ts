import { enterpriseCallbacks } from '../src/lib/enterprise-callback';

const credentials = { token: 'callback-token', encodingKey: Buffer.alloc(32, 7).toString('base64').replace(/=$/, ''), receiver: 'corp-test' };

it('verifies and decrypts callbacks bound to the configured enterprise', () => {
  const encrypted = enterpriseCallbacks.encrypt({ ...credentials, text: '<xml><UserID><![CDATA[employee-1]]></UserID></xml>' });
  const plain = enterpriseCallbacks.decrypt({ ...credentials, encrypted: encrypted.encrypt, signature: encrypted.msg_signature, timestamp: encrypted.timeStamp, nonce: encrypted.nonce });
  expect(enterpriseCallbacks.xmlText({ xml: plain, tag: 'UserID' })).toBe('employee-1');
  expect(() => enterpriseCallbacks.decrypt({ ...credentials, receiver: 'other-corp', encrypted: encrypted.encrypt, signature: encrypted.msg_signature, timestamp: encrypted.timeStamp, nonce: encrypted.nonce })).toThrow('receiver');
});

it('rejects forged signatures and replayed timestamps', () => {
  const encrypted = enterpriseCallbacks.encrypt({ ...credentials, text: 'success' });
  expect(() => enterpriseCallbacks.decrypt({ ...credentials, encrypted: encrypted.encrypt, signature: 'forged', timestamp: encrypted.timeStamp, nonce: encrypted.nonce })).toThrow('signature');
  const old = enterpriseCallbacks.encrypt({ ...credentials, text: 'success', timestamp: String(Math.floor(Date.now() / 1000) - 600) });
  expect(() => enterpriseCallbacks.decrypt({ ...credentials, encrypted: old.encrypt, signature: old.msg_signature, timestamp: old.timeStamp, nonce: old.nonce })).toThrow('timestamp');
});
