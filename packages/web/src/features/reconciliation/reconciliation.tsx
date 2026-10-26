import {
  ActionBase,
  OutputSchemaField,
  PropertyType,
} from '@fema-ipaas/connector-sdk';
import { Permission, tryCatchSync } from '@fema-ipaas/core-utils';
import {
  PopulatedWorkflow,
  ProjectWithLimits,
  ReconciliationDifference,
  ReconciliationEndpoint,
  ReconciliationExpectation,
  ReconciliationFilter,
  ReconciliationRule,
  ReconciliationRuleBody,
  ReconciliationRun,
  SeekPage,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { connectionsApi } from '@/features/connections/api/connections';
import { connectorsHooks } from '@/features/connectors/hooks/connectors-hooks';
import { MyProjectRole } from '@/hooks/authorization-hooks';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

export function ReconciliationSettings() {
  const [projectId, setProjectId] = useState(
    authenticationSession.getProjectId() ?? '',
  );
  const projects = useQuery({
    queryKey: ['reconciliation-projects'],
    queryFn: () =>
      api.get<SeekPage<ProjectWithLimits>>('/v1/projects', { limit: 1000 }),
    meta: PRIMARY_DATA,
  });
  return (
    <div className="flex flex-col gap-4 py-4">
      <Choice
        label={t('Project')}
        value={projectId}
        onChange={setProjectId}
        options={(projects.data?.data ?? []).map((project) => ({
          value: project.id,
          label: project.displayName,
        }))}
      />
      {projectId && <Rules key={projectId} projectId={projectId} />}
    </div>
  );
}

function Rules({ projectId }: { projectId: string }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReconciliationRule>();
  const [selected, setSelected] = useState<ReconciliationRule>();
  const [deleting, setDeleting] = useState<ReconciliationRule>();
  const client = useQueryClient();
  const canWrite = useCanWrite(projectId);
  const refresh = () => {
    void client.invalidateQueries({
      queryKey: ['reconciliation-rules', projectId],
    });
  };
  const query = useQuery({
    queryKey: ['reconciliation-rules', projectId],
    queryFn: () =>
      api.get<RuleWithRun[]>('/v1/reconciliation/rules', { projectId }),
    refetchInterval: (state) =>
      state.state.data?.some((rule) =>
        ['QUEUED', 'RUNNING'].includes(rule.lastRun?.status ?? ''),
      )
        ? 3000
        : false,
    meta: PRIMARY_DATA,
  });
  const start = useMutation({
    mutationFn: (ruleId: string) =>
      api.post<{ runId: string }>(
        `/v1/reconciliation/rules/${ruleId}/runs`,
        {},
      ),
    onSuccess: refresh,
    onError: showError,
  });
  const remove = useMutation({
    mutationFn: (ruleId: string) =>
      api.delete(`/v1/reconciliation/rules/${ruleId}`),
    onSuccess: () => {
      setDeleting(undefined);
      refresh();
    },
    onError: showError,
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {t('Compare full lists to find missing or different records.')}
        </p>
        <Button
          disabled={!canWrite}
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          {t('New reconciliation rule')}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {['Name', 'Status', 'Latest run', 'Differences'].map((label) => (
              <TableHead key={label}>{t(label)}</TableHead>
            ))}
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(query.data ?? []).map((rule) => (
            <TableRow key={rule.id}>
              <TableCell>
                <Button variant="link" onClick={() => setSelected(rule)}>
                  {rule.name}
                </Button>
              </TableCell>
              <TableCell>{t(rule.enabled ? 'Enabled' : 'Disabled')}</TableCell>
              <TableCell>
                {rule.lastRun ? (
                  <div className="flex flex-col gap-1">
                    <span>{t(rule.lastRun.status)}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('Source')}: {rule.lastRun.sourceCount} · {t('Target')}:{' '}
                      {rule.lastRun.targetCount} · {t('Matched')}:{' '}
                      {rule.lastRun.matchedCount}
                    </span>
                  </div>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell>{rule.lastRun?.differenceCount ?? '—'}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      !canWrite ||
                      start.isPending ||
                      ['QUEUED', 'RUNNING'].includes(rule.lastRun?.status ?? '')
                    }
                    onClick={() => start.mutate(rule.id)}
                  >
                    {t('Reconcile now')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!canWrite}
                    onClick={() => {
                      setEditing(rule);
                      setFormOpen(true);
                    }}
                  >
                    {t('Edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!canWrite}
                    onClick={() => setDeleting(rule)}
                  >
                    {t('Delete')}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {query.data?.length === 0 && (
            <TableRow>
              <TableCell colSpan={5}>
                {t('No reconciliation rules yet')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-5xl">
          <SheetHeader>
            <SheetTitle>
              {t(
                editing
                  ? 'Edit reconciliation rule'
                  : 'New reconciliation rule',
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="p-4">
            {formOpen && (
              <RuleForm
                key={editing?.id ?? 'new'}
                projectId={projectId}
                initial={editing}
                onSaved={() => {
                  setFormOpen(false);
                  refresh();
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
      {selected && (
        <Dialog open onOpenChange={() => setSelected(undefined)}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selected.name}</DialogTitle>
            </DialogHeader>
            <ReconciliationDifferences
              key={selected.id}
              projectId={projectId}
              ruleId={selected.id}
            />
          </DialogContent>
        </Dialog>
      )}
      {deleting && (
        <Dialog open onOpenChange={() => setDeleting(undefined)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('Delete reconciliation rule')}</DialogTitle>
            </DialogHeader>
            <p className="text-sm">
              {t('Deleting a rule removes its reconciliation history.')}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleting(undefined)}>
                {t('Cancel')}
              </Button>
              <Button
                variant="destructive"
                loading={remove.isPending}
                onClick={() => remove.mutate(deleting.id)}
              >
                {t('Delete')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function RuleForm({
  projectId,
  initial,
  onSaved,
}: {
  projectId: string;
  initial?: ReconciliationRule;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [workflowId, setWorkflowId] = useState(initial?.workflowId ?? '');
  const [source, setSource] = useState<ReconciliationEndpoint>(
    initial?.source ?? emptyEndpoint(),
  );
  const [target, setTarget] = useState<ReconciliationEndpoint>(
    initial?.target ?? emptyEndpoint(),
  );
  const [scope, setScope] = useState<ReconciliationFilter[]>(
    initial?.scope ?? [],
  );
  const [readActionName, setReadActionName] = useState(
    initial?.repair.readActionName ?? '',
  );
  const [keyInput, setKeyInput] = useState(initial?.repair.keyInput ?? '');
  const [cron, setCron] = useState(initial?.cron ?? '17 2 * * *');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [maxRepairs, setMaxRepairs] = useState(initial?.maxRepairsPerRun ?? 20);
  const [checks, setChecks] = useState<ExpectationDraft[]>(
    initial?.expectations.map(draftOf) ?? [emptyCheck()],
  );
  const workflows = useQuery({
    queryKey: ['reconciliation-workflows', projectId],
    queryFn: () =>
      api.get<SeekPage<PopulatedWorkflow>>('/v1/workflows', {
        projectId,
        limit: 1000,
      }),
    meta: PRIMARY_DATA,
  });
  const mappingTables = useQuery({
    queryKey: ['reconciliation-mapping-tables', projectId],
    queryFn: () =>
      api.get<{ id: string; name: string }[]>('/v1/mapping-tables', {
        projectId,
      }),
  });
  const sourceConnector = connectorsHooks.useConnector({
    name: source.connectorName,
    projectId,
    enabled: !!source.connectorName,
  });
  const targetConnector = connectorsHooks.useConnector({
    name: target.connectorName,
    projectId,
    enabled: !!target.connectorName,
  });
  const sourcePaths = fieldsOf(
    sourceConnector.connectorModel?.actions[source.actionName],
  );
  const targetPaths = fieldsOf(
    targetConnector.connectorModel?.actions[target.actionName],
  );
  const reads = Object.values(
    sourceConnector.connectorModel?.actions ?? {},
  ).filter((action) => action.classification === 'READ');
  const readInputs = Object.keys(
    reads.find((action) => action.name === readActionName)?.props ?? {},
  );
  const save = useMutation({
    mutationFn: () =>
      api.post<ReconciliationRule>(
        initial
          ? `/v1/reconciliation/rules/${initial.id}`
          : '/v1/reconciliation/rules',
        ReconciliationRuleBody.parse({
          projectId,
          name,
          workflowId,
          source,
          target,
          scope,
          expectations: checks.map(expectationOf),
          repair: { readActionName, keyInput },
          cron,
          enabled,
          maxRepairsPerRun: maxRepairs,
        }),
      ),
    onSuccess: onSaved,
    onError: showError,
  });
  const changeCheck = ({
    index,
    patch,
  }: {
    index: number;
    patch: Partial<ExpectationDraft>;
  }) =>
    setChecks((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  return (
    <div className="flex flex-col gap-4 text-sm">
      <Field label={t('Name')} value={name} onChange={setName} />
      <Choice
        label={t('Workflow used to repair differences')}
        value={workflowId}
        onChange={setWorkflowId}
        options={(workflows.data?.data ?? []).map((workflow) => ({
          value: workflow.id,
          label: workflow.version.displayName,
        }))}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <EndpointForm
          projectId={projectId}
          label={t('Source')}
          endpoint={source}
          onChange={setSource}
        />
        <EndpointForm
          projectId={projectId}
          label={t('Target')}
          endpoint={target}
          onChange={setTarget}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>{t('Source scope')}</Label>
        <p className="text-xs text-muted-foreground">
          {t('Only compare source records matching these conditions.')}
        </p>
        <FilterEditor filters={scope} paths={sourcePaths} onChange={setScope} />
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                'Aspect',
                'Check',
                'Source field',
                'Target field',
                'Mapping table',
                'Conditions',
                'Expected flag',
              ].map((label) => (
                <TableHead key={label}>{t(label)}</TableHead>
              ))}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {checks.map((check, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Input
                    aria-label={t('Aspect')}
                    value={check.aspect}
                    onChange={(event) =>
                      changeCheck({
                        index,
                        patch: { aspect: event.target.value },
                      })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Choice
                    label={t('Check')}
                    value={check.kind}
                    onChange={(value) =>
                      changeCheck({ index, patch: { kind: checkKind(value) } })
                    }
                    options={CHECKS.map((value) => ({
                      value,
                      label: t(value),
                    }))}
                  />
                </TableCell>
                <TableCell>
                  {['EQUALS', 'CONTAINS'].includes(check.kind) && (
                    <Field
                      label={t('Source field')}
                      value={check.sourcePath}
                      suggestions={sourcePaths}
                      onChange={(sourcePath) =>
                        changeCheck({ index, patch: { sourcePath } })
                      }
                    />
                  )}
                </TableCell>
                <TableCell>
                  {check.kind !== 'EXISTS' && (
                    <Field
                      label={t('Target field')}
                      value={check.targetPath}
                      suggestions={targetPaths}
                      onChange={(targetPath) =>
                        changeCheck({ index, patch: { targetPath } })
                      }
                    />
                  )}
                </TableCell>
                <TableCell>
                  {['EQUALS', 'CONTAINS'].includes(check.kind) && (
                    <Choice
                      label={t('Mapping table')}
                      value={check.mappingTableId || 'none'}
                      onChange={(value) =>
                        changeCheck({
                          index,
                          patch: {
                            mappingTableId: value === 'none' ? '' : value,
                          },
                        })
                      }
                      options={[
                        { value: 'none', label: t('None') },
                        ...(mappingTables.data ?? []).map((table) => ({
                          value: table.id,
                          label: table.name,
                        })),
                      ]}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <FilterEditor
                    filters={check.when}
                    paths={sourcePaths}
                    onChange={(when) => changeCheck({ index, patch: { when } })}
                  />
                </TableCell>
                <TableCell>
                  {check.kind === 'FLAG' && (
                    <Choice
                      label={t('Expected flag')}
                      value={String(check.flag)}
                      onChange={(value) =>
                        changeCheck({
                          index,
                          patch: { flag: value === 'true' },
                        })
                      }
                      options={[
                        { value: 'true', label: t('Yes') },
                        { value: 'false', label: t('No') },
                      ]}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={checks.length === 1}
                    onClick={() =>
                      setChecks((current) =>
                        current.filter((_row, rowIndex) => rowIndex !== index),
                      )
                    }
                  >
                    {t('Remove')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button
        variant="outline"
        onClick={() => setChecks((current) => [...current, emptyCheck()])}
      >
        {t('Add check')}
      </Button>
      <Choice
        label={t('Read current source record before repair')}
        value={readActionName}
        onChange={setReadActionName}
        options={reads.map((action) => ({
          value: action.name,
          label: action.displayName,
        }))}
      />
      <Choice
        label={t('Business key input field')}
        value={keyInput}
        onChange={setKeyInput}
        options={readInputs
          .filter((key) => key !== 'auth')
          .map((value) => ({ value, label: value }))}
      />
      <Field label={t('Schedule')} value={cron} onChange={setCron} />
      <Field
        label={t('Maximum automatic repairs per run')}
        value={String(maxRepairs)}
        onChange={(value) => setMaxRepairs(Number(value))}
        type="number"
      />
      <Choice
        label={t('Status')}
        value={String(enabled)}
        onChange={(value) => setEnabled(value === 'true')}
        options={[
          { value: 'true', label: t('Enabled') },
          { value: 'false', label: t('Disabled') },
        ]}
      />
      <p className="text-xs text-muted-foreground">
        {t(
          'Use 0 to review differences before repairing. Only the selected workflow writes changes.',
        )}
      </p>
      <Button
        loading={save.isPending}
        disabled={
          !name ||
          !workflowId ||
          !source.actionName ||
          !target.actionName ||
          !readActionName ||
          !keyInput
        }
        onClick={() => save.mutate()}
      >
        {t('Save')}
      </Button>
    </div>
  );
}

function FilterEditor({
  filters,
  paths,
  onChange,
}: {
  filters: ReconciliationFilter[];
  paths: Suggestion[];
  onChange: (filters: ReconciliationFilter[]) => void;
}) {
  const update = ({
    index,
    patch,
  }: {
    index: number;
    patch: Partial<ReconciliationFilter>;
  }) =>
    onChange(
      filters.map((filter, current) =>
        current === index ? { ...filter, ...patch } : filter,
      ),
    );
  return (
    <div className="flex min-w-56 flex-col gap-2">
      {filters.map((filter, index) => (
        <div key={index} className="flex items-end gap-2">
          <Field
            label={t('When field')}
            value={filter.path}
            suggestions={paths}
            onChange={(path) => update({ index, patch: { path } })}
          />
          <Field
            label={t('Values')}
            value={filter.in.join(',')}
            onChange={(value) =>
              update({
                index,
                patch: { in: value.split(',').map((item) => item.trim()) },
              })
            }
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange(filters.filter((_filter, current) => current !== index))
            }
          >
            {t('Remove')}
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange([...filters, { path: '', in: [] }])}
      >
        {t('Add condition')}
      </Button>
    </div>
  );
}

function EndpointForm({
  projectId,
  label,
  endpoint,
  onChange,
}: {
  projectId: string;
  label: string;
  endpoint: ReconciliationEndpoint;
  onChange: (endpoint: ReconciliationEndpoint) => void;
}) {
  const connections = useQuery({
    queryKey: ['reconciliation-connections', projectId],
    queryFn: () => connectionsApi.list({ projectId, limit: 1000 }),
  });
  const connector = connectorsHooks.useConnector({
    name: endpoint.connectorName,
    projectId,
    enabled: !!endpoint.connectorName,
  });
  const actions = Object.values(connector.connectorModel?.actions ?? {}).filter(
    (action) =>
      action.classification === 'SEARCH' && !!action.reliability?.enumeration,
  );
  const selected = actions.find(
    (action) => action.name === endpoint.actionName,
  );
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <p className="font-medium">{label}</p>
      <Choice
        label={t('Connection')}
        value={endpoint.connectionExternalId}
        options={(connections.data?.data ?? []).map((connection) => ({
          value: connection.externalId,
          label: connection.displayName,
        }))}
        onChange={(externalId) => {
          const connection = connections.data?.data.find(
            (item) => item.externalId === externalId,
          );
          if (connection)
            onChange({
              ...emptyEndpoint(),
              connectorName: connection.connectorName,
              connectionExternalId: externalId,
            });
        }}
      />
      <Choice
        label={t('Full-list action')}
        value={endpoint.actionName}
        options={actions.map((action) => ({
          value: action.name,
          label: action.displayName,
        }))}
        onChange={(actionName) =>
          onChange({
            ...endpoint,
            actionName,
            input: Object.fromEntries(
              Object.entries(
                actions.find((action) => action.name === actionName)?.props ??
                  {},
              ).flatMap(([key, prop]) =>
                !['pageToken', 'pageSize', 'allPages'].includes(key) &&
                'defaultValue' in prop &&
                prop.defaultValue !== undefined
                  ? [[key, prop.defaultValue]]
                  : [],
              ),
            ),
            keyPath:
              actions.find((action) => action.name === actionName)?.reliability
                ?.enumeration?.businessKeyPath ?? '',
          })
        }
      />
      <Field
        label={t('Business key field')}
        value={endpoint.keyPath}
        suggestions={fieldsOf(selected)}
        onChange={(keyPath) => onChange({ ...endpoint, keyPath })}
      />
      {selected && (
        <ActionFields
          action={selected}
          values={endpoint.input}
          onChange={(input) => onChange({ ...endpoint, input })}
        />
      )}
    </div>
  );
}

function ActionFields({
  action,
  values,
  onChange,
}: {
  action: ActionBase;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}) {
  return (
    <>
      {Object.entries(action.props)
        .filter(
          ([key, prop]) =>
            !['pageToken', 'pageSize', 'allPages'].includes(key) &&
            prop.type !== PropertyType.MARKDOWN,
        )
        .map(([key, prop]) => {
          const value =
            values[key] ?? ('defaultValue' in prop ? prop.defaultValue : '');
          if (prop.type === PropertyType.STATIC_DROPDOWN)
            return (
              <Choice
                key={key}
                label={prop.displayName}
                value={String(value ?? '')}
                options={prop.options.options.map((option) => ({
                  value: String(option.value),
                  label: option.label,
                }))}
                onChange={(selected) =>
                  onChange({
                    ...values,
                    [key]: prop.options.options.find(
                      (option) => String(option.value) === selected,
                    )?.value,
                  })
                }
              />
            );
          if (prop.type === PropertyType.CHECKBOX)
            return (
              <Choice
                key={key}
                label={prop.displayName}
                value={String(value ?? false)}
                options={[
                  { value: 'true', label: t('Yes') },
                  { value: 'false', label: t('No') },
                ]}
                onChange={(selected) =>
                  onChange({ ...values, [key]: selected === 'true' })
                }
              />
            );
          return (
            <Field
              key={key}
              label={prop.displayName}
              value={
                typeof value === 'object'
                  ? JSON.stringify(value)
                  : String(value ?? '')
              }
              type={prop.type === PropertyType.NUMBER ? 'number' : 'text'}
              onChange={(next) =>
                onChange({
                  ...values,
                  [key]:
                    prop.type === PropertyType.NUMBER
                      ? Number(next)
                      : prop.type === PropertyType.JSON ||
                        prop.type === PropertyType.OBJECT ||
                        prop.type === PropertyType.ARRAY
                      ? jsonValue(next)
                      : next,
                })
              }
            />
          );
        })}
    </>
  );
}

export function ReconciliationDifferences({
  projectId,
  ruleId,
}: {
  projectId: string;
  ruleId: string;
}) {
  const [cursor, setCursor] = useState<string>();
  const [status, setStatus] = useState('OPEN');
  const [selected, setSelected] = useState<string[]>([]);
  const [ignoreIds, setIgnoreIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const canWrite = useCanWrite(projectId);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['reconciliation-differences', projectId, ruleId, cursor, status],
    queryFn: () =>
      api.get<SeekPage<ReconciliationDifference>>(
        `/v1/reconciliation/rules/${ruleId}/differences`,
        {
          projectId,
          cursor,
          limit: 50,
          ...(status === 'all' ? {} : { status }),
        },
      ),
    meta: PRIMARY_DATA,
  });
  const rows = query.data?.data ?? [];
  const reviewable = rows.filter((row) => row.status === 'OPEN');
  const repairable =
    selected.length > 0 &&
    rows
      .filter((row) => selected.includes(row.id))
      .every((row) => row.status === 'OPEN' && row.aspect !== 'duplicate-key');
  const action = useMutation({
    mutationFn: ({ ids, kind }: { ids: string[]; kind: 'repair' | 'ignore' }) =>
      api.post(`/v1/reconciliation/differences/${kind}`, {
        projectId,
        ids,
        ...(kind === 'ignore' ? { reason } : {}),
      }),
    onSuccess: () => {
      setSelected([]);
      setIgnoreIds([]);
      setReason('');
      void client.invalidateQueries({
        queryKey: ['reconciliation-differences', projectId, ruleId],
      });
    },
    onError: showError,
  });
  return (
    <div className="flex flex-col gap-3">
      <Choice
        label={t('Status')}
        value={status}
        onChange={(value) => {
          setStatus(value);
          setCursor(undefined);
          setSelected([]);
        }}
        options={['OPEN', 'REPAIRING', 'RESOLVED', 'IGNORED', 'all'].map(
          (value) => ({ value, label: t(value === 'all' ? 'All' : value) }),
        )}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!canWrite || !repairable || action.isPending}
          onClick={() => action.mutate({ ids: selected, kind: 'repair' })}
        >
          {t('Repair selected')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!canWrite || !selected.length || action.isPending}
          onClick={() => setIgnoreIds(selected)}
        >
          {t('Ignore selected')}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Checkbox
                aria-label={t('Select all')}
                checked={
                  reviewable.length > 0 &&
                  reviewable.every((row) => selected.includes(row.id))
                }
                disabled={!canWrite || !reviewable.length}
                onCheckedChange={(checked) =>
                  setSelected(
                    checked === true ? reviewable.map((row) => row.id) : [],
                  )
                }
              />
            </TableHead>
            {['Business key', 'Aspect', 'Expected', 'Actual', 'Status'].map(
              (label) => (
                <TableHead key={label}>{t(label)}</TableHead>
              ),
            )}
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Checkbox
                  aria-label={`${t('Select')} ${row.businessKey}`}
                  checked={selected.includes(row.id)}
                  disabled={!canWrite || row.status !== 'OPEN'}
                  onCheckedChange={(checked) =>
                    setSelected((current) =>
                      checked === true
                        ? [...current, row.id]
                        : current.filter((id) => id !== row.id),
                    )
                  }
                />
              </TableCell>
              <TableCell>{row.businessKey}</TableCell>
              <TableCell>{row.aspect}</TableCell>
              <TableCell>{JSON.stringify(row.expected)}</TableCell>
              <TableCell>{JSON.stringify(row.actual)}</TableCell>
              <TableCell>{t(row.status)}</TableCell>
              <TableCell className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !canWrite ||
                    row.status !== 'OPEN' ||
                    row.aspect === 'duplicate-key' ||
                    action.isPending
                  }
                  onClick={() =>
                    action.mutate({ ids: [row.id], kind: 'repair' })
                  }
                >
                  {t('Repair')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={
                    !canWrite ||
                    !['OPEN', 'REPAIRING'].includes(row.status) ||
                    action.isPending
                  }
                  onClick={() => setIgnoreIds([row.id])}
                >
                  {t('Ignore')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!rows.length && !query.isPending && (
            <TableRow>
              <TableCell colSpan={7}>{t('No differences')}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={!cursor}
          onClick={() => {
            setCursor(undefined);
            setSelected([]);
          }}
        >
          {t('First page')}
        </Button>
        <Button
          variant="outline"
          disabled={!query.data?.next}
          onClick={() => {
            setCursor(query.data?.next ?? undefined);
            setSelected([]);
          }}
        >
          {t('Next')}
        </Button>
      </div>
      <Dialog
        open={ignoreIds.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setIgnoreIds([]);
            setReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Reason for ignoring differences')}</DialogTitle>
          </DialogHeader>
          <Textarea
            aria-label={t('Reason')}
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button
            loading={action.isPending}
            disabled={!reason.trim()}
            onClick={() => action.mutate({ ids: ignoreIds, kind: 'ignore' })}
          >
            {t('Ignore')}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function useCanWrite(projectId: string): boolean {
  const role = useQuery({
    queryKey: ['project-member-role', projectId],
    queryFn: () =>
      api.get<MyProjectRole>('/v1/project-members/me', { projectId }),
    staleTime: 5 * 60 * 1000,
  });
  return role.data?.permissions.includes(Permission.WRITE_WORKFLOW) ?? false;
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  suggestions = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
  suggestions?: Suggestion[];
}) {
  const id = useId();
  return (
    <div className="flex min-w-32 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        list={suggestions.length ? `${id}-options` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {suggestions.length > 0 && (
        <datalist id={`${id}-options`}>
          {suggestions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </datalist>
      )}
    </div>
  );
}

function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Suggestion[];
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={t('Select an option')} />
        </SelectTrigger>
        <SelectContent>
          {options
            .filter((option) => option.value.length > 0)
            .map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function fieldsOf(action: ActionBase | undefined): Suggestion[] {
  return fieldPaths({
    fields:
      action?.outputSchema?.fields.find((field) => field.key === 'items')
        ?.listItems ?? [],
    prefix: '',
  });
}
function fieldPaths({
  fields,
  prefix,
}: {
  fields: OutputSchemaField[];
  prefix: string;
}): Suggestion[] {
  return fields.flatMap((field) => {
    const value = prefix ? `${prefix}.${field.key}` : field.key;
    return [
      { value, label: field.label ?? value },
      ...fieldPaths({ fields: field.children ?? [], prefix: value }),
    ];
  });
}
function jsonValue(value: string): unknown {
  const result = tryCatchSync(() => JSON.parse(value));
  return result.error ? value : result.data;
}
function emptyEndpoint(): ReconciliationEndpoint {
  return {
    connectorName: '',
    actionName: '',
    connectionExternalId: '',
    input: {},
    keyPath: '',
  };
}
function emptyCheck(): ExpectationDraft {
  return {
    aspect: 'account',
    kind: 'EXISTS',
    sourcePath: '',
    targetPath: '',
    mappingTableId: '',
    when: [],
    flag: true,
  };
}
function checkKind(value: string): ExpectationDraft['kind'] {
  return value === 'EQUALS' || value === 'CONTAINS' || value === 'FLAG'
    ? value
    : 'EXISTS';
}
function draftOf(check: ReconciliationExpectation): ExpectationDraft {
  return {
    aspect: check.aspect,
    kind: check.expect.kind,
    sourcePath: 'sourcePath' in check.expect ? check.expect.sourcePath : '',
    targetPath: 'targetPath' in check.expect ? check.expect.targetPath : '',
    mappingTableId:
      'mappingTableId' in check.expect ? check.expect.mappingTableId ?? '' : '',
    when: check.when,
    flag: check.expect.kind === 'FLAG' ? check.expect.value : true,
  };
}
function expectationOf(draft: ExpectationDraft): ReconciliationExpectation {
  const base = { aspect: draft.aspect, when: draft.when };
  if (draft.kind === 'EXISTS') return { ...base, expect: { kind: 'EXISTS' } };
  if (draft.kind === 'FLAG')
    return {
      ...base,
      expect: { kind: 'FLAG', targetPath: draft.targetPath, value: draft.flag },
    };
  return {
    ...base,
    expect: {
      kind: draft.kind,
      sourcePath: draft.sourcePath,
      targetPath: draft.targetPath,
      ...(draft.mappingTableId ? { mappingTableId: draft.mappingTableId } : {}),
    },
  };
}
function showError(error: unknown): void {
  toast.error(api.extractServerErrorMessage(error, t('Something went wrong')));
}

const PRIMARY_DATA = { showErrorDialog: true, loadSubsetOptions: {} };
const CHECKS: ExpectationDraft['kind'][] = [
  'EXISTS',
  'EQUALS',
  'CONTAINS',
  'FLAG',
];
type RuleWithRun = ReconciliationRule & { lastRun: ReconciliationRun | null };
type ExpectationDraft = {
  aspect: string;
  kind: 'EXISTS' | 'EQUALS' | 'CONTAINS' | 'FLAG';
  sourcePath: string;
  targetPath: string;
  mappingTableId: string;
  when: ReconciliationFilter[];
  flag: boolean;
};
type Suggestion = { value: string; label: string };
