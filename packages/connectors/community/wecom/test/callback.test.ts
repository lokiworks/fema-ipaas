import { enterpriseCallbacks } from '@fema-ipaas/connector-common';
import { ConnectionType, createMockActionContext, TriggerStrategy } from '@fema-ipaas/connector-sdk';
import { contactChanged } from '../src/lib/triggers/contact-changed';
import { wecomContacts } from '../src/lib/common/contacts';

it('acknowledges verified callbacks and reads current state only during execution', async () => {
  if (contactChanged.type !== TriggerStrategy.WEBHOOK) throw new Error('Expected webhook trigger');
  const credentials = { token: 'token', encodingKey: Buffer.alloc(32, 3).toString('base64').replace(/=$/, ''), receiver: 'corp' };
  const encrypted = enterpriseCallbacks.encrypt({ ...credentials, text: '<xml><Event>change_contact</Event><ChangeType>update_user</ChangeType><UserID>employee</UserID><CreateTime>1</CreateTime></xml>' });
  const context: Parameters<typeof contactChanged.run>[0] = { ...createMockActionContext<typeof contactChanged.props>({ propsValue: { token: credentials.token, encodingKey: credentials.encodingKey, setup: undefined } }), auth: { type: ConnectionType.CUSTOM_AUTH, props: { corpId: 'corp', appSecret: 'secret', contactSecret: undefined, agentId: undefined, robotKey: undefined } }, webhookUrl: 'https://example.com/hook', payload: { body: `<xml><Encrypt><![CDATA[${encrypted.encrypt}]]></Encrypt></xml>`, queryParams: { msg_signature: encrypted.msg_signature, timestamp: encrypted.timeStamp, nonce: encrypted.nonce }, headers: {}, method: 'POST' } };
  const read = vi.spyOn(wecomContacts, 'get').mockResolvedValue({ userid: 'employee', name: 'Current name' });
  try {
    const ack = await contactChanged.onHandshake(context);
    expect(ack).toMatchObject({ status: 200, body: 'success', continueToRun: true });
    expect(read).not.toHaveBeenCalled();
    if (!ack.triggerPayload) throw new Error('Missing verified payload');
    expect(await contactChanged.run({ ...context, payload: ack.triggerPayload })).toEqual([expect.objectContaining({ userid: 'employee', current: { userid: 'employee', name: 'Current name' } })]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(await contactChanged.onHandshake({ ...context, payload: { ...context.payload, queryParams: { ...context.payload.queryParams, msg_signature: 'forged' } } })).toMatchObject({ status: 401 });
    const handshake = await contactChanged.onHandshake({ ...context, payload: { ...context.payload, queryParams: { ...context.payload.queryParams, echostr: encrypted.encrypt } } });
    expect(handshake).toMatchObject({ status: 200, continueToRun: false });
  } finally { read.mockRestore(); }
});
