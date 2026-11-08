import { describe, expect, it } from 'vitest';

import { tenantAccessUtils } from '@/features/tenant-access/utils/tenant-access-utils';

describe('tenantAccessUtils', () => {
  it('splits pasted emails on new lines, commas and Chinese punctuation', () => {
    expect(
      tenantAccessUtils.parseEmails(
        'A@x.com, b@x.com\nc@x.com；a@x.com、d@y.cn',
      ),
    ).toEqual(['a@x.com', 'b@x.com', 'c@x.com', 'd@y.cn']);
  });

  it('validates email shape', () => {
    expect(tenantAccessUtils.isEmail('someone@acme.com')).toBe(true);
    expect(tenantAccessUtils.isEmail('someone@acme')).toBe(false);
    expect(tenantAccessUtils.isEmail('not an email')).toBe(false);
  });

  it('marks addresses outside the home domains as external', () => {
    expect(
      tenantAccessUtils.isExternalEmail({
        email: 'x@gmail.com',
        homeDomains: ['acme.com'],
      }),
    ).toBe(true);
    expect(
      tenantAccessUtils.isExternalEmail({
        email: 'x@acme.com',
        homeDomains: ['acme.com'],
      }),
    ).toBe(false);
    expect(
      tenantAccessUtils.isExternalEmail({
        email: 'x@gmail.com',
        homeDomains: [],
      }),
    ).toBe(false);
  });

  it('checks worker labels and concurrency', () => {
    expect(tenantAccessUtils.parseLabels('Intranet, gpu gpu')).toEqual([
      'intranet',
      'gpu',
    ]);
    expect(tenantAccessUtils.labelsError(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(
      'atMostFiveLabels',
    );
    expect(tenantAccessUtils.labelsError(['bad_label'])).toBe(
      'invalidWorkerLabel',
    );
    expect(tenantAccessUtils.labelsError(['ok-1'])).toBeNull();
    expect(tenantAccessUtils.concurrencyError('0')).toBe(
      'workerConcurrencyRange',
    );
    expect(tenantAccessUtils.concurrencyError('101')).toBe(
      'workerConcurrencyRange',
    );
    expect(tenantAccessUtils.concurrencyError('5')).toBeNull();
  });

  it('builds a docker command that uses the existing worker token', () => {
    const command = tenantAccessUtils.workerDockerCommand({
      name: 'w1',
      frontendUrl: 'https://ipaas.example.com',
      concurrency: '8',
      labels: ['intranet'],
      version: '1.2.3',
    });
    expect(command).toContain('FEMA_CONTAINER_TYPE=WORKER');
    expect(command).toContain('FEMA_FRONTEND_URL=https://ipaas.example.com');
    expect(command).toContain('FEMA_WORKER_TOKEN=<worker-token>');
    expect(command).toContain('FEMA_WORKER_CONCURRENCY=8');
    expect(command).toContain('FEMA_WORKER_LABELS=intranet');
    expect(command).toContain(':1.2.3');
  });

  it('omits the labels line when there are none', () => {
    const command = tenantAccessUtils.workerDockerCommand({
      name: 'w1',
      frontendUrl: 'https://x',
      concurrency: '1',
      labels: [],
      version: '1.0.0',
    });
    expect(command).not.toContain('FEMA_WORKER_LABELS');
  });

  it('quotes CSV cells', () => {
    expect(
      tenantAccessUtils.toCsv([
        ['a', 'b "c"'],
        ['1,2', ''],
      ]),
    ).toBe('"a","b ""c"""\n"1,2",""');
  });

  it('checks the password length range', () => {
    expect(tenantAccessUtils.passwordLengthError(7)).toBe(
      'passwordMinLengthRange',
    );
    expect(tenantAccessUtils.passwordLengthError(10)).toBeNull();
    expect(tenantAccessUtils.passwordLengthError(65)).toBe(
      'passwordMinLengthRange',
    );
  });

  it('falls back to the email when a member has no name', () => {
    expect(
      tenantAccessUtils.memberDisplayName({
        firstName: '',
        lastName: '',
        email: 'x@y.com',
      }),
    ).toBe('x@y.com');
    expect(
      tenantAccessUtils.memberDisplayName({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'x@y.com',
      }),
    ).toBe('Ada Lovelace');
  });
});

describe('tenantAccessUtils.normalizePhone', () => {
  it('adds +86 to mainland numbers and strips separators', () => {
    expect(tenantAccessUtils.normalizePhone('138-0013-8000')).toBe(
      '+8613800138000',
    );
    expect(tenantAccessUtils.normalizePhone('8613800138000')).toBe(
      '+8613800138000',
    );
  });

  it('keeps international numbers', () => {
    expect(tenantAccessUtils.normalizePhone('+1 415 555 0100')).toBe(
      '+14155550100',
    );
  });
});

describe('tenantAccessUtils.parseContacts', () => {
  it('splits emails, phones and invalid entries', () => {
    expect(
      tenantAccessUtils.parseContacts(
        'A@x.com, 13800138000\n+14155550100；bad value;a@x.com',
      ),
    ).toEqual({
      emails: ['a@x.com'],
      phones: ['+8613800138000', '+14155550100'],
      invalid: ['bad value'],
    });
  });
});

describe('tenantAccessUtils.slugError', () => {
  it('accepts lowercase letters, digits and inner hyphens', () => {
    expect(tenantAccessUtils.slugError('acme-1')).toBeNull();
  });

  it('rejects short, long and malformed slugs', () => {
    expect(tenantAccessUtils.slugError('ab')).not.toBeNull();
    expect(tenantAccessUtils.slugError('-acme')).not.toBeNull();
    expect(tenantAccessUtils.slugError('a'.repeat(41))).not.toBeNull();
    expect(tenantAccessUtils.slugError('Acme Corp')).not.toBeNull();
  });
});

describe('tenantAccessUtils.tenantLoginUrl', () => {
  it('joins origin and slug without a doubled slash', () => {
    expect(
      tenantAccessUtils.tenantLoginUrl({
        origin: 'https://ipaas.example.com/',
        slug: 'acme',
      }),
    ).toBe('https://ipaas.example.com/t/acme');
  });
});
