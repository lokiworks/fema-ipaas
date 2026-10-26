import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { blockedUntilMarker, fixOwnerMarker, isObject, ssrfIpClassifier, tryCatch } from '@fema-ipaas/connector-sdk';
import nodemailer from 'nodemailer';

async function transport(settings: SmtpSettings) {
  const allowList = ssrfIpClassifier.parseAllowList({ raw: process.env['FEMA_SSRF_ALLOW_LIST'] });
  const addresses = isIP(settings.host) ? [{ address: settings.host }] : await lookup(settings.host, { all: true });
  if (!addresses.length || addresses.some(({ address }) => ssrfIpClassifier.isBlockedIp({ ip: address, allowList }))) {
    throw new Error(fixOwnerMarker.attach({ message: 'SMTP host is private or blocked. Ask the administrator to add its IP or CIDR to FEMA_SSRF_ALLOW_LIST.', owner: 'TARGET_ADMIN' }));
  }
  if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) throw new Error('Invalid SMTP port');
  return nodemailer.createTransport({
    host: addresses[0].address, port: settings.port, secure: settings.secure,
    ...(settings.username ? { auth: { user: settings.username, pass: settings.password ?? '' } } : {}),
    tls: { servername: settings.host, rejectUnauthorized: true },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 30000,
    disableFileAccess: true, disableUrlAccess: true,
  });
}

async function verify(settings: SmtpSettings): Promise<void> {
  const client = await transport(settings);
  const { error } = await tryCatch(() => client.verify());
  client.close();
  if (error) throw failure(error);
}

async function send({ settings, message }: { settings: SmtpSettings; message: MailMessage }): Promise<{ messageId: string }> {
  const client = await transport(settings);
  const { data, error } = await tryCatch(() => client.sendMail({ ...message, from: settings.from }));
  client.close();
  if (error) throw failure(error);
  if ((data.rejected?.length ?? 0) > 0) throw new Error(fixOwnerMarker.attach({ message: 'Some recipients were rejected; other recipients may already have received this email. Review delivery before sending again.', owner: 'SOURCE_DATA_OWNER' }));
  return { messageId: String(data.messageId) };
}

function failure(error: unknown): Error {
  const status = isObject(error) && typeof error['responseCode'] === 'number' ? error['responseCode'] : 0;
  if ([421, 451].includes(status)) return new Error(blockedUntilMarker.attach({ message: 'SMTP server is temporarily rejecting mail. Check delivery before sending again.', until: new Date(Date.now() + 30000) }));
  const owner = status === 535 ? 'CONNECTION_OWNER' : status === 550 ? 'SOURCE_DATA_OWNER' : 'TARGET_ADMIN';
  return new Error(fixOwnerMarker.attach({ message: `SMTP delivery failed (${status || 'connection'}). The email may already have been accepted. Check delivery before sending again.`, owner }));
}

export const smtp = { verify, send };

export type SmtpSettings = { host: string; port: number; secure: boolean; username?: string; password?: string; from: string };
export type MailMessage = { to: string[]; cc: string[]; subject: string; text?: string; html?: string; attachments: { filename: string; content: Buffer }[] };
