import { FlagId, SetupCheckLevel } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { systemHooks } from '@/features/system';
import { flagsHooks } from '@/hooks/flags-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { useRedirectAfterLogin } from '@/lib/navigation-utils';

import {
  InstallError,
  InstallStage,
  setupWizardHooks,
} from '../hooks/setup-wizard-hooks';
import {
  AdministratorErrors,
  setupWizardUtils,
  WIZARD_STEPS,
  WizardDraft,
  WizardStep,
} from '../utils/setup-wizard-utils';

import { AdministratorStep } from './administrator-step';
import { EnvironmentStep } from './environment-step';
import { OrganizationStep } from './organization-step';
import { ReviewStep } from './review-step';
import { ServicesStep } from './services-step';
import { WizardStepper } from './wizard-stepper';

export function SetupWizard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const redirectAfterLogin = useRedirectAfterLogin();
  const status = systemHooks.useSetupStatus({ enabled: true });
  const { data: publicUrl } = flagsHooks.useFlag<string>(FlagId.PUBLIC_URL);
  const install = setupWizardHooks.useInstall();
  const [draft, setDraft] = useState<WizardDraft>(setupWizardUtils.loadDraft);
  const restoredFromStorage = useRef(draft.email.length > 0);
  const [touched, setTouched] = useState<Touched>({});
  const [attempted, setAttempted] = useState<Attempted>({});
  const [accountCreated, setAccountCreated] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const requested = setupWizardUtils.stepFromParam({
    value: searchParams.get(STEP_PARAM),
  });
  const step = setupWizardUtils.reachableStep({ requested, draft });
  const access = setupWizardUtils.accessAddress({
    configured: publicUrl ?? null,
    current: window.location.origin,
  });
  const administratorErrors = setupWizardUtils.validateAdministrator({ draft });
  const organizationErrors = setupWizardUtils.validateOrganization({ draft });
  const environmentBlocked =
    !status.data ||
    status.data.checks.some((check) => check.level === SetupCheckLevel.ERROR);
  const noServiceEnabled = (status.data?.services ?? []).every(
    (service) => !service.enabled,
  );

  useEffect(() => {
    setupWizardUtils.saveDraft({ draft });
  }, [draft]);

  useEffect(() => {
    if (step !== requested) {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set(STEP_PARAM, step);
          return next;
        },
        { replace: true },
      );
    }
  }, [step, requested, setSearchParams]);

  function goTo({
    target,
    replace = false,
  }: {
    target: WizardStep;
    replace?: boolean;
  }) {
    setFailure(null);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set(STEP_PARAM, target);
        return next;
      },
      { replace },
    );
  }

  function change({ patch }: { patch: Partial<WizardDraft> }) {
    setFailure(null);
    setDraft((current) => ({ ...current, ...patch }));
  }

  function advance() {
    const index = WIZARD_STEPS.indexOf(step);
    const next = WIZARD_STEPS[index + 1];
    if (next) {
      goTo({ target: next });
    }
  }

  function tryAdvance() {
    if (step === WizardStep.ENVIRONMENT && !environmentBlocked) {
      advance();
      return;
    }
    if (step === WizardStep.ADMINISTRATOR) {
      setAttempted((current) => ({ ...current, administrator: true }));
      if (!setupWizardUtils.hasErrors({ errors: administratorErrors })) {
        advance();
      }
      return;
    }
    if (step === WizardStep.ORGANIZATION) {
      setAttempted((current) => ({ ...current, organization: true }));
      if (!setupWizardUtils.hasErrors({ errors: organizationErrors })) {
        advance();
      }
      return;
    }
    if (step === WizardStep.SERVICES) {
      advance();
      return;
    }
    if (step === WizardStep.REVIEW) {
      finish();
    }
  }

  function finish() {
    setFailure(null);
    install.mutate(
      { draft, accountCreated },
      {
        onSuccess: (response) => {
          authenticationSession.saveResponse(response, false);
          setupWizardUtils.clearDraft();
          redirectAfterLogin();
        },
        onError: (error: InstallError) => {
          setAccountCreated(
            accountCreated || error.stage === InstallStage.ORGANIZATION,
          );
          setFailure(setupWizardHooks.installFailureMessage({ error }));
        },
      },
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!install.isPending) {
      tryAdvance();
    }
  }

  const administratorVisible = (field: keyof AdministratorErrors) =>
    Boolean(attempted.administrator || touched[field]);
  const heading = headingOf({ step });
  const first = step === WizardStep.ENVIRONMENT;
  const last = step === WizardStep.REVIEW;
  const blockedHint = nextBlockedHint({
    step,
    environmentBlocked,
    administratorErrors,
    organizationErrors,
    attempted,
  });

  return (
    <div className="flex w-full flex-col gap-6">
      <WizardStepper current={step} onSelect={(target) => goTo({ target })} />
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-6 rounded-2xl border bg-background p-6 shadow-sm"
      >
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-medium tracking-tight">
            {heading.title}
          </h1>
          <p className="text-sm text-muted-foreground">{heading.description}</p>
        </header>
        <div className="min-h-[12rem]">
          {step === WizardStep.ENVIRONMENT && (
            <EnvironmentStep status={status} access={access} />
          )}
          {step === WizardStep.ADMINISTRATOR && (
            <AdministratorStep
              draft={draft}
              errors={administratorErrors}
              visible={administratorVisible}
              passwordWasDiscarded={
                restoredFromStorage.current && draft.password.length === 0
              }
              onChange={(patch) => change({ patch })}
              onBlur={(field) =>
                setTouched((current) => ({ ...current, [field]: true }))
              }
            />
          )}
          {step === WizardStep.ORGANIZATION && (
            <OrganizationStep
              draft={draft}
              errors={organizationErrors}
              visible={Boolean(
                attempted.organization || touched.organizationName,
              )}
              onChange={(patch) => change({ patch })}
              onBlur={() =>
                setTouched((current) => ({
                  ...current,
                  organizationName: true,
                }))
              }
            />
          )}
          {step === WizardStep.SERVICES && <ServicesStep status={status} />}
          {step === WizardStep.REVIEW && (
            <ReviewStep
              draft={draft}
              status={status.data}
              access={access}
              failure={failure}
            />
          )}
        </div>
        <footer className="flex items-center gap-3 border-t pt-4">
          {!first && (
            <Button
              type="button"
              variant="outline"
              disabled={install.isPending}
              onClick={() => {
                const previous = WIZARD_STEPS[WIZARD_STEPS.indexOf(step) - 1];
                if (previous) {
                  goTo({ target: previous });
                }
              }}
            >
              <ChevronLeft className="size-4" />
              {t('Previous step')}
            </Button>
          )}
          <div className="grow" />
          {blockedHint && (
            <span role="status" className="text-xs text-destructive">
              {blockedHint}
            </span>
          )}
          <Button
            type="submit"
            onMouseDown={(event) => event.preventDefault()}
            loading={install.isPending}
            disabled={step === WizardStep.ENVIRONMENT && environmentBlocked}
          >
            {nextLabel({ step, noServiceEnabled, failed: failure !== null })}
            {!last && <ChevronRight className="size-4" />}
          </Button>
        </footer>
      </form>
    </div>
  );
}

