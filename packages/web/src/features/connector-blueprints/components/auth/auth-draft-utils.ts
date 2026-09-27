import {
  BlueprintAuth,
  BlueprintAuthFieldControl,
  BlueprintAuthFlow,
  BlueprintAuthFlowStep,
  BlueprintAuthProblem,
  BlueprintAuthType,
  blueprintRules,
  blueprintTemplate,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

function same({ left, right }: { left: unknown; right: unknown }): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function flowStepOf({
  auth,
  flow,
}: {
  auth: BlueprintAuth;
  flow: BlueprintAuthFlow;
}): BlueprintAuthFlowStep {
  switch (flow) {
    case BlueprintAuthFlow.TOKEN:
      return auth.tokenFlow;
    case BlueprintAuthFlow.REFRESH:
      return auth.refreshFlow;
    case BlueprintAuthFlow.USER:
      return auth.userFlow;
  }
}

function withFlowStep({
  auth,
  flow,
  patch,
}: {
  auth: BlueprintAuth;
  flow: BlueprintAuthFlow;
  patch: Partial<BlueprintAuthFlowStep>;
}): BlueprintAuth {
  const next = { ...flowStepOf({ auth, flow }), ...patch };
  switch (flow) {
    case BlueprintAuthFlow.TOKEN:
      return { ...auth, tokenFlow: next };
    case BlueprintAuthFlow.REFRESH:
      return { ...auth, refreshFlow: next };
    case BlueprintAuthFlow.USER:
      return { ...auth, userFlow: next };
  }
}

function flowStepError({
  required,
  enabled,
  step,
}: {
  required: boolean;
  enabled: boolean;
  step: BlueprintAuthFlowStep;
}): AuthFlowErrorKind | null {
  if (!required && !enabled) {
    return null;
  }
  const url = step.url.trim();
  if (url.length === 0) {
    return 'URL_REQUIRED';
  }
  if (!url.startsWith('/') && !blueprintRules.isHttpUrl(url)) {
    return 'URL_INVALID';
  }
  if (blueprintTemplate.jsonError(step.config)) {
    return 'CONFIG_INVALID';
  }
  return null;
}

function flowStepErrorMessage(kind: AuthFlowErrorKind | null): string {
  switch (kind) {
    case 'URL_REQUIRED':
      return t('Enter a request address');
    case 'URL_INVALID':
      return t('The address must start with / or http(s)://');
    case 'CONFIG_INVALID':
      return t('Request config is not valid JSON');
    case null:
      return '';
  }
}

function stepIsValid({
  step,
  problems,
}: {
  step: AuthWizardStep;
  problems: BlueprintAuthProblem[];
}): boolean {
  switch (step) {
    case 0:
      return !problems.includes(BlueprintAuthProblem.NAME);
    case 1:
      return (
        !problems.includes(BlueprintAuthProblem.FIELDS) &&
        !problems.includes(BlueprintAuthProblem.CREDENTIAL)
      );
    case 2:
      return (
        !problems.includes(BlueprintAuthProblem.OAUTH_URLS) &&
        !problems.includes(BlueprintAuthProblem.FLOWS) &&
        !problems.includes(BlueprintAuthProblem.PLUGIN)
      );
    default:
      return true;
  }
}

function publishChecklist({
  problems,
  dirty,
  flowPassed,
  apiPassed,
}: {
  problems: BlueprintAuthProblem[];
  dirty: boolean;
  flowPassed: boolean;
  apiPassed: boolean;
}): Record<AuthChecklistItemId, boolean> {
  return {
    basicInfo: stepIsValid({ step: 0, problems }),
    fieldsValid: stepIsValid({ step: 1, problems }),
    flowConfigured: stepIsValid({ step: 2, problems }),
    saved: !dirty,
    flowTestPassed: flowPassed,
    apiTestPassed: apiPassed,
  };
}

function showsCredentialFields(type: BlueprintAuthType): boolean {
  return type !== BlueprintAuthType.BASIC_AUTH;
}

function authTypeLabel(type: BlueprintAuthType): string {
  switch (type) {
    case BlueprintAuthType.AUTHORIZATION_CODE:
      return t('Authorization code');
    case BlueprintAuthType.CLIENT_CREDENTIALS:
      return t('Client credentials');
    case BlueprintAuthType.API_KEY:
      return t('API Key');
    case BlueprintAuthType.BASIC_AUTH:
      return t('Basic Auth');
  }
}

function authFieldControlLabel(control: BlueprintAuthFieldControl): string {
  switch (control) {
    case BlueprintAuthFieldControl.TEXT:
      return t('Single-line text');
    case BlueprintAuthFieldControl.PASSWORD:
      return t('Password');
    case BlueprintAuthFieldControl.LONG_TEXT:
      return t('Multi-line text');
    case BlueprintAuthFieldControl.DROPDOWN:
      return t('Dropdown (single choice)');
  }
}

export const authDraftUtils = {
  same,
  flowStepOf,
  withFlowStep,
  flowStepError,
  flowStepErrorMessage,
  stepIsValid,
  publishChecklist,
  showsCredentialFields,
  authTypeLabel,
  authFieldControlLabel,
};

export type AuthFlowErrorKind =
  | 'URL_REQUIRED'
  | 'URL_INVALID'
  | 'CONFIG_INVALID';

export type AuthWizardStep = number;

export type AuthChecklistItemId =
  | 'basicInfo'
  | 'fieldsValid'
  | 'flowConfigured'
  | 'saved'
  | 'flowTestPassed'
  | 'apiTestPassed';
