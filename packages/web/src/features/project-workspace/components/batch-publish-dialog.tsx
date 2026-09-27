import {
  BatchPublishCheckItem,
  BatchPublishCheckStatus,
  BatchPublishResponse,
  PUBLISH_DESCRIPTION_MAX_LENGTH,
} from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { CircleCheck, CircleX, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { projectWorkspaceApi } from '../api/project-workspace-api';
import { projectWorkspaceHooks } from '../hooks/project-workspace-hooks';

export function BatchPublishDialog({
  open,
  onOpenChange,
  projectId,
  workflowIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  workflowIds: string[];
  onDone?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {open && (
          <BatchPublishBody
            projectId={projectId}
            workflowIds={workflowIds}
            onClose={() => {
              onOpenChange(false);
              onDone?.();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BatchPublishBody({
  projectId,
  workflowIds,
  onClose,
}: {
  projectId: string;
  workflowIds: string[];
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>('check');
  const [confirmingWarnings, setConfirmingWarnings] = useState(false);
  const [description, setDescription] = useState('');
  const [result, setResult] = useState<BatchPublishResponse | null>(null);
  const { data: check, isLoading } = useQuery({
    queryKey: ['project-workspace', 'publish-check', projectId, workflowIds],
    queryFn: () => projectWorkspaceApi.publishCheck({ projectId, workflowIds }),
    gcTime: 0,
    staleTime: 0,
  });
  const { mutate: publish, isPending } = projectWorkspaceHooks.useBatchPublish();

  const items = check?.items ?? [];
  const toTest = check?.target === 'TEST';
  const publishable = items.filter(
    (item) =>
      item.status === BatchPublishCheckStatus.READY ||
      item.status === BatchPublishCheckStatus.WARNING,
  );
  const invalid = items.filter(
    (item) => item.status === BatchPublishCheckStatus.INVALID,
  );
  const unchanged = items.filter(
    (item) => item.status === BatchPublishCheckStatus.UNCHANGED,
  );
  const warned = items.filter(
    (item) => item.status === BatchPublishCheckStatus.WARNING,
  );

  const goNext = () => {
    if (warned.length > 0 && !confirmingWarnings) {
      setConfirmingWarnings(true);
      return;
    }
    setStep('describe');
  };

  const handlePublish = () =>
    publish(
      {
        projectId,
        workflowIds: publishable.map((item) => item.workflowId),
        description: description.trim() || undefined,
      },
      {
        onSuccess: (response) => {
          setResult(response);
          setStep('result');
        },
      },
    );

  const published = result?.items.filter((item) => item.success) ?? [];
  const failed = result?.items.filter((item) => !item.success) ?? [];

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {workflowIds.length > 1 ? t('Batch publish') : t('Publish')}
        </DialogTitle>
      </DialogHeader>
      <StepBar step={step} />
      <div className="flex min-h-48 flex-col gap-3">
        {step === 'check' &&
          (isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              {t('Checking workflows...')}
            </div>
          ) : (
            <>
              {invalid.length > 0 && (
                <Notice tone="warning">
                  {t(
                    '{count} workflows have errors and cannot be published. They were removed from this batch.',
                    { count: invalid.length },
                  )}
                </Notice>
              )}
              {unchanged.length > 0 && (
                <Notice tone="info">
                  {t(
                    '{count} workflows have no unpublished changes and need no publishing.',
                    { count: unchanged.length },
                  )}
                </Notice>
              )}
              {warned.length > 0 && (
                <Notice tone="warning">
                  {confirmingWarnings
                    ? t(
                        '{count} workflows still have unresolved warnings; the affected steps may fail after publishing. Continue anyway?',
                        { count: warned.length },
                      )
                    : t(
                        '{count} workflows have unresolved warnings. You will be asked to confirm in the next step.',
                        { count: warned.length },
                      )}
                </Notice>
              )}
              <div className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-md border">
                {items.map((item) => (
                  <div
                    key={item.workflowId}
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {item.displayName}
                    </span>
                    <CheckBadge item={item} />
                  </div>
                ))}
              </div>
            </>
          ))}
        {step === 'describe' && (
          <>
            <Notice tone={toTest ? 'info' : 'warning'}>
              {toTest
                ? t(
                    'Publishes {count} workflows to the test environment. Each gets a new version; production is not affected. Promote to production after verifying.',
                    { count: publishable.length },
                  )
                : t(
                    'Publishes {count} workflows. Each gets a new version and starts running in production right away, replacing the running version.',
                    { count: publishable.length },
                  )}
            </Notice>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                {t('Publish description')}
              </span>
              <Textarea
                rows={3}
                value={description}
                maxLength={PUBLISH_DESCRIPTION_MAX_LENGTH}
                placeholder={t(
                  'Describe what changed so the team can trace it later',
                )}
                onChange={(event) => setDescription(event.target.value)}
              />
              <span className="text-xs text-muted-foreground">
                {description.length}/{PUBLISH_DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
          </>
        )}
        {step === 'result' && result && (
          <>
            <p className="text-sm">
              {t(
                '{published} of {total} workflows were published to {environment}. {skipped} could not be published or needed no publishing.',
                {
                  published: published.length,
                  total: items.length,
                  environment: toTest
                    ? t('the test environment')
                    : t('production'),
                  skipped: items.length - published.length,
                },
              )}
            </p>
            <div className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-md border">
              {[...published, ...failed].map((item) => (
                <div
                  key={item.workflowId}
                  className="flex items-center gap-2 px-3 py-2 text-sm"
                >
                  {item.success ? (
                    <CircleCheck className="size-4 text-success" />
                  ) : (
                    <CircleX className="size-4 text-destructive" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {item.displayName}
                  </span>
                  {!item.success && item.error && (
                    <span className="truncate text-xs text-muted-foreground">
                      {t(item.error)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <DialogFooter>
        {step === 'check' && (
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button
              type="button"
              disabled={isLoading || publishable.length === 0}
              onClick={goNext}
            >
              {confirmingWarnings ? t('Continue publishing') : t('Next')}
            </Button>
          </>
        )}
        {step === 'describe' && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep('check')}
            >
              {t('Back')}
            </Button>
            <Button type="button" loading={isPending} onClick={handlePublish}>
              {toTest
                ? t('Publish {count} workflows to test', {
                    count: publishable.length,
                  })
                : t('Publish {count} workflows', {
                    count: publishable.length,
                  })}
            </Button>
          </>
        )}
        {step === 'result' && (
          <Button type="button" onClick={onClose}>
            {t('Done')}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function StepBar({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'check', label: t('Check') },
    { key: 'describe', label: t('Publish settings') },
    { key: 'result', label: t('Result') },
  ];
  const activeIndex = steps.findIndex((item) => item.key === step);
  return (
    <ol className="flex items-center gap-3 text-sm">
      {steps.map((item, index) => (
        <li
          key={item.key}
          className={cn(
            'flex items-center gap-2',
            index > activeIndex && 'text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-full border text-xs',
              index <= activeIndex &&
                'border-primary bg-primary text-primary-foreground',
            )}
          >
            {index + 1}
          </span>
          {item.label}
        </li>
      ))}
    </ol>
  );
}

function CheckBadge({ item }: { item: BatchPublishCheckItem }) {
  switch (item.status) {
    case BatchPublishCheckStatus.INVALID:
      return <Badge variant="destructive">{t('Has errors, fix in the editor')}</Badge>;
    case BatchPublishCheckStatus.UNCHANGED:
      return <Badge variant="outline">{t('No unpublished changes')}</Badge>;
    case BatchPublishCheckStatus.WARNING:
      return (
        <Badge
          variant="outline"
          className="border-amber-500 text-amber-700 dark:text-amber-300"
        >
          {t('Publishable · has warnings')}
        </Badge>
      );
    case BatchPublishCheckStatus.READY:
      return <Badge variant="success">{t('Publishable')}</Badge>;
  }
}

function Notice({
  tone,
  children,
}: {
  tone: 'info' | 'warning';
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        'rounded-md border p-3 text-sm',
        tone === 'warning'
          ? 'border-amber-500/40 bg-amber-500/5'
          : 'border-primary/30 bg-primary/5',
      )}
    >
      {children}
    </p>
  );
}

type Step = 'check' | 'describe' | 'result';