function headingOf({ step }: { step: WizardStep }): {
  title: string;
  description: string;
} {
  switch (step) {
    case WizardStep.ENVIRONMENT:
      return {
        title: t('Check the environment'),
        description: t(
          'Make sure the database, queue and storage work. Anything that does not says how to fix it.',
        ),
      };
    case WizardStep.ADMINISTRATOR:
      return {
        title: t('Create the administrator'),
        description: t(
          'The first account owns the platform and can do everything. You will sign in with it.',
        ),
      };
    case WizardStep.ORGANIZATION:
      return {
        title: t('Name your organization'),
        description: t(
          'This is the name your team sees. A default project is created with it.',
        ),
      };
    case WizardStep.SERVICES:
      return {
        title: t('Optional services'),
        description: t(
          'None of these are required. Features that need a service you skip show as not enabled and never fail.',
        ),
      };
    case WizardStep.REVIEW:
      return {
        title: t('Review and finish'),
        description: t(
          'Check the settings below. Finishing creates the account and the organization, and signs you in.',
        ),
      };
  }
}

function nextLabel({
  step,
  noServiceEnabled,
  failed,
}: {
  step: WizardStep;
  noServiceEnabled: boolean;
  failed: boolean;
}): string {
  if (step === WizardStep.REVIEW) {
    return failed ? t('Try again') : t('Finish setup');
  }
  if (step === WizardStep.SERVICES && noServiceEnabled) {
    return t('Skip all and continue');
  }
  return t('Next step');
}

function nextBlockedHint({
  step,
  environmentBlocked,
  administratorErrors,
  organizationErrors,
  attempted,
}: {
  step: WizardStep;
  environmentBlocked: boolean;
  administratorErrors: AdministratorErrors;
  organizationErrors: { organizationName: string | null };
  attempted: Attempted;
}): string | null {
  if (step === WizardStep.ENVIRONMENT && environmentBlocked) {
    return t('Fix the items marked as errors first');
  }
  if (
    step === WizardStep.ADMINISTRATOR &&
    attempted.administrator &&
    setupWizardUtils.hasErrors({ errors: administratorErrors })
  ) {
    return t('Fix the highlighted fields first');
  }
  if (
    step === WizardStep.ORGANIZATION &&
    attempted.organization &&
    setupWizardUtils.hasErrors({ errors: organizationErrors })
  ) {
    return t('Fix the highlighted fields first');
  }
  return null;
}

const STEP_PARAM = 'step';

type Touched = Partial<
  Record<keyof AdministratorErrors | 'organizationName', boolean>
>;
type Attempted = { administrator?: boolean; organization?: boolean };
