import { httpClient, HttpMethod } from '@fema-ipaas/connector-common';
import { ConnectorAuth, Property, tryCatch } from '@fema-ipaas/connector-sdk';
import { smtp } from './smtp';

export const emailAuth = ConnectorAuth.CustomAuth({
  displayName: 'Mail service', required: true,
  description: 'Choose your SMTP server, or the platform mail service configured by the administrator in System settings. Private SMTP IPs must be explicitly allowed in FEMA_SSRF_ALLOW_LIST. TLS certificates are always verified.',
  props: {
    mode: Property.StaticDropdown({ displayName: 'Mail service', required: true, defaultValue: 'SMTP', options: { options: [{ label: 'Own SMTP server', value: 'SMTP' }, { label: 'Platform mail service', value: 'PLATFORM', requiredServerFlag: 'SMTP_CONFIGURED', description: 'Ask the administrator to configure the mail service in System settings if this option is unavailable.' }] } }),
    host: Property.ShortText({ displayName: 'SMTP host', required: false }),
    port: Property.Number({ displayName: 'SMTP port', required: false, defaultValue: 587 }),
    secure: Property.Checkbox({ displayName: 'Implicit TLS (port 465)', required: false, defaultValue: false }),
    username: Property.ShortText({ displayName: 'SMTP username', required: false }),
    password: ConnectorAuth.SecretText({ displayName: 'SMTP password', required: false }),
    from: Property.ShortText({ displayName: 'Sender address', required: false }),
  },
  async validate({ auth, server }) {
    const { error } = await tryCatch(async () => {
      if (auth.mode === 'PLATFORM') {
        const flags = await httpClient.sendRequest<Record<string, unknown>>({ method: HttpMethod.GET, url: `${server.apiUrl.replace(/\/$/, '')}/v1/flags` });
        if (flags.body['SMTP_CONFIGURED'] !== true) throw new Error('Platform mail is not enabled. Configure it in System settings, or choose your own SMTP server.');
        return;
      }
      if (!auth.host || !auth.from) throw new Error('SMTP host and sender address are required.');
      await smtp.verify({ host: auth.host, port: auth.port ?? 587, secure: auth.secure ?? false, username: auth.username, password: auth.password, from: auth.from });
    });
    return error ? { valid: false, error: error.message } : { valid: true };
  },
});
