import { AuthenticationType, httpClient, HttpMethod } from '@fema-ipaas/connector-common';
import { ConnectorCategory, ConnectorFile, createAction, createConnector, Property } from '@fema-ipaas/connector-sdk';
import { emailAuth } from './lib/auth';
import { MailMessage, smtp } from './lib/smtp';

const sendEmail = createAction({
  auth: emailAuth, name: 'send_email', displayName: 'Send email', description: 'Send an email using SMTP or the platform mail service', classification: 'WRITE',
  reliability: { writeSafety: 'UNSAFE', rateLimits: [{ bucket: 'email-send', scope: 'APP', perSecond: 1 }] },
  aiMetadata: { description: 'Send email to at most 50 recipients. Repeating this action sends another email. Review delivery after a timeout.', idempotent: false },
  props: {
    to: Property.Array({ displayName: 'To', required: true }), cc: Property.Array({ displayName: 'Cc', required: false }),
    subject: Property.ShortText({ displayName: 'Subject', required: true }), text: Property.LongText({ displayName: 'Plain text', required: false }), html: Property.LongText({ displayName: 'HTML', required: false }),
    attachments: Property.Array({ displayName: 'Attachments', required: false, properties: { file: Property.File({ displayName: 'File', required: true }) } }),
  },
  outputSchema: { fields: [{ key: 'messageId', label: 'Message ID' }] },
  async run(context) {
    const to = recipients(context.propsValue.to);
    const cc = recipients(context.propsValue.cc ?? []);
    if (!to.length || to.length + cc.length > 50) throw new Error('Provide between 1 and 50 recipients.');
    if (!context.propsValue.text && !context.propsValue.html) throw new Error('Provide plain text or HTML.');
    const attachments = attachmentFiles(context.propsValue.attachments ?? []);
    if (attachments.reduce((sum, file) => sum + file.content.length, 0) > 10 * 1024 * 1024) throw new Error('Attachments must total at most 10 MB.');
    const auth = context.auth.props;
    await context.rateLimit.acquire({ bucket: 'email-send', scopeKey: auth.mode === 'PLATFORM' ? 'platform' : `${auth.host}:${auth.username}` });
    const message: MailMessage = { to, cc, subject: context.propsValue.subject, text: context.propsValue.text, html: context.propsValue.html, attachments };
    if (auth.mode === 'PLATFORM') {
      const response = await httpClient.sendRequest<{ messageId: string }>({ method: HttpMethod.POST, url: `${context.server.apiUrl.replace(/\/$/, '')}/v1/engine/email/send`, authentication: { type: AuthenticationType.BEARER_TOKEN, token: context.server.token }, body: { ...message, attachments: attachments.map((file) => ({ filename: file.filename, content: file.content.toString('base64') })) } });
      return response.body;
    }
    if (!auth.host || !auth.from) throw new Error('SMTP host and sender address are required.');
    return smtp.send({ settings: { host: auth.host, port: auth.port ?? 587, secure: auth.secure ?? false, username: auth.username, password: auth.password, from: auth.from }, message });
  },
});

function recipients(values: unknown[]): string[] {
  return values.map((value) => { if (typeof value !== 'string' || !/^[^\s@<>]+@[^\s@<>]+$/.test(value)) throw new Error('Invalid recipient address'); return value; });
}

function attachmentFiles(values: unknown[]): { filename: string; content: Buffer }[] {
  return values.map((value) => {
    if (typeof value !== 'object' || value === null || !('file' in value) || !(value.file instanceof ConnectorFile)) throw new Error('Invalid attachment');
    return { filename: value.file.filename, content: value.file.data };
  });
}

export const email = createConnector({ displayName: 'Email', description: 'Send workflow email', logoUrl: '/assets/connectors/email.svg', authors: ['lokiworks'], categories: [ConnectorCategory.CORE], auth: emailAuth, actions: [sendEmail], triggers: [] });
