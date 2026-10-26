import net from 'node:net';
import { connectorContract } from '@fema-ipaas/connector-sdk';
import { email } from '../src';
import { smtp } from '../src/lib/smtp';

it('satisfies the connector contract', () => {
  expect(connectorContract.violationsOf({ connector: email })).toEqual([]);
});

it('blocks a private SMTP host before opening a connection', async () => {
  const prior = process.env['FEMA_SSRF_ALLOW_LIST'];
  delete process.env['FEMA_SSRF_ALLOW_LIST'];
  try {
    await expect(smtp.verify({ host: '127.0.0.1', port: 25, secure: false, from: 'sender@example.com' })).rejects.toThrow('SMTP host is private or blocked');
  } finally {
    if (prior === undefined) delete process.env['FEMA_SSRF_ALLOW_LIST'];
    else process.env['FEMA_SSRF_ALLOW_LIST'] = prior;
  }
});

it('delivers a message and attachment through an explicitly allowed local SMTP server', async () => {
  const messages: string[] = [];
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    socket.write('220 local SMTP\r\n');
    let pending = '';
    let receiving = false;
    let body = '';
    socket.on('data', (chunk) => {
      pending += chunk;
      while (pending.includes('\r\n')) {
        const end = pending.indexOf('\r\n');
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        if (receiving) {
          if (line === '.') { receiving = false; messages.push(body); socket.write('250 queued\r\n'); }
          else body += `${line}\r\n`;
        } else if (line.startsWith('EHLO')) socket.write('250-local\r\n250 SIZE 10000000\r\n');
        else if (line === 'DATA') { receiving = true; socket.write('354 continue\r\n'); }
        else if (line === 'QUIT') { socket.end('221 goodbye\r\n'); }
        else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing SMTP address');
  const prior = process.env['FEMA_SSRF_ALLOW_LIST'];
  process.env['FEMA_SSRF_ALLOW_LIST'] = '127.0.0.1/32';
  try {
    const result = await smtp.send({ settings: { host: '127.0.0.1', port: address.port, secure: false, from: 'sender@example.com' }, message: { to: ['recipient@example.com'], cc: [], subject: 'Workflow mail', text: 'Hello', attachments: [{ filename: 'hello.txt', content: Buffer.from('Attachment content') }] } });
    expect(result.messageId).toBeTruthy();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Subject: Workflow mail');
    expect(messages[0]).toContain('filename=hello.txt');
    expect(messages[0]).toContain(Buffer.from('Attachment content').toString('base64'));
  } finally {
    if (prior === undefined) delete process.env['FEMA_SSRF_ALLOW_LIST'];
    else process.env['FEMA_SSRF_ALLOW_LIST'] = prior;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
