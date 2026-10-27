import {
  CreateDataErasureRequestBody,
  DataErasureRequest,
  ErasureCounts,
  ErasureStatus,
  ErasureSubjectKind,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import dayjs from 'dayjs';
import { t } from 'i18next';
import { Download, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

import { privacyHooks } from '../hooks/privacy-hooks';
import { erasureConfirmationUtils } from '../utils/erasure-confirmation';

export function DataErasureSection() {
  const [open, setOpen] = useState(false);
  const { data: requests = [] } = privacyHooks.useErasures();
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>{t('Delete personal data')}</CardTitle>
          <CardDescription>
            {t(
              'Find a person in run inputs, outputs, error messages, business keys and received request bodies across all projects and clear it. Run status, duration and error codes are kept. Sample data saved in the editor is not covered.',
            )}
          </CardDescription>
        </div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          {t('New deletion request')}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('No deletion requests yet.')}
          </p>
        ) : (
          requests.map((request) => (
            <ErasureRow key={request.id} request={request} />
          ))
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <ErasureForm
            key={open ? 'open' : 'closed'}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ErasureRow({ request }: { request: DataErasureRequest }) {
  const { mutate: cancel, isPending } = privacyHooks.useCancelErasure();
  const { mutate: downloadReceipt, isPending: isDownloading } =
    privacyHooks.useDownloadReceipt();
  const [confirming, setConfirming] = useState(false);
  const subject = request.subjectHint
    ? `${request.subjectHint} · ${request.valueHint}`
    : request.valueHint;
  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm">{subject}</span>
        <Badge variant="outline">{kindLabel(request.kind)}</Badge>
        <Badge variant={statusVariant(request.status)}>
          {statusLabel(request.status)}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {dayjs(request.created).format('YYYY/MM/DD HH:mm')}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">{request.reason}</span>
      <span className="text-sm">{progressText(request)}</span>
      {request.status === ErasureStatus.DONE &&
        request.matchedRuns > 0 &&
        request.counts !== null && (
          <span className="text-xs text-muted-foreground">
            {countsText(request.counts)}
          </span>
        )}
      {request.status === ErasureStatus.DONE && (
        <div>
          <Button
            size="sm"
            variant="outline"
            loading={isDownloading}
            onClick={() => downloadReceipt(request.id)}
          >
            <Download className="size-4 mr-1" />
            {t('Download receipt')}
          </Button>
        </div>
      )}
      {request.status === ErasureStatus.AWAITING_CONFIRMATION && (
        <>
          <ul className="text-xs text-muted-foreground">
            {request.matchedWorkflows
              .slice(0, MAX_WORKFLOWS_SHOWN)
              .map((workflow) => (
                <li key={workflow.workflowId}>
                  {t('{workflow}: {count} runs', {
                    workflow: workflow.displayName,
                    count: workflow.count,
                  })}
                </li>
              ))}
          </ul>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={() => setConfirming(true)}
            >
              {t('Delete data from {count} runs', {
                count: request.matchedRuns,
              })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => cancel(request.id)}
            >
              {t('Cancel')}
            </Button>
          </div>
          <Dialog open={confirming} onOpenChange={setConfirming}>
            <DialogContent className="max-w-lg">
              <ErasureConfirmForm
                key={confirming ? 'open' : 'closed'}
                request={request}
                onDone={() => setConfirming(false)}
              />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function ErasureConfirmForm({
  request,
  onDone,
}: {
  request: DataErasureRequest;
  onDone: () => void;
}) {
  const [typed, setTyped] = useState('');
  const {
    mutate: confirm,
    isPending,
    error,
  } = privacyHooks.useConfirmErasure();
  const word = t('erasureConfirmWord');
  const canSubmit = erasureConfirmationUtils.isAcceptable({
    kind: request.kind,
    typed,
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) {
          return;
        }
        confirm(
          { id: request.id, request: { confirmation: typed.trim() } },
          { onSuccess: onDone },
        );
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-destructive">
          <TriangleAlert className="size-5" />
          {t('Delete personal data from {count} runs?', {
            count: request.matchedRuns,
          })}
        </DialogTitle>
        <DialogDescription>
          {t(
            'This cannot be undone. The runs keep their status, duration and error codes; inputs and outputs that contain this value are cleared.',
          )}
        </DialogDescription>
      </DialogHeader>
      <Alert variant="destructive">
        <TriangleAlert className="h-4 w-4" />
        <AlertDescription>
          {t(
            'Unmasked run states, original request bodies and saved search hashes for {person} are deleted too.',
            { person: request.valueHint },
          )}
        </AlertDescription>
      </Alert>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="erasure-confirmation">
          {t(
            'Type the full {kind} of this person, or the word {word}, to confirm',
            { kind: kindLabel(request.kind), word },
          )}
        </label>
        <Input
          id="erasure-confirmation"
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={word}
          className="font-mono"
        />
        {error !== null && (
          <span className="text-sm text-destructive" role="alert">
            {api.extractServerErrorMessage(error, t('Something went wrong'))}
          </span>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('Cancel')}
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={!canSubmit}
          loading={isPending}
        >
          <TriangleAlert className="size-4 mr-2" />
          {t('Delete')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ErasureForm({ onDone }: { onDone: () => void }) {
  const { mutate: create, isPending } = privacyHooks.useCreateErasure({
    onSuccess: onDone,
  });
  const form = useForm<CreateDataErasureRequestBody>({
    resolver: zodResolver(CreateDataErasureRequestBody),
    mode: 'onChange',
    defaultValues: defaultErasureValues(),
  });
  const kind = form.watch('kind');
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => create(values))}
      >
        <DialogHeader>
          <DialogTitle>{t('New deletion request')}</DialogTitle>
          <DialogDescription>
            {t(
              'Run logs are searched first. Nothing is deleted until you confirm the results.',
            )}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="kind"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Find by')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.values(ErasureSubjectKind).map((option) => (
                    <SelectItem key={option} value={option}>
                      {kindLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{kindLabel(kind)}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="font-mono"
                  placeholder={kindPlaceholder(kind)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="subjectName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Name (optional)')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormDescription>
                {t('Only the first character is kept, to tell requests apart.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Reason')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={2}
                  placeholder={t(
                    'For example: the employee left and asked for their data to be deleted, ticket HR-2031',
                  )}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {t('Search run logs')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function defaultErasureValues(): CreateDataErasureRequestBody {
  return {
    kind: ErasureSubjectKind.EMPLOYEE_ID,
    value: '',
    subjectName: '',
    reason: '',
  };
}

function kindLabel(kind: ErasureSubjectKind): string {
  switch (kind) {
    case ErasureSubjectKind.EMPLOYEE_ID:
      return t('Employee ID');
    case ErasureSubjectKind.EMAIL:
      return t('Email');
    case ErasureSubjectKind.PHONE:
      return t('Mobile number');
  }
}

function kindPlaceholder(kind: ErasureSubjectKind): string {
  switch (kind) {
    case ErasureSubjectKind.EMPLOYEE_ID:
      return 'XH20210311';
    case ErasureSubjectKind.EMAIL:
      return 'name@example.com';
    case ErasureSubjectKind.PHONE:
      return '13800000000';
  }
}

function statusLabel(status: ErasureStatus): string {
  switch (status) {
    case ErasureStatus.SCANNING:
      return t('Searching');
    case ErasureStatus.AWAITING_CONFIRMATION:
      return t('Waiting for confirmation');
    case ErasureStatus.ERASING:
      return t('Deleting');
    case ErasureStatus.DONE:
      return t('Done');
    case ErasureStatus.CANCELED:
      return t('Canceled');
    case ErasureStatus.FAILED:
      return t('Failed');
  }
}

function statusVariant(
  status: ErasureStatus,
): 'default' | 'secondary' | 'destructive' | 'success' | 'outline' {
  switch (status) {
    case ErasureStatus.DONE:
      return 'success';
    case ErasureStatus.FAILED:
      return 'destructive';
    case ErasureStatus.CANCELED:
      return 'outline';
    default:
      return 'secondary';
  }
}

function countsText(counts: ErasureCounts): string {
  return t(
    'Cleared {logs} log files, {slices} large outputs, {payloads} request bodies, {keys} business keys, {messages} failure messages, {dedupe} dedupe keys and {hashes} search hashes.',
    {
      logs: counts.displayLogFiles + counts.rawStateFiles,
      slices: counts.logSlices,
      payloads: counts.webhookPayloads,
      keys: counts.runIdentifiers,
      messages: counts.failureMessages,
      dedupe: counts.dedupeKeys,
      hashes: counts.searchHashes,
    },
  );
}

function progressText(request: DataErasureRequest): string {
  switch (request.status) {
    case ErasureStatus.SCANNING:
      return t('Searched {count} runs so far', { count: request.scannedRuns });
    case ErasureStatus.AWAITING_CONFIRMATION:
      return t(
        'Found in {count} of {scanned} runs across {workflows} workflows.',
        {
          count: request.matchedRuns,
          scanned: request.scannedRuns,
          workflows: request.matchedWorkflows.length,
        },
      );
    case ErasureStatus.ERASING:
      return t('Deleting data from {count} runs', {
        count: request.matchedRuns,
      });
    case ErasureStatus.DONE:
      return request.matchedRuns === 0
        ? t(
            'Searched {scanned} runs. Nothing to delete; the request is kept as a record.',
            {
              scanned: request.scannedRuns,
            },
          )
        : t('Cleared data from {count} runs', { count: request.erasedRuns });
    case ErasureStatus.CANCELED:
      return t('Canceled. Nothing was deleted.');
    case ErasureStatus.FAILED:
      return request.error ?? t('Something went wrong');
  }
}

const MAX_WORKFLOWS_SHOWN = 5;
