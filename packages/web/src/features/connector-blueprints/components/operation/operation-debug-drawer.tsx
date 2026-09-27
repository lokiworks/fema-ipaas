import {
  BlueprintInput,
  BlueprintInputControl,
  BlueprintOperation,
  blueprintRules,
  blueprintTemplate,
  BlueprintValueType,
  ConnectorBlueprintDetail,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { SaveIcon } from 'lucide-react';
import { useState } from 'react';

import { Dot } from '@/components/custom/dot';
import { SimpleJsonViewer } from '@/components/custom/simple-json-viewer';
import { CodeBlock, CodeBlockCode } from '@/components/prompt-kit/code-block';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import { connectorBlueprintHooks } from '../../hooks/connector-blueprint-hooks';

export function OperationDebugDrawer({
  open,
  onOpenChange,
  detail,
  operation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: ConnectorBlueprintDetail;
  operation: BlueprintOperation;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-2xl"
      >
        {open && (
          <DebugConsole
            key={operation.key}
            detail={detail}
            operation={operation}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DebugConsole({
  detail,
  operation,
}: {
  detail: ConnectorBlueprintDetail;
  operation: BlueprintOperation;
}) {
  const { data: allProjects } = connectorBlueprintHooks.useBlueprintProjects(
    detail.id,
  );
  const projects = (allProjects ?? []).filter((project) => project.member);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(operation.inputs.map((input) => [input.key, ''])),
  );
  const [chosenProjectId, setProjectId] = useState<string | null>(null);
  const projectId = chosenProjectId ?? projects[0]?.id ?? null;
  const [tab, setTab] = useState('resp');
  const [tried, setTried] = useState(false);

  const {
    mutateAsync: runDebug,
    isPending: running,
    data: result,
  } = connectorBlueprintHooks.useDebugBlueprintOperation({ id: detail.id });
  const { mutate: saveRecord, isPending: saving } =
    connectorBlueprintHooks.useSaveBlueprintDebugRecord({ id: detail.id });

  const errors = Object.fromEntries(
    operation.inputs.map((input) => [
      input.key,
      debugValueError(input, values[input.key]),
    ]),
  );
  const projectError =
    projectId === null && projects.length > 0 ? t('Choose a project') : '';
  const invalid = Object.values(errors).some(Boolean) || Boolean(projectError);

  const run = async () => {
    setTried(true);
    if (invalid) {
      return;
    }
    const input = Object.fromEntries(
      operation.inputs.map((current) => [
        current.key,
        typedValue(current, values[current.key]),
      ]),
    );
    const response = await runDebug({
      operationKey: operation.key,
      input,
      projectId,
    });
    setTab('resp');
    return response;
  };

  const records = detail.debugRecords.filter(
    (record) => record.operationKey === operation.key,
  );

  return (
    <>
      <SheetHeader>
        <SheetTitle>{t('Debug console')}</SheetTitle>
        <SheetDescription>
          {t('{name} · {method} {path}', {
            name: operation.name,
            method: operation.method,
            path: operation.path,
          })}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 py-2">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">{t('Debug inputs')}</p>
          {operation.inputs.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t('This operation has no inputs')}
            </p>
          )}
          {operation.inputs.map((input) => (
            <div
              key={input.key}
              className="grid grid-cols-[160px_1fr] items-start gap-3"
            >
              <label className="pt-2 text-sm">
                {input.label}
                {input.required && <span className="text-destructive"> *</span>}
              </label>
              <div className="flex flex-col gap-1">
                {input.control === BlueprintInputControl.SWITCH ? (
                  <Switch
                    checked={values[input.key] === 'true'}
                    onCheckedChange={(checked) =>
                      setValues((current) => ({
                        ...current,
                        [input.key]: String(checked),
                      }))
                    }
                  />
                ) : input.control === BlueprintInputControl.DROPDOWN ? (
                  <Select
                    value={values[input.key] || undefined}
                    onValueChange={(value) =>
                      setValues((current) => ({
                        ...current,
                        [input.key]: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('Choose')} />
                    </SelectTrigger>
                    <SelectContent>
                      {input.options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : input.control === BlueprintInputControl.CODE ? (
                  <Textarea
                    rows={3}
                    className="font-mono"
                    value={values[input.key]}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [input.key]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <Input
                    value={values[input.key]}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [input.key]: event.target.value,
                      }))
                    }
                  />
                )}
                {tried && errors[input.key] && (
                  <p className="text-xs text-destructive">
                    {errors[input.key]}
                  </p>
                )}
              </div>
            </div>
          ))}
          <div className="grid grid-cols-[160px_1fr] items-start gap-3">
            <label className="pt-2 text-sm">
              {t('Project')} <span className="text-destructive">*</span>
            </label>
            <div className="flex flex-col gap-1">
              <Select
                value={projectId ?? undefined}
                onValueChange={setProjectId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('Choose a project')} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tried && projectError && (
                <p className="text-xs text-destructive">{projectError}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button loading={running} onClick={run}>
            {t('Run debug')}
          </Button>
          {running && (
            <span className="text-xs text-muted-foreground">
              {t('Running on a worker, this can take a few seconds')}
            </span>
          )}
          {result && (
            <>
              <Button
                variant="outline"
                loading={saving}
                onClick={() =>
                  saveRecord({
                    operationKey: operation.key,
                    input: Object.fromEntries(
                      operation.inputs.map((current) => [
                        current.key,
                        typedValue(current, values[current.key]),
                      ]),
                    ),
                    success: result.success,
                    status: result.status,
                    durationMs: result.durationMs,
                  })
                }
              >
                <SaveIcon className="size-4" />
                {t('Save this record')}
              </Button>
              <Badge variant={result.success ? 'success' : 'destructive'}>
                {t('{status} · {duration} ms', {
                  status: result.success
                    ? `${result.status} OK`
                    : result.errorMessage ?? String(result.status),
                  duration: result.durationMs,
                })}
              </Badge>
            </>
          )}
        </div>
        {result && (
          <div className="flex flex-col gap-2">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="req">{t('Request')}</TabsTrigger>
                <TabsTrigger value="resp">{t('Response')}</TabsTrigger>
                <TabsTrigger value="log">{t('HTTP log')}</TabsTrigger>
              </TabsList>
            </Tabs>
            {tab === 'req' && (
              <CodeBlock>
                <CodeBlockCode code={result.request} language="http" />
              </CodeBlock>
            )}
            {tab === 'resp' && (
              <SimpleJsonViewer data={result.response} maxHeight={320} />
            )}
            {tab === 'log' && (
              <CodeBlock>
                <CodeBlockCode code={result.log.join('\n')} language="log" />
              </CodeBlock>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            {t('Debug records')}{' '}
            <span className="text-xs font-normal text-muted-foreground">
              {t('The server keeps up to {limit} per operation', { limit: 20 })}
            </span>
          </p>
          {records.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t(
                'Records you save appear here and can be reloaded with one click',
              )}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
                >
                  <Dot
                    variant="destructive"
                    className={record.success ? 'bg-success' : undefined}
                  />
                  <span className="grow">
                    {new Date(record.at).toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {record.status} · {record.durationMs} ms
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setValues((current) => ({
                        ...current,
                        ...Object.fromEntries(
                          Object.entries(record.input).map(([key, value]) => [
                            key,
                            blueprintTemplate.stringify(value),
                          ]),
                        ),
                      }));
                      setTried(false);
                    }}
                  >
                    {t('Load parameters')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function typedValue(input: BlueprintInput, raw: string): unknown {
  if (input.control === BlueprintInputControl.SWITCH) {
    return raw === 'true';
  }
  if (input.control === BlueprintInputControl.CODE) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  if (
    input.type === BlueprintValueType.NUMBER &&
    raw.trim().length > 0 &&
    !Number.isNaN(Number(raw))
  ) {
    return Number(raw);
  }
  return raw;
}

function debugValueError(input: BlueprintInput, raw: string): string {
  const empty = raw === undefined || raw.trim().length === 0;
  if (input.control === BlueprintInputControl.SWITCH) {
    return '';
  }
  if (empty) {
    return input.required ? t('Enter {label}', { label: input.label }) : '';
  }
  if (
    input.type === BlueprintValueType.NUMBER &&
    input.control !== BlueprintInputControl.CODE &&
    Number.isNaN(Number(raw))
  ) {
    return t('Enter a number');
  }
  if (
    input.control === BlueprintInputControl.CODE &&
    blueprintTemplate.jsonError(raw)
  ) {
    return t('Not valid JSON');
  }
  if (
    input.pattern.length > 0 &&
    blueprintRules.isValidRegex(input.pattern) &&
    !new RegExp(input.pattern).test(raw)
  ) {
    return input.patternMessage || t('Invalid format');
  }
  return '';
}
