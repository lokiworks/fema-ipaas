import { ErrorCode } from '@fema-ipaas/core-utils';
import {
  AuthenticationResponse,
  OptionalServiceKind,
  ServiceCheckResult,
} from '@fema-ipaas/shared';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';

import { authenticationApi } from '@/api/authentication-api';
import { systemApi } from '@/features/system';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

import { setupWizardUtils, WizardDraft } from '../utils/setup-wizard-utils';

function useInstall() {
  return useMutation<AuthenticationResponse, InstallError, InstallVariables>({
    mutationFn: async ({ draft, accountCreated }) => {
      if (!accountCreated) {
        await createAccount({ draft });
      }
      return createOrganization({ draft });
    },
  });
}

function useServiceCheck() {
  return useMutation<ServiceCheckResult, Error, { kind: OptionalServiceKind }>({
    mutationFn: ({ kind }) => systemApi.checkSetupService({ kind }),
  });
}

function installFailureMessage({ error }: { error: InstallError }): string {
  const code = readErrorCode({ error });
  if (code === ErrorCode.EXISTING_USER) {
    return t(
      'This email already has an account. If setup was interrupted, sign in with it to continue.',
    );
  }
  if (code === ErrorCode.DOMAIN_NOT_ALLOWED) {
    return t(
      'This email domain is blocked because it is a disposable address. Use your work email.',
    );
  }
  if (api.isError(error.cause) && !error.cause.response) {
    return t(
      'Cannot reach the server. Check that it is running, then try again.',
    );
  }
  return api.extractServerErrorMessage(
    error.cause,
    t('Setup could not be completed. Check the server log, then try again.'),
  );
}

async function createAccount({ draft }: { draft: WizardDraft }): Promise<void> {
  const { firstName, lastName } = setupWizardUtils.splitName({
    fullName: draft.fullName,
  });
  try {
    const response = await authenticationApi.signUp({
      email: draft.email.trim().toLowerCase(),
      password: draft.password,
      firstName,
      lastName,
      trackEvents: false,
      newsLetter: false,
    });
    authenticationSession.saveResponse(response, false);
  } catch (cause) {
    throw new InstallError({ stage: InstallStage.ACCOUNT, cause });
  }
}

async function createOrganization({
  draft,
}: {
  draft: WizardDraft;
}): Promise<AuthenticationResponse> {
  try {
    return await authenticationApi.completeSignUp({
      fullName: draft.fullName.trim(),
      organizationName: draft.organizationName.trim(),
    });
  } catch (cause) {
    throw new InstallError({ stage: InstallStage.ORGANIZATION, cause });
  }
}

function readErrorCode({ error }: { error: InstallError }): string | undefined {
  if (!api.isError(error.cause)) {
    return undefined;
  }
  const data: unknown = error.cause.response?.data;
  if (typeof data === 'object' && data !== null && 'code' in data) {
    return typeof data.code === 'string' ? data.code : undefined;
  }
  return undefined;
}

export const setupWizardHooks = {
  useInstall,
  useServiceCheck,
  installFailureMessage,
};

export enum InstallStage {
  ACCOUNT = 'ACCOUNT',
  ORGANIZATION = 'ORGANIZATION',
}

export class InstallError extends Error {
  readonly stage: InstallStage;
  readonly cause: unknown;

  constructor({ stage, cause }: { stage: InstallStage; cause: unknown }) {
    super('Setup failed');
    this.stage = stage;
    this.cause = cause;
  }
}

type InstallVariables = {
  draft: WizardDraft;
  accountCreated: boolean;
};
