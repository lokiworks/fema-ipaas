import {
  BlueprintAuth,
  blueprintProblems,
  ConnectorBlueprintDetail,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ShieldQuestion } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { connectorBlueprintHooks } from '../../hooks/connector-blueprint-hooks';

import { AuthConfirmDialog } from './auth-confirm-dialog';
import { authDraftUtils, AuthWizardStep } from './auth-draft-utils';
import { AuthStepBasic } from './auth-step-basic';
import { AuthStepFields } from './auth-step-fields';
import { AuthStepFlow } from './auth-step-flow';
import { AuthStepPublish } from './auth-step-publish';
import { AuthStepTest } from './auth-step-test';

export function BlueprintAuthDevWizard({
  detail,
}: {
  detail: ConnectorBlueprintDetail;
}) {
  const savedAuth = detail.definition.auth;
  const [draft, setDraft] = useState<BlueprintAuth | null>(savedAuth);
  const [step, setStep] = useState<AuthWizardStep>(0);

  if (!savedAuth || !draft) {
    return <NoAuthEmptyState detailId={detail.id} />;
  }

  return (
    <AuthDevWizardBody
      detail={detail}
      savedAuth={savedAuth}
      draft={draft}
      setDraft={setDraft}
      step={step}
      setStep={setStep}
    />
  );
}

function AuthDevWizardBody({
  detail,
  savedAuth,
  draft,
  setDraft,
  step,
  setStep,
}: {
  detail: ConnectorBlueprintDetail;
  savedAuth: BlueprintAuth;
  draft: BlueprintAuth;
  setDraft: (auth: BlueprintAuth) => void;
  step: AuthWizardStep;
  setStep: (step: AuthWizardStep) => void;
}) {
  const base = `/tenant/connectors/development/${detail.id}`;
  const [discardOpen, setDiscardOpen] = useState(false);
  const dirty = !authDraftUtils.same({ left: draft, right: savedAuth });
  const problems = blueprintProblems.auth({ auth: draft });
  const stepValid = authDraftUtils.stepIsValid({ step, problems });
  const { mutate: save, isPending: saving } =
    connectorBlueprintHooks.useUpdateConnectorBlueprint({ id: detail.id });

  const doSave = () =>
    save({ definition: { ...detail.definition, auth: draft } });
  const doDiscard = () => {
    setDraft(savedAuth);
    setDiscardOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={`${base}/auth`}>
                  {t('Authentication and authorization')}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>
                {t('Develop authentication · {name}', { name: savedAuth.name })}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex-1" />
        <AuthStatusBadge detail={detail} />
      </div>
      {!draft.enabled && (
        <Alert variant="warning">
          <AlertDescription>
            {t(
              'The connector currently uses no authentication. This configuration is kept but has no effect until you switch back.',
            )}
          </AlertDescription>
        </Alert>
      )}
      <StepsNav step={step} onChange={setStep} />
      <div className="min-h-[240px]">
        {step === 0 && (
          <AuthStepBasic
            draft={draft}
            setDraft={setDraft}
            problems={problems}
          />
        )}
        {step === 1 && (
          <AuthStepFields
            draft={draft}
            setDraft={setDraft}
            problems={problems}
          />
        )}
        {step === 2 && (
          <AuthStepFlow
            detail={detail}
            draft={draft}
            setDraft={setDraft}
            problems={problems}
          />
        )}
        {step === 3 && <AuthStepTest detail={detail} dirty={dirty} />}
        {step === 4 && (
          <AuthStepPublish detail={detail} problems={problems} dirty={dirty} />
        )}
      </div>
      <div className="flex items-center gap-2 border-t pt-3">
        <Button
          type="button"
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
        >
          {t('Previous')}
        </Button>
        <div className="flex-1" />
        {dirty && (
          <>
            <span className="text-xs text-muted-foreground">
              {t('Unsaved changes')}
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDiscardOpen(true)}
            >
              {t('Discard changes')}
            </Button>
            <Button type="button" loading={saving} onClick={doSave}>
              {t('Save')}
            </Button>
          </>
        )}
        {step < 4 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  type="button"
                  disabled={!stepValid}
                  onClick={() => setStep(step + 1)}
                >
                  {t('Next')}
                </Button>
              </span>
            </TooltipTrigger>
            {!stepValid && (
              <TooltipContent>
                {t('Finish configuring this step first')}
              </TooltipContent>
            )}
          </Tooltip>
        )}
      </div>
      <AuthConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={t('Discard unsaved changes?')}
        description={t(
          'The authentication will revert to what was last saved.',
        )}
        confirmLabel={t('Discard changes')}
        onConfirm={doDiscard}
        danger
      />
    </div>
  );
}

function AuthStatusBadge({ detail }: { detail: ConnectorBlueprintDetail }) {
  if (detail.authStatus.published) {
    return <Badge variant="success">{t('Published')}</Badge>;
  }
  if (detail.authStatus.everPublished) {
    return (
      <Badge variant="info">{t('Published · has unpublished changes')}</Badge>
    );
  }
  return <Badge variant="secondary">{t('Draft')}</Badge>;
}

function StepsNav({
  step,
  onChange,
}: {
  step: AuthWizardStep;
  onChange: (step: AuthWizardStep) => void;
}) {
  const titles = [
    t('Basic information'),
    t('Authentication form'),
    t('Authentication flow'),
    t('Test authentication'),
    t('Publish authentication'),
  ];
  return (
    <div className="flex items-center gap-2">
      {titles.map((title, index) => (
        <button
          key={title}
          type="button"
          onClick={() => onChange(index)}
          className={cn(
            'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm',
            index === step
              ? 'border-primary bg-accent font-medium'
              : 'text-muted-foreground hover:bg-accent',
          )}
        >
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-full text-xs',
              index === step
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted',
            )}
          >
            {index + 1}
          </span>
          {title}
        </button>
      ))}
    </div>
  );
}

function NoAuthEmptyState({ detailId }: { detailId: string }) {
  const navigate = useNavigate();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldQuestion />
        </EmptyMedia>
        <EmptyTitle>{t('No authentication yet')}</EmptyTitle>
        <EmptyDescription>
          {t(
            'Create an authentication in Authentication and authorization first, then develop its flow.',
          )}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          onClick={() =>
            navigate(`/tenant/connectors/development/${detailId}/auth`)
          }
        >
          {t('Go create an authentication')}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
