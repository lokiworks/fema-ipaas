import { enterpriseCallbacks } from '@fema-ipaas/connector-common';
import { ConnectionType, createMockActionContext, TriggerStrategy } from '@fema-ipaas/connector-sdk';
import { contactChanged } from '../src/lib/triggers/contact-changed';
import { dingtalkContacts } from '../src/lib/common/contacts';

it('encrypts the success acknowledgement, rejects forgeries and reads current member state', async () => {
  if (contactChanged.type !== TriggerStrategy.WEBHOOK) throw new Error('Expected webhook trigger');
  const credentials = { token: 'token', encodingKey: Buffer.alloc(32, 3).toString('base64').replace(/=$/, ''), receiver: 'app-key' };
  const event = { EventType: 'user_modify_org', UserId: ['employee'], TimeStamp: Date.now() };
  const encrypted = enterpriseCallbacks.encrypt({ ...credentials, text: JSON.stringify(event) });
  const context: Parameters<typeof contactChanged.run>[0] = { ...createMockActionContext<typeof contactChanged.props>({ propsValue: { token: credentials.token, encodingKey: credentials.encodingKey, setup: undefined } }), auth: { type: ConnectionType.CUSTOM_AUTH, props: { appKey: 'app-key', appSecret: 'secret', agentId: undefined, robotToken: undefined, robotSecret: undefined } }, webhookUrl: 'https://example.com/hook', payload: { body: { encrypt: encrypted.encrypt }, queryParams: { signature: encrypted.msg_signature, timestamp: encrypted.timeStamp, nonce: encrypted.nonce }, headers: {}, method: 'POST' } };
  const read = vi.spyOn(dingtalkContacts, 'get').mockResolvedValue({ userid: 'employee', name: 'Current name' });
  try {
    const ack = await contactChanged.onHandshake(context);
    expect(ack).toMatchObject({ status: 200, continueToRun: true });
    const body = ack.body;
    if (!body || typeof body !== 'object' || !('encrypt' in body) || typeof body.encrypt !== 'string' || !('msg_signature' in body) || typeof body.msg_signature !== 'string' || !('timeStamp' in body) || typeof body.timeStamp !== 'string' || !('nonce' in body) || typeof body.nonce !== 'string') throw new Error('Invalid encrypted acknowledgement');
    expect(enterpriseCallbacks.decrypt({ ...credentials, encrypted: body.encrypt, signature: body.msg_signature, timestamp: body.timeStamp, nonce: body.nonce })).toBe('success');
    expect(read).not.toHaveBeenCalled();
    if (!ack.triggerPayload) throw new Error('Missing verified payload');
    expect(await contactChanged.run({ ...context, payload: ack.triggerPayload })).toEqual([expect.objectContaining({ userid: 'employee', current: { userid: 'employee', name: 'Current name' } })]);
    expect(await contactChanged.onHandshake({ ...context, payload: { ...context.payload, queryParams: { ...context.payload.queryParams, signature: 'forged' } } })).toMatchObject({ status: 401 });
  } finally { read.mockRestore(); }
});
