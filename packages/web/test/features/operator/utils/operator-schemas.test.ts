import { PlatformClientKind, PlatformScope } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { operatorSchemas } from '@/features/operator/utils/operator-schemas';

function messagesOf(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}): Record<string, string> {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [
      String(issue.path[0]),
      issue.message,
    ]),
  );
}

describe('operatorSchemas.createTenantForm', () => {
  const valid = {
    name: 'Acme',
    slug: '',
    contact: 'owner@example.com',
    lastName: '',
    firstName: '',
    limits: {
      usersLimit: '',
      projectsLimit: '10',
      activeWorkflowsLimit: '',
      concurrentExecutionsLimit: '',
      workerGroupId: '',
    },
  };

  it('accepts an email or mobile owner and empty limits', () => {
    expect(operatorSchemas.createTenantForm.safeParse(valid).success).toBe(
      true,
    );
    expect(
      operatorSchemas.createTenantForm.safeParse({
        ...valid,
        contact: '13800138000',
      }).success,
    ).toBe(true);
  });

  it('reports translation keys for each invalid field', () => {
    const result = operatorSchemas.createTenantForm.safeParse({
      ...valid,
      name: ' ',
      slug: 'A b',
      contact: 'nobody',
      limits: { ...valid.limits, usersLimit: '-1' },
    });
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toMatchObject({
      name: 'required',
      slug: 'tenantSlugInvalid',
      contact: 'Enter the owner email address or mobile number',
    });
  });
});

describe('operatorSchemas.limitsForm', () => {
  it('rejects non-integer limits with the shared message', () => {
    const result = operatorSchemas.limitsForm.safeParse({
      limits: {
        usersLimit: '1.5',
        projectsLimit: '',
        activeWorkflowsLimit: '',
        concurrentExecutionsLimit: '',
        workerGroupId: '',
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('operatorSchemas.platformClientForm', () => {
  it('accepts an API key with a name and scopes', () => {
    expect(
      operatorSchemas.platformClientForm.safeParse({
        kind: PlatformClientKind.API_KEY,
        name: 'Billing',
        issuer: '',
        subjects: '',
        scopes: [PlatformScope.USAGE_READ],
      }).success,
    ).toBe(true);
  });

  it('requires scopes and a name', () => {
    const result = operatorSchemas.platformClientForm.safeParse({
      kind: PlatformClientKind.API_KEY,
      name: '',
      issuer: '',
      subjects: '',
      scopes: [],
    });
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toMatchObject({
      name: 'required',
      scopes: 'required',
    });
  });

  it('maps trusted issuer problems onto the form fields', () => {
    const result = operatorSchemas.platformClientForm.safeParse({
      kind: PlatformClientKind.TRUSTED_ISSUER,
      name: 'IAM',
      issuer: 'not a url',
      subjects: '',
      scopes: [PlatformScope.TENANT_PROVISION],
    });
    expect(result.success).toBe(false);
    expect(Object.keys(messagesOf(result))).toEqual(
      expect.arrayContaining(['issuer', 'subjects']),
    );
  });
});

describe('operatorSchemas.smsForm', () => {
  const values = {
    provider: 'ALIYUN' as const,
    accessKeyId: 'ak',
    accessKeySecret: '',
    signName: 'Sign',
    templateCode: 'SMS_1',
    sdkAppId: '',
    region: '',
  };

  it('requires the secret only when none is saved', () => {
    const first = operatorSchemas
      .smsForm({ hasSecret: false })
      .safeParse(values);
    expect(first.success).toBe(false);
    expect(messagesOf(first)).toMatchObject({ accessKeySecret: 'required' });
    expect(
      operatorSchemas.smsForm({ hasSecret: true }).safeParse(values).success,
    ).toBe(true);
  });
});

describe('operatorSchemas.smsTestForm', () => {
  it('normalizes a mainland number before validating', () => {
    expect(
      operatorSchemas.smsTestForm.safeParse({ phone: '138 0013 8000' }).success,
    ).toBe(true);
    const bad = operatorSchemas.smsTestForm.safeParse({ phone: '123' });
    expect(bad.success).toBe(false);
    expect(messagesOf(bad)).toMatchObject({ phone: 'invalidPhone' });
  });
});

describe('operatorSchemas.loginAppForm', () => {
  const values = {
    enabled: true,
    appId: 'cli_x',
    appSecret: '',
    region: '',
    allowSelfSignup: false,
  };

  it('requires the secret only when none is saved', () => {
    expect(
      operatorSchemas.loginAppForm({ hasSecret: false }).safeParse(values)
        .success,
    ).toBe(false);
    expect(
      operatorSchemas.loginAppForm({ hasSecret: true }).safeParse(values)
        .success,
    ).toBe(true);
  });
});
