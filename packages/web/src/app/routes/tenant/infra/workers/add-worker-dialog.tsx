import { FlagId, WORKER_NODE_LIMITS } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { tenantAccessUtils } from '@/features/tenant-access';
import { flagsHooks } from '@/hooks/flags-hooks';

export function AddWorkerDialog({
  open,
  onOpenChange,
  appVersion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appVersion: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <AddWorkerGuide
          key={open ? 'open' : 'closed'}
          appVersion={appVersion}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddWorkerGuide({
  appVersion,
  onOpenChange,
}: {
  appVersion: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: publicUrl } = flagsHooks.useFlag<string>(FlagId.PUBLIC_URL);
  const [name, setName] = useState('fema-worker-1');
  const [concurrency, setConcurrency] = useState('5');
  const [labelsText, setLabelsText] = useState('');
  const labels = tenantAccessUtils.parseLabels(labelsText);
  const concurrencyError = tenantAccessUtils.concurrencyError(concurrency);
  const labelsError = tenantAccessUtils.labelsError(labels);
  const nameValid = /^[a-z0-9][a-z0-9_.-]*$/.test(name);
  const ready = nameValid && concurrencyError === null && labelsError === null;
  const command = tenantAccessUtils.workerDockerCommand({
    name,
    frontendUrl: (publicUrl ?? window.location.origin).replace(/\/+$/, ''),
    concurrency,
    labels,
    version: appVersion,
  });

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t('Add a worker')}</DialogTitle>
        <DialogDescription>
          {t(
            'Workers run on your own machines and connect out to this platform. Start one with the command below and it appears in the list within a few seconds.',
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="worker-name">{t('Container name')}</Label>
          <Input
            id="worker-name"
            value={name}
            onChange={(event) => setName(event.target.value.trim())}
          />
          {!nameValid && (
            <span className="text-xs text-destructive">
              {t('Use lowercase letters, digits, dots, dashes and underscores')}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="worker-concurrency">{t('Concurrency')}</Label>
          <Input
            id="worker-concurrency"
            value={concurrency}
            onChange={(event) => setConcurrency(event.target.value.trim())}
          />
          {concurrencyError && (
            <span className="text-xs text-destructive">
              {t(concurrencyError)}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="worker-labels">{t('Labels')}</Label>
          <Input
            id="worker-labels"
            value={labelsText}
            placeholder="intranet"
            onChange={(event) => setLabelsText(event.target.value)}
          />
          {labelsError && (
            <span className="text-xs text-destructive">{t(labelsError)}</span>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          'Concurrency is between {min} and {max}. Up to {labels} labels describe the worker in this list; they do not route jobs. To dedicate workers to a project, use worker groups.',
          {
            min: WORKER_NODE_LIMITS.minConcurrency,
            max: WORKER_NODE_LIMITS.maxConcurrency,
            labels: WORKER_NODE_LIMITS.maxLabels,
          },
        )}
      </p>
      <div className="flex flex-col gap-2">
        <Label>
          {t('1. Create a worker token on a machine that has FEMA_JWT_SECRET')}
        </Label>
        <CopyToClipboardInput
          textToCopy="npx @fema-ipaas/cli workers token"
          useInput={true}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>{t('2. Start the worker with the token from step 1')}</Label>
        {ready ? (
          <CopyToClipboardInput textToCopy={command} useInput={false} />
        ) : (
          <span className="text-sm text-muted-foreground">
            {t('Fix the fields above to see the command')}
          </span>
        )}
      </div>
      <Alert>
        <AlertDescription>
          {t(
            'The worker only needs outbound access to this address. Worker tokens do not expire and cannot be revoked one by one; changing FEMA_JWT_SECRET invalidates all of them. There is no one-time registration token, because workers present the same token every time they reconnect.',
          )}
        </AlertDescription>
      </Alert>
      <DialogFooter>
        <Button onClick={() => onOpenChange(false)}>{t('Done')}</Button>
      </DialogFooter>
    </div>
  );
}
