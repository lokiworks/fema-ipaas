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
