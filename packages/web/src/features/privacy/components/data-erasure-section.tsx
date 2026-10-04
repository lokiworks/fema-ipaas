import {
  CreateDataErasureRequestBody,
  DataErasureRequest,
  ErasureStatus,
  ErasureSubjectKind,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import dayjs from 'dayjs';
import { t } from 'i18next';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
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

import { privacyHooks } from '../hooks/privacy-hooks';

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
              'Find a person in run inputs, outputs and error messages across all projects and clear it. Run status, duration and error codes are kept. Trigger payload files and sample data are not covered.',
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
  const {
    mutate: act,
    mutateAsync,
    isPending,
  } = privacyHooks.useErasureAction();
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
          {dayjs(request.created).format('YYYY-MM-DD HH:mm')}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">{request.reason}</span>
      <span className="text-sm">{progressText(request)}</span>
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
            <ConfirmationDeleteDialog
              title={t('Delete personal data from {count} runs?', {
                count: request.matchedRuns,
              })}
              message={t(
                'This cannot be undone. The runs keep their status, duration and error codes; inputs and outputs that contain this value are cleared.',
              )}
              buttonText={t('Delete')}
              entityName={request.valueHint}
              showToast={false}
              mutationFn={async () => {
                await mutateAsync({ id: request.id, action: 'confirm' });
              }}
            >
              <Button size="sm" variant="destructive" disabled={isPending}>
                {t('Delete data from {count} runs', {
                  count: request.matchedRuns,
                })}
              </Button>
            </ConfirmationDeleteDialog>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => act({ id: request.id, action: 'cancel' })}
            >
              {t('Cancel')}
            </Button>
          </div>
        </>
      )}
    </div>
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
