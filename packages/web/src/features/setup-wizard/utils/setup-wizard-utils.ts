import {
  MAX_FULL_NAME_LENGTH,
  MAX_ORGANIZATION_NAME_LENGTH,
} from '@fema-ipaas/shared';

import { passwordRules } from '@/features/authentication/utils/password-validation-utils';
import { formatUtils } from '@/lib/format-utils';

const FORBIDDEN_NAME_CHARACTERS = /[./]/;
const MAX_ADMIN_NAME_LENGTH = 50;

function validateAdministrator({
  draft,
}: {
  draft: WizardDraft;
}): AdministratorErrors {
  return {
    fullName: fullNameError({ value: draft.fullName }),
    email: emailError({ value: draft.email }),
    password: passwordError({ value: draft.password }),
    confirmPassword: confirmError({
      password: draft.password,
      confirmation: draft.confirmPassword,
    }),
  };
}

function validateOrganization({
  draft,
}: {
  draft: WizardDraft;
}): OrganizationErrors {
  const value = draft.organizationName.trim();
  if (value.length === 0) {
    return { organizationName: 'Organization name is required' };
  }
  if (value.length > MAX_ORGANIZATION_NAME_LENGTH) {
    return { organizationName: 'Organization name is too long' };
  }
  return { organizationName: null };
}

function hasErrors({ errors }: { errors: Record<string, string | null> }) {
  return Object.values(errors).some((error) => error !== null);
}

function firstBlockedStep({
  draft,
}: {
  draft: WizardDraft;
}): WizardStep | null {
  if (hasErrors({ errors: validateAdministrator({ draft }) })) {
    return WizardStep.ADMINISTRATOR;
  }
  if (hasErrors({ errors: validateOrganization({ draft }) })) {
    return WizardStep.ORGANIZATION;
  }
  return null;
}

function reachableStep({
  requested,
  draft,
}: {
  requested: WizardStep;
  draft: WizardDraft;
}): WizardStep {
  const blocked = firstBlockedStep({ draft });
  if (blocked === null) {
    return requested;
  }
  return WIZARD_STEPS.indexOf(requested) > WIZARD_STEPS.indexOf(blocked)
    ? blocked
    : requested;
}

function stepFromParam({ value }: { value: string | null }): WizardStep {
  return WIZARD_STEPS.find((step) => step === value) ?? WizardStep.ENVIRONMENT;
}

function stepNumber({ step }: { step: WizardStep }): number {
  return WIZARD_STEPS.indexOf(step) + 1;
}

function splitName({ fullName }: { fullName: string }): {
  firstName: string;
  lastName: string;
} {
  const [first = '', ...rest] = fullName.trim().split(/\s+/);
  return {
    firstName: first,
    lastName: rest.length > 0 ? rest.join(' ') : PLACEHOLDER_LAST_NAME,
  };
}

function loadDraft(): WizardDraft {
  const stored = readStoredDraft();
  return { ...EMPTY_DRAFT, ...stored };
}

function saveDraft({ draft }: { draft: WizardDraft }): void {
  try {
    const { fullName, email, organizationName } = draft;
    window.sessionStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ fullName, email, organizationName }),
    );
  } catch {
    return;
  }
}

function clearDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    return;
  }
}

function accessAddress({
  configured,
  current,
}: {
  configured: string | null;
  current: string;
}): AccessAddress {
  const currentOrigin = originOf({ value: current });
  const configuredOrigin =
    configured === null ? null : originOf({ value: configured });
  const mismatch =
    configuredOrigin !== null &&
    currentOrigin !== null &&
    configuredOrigin !== currentOrigin;
  const insecure =
    currentOrigin !== null &&
    currentOrigin.startsWith('http://') &&
    !isLocalOrigin({ origin: currentOrigin });
  return {
    current: currentOrigin,
    configured: configuredOrigin,
    mismatch,
    insecure,
  };
}

function fullNameError({ value }: { value: string }): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'Full name is required';
  }
  if (
    trimmed.length > MAX_ADMIN_NAME_LENGTH ||
    trimmed.length > MAX_FULL_NAME_LENGTH
  ) {
    return 'Full name is too long';
  }
  if (FORBIDDEN_NAME_CHARACTERS.test(trimmed)) {
    return 'Full name cannot contain . or /';
  }
  return null;
}

function emailError({ value }: { value: string }): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'Email is required';
  }
  return formatUtils.emailRegex.test(trimmed) ? null : 'Email is invalid';
}

function passwordError({ value }: { value: string }): string | null {
  if (value.length === 0) {
    return 'Password is required';
  }
  const failingIndex = passwordRules.findIndex(
    (rule) => !rule.condition(value),
  );
  if (failingIndex === -1) {
    return null;
  }
  if (failingIndex === 0) {
    return value.length < MIN_PASSWORD_LENGTH
      ? 'Password must be at least 8 characters long'
      : "Password can't be more than 64 characters long";
  }
  return PASSWORD_RULE_MESSAGES[failingIndex] ?? 'Password is too weak';
}

function confirmError({
  password,
  confirmation,
}: {
  password: string;
  confirmation: string;
}): string | null {
  if (confirmation.length === 0) {
    return 'Enter the password again';
  }
  return confirmation === password ? null : 'The two passwords do not match';
}

function readStoredDraft(): Partial<WizardDraft> {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (raw === null) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    return {
      fullName: stringField({ source: parsed, key: 'fullName' }),
      email: stringField({ source: parsed, key: 'email' }),
      organizationName: stringField({
        source: parsed,
        key: 'organizationName',
      }),
    };
  } catch {
    return {};
  }
}

function stringField({ source, key }: { source: object; key: string }): string {
  const value: unknown = Object.entries(source).find(
    ([name]) => name === key,
  )?.[1];
  return typeof value === 'string' ? value : '';
}

function originOf({ value }: { value: string }): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLocalOrigin({ origin }: { origin: string }): boolean {
  const { hostname } = new URL(origin);
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  );
}

export const setupWizardUtils = {
  validateAdministrator,
  validateOrganization,
  hasErrors,
  firstBlockedStep,
  reachableStep,
  stepFromParam,
  stepNumber,
  splitName,
  loadDraft,
  saveDraft,
  clearDraft,
  accessAddress,
};

export enum WizardStep {
  ENVIRONMENT = 'environment',
  ADMINISTRATOR = 'administrator',
  ORGANIZATION = 'organization',
  SERVICES = 'services',
  REVIEW = 'review',
}

export const WIZARD_STEPS: WizardStep[] = [
  WizardStep.ENVIRONMENT,
  WizardStep.ADMINISTRATOR,
  WizardStep.ORGANIZATION,
  WizardStep.SERVICES,
  WizardStep.REVIEW,
];

const PLACEHOLDER_LAST_NAME = '-';
const DRAFT_STORAGE_KEY = 'setup-wizard-draft';

const MIN_PASSWORD_LENGTH = 8;

const PASSWORD_RULE_MESSAGES: Record<number, string> = {
  1: 'Password must contain at least one special character',
  2: 'Password must contain at least one lowercase letter',
  3: 'Password must contain at least one uppercase letter',
  4: 'Password must contain at least one number',
};

const EMPTY_DRAFT: WizardDraft = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  organizationName: '',
};

export type WizardDraft = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  organizationName: string;
};

export type AdministratorErrors = {
  fullName: string | null;
  email: string | null;
  password: string | null;
  confirmPassword: string | null;
};

export type OrganizationErrors = {
  organizationName: string | null;
};

export type AccessAddress = {
  current: string | null;
  configured: string | null;
  mismatch: boolean;
  insecure: boolean;
};
