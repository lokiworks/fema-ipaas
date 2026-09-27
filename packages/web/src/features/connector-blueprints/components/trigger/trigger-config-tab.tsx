import {
  BLUEPRINT_LIMITS,
  BlueprintHttpMethod,
  BlueprintPagination,
  BlueprintTrigger,
  BlueprintTriggerType,
  blueprintRules,
  blueprintTemplate,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { MethodTag } from '../operation/method-tag';

export function TriggerConfigTab({
  trigger,
  onUpdate,
  isPending,
}: {
  trigger: BlueprintTrigger;
  onUpdate: (patch: Partial<BlueprintTrigger>) => void;
  isPending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(trigger));

  const startEdit = () => {
    setDraft(draftOf(trigger));
    setEditing(true);
  };

  if (editing) {
    return (
      <ConfigEditForm
        draft={draft}
        setDraft={setDraft}
        isPending={isPending}
        onCancel={() => setEditing(false)}
        onSave={(patch) => {
          onUpdate(patch);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">{t('Trigger configuration')}</span>
        <Button size="sm" variant="outline" onClick={startEdit}>
          {t('Edit')}
        </Button>
      </div>
      {trigger.type === BlueprintTriggerType.INSTANT ? (
        <div className="flex flex-col gap-3">
          <EndpointReadView
            label={t('Subscribe endpoint')}
            description={t(
              'Called when the workflow turns on, registers the platform callback with the service',
            )}
            required={false}
            endpoint={trigger.instant.subscribe}
          />
          <EndpointReadView
            label={t('Unsubscribe endpoint')}
            description={t(
              'Called when the workflow turns off, deregisters the callback',
            )}
            required={false}
            endpoint={trigger.instant.unsubscribe}
          />
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                {t('Execute endpoint')}
              </span>
              <Badge variant="outline">{t('Required')}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                'Runs after receiving a push, transforms the raw event into outputs',
              )}
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">
              {trigger.instant.handle}
            </pre>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t('Request')}</dt>
          <dd className="flex items-center gap-2">
            <MethodTag method={trigger.polling.method} />
            <span className="font-mono">{trigger.polling.path}</span>
          </dd>
          <dt className="text-muted-foreground">{t('Polling interval')}</dt>
          <dd>
            {t('Every {minutes} minutes', {
              minutes: trigger.polling.intervalMinutes,
            })}
          </dd>
          <dt className="text-muted-foreground">{t('Pagination')}</dt>
          <dd>
            {paginationLabel(trigger.polling.pagination, trigger.polling)}
          </dd>
          {trigger.polling.pagination !== BlueprintPagination.NONE && (
            <>
              <dt className="text-muted-foreground">{t('Has more page')}</dt>
              <dd className="font-mono">{trigger.polling.hasMorePath}</dd>
            </>
          )}
          <dt className="text-muted-foreground">{t('List path')}</dt>
          <dd className="font-mono">{trigger.polling.listPath}</dd>
          <dt className="text-muted-foreground">{t('Deduplication key')}</dt>
          <dd className="font-mono">{trigger.polling.dedupeKey}</dd>
          <dt className="text-muted-foreground">{t('Checkpoint')}</dt>
          <dd className="font-mono">
            {trigger.polling.checkpointName
              ? `${trigger.polling.checkpointName} = max(item.${trigger.polling.checkpointItemPath})`
              : '-'}
          </dd>
        </dl>
      )}
      <p className="text-xs text-muted-foreground">
        {t(
          'Instant triggers register the platform webhook URL with the service when a workflow turns on',
        )}
      </p>
    </section>
  );
}

function EndpointReadView({
  label,
  description,
  required,
  endpoint,
}: {
  label: string;
  description: string;
  required: boolean;
  endpoint: { enabled: boolean; method: BlueprintHttpMethod; path: string };
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{label}</span>
        <Badge variant="outline">
          {required
            ? t('Required')
            : endpoint.enabled
            ? t('Enabled')
            : t('Disabled')}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      {endpoint.enabled && (
        <div className="mt-1 flex items-center gap-2">
          <MethodTag method={endpoint.method} />
          <span className="font-mono text-xs">{endpoint.path}</span>
        </div>
      )}
    </div>
  );
}

function ConfigEditForm({
  draft,
  setDraft,
  isPending,
  onCancel,
  onSave,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  isPending: boolean;
  onCancel: () => void;
  onSave: (patch: Partial<BlueprintTrigger>) => void;
}) {
  const setType = (type: BlueprintTriggerType) => setDraft({ ...draft, type });
  const setInstant = <K extends keyof Draft['instant']>(
    key: K,
    value: Draft['instant'][K],
  ) => setDraft({ ...draft, instant: { ...draft.instant, [key]: value } });
  const setPolling = <K extends keyof Draft['polling']>(
    key: K,
    value: Draft['polling'][K],
  ) => setDraft({ ...draft, polling: { ...draft.polling, [key]: value } });

  const subscribePathError =
    draft.instant.subscribeEnabled &&
    !draft.instant.subscribePath.startsWith('/') &&
    !blueprintRules.isHttpUrl(draft.instant.subscribePath)
      ? t('The path must start with /')
      : '';
  const unsubscribePathError =
    draft.instant.unsubscribeEnabled &&
    !draft.instant.unsubscribePath.startsWith('/') &&
    !blueprintRules.isHttpUrl(draft.instant.unsubscribePath)
      ? t('The path must start with /')
      : '';
  const handleError =
    draft.instant.handle.trim().length === 0
      ? t('Enter the output transform template')
      : blueprintTemplate.jsonError(draft.instant.handle)
      ? t('Not valid JSON')
      : '';

  const pollingPathError =
    !draft.polling.path.startsWith('/') &&
    !blueprintRules.isHttpUrl(draft.polling.path)
      ? t('The path must start with /')
      : '';
  const interval = Number(draft.polling.intervalMinutes);
  const intervalError =
    !Number.isInteger(interval) ||
    interval < 1 ||
    interval > BLUEPRINT_LIMITS.pollingIntervalMax
      ? t('Enter a whole number between 1 and {max}', {
          max: BLUEPRINT_LIMITS.pollingIntervalMax,
        })
      : '';
  const startPage = Number(draft.polling.startPage);
  const startPageError =
    draft.polling.pagination === BlueprintPagination.PAGE &&
    !(Number.isInteger(startPage) && startPage >= 0)
      ? t('Enter a whole number that is 0 or greater')
      : '';
  const cursorPathError =
    draft.polling.pagination === BlueprintPagination.CURSOR &&
    draft.polling.cursorPath.trim().length === 0
      ? t('Enter the cursor path')
      : '';
  const hasMoreError =
    draft.polling.pagination !== BlueprintPagination.NONE &&
    draft.polling.hasMorePath.trim().length === 0
      ? t('Enter the path that tells whether there is a next page')
      : '';
  const listPathError =
    draft.polling.listPath.trim().length === 0
      ? t('Enter the list data path')
      : '';
  const dedupeKeyError =
    draft.polling.dedupeKey.trim().length === 0
      ? t('Enter the deduplication key')
      : '';

  const invalid =
    draft.type === BlueprintTriggerType.INSTANT
      ? Boolean(subscribePathError) ||
        Boolean(unsubscribePathError) ||
        Boolean(handleError)
      : Boolean(pollingPathError) ||
        Boolean(intervalError) ||
        Boolean(startPageError) ||
        Boolean(cursorPathError) ||
        Boolean(hasMoreError) ||
        Boolean(listPathError) ||
        Boolean(dedupeKeyError);

  const save = () => {
    if (invalid) {
      return;
    }
    onSave({
      type: draft.type,
      instant: {
        subscribe: {
          enabled: draft.instant.subscribeEnabled,
          method: draft.instant.subscribeMethod,
          path: draft.instant.subscribePath,
          request: null,
        },
        unsubscribe: {
          enabled: draft.instant.unsubscribeEnabled,
          method: draft.instant.unsubscribeMethod,
          path: draft.instant.unsubscribePath,
          request: null,
        },
        subscriptionIdPath:
          draft.instant.subscriptionIdPath.trim() || 'body.id',
        handle: draft.instant.handle,
      },
      polling: {
        method: draft.polling.method,
        path: draft.polling.path,
        request: null,
        intervalMinutes: interval,
        pagination: draft.polling.pagination,
        pageParam: draft.polling.pageParam.trim(),
        startPage: Number.isInteger(startPage) ? startPage : 1,
        cursorParam: draft.polling.cursorParam.trim(),
        cursorPath: draft.polling.cursorPath.trim(),
        hasMorePath: draft.polling.hasMorePath.trim(),
        maxPages: Math.max(1, Number(draft.polling.maxPages) || 1),
        listPath: draft.polling.listPath.trim(),
        dedupeKey: draft.polling.dedupeKey.trim(),
        checkpointName: draft.polling.checkpointName.trim(),
        checkpointItemPath: draft.polling.checkpointItemPath.trim(),
      },
    });
  };

  return (
    <section className="flex flex-col gap-4 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">{t('Trigger configuration')}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button
            size="sm"
            disabled={invalid}
            loading={isPending}
            onClick={save}
          >
            {t('Save')}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TypeCard
          active={draft.type === BlueprintTriggerType.INSTANT}
          title={t('Instant trigger')}
          description={t(
            'The service pushes events and runs start immediately',
          )}
          onClick={() => setType(BlueprintTriggerType.INSTANT)}
        />
        <TypeCard
          active={draft.type === BlueprintTriggerType.POLLING}
          title={t('Polling trigger')}
          description={t(
            'The platform calls an API periodically to find new data',
          )}
          onClick={() => setType(BlueprintTriggerType.POLLING)}
        />
      </div>
      {draft.type === BlueprintTriggerType.INSTANT ? (
        <div className="flex flex-col gap-3">
          <EndpointForm
            label={t('Subscribe endpoint')}
            description={t(
              'Called when the workflow turns on, registers the platform callback URL with the service. Referenced as {placeholder}',
              { placeholder: '{{webhookUrl}}' },
            )}
            enabled={draft.instant.subscribeEnabled}
            method={draft.instant.subscribeMethod}
            path={draft.instant.subscribePath}
            error={subscribePathError}
            onEnabledChange={(value) => setInstant('subscribeEnabled', value)}
            onMethodChange={(value) => setInstant('subscribeMethod', value)}
            onPathChange={(value) => setInstant('subscribePath', value)}
          />
          <EndpointForm
            label={t('Unsubscribe endpoint')}
            description={t(
              'Called when the workflow turns off, deregisters the callback. Referenced as {placeholder}',
              { placeholder: '{{subscriptionId}}' },
            )}
            enabled={draft.instant.unsubscribeEnabled}
            method={draft.instant.unsubscribeMethod}
            path={draft.instant.unsubscribePath}
            error={unsubscribePathError}
            onEnabledChange={(value) => setInstant('unsubscribeEnabled', value)}
            onMethodChange={(value) => setInstant('unsubscribeMethod', value)}
            onPathChange={(value) => setInstant('unsubscribePath', value)}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              {t('Subscription id path')}
            </label>
            <Input
              className="font-mono"
              value={draft.instant.subscriptionIdPath}
              placeholder="body.id"
              onChange={(event) =>
                setInstant('subscriptionIdPath', event.target.value)
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              {t('Execute endpoint')}{' '}
              <span className="text-destructive">*</span>
            </label>
            <p className="text-xs text-muted-foreground">
              {t(
                'Runs after receiving a push, transforms the raw event with {placeholder}',
                {
                  placeholder: '{{event.x}}',
                },
              )}
            </p>
            <Textarea
              rows={6}
              className="font-mono"
              value={draft.instant.handle}
              onChange={(event) => setInstant('handle', event.target.value)}
            />
            {handleError && (
              <p className="text-xs text-destructive">{handleError}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t('Request')}</label>
              <div className="flex gap-2">
                <Select
                  value={draft.polling.method}
                  onValueChange={(value) => {
                    const method = toHttpMethod(value);
                    if (method) {
                      setPolling('method', method);
                    }
                  }}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BlueprintHttpMethod.GET}>GET</SelectItem>
                    <SelectItem value={BlueprintHttpMethod.POST}>
                      POST
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="grow font-mono"
                  value={draft.polling.path}
                  onChange={(event) => setPolling('path', event.target.value)}
                />
              </div>
              {pollingPathError && (
                <p className="text-xs text-destructive">{pollingPathError}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                {t('Polling interval')}
              </label>
              <Input
                value={draft.polling.intervalMinutes}
                onChange={(event) =>
                  setPolling('intervalMinutes', event.target.value)
                }
              />
              {intervalError && (
                <p className="text-xs text-destructive">{intervalError}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t('Pagination')}</label>
              <Select
                value={draft.polling.pagination}
                onValueChange={(value) => {
                  const pagination = toPagination(value);
                  if (pagination) {
                    setPolling('pagination', pagination);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BlueprintPagination.NONE}>
                    {t('No pagination')}
                  </SelectItem>
                  <SelectItem value={BlueprintPagination.PAGE}>
                    {t('Page number')}
                  </SelectItem>
                  <SelectItem value={BlueprintPagination.CURSOR}>
                    {t('Cursor')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draft.polling.pagination === BlueprintPagination.PAGE && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">{t('Start page')}</label>
                <Input
                  value={draft.polling.startPage}
                  onChange={(event) =>
                    setPolling('startPage', event.target.value)
                  }
                />
                {startPageError && (
                  <p className="text-xs text-destructive">{startPageError}</p>
                )}
              </div>
            )}
            {draft.polling.pagination === BlueprintPagination.CURSOR && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">
                  {t('Cursor path')}
                </label>
                <Input
                  className="font-mono"
                  value={draft.polling.cursorPath}
                  onChange={(event) =>
                    setPolling('cursorPath', event.target.value)
                  }
                />
                {cursorPathError && (
                  <p className="text-xs text-destructive">{cursorPathError}</p>
                )}
              </div>
            )}
            {draft.polling.pagination !== BlueprintPagination.NONE && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">
                    {t('Has more page')}
                  </label>
                  <Input
                    className="font-mono"
                    value={draft.polling.hasMorePath}
                    onChange={(event) =>
                      setPolling('hasMorePath', event.target.value)
                    }
                  />
                  {hasMoreError && (
                    <p className="text-xs text-destructive">{hasMoreError}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">
                    {t('Maximum pages per run')}
                  </label>
                  <Input
                    value={draft.polling.maxPages}
                    onChange={(event) =>
                      setPolling('maxPages', event.target.value)
                    }
                  />
                </div>
              </>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                {t('List data path')}
              </label>
              <Input
                className="font-mono"
                value={draft.polling.listPath}
                placeholder="body.items"
                onChange={(event) => setPolling('listPath', event.target.value)}
              />
              {listPathError && (
                <p className="text-xs text-destructive">{listPathError}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                {t('Deduplication key')}
              </label>
              <Input
                className="font-mono"
                value={draft.polling.dedupeKey}
                placeholder="id"
                onChange={(event) =>
                  setPolling('dedupeKey', event.target.value)
                }
              />
              {dedupeKeyError && (
                <p className="text-xs text-destructive">{dedupeKeyError}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              {t('Checkpoint variable')}
            </label>
            <p className="text-xs text-muted-foreground">
              {t(
                'Saved after each poll and picked up by the next one, referenced as {placeholder}',
                { placeholder: '{{checkpoint.x}}' },
              )}
            </p>
            <div className="flex items-center gap-2 font-mono text-sm">
              <Input
                className="w-40"
                value={draft.polling.checkpointName}
                placeholder="lastTime"
                onChange={(event) =>
                  setPolling('checkpointName', event.target.value)
                }
              />
              <span>= max(item.</span>
              <Input
                className="w-40"
                value={draft.polling.checkpointItemPath}
                placeholder="updatedAt"
                onChange={(event) =>
                  setPolling('checkpointItemPath', event.target.value)
                }
              />
              <span>)</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function EndpointForm({
  label,
  description,
  enabled,
  method,
  path,
  error,
  onEnabledChange,
  onMethodChange,
  onPathChange,
}: {
  label: string;
  description: string;
  enabled: boolean;
  method: BlueprintHttpMethod;
  path: string;
  error: string;
  onEnabledChange: (value: boolean) => void;
  onMethodChange: (value: BlueprintHttpMethod) => void;
  onPathChange: (value: string) => void;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {t('Enabled')}
          <Switch checked={enabled} onCheckedChange={onEnabledChange} />
        </div>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{description}</p>
      {enabled && (
        <div className="flex flex-col gap-1">
          <div className="flex gap-2">
            <Select
              value={method}
              onValueChange={(value) => {
                const next = toHttpMethod(value);
                if (next) {
                  onMethodChange(next);
                }
              }}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(BlueprintHttpMethod).map((candidate) => (
                  <SelectItem key={candidate} value={candidate}>
                    {candidate}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="grow font-mono"
              value={path}
              onChange={(event) => onPathChange(event.target.value)}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}

function TypeCard({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-1 rounded-md border p-3 text-left data-[active=true]:border-primary data-[active=true]:ring-1 data-[active=true]:ring-primary"
      data-active={active}
    >
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

function paginationLabel(
  pagination: BlueprintPagination,
  polling: { startPage: number; cursorPath: string },
): string {
  switch (pagination) {
    case BlueprintPagination.NONE:
      return t('No pagination');
    case BlueprintPagination.PAGE:
      return t('Page number, starting at page {page}', {
        page: polling.startPage,
      });
    case BlueprintPagination.CURSOR:
      return t('Cursor {path}', { path: polling.cursorPath });
  }
}

function toHttpMethod(value: string): BlueprintHttpMethod | undefined {
  return z.enum(BlueprintHttpMethod).safeParse(value).data;
}

function toPagination(value: string): BlueprintPagination | undefined {
  return z.enum(BlueprintPagination).safeParse(value).data;
}

function draftOf(trigger: BlueprintTrigger): Draft {
  return {
    type: trigger.type,
    instant: {
      subscribeEnabled: trigger.instant.subscribe.enabled,
      subscribeMethod: trigger.instant.subscribe.method,
      subscribePath: trigger.instant.subscribe.path,
      unsubscribeEnabled: trigger.instant.unsubscribe.enabled,
      unsubscribeMethod: trigger.instant.unsubscribe.method,
      unsubscribePath: trigger.instant.unsubscribe.path,
      subscriptionIdPath: trigger.instant.subscriptionIdPath,
      handle: trigger.instant.handle,
    },
    polling: {
      method: trigger.polling.method,
      path: trigger.polling.path,
      intervalMinutes: String(trigger.polling.intervalMinutes),
      pagination: trigger.polling.pagination,
      pageParam: trigger.polling.pageParam,
      startPage: String(trigger.polling.startPage),
      cursorParam: trigger.polling.cursorParam,
      cursorPath: trigger.polling.cursorPath,
      hasMorePath: trigger.polling.hasMorePath,
      maxPages: String(trigger.polling.maxPages),
      listPath: trigger.polling.listPath,
      dedupeKey: trigger.polling.dedupeKey,
      checkpointName: trigger.polling.checkpointName,
      checkpointItemPath: trigger.polling.checkpointItemPath,
    },
  };
}

type Draft = {
  type: BlueprintTriggerType;
  instant: {
    subscribeEnabled: boolean;
    subscribeMethod: BlueprintHttpMethod;
    subscribePath: string;
    unsubscribeEnabled: boolean;
    unsubscribeMethod: BlueprintHttpMethod;
    unsubscribePath: string;
    subscriptionIdPath: string;
    handle: string;
  };
  polling: {
    method: BlueprintHttpMethod;
    path: string;
    intervalMinutes: string;
    pagination: BlueprintPagination;
    pageParam: string;
    startPage: string;
    cursorParam: string;
    cursorPath: string;
    hasMorePath: string;
    maxPages: string;
    listPath: string;
    dedupeKey: string;
    checkpointName: string;
    checkpointItemPath: string;
  };
};
