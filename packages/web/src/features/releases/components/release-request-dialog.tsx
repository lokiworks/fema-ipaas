import {
  CreateWorkflowReleaseRequestBody,
  ReleaseCheckLevel,
  ReleasePreview,
  WorkflowReleaseStatus,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { CircleX } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { CharacterCounter } from '@/features/project-workspace/components/character-counter';
import { projectCollectionUtils } from '@/features/projects';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

import { releasesHooks } from '../hooks/releases-hooks';
import { releaseUiUtils } from '../utils/release-ui-utils';
import { StepChangeKind } from '../utils/version-diff';

import { ReleaseChecks } from './release-checks';
import { StepDiff, stepChangeHooks, stepChangeUtils } from './step-diff';

export function ReleaseRequestDialog({
  open,
  onOpenChange,
  workflowId,
  onPromoted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  onPromoted?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <ReleaseRequestForm
          key={open ? 'open' : 'closed'}
          workflowId={workflowId}
          onPromoted={onPromoted}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReleaseRequestForm({
  workflowId,
  onPromoted,
  onOpenChange,
}: {
  workflowId: string;
  onPromoted?: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const projectId = authenticationSession.getProjectId()!;
  const { project } = projectCollectionUtils.useCurrentProject();
  const needsApproval = releaseUiUtils.approvalRequired(
    project.releaseApproverIds,
  );
  const [confirming, setConfirming] = useState(false);
  const {
    data: preview,
    isLoading: isChecking,
    isFetching: isRechecking,
    error: previewError,
    refetch: recheck,
  } = releasesHooks.usePreview({
    request: { projectId, workflowId },
    enabled: true,
  });
  const { mutate: create, isPending } = releasesHooks.useCreateRelease();
  const form = useForm<CreateWorkflowReleaseRequestBody>({
    resolver: zodResolver(CreateWorkflowReleaseRequestBody),
    mode: 'onChange',
    defaultValues: { projectId, workflowId, note: '' },
  });
  const note = form.watch('note');

  const submit = (values: CreateWorkflowReleaseRequestBody) => {
    create(values, {
      onSuccess: (release) => {
        onOpenChange(false);
        if (release.status === WorkflowReleaseStatus.DEPLOYED) {
          toast.success(t('Promoted to production'));
          onPromoted?.();
          return;
        }
        toast.success(t('Promotion submitted for approval'));
        navigate(
          authenticationSession.appendProjectRoutePrefix(
            `/releases/${release.id}`,
          ),
        );
      },
    });
  };

  const handleSubmit = (values: CreateWorkflowReleaseRequestBody) => {
    if (needsApproval) {
      submit(values);
      return;
    }
    setConfirming(true);
  };

  const blocking = (preview?.checks ?? []).filter(
    (check) => check.level === ReleaseCheckLevel.ERROR,
  );
  const canSubmit = !!preview && preview.canSubmit && !isRechecking;

  if (confirming && preview) {
    return (
      <ConfirmGoLive
        preview={preview}
        note={note}
        isPending={isPending}
        onBack={() => setConfirming(false)}
        onConfirm={() => submit(form.getValues())}
      />
    );
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <DialogHeader>
          <DialogTitle>{t('Promote to production')}</DialogTitle>
          <DialogDescription>
            {needsApproval
              ? t(
                  'The version in test is sent to the approvers with its checks and test runs. It goes live in production after approval.',
                )
              : t(
                  'The version in test goes live in production right away. This project does not require approval.',
                )}{' '}
            {t('Changes that are not deployed to test are not included.')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto pr-1">
          {isChecking && <Skeleton className="h-40 w-full" />}
          {!isChecking && !preview && (
            <Alert variant="destructive">
              <CircleX />
              <AlertTitle>{t('The promotion cannot be checked')}</AlertTitle>
              <AlertDescription>
                {api.extractServerErrorMessage(
                  previewError,
                  t('Something went wrong'),
                )}
              </AlertDescription>
            </Alert>
          )}
          {preview && (
            <>
              <VersionPath preview={preview} />
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">
                  {t('Changes compared with production')}
                </h3>
                <StepDiff
                  workflowId={workflowId}
                  versionId={preview.testVersionId}
                  previousVersionId={preview.productionVersionId}
                />
              </section>
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">
                  {t('Pre-release checks')}
                </h3>
                <ReleaseChecks checks={preview.checks} />
                {blocking.length > 0 && (
                  <Alert variant="destructive">
                    <CircleX />
                    <AlertTitle>
                      {t('blockingChecksCount', { count: blocking.length })}
                    </AlertTitle>
                    <AlertDescription className="flex flex-col items-start gap-2">
                      {t(
                        'Fix the items marked in red, then check again. The promotion can only be submitted when none are left.',
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        loading={isRechecking}
                        onClick={() => void recheck()}
                      >
                        {t('Check again')}
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
              </section>
            </>
          )}
          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('What changed')}</FormLabel>
                <CharacterCounter
                  multiline
                  length={(field.value ?? '').length}
                  max={300}
                >
                  <FormControl>
                    <Textarea
                      {...field}
                      maxLength={300}
                      placeholder={t(
                        'e.g. Read the amount threshold from a variable; tested with 12 invoices',
                      )}
                    />
                  </FormControl>
                </CharacterCounter>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type="submit"
            loading={isPending}
            disabled={!canSubmit}
            title={
              preview && !preview.canSubmit
                ? t('Fix the failing checks before promoting')
                : undefined
            }
          >
            {needsApproval
              ? t('Submit for approval')
              : t('Promote to production')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function VersionPath({ preview }: { preview: ReleasePreview }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{preview.workflowDisplayName}</span>
      <Badge variant="info">
        {t('Test environment')} {versionLabel(preview.testVersionNumber)}
      </Badge>
      <span aria-hidden="true">→</span>
      <Badge variant="success">
        {t('Production')}{' '}
        {preview.productionVersionId
          ? versionLabel(preview.productionVersionNumber)
          : t('Not published yet')}
      </Badge>
    </p>
  );
}

function ConfirmGoLive({
  preview,
  note,
  isPending,
  onBack,
  onConfirm,
}: {
  preview: ReleasePreview;
  note: string;
  isPending: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { entries } = stepChangeHooks.useStepChanges({
    workflowId: preview.workflowId,
    versionId: preview.testVersionId,
    previousVersionId: preview.productionVersionId,
  });
  const counts = Object.values(StepChangeKind).map((kind) => ({
    kind,
    count: entries.filter((entry) => entry.change.kind === kind).length,
  }));
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t('Go live without approval?')}</DialogTitle>
        <DialogDescription>
          {t(
            'This project has no approver, so the version in test goes live in production as soon as you confirm.',
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto pr-1">
        <VersionPath preview={preview} />
        <div className="flex flex-wrap items-center gap-2">
          {counts
            .filter((entry) => entry.count > 0)
            .map((entry) => (
              <Badge
                key={entry.kind}
                variant={stepChangeUtils.kindVariant(entry.kind)}
              >
                {stepChangeUtils.kindLabel(entry.kind)} {entry.count}
              </Badge>
            ))}
          {entries.length === 0 && (
            <span className="text-sm text-muted-foreground">
              {t('No step changes compared with the published version.')}
            </span>
          )}
        </div>
        <ul className="flex flex-col gap-1 text-sm">
          {entries.map(({ change }) => (
            <li key={`${change.kind}-${change.name}`}>
              {stepChangeUtils.kindLabel(change.kind)} · {change.displayName}
            </li>
          ))}
        </ul>
        <p className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-line">
          {note}
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack}>
          {t('Back')}
        </Button>
        <Button type="button" loading={isPending} onClick={onConfirm}>
          {t('Confirm and go live')}
        </Button>
      </DialogFooter>
    </div>
  );
}

function versionLabel(versionNumber: number | null | undefined): string {
  return versionNumber ? `v${versionNumber}` : '';
}
