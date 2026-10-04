// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import {
  setupWizardUtils,
  WizardDraft,
  WizardStep,
} from './setup-wizard-utils';

const validDraft: WizardDraft = {
  fullName: 'Lin Xiao',
  email: 'admin@corp.test',
  password: 'Passw0rd!x1',
  confirmPassword: 'Passw0rd!x1',
  organizationName: 'Acme',
};

describe('setupWizardUtils.validateAdministrator', () => {
  it('accepts a complete administrator', () => {
    const errors = setupWizardUtils.validateAdministrator({
      draft: validDraft,
    });
    expect(setupWizardUtils.hasErrors({ errors })).toBe(false);
  });

  it('asks for every field when the form is empty', () => {
    const errors = setupWizardUtils.validateAdministrator({
      draft: {
        ...validDraft,
        fullName: '',
        email: '',
        password: '',
        confirmPassword: '',
      },
    });
    expect(errors).toEqual({
      fullName: 'Full name is required',
      email: 'Email is required',
      password: 'Password is required',
      confirmPassword: 'Enter the password again',
    });
  });

  it('names the first missing password rule', () => {
    const cases: [string, string][] = [
      ['Ab1!', 'Password must be at least 8 characters long'],
      ['password1', 'Password must contain at least one special character'],
      ['PASSWORD1!', 'Password must contain at least one lowercase letter'],
      ['password1!', 'Password must contain at least one uppercase letter'],
      ['Password!!', 'Password must contain at least one number'],
      [
        `Aa1!${'x'.repeat(61)}`,
        "Password can't be more than 64 characters long",
      ],
    ];
    cases.forEach(([password, message]) => {
      const errors = setupWizardUtils.validateAdministrator({
        draft: { ...validDraft, password, confirmPassword: password },
      });
      expect(errors.password).toBe(message);
    });
  });

  it('rejects a confirmation that differs', () => {
    const errors = setupWizardUtils.validateAdministrator({
      draft: { ...validDraft, confirmPassword: 'Passw0rd!x2' },
    });
    expect(errors.confirmPassword).toBe('The two passwords do not match');
  });

  it('rejects malformed emails and names the API refuses', () => {
    const errors = setupWizardUtils.validateAdministrator({
      draft: { ...validDraft, email: 'not-an-email', fullName: 'a/b' },
    });
    expect(errors.email).toBe('Email is invalid');
    expect(errors.fullName).toBe('Full name cannot contain . or /');
  });
});

describe('setupWizardUtils.validateOrganization', () => {
  it('requires a name of at most 20 characters', () => {
    expect(
      setupWizardUtils.validateOrganization({
        draft: { ...validDraft, organizationName: '   ' },
      }).organizationName,
    ).toBe('Organization name is required');
    expect(
      setupWizardUtils.validateOrganization({
        draft: { ...validDraft, organizationName: 'x'.repeat(21) },
      }).organizationName,
    ).toBe('Organization name is too long');
    expect(
      setupWizardUtils.validateOrganization({
        draft: { ...validDraft, organizationName: 'x'.repeat(20) },
      }).organizationName,
    ).toBeNull();
  });
});

describe('setupWizardUtils.reachableStep', () => {
  const empty: WizardDraft = {
    ...validDraft,
    password: '',
    confirmPassword: '',
    organizationName: '',
  };

  it('sends the visitor back to the first step that is not filled in', () => {
    expect(
      setupWizardUtils.reachableStep({
        requested: WizardStep.REVIEW,
        draft: empty,
      }),
    ).toBe(WizardStep.ADMINISTRATOR);
    expect(
      setupWizardUtils.reachableStep({
        requested: WizardStep.SERVICES,
        draft: { ...validDraft, organizationName: '' },
      }),
    ).toBe(WizardStep.ORGANIZATION);
  });

  it('lets the visitor look at earlier steps and at everything once filled in', () => {
    expect(
      setupWizardUtils.reachableStep({
        requested: WizardStep.ENVIRONMENT,
        draft: empty,
      }),
    ).toBe(WizardStep.ENVIRONMENT);
    expect(
      setupWizardUtils.reachableStep({
        requested: WizardStep.ADMINISTRATOR,
        draft: empty,
      }),
    ).toBe(WizardStep.ADMINISTRATOR);
    expect(
      setupWizardUtils.reachableStep({
        requested: WizardStep.REVIEW,
        draft: validDraft,
      }),
    ).toBe(WizardStep.REVIEW);
  });

  it('falls back to the first step for an unknown address', () => {
    expect(setupWizardUtils.stepFromParam({ value: 'nonsense' })).toBe(
      WizardStep.ENVIRONMENT,
    );
    expect(setupWizardUtils.stepFromParam({ value: null })).toBe(
      WizardStep.ENVIRONMENT,
    );
    expect(setupWizardUtils.stepFromParam({ value: 'services' })).toBe(
      WizardStep.SERVICES,
    );
  });
});

describe('setupWizardUtils.splitName', () => {
  it('gives the API a first and a last name even for one-word names', () => {
    expect(setupWizardUtils.splitName({ fullName: 'Lin Xiao' })).toEqual({
      firstName: 'Lin',
      lastName: 'Xiao',
    });
    expect(setupWizardUtils.splitName({ fullName: '林晓' })).toEqual({
      firstName: '林晓',
      lastName: '-',
    });
    expect(
      setupWizardUtils.splitName({ fullName: '  Anna  Maria  Lopez ' }),
    ).toEqual({ firstName: 'Anna', lastName: 'Maria Lopez' });
  });
});

describe('setupWizardUtils drafts', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('keeps everything except the passwords across a reload', () => {
    setupWizardUtils.saveDraft({ draft: validDraft });
    const stored = window.sessionStorage.getItem('setup-wizard-draft') ?? '';
    expect(stored).not.toContain('Passw0rd');
    const loaded = setupWizardUtils.loadDraft();
    expect(loaded).toEqual({
      ...validDraft,
      password: '',
      confirmPassword: '',
    });
  });

  it('ignores a corrupted draft', () => {
    window.sessionStorage.setItem('setup-wizard-draft', '{not json');
    expect(setupWizardUtils.loadDraft().email).toBe('');
    window.sessionStorage.setItem('setup-wizard-draft', '[1,2]');
    expect(setupWizardUtils.loadDraft().fullName).toBe('');
  });

  it('forgets the draft once setup is finished', () => {
    setupWizardUtils.saveDraft({ draft: validDraft });
    setupWizardUtils.clearDraft();
    expect(setupWizardUtils.loadDraft().email).toBe('');
  });
});

describe('setupWizardUtils.accessAddress', () => {
  it('flags a configured address that differs from the one in the browser', () => {
    const result = setupWizardUtils.accessAddress({
      configured: 'http://localhost:3000/',
      current: 'http://10.0.0.5:8080',
    });
    expect(result.mismatch).toBe(true);
    expect(result.insecure).toBe(true);
  });

  it('accepts a matching address and does not call localhost insecure', () => {
    const matching = setupWizardUtils.accessAddress({
      configured: 'http://localhost:4200/',
      current: 'http://localhost:4200',
    });
    expect(matching.mismatch).toBe(false);
    expect(matching.insecure).toBe(false);
    const secure = setupWizardUtils.accessAddress({
      configured: 'https://ipaas.corp.test',
      current: 'https://ipaas.corp.test',
    });
    expect(secure.mismatch).toBe(false);
    expect(secure.insecure).toBe(false);
  });
});
