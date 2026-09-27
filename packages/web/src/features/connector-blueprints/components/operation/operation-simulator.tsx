import {
  BlueprintInputControl,
  BlueprintOperation,
  blueprintExpression,
  blueprintRules,
  blueprintTemplate,
  ConnectorBlueprintDetail,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { SmartphoneIcon } from 'lucide-react';
import { useState } from 'react';

import { SimpleJsonViewer } from '@/components/custom/simple-json-viewer';
import { CodeBlock, CodeBlockCode } from '@/components/prompt-kit/code-block';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { blueprintIconUtils } from '../../utils/blueprint-icon-utils';

import { MethodTag } from './method-tag';

export function OperationSimulator({
  detail,
  operation,
}: {
  detail: ConnectorBlueprintDetail;
  operation: BlueprintOperation;
}) {
  const auth = detail.definition.auth;
  const needsConnection = Boolean(auth && auth.enabled);
  const [tab, setTab] = useState('op');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const currentTab = !needsConnection && tab === 'conn' ? 'op' : tab;
  const request = blueprintTemplate.resolveRequest(operation);
  const built = blueprintTemplate.buildRequest({
    baseUrl: detail.definition.baseUrl,
    method: operation.method,
    path: operation.path,
    request,
    vars: { input: values },
  });

  return (
    <aside className="flex w-[432px] shrink-0 flex-col border-l">
      <div className="flex items-center gap-2 border-b p-3 text-sm font-medium">
        <SmartphoneIcon className="size-3.5 text-muted-foreground" />
        {t('Simulator')}
        <span className="text-xs font-normal text-muted-foreground">
          {t('Previews the node panel')}
        </span>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto p-3">
        <div className="flex items-center gap-2">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white"
            style={{ background: detail.iconColor }}
          >
            {blueprintIconUtils.letterOf(detail.displayName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{detail.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {t('Operation: {name}', { name: operation.name })}
            </p>
          </div>
        </div>
        <Tabs value={currentTab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="op">{t('Operation')}</TabsTrigger>
            {needsConnection && (
              <TabsTrigger value="conn">{t('Connection')}</TabsTrigger>
            )}
            <TabsTrigger value="input">
              {t('Inputs')} ({operation.inputs.length})
            </TabsTrigger>
            <TabsTrigger value="output">{t('Outputs')}</TabsTrigger>
          </TabsList>
        </Tabs>
        {currentTab === 'op' && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <MethodTag method={operation.method} />
              <span className="font-medium">{operation.name}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {operation.description || t('No operation description')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('Group: {group}', {
                group: operation.group || t('Ungrouped'),
              })}
            </p>
            <p className="text-xs font-medium text-muted-foreground">
              {t('Request preview')}
            </p>
            <CodeBlock>
              <CodeBlockCode code={formatBuiltRequest(built)} language="http" />
            </CodeBlock>
          </div>
        )}
        {currentTab === 'conn' && needsConnection && auth && (
          <p className="text-xs text-muted-foreground">
            {t(
              'The workflow user picks one of their connections of this connector, authenticated with {name}',
              { name: auth.name },
            )}
          </p>
        )}
        {currentTab === 'input' &&
          (operation.inputs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('This operation has no inputs')}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {operation.inputs.map((input) => {
                const visible = blueprintExpression.evaluate({
                  expression: input.visibleIf,
                  values,
                });
                if (!visible) {
                  return null;
                }
                const value = values[input.key];
                const error = patternErrorOf(
                  input.pattern,
                  input.patternMessage,
                  value,
                );
                return (
                  <div key={input.key} className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-sm">
                      <span>{input.label}</span>
                      {input.required && (
                        <span className="text-destructive">*</span>
                      )}
                      {input.hint && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default text-xs text-muted-foreground">
                              ?
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{input.hint}</TooltipContent>
                        </Tooltip>
                      )}
                      {input.visibleIf.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          {t('Conditional')}
                        </Badge>
                      )}
                    </div>
                    {input.control === BlueprintInputControl.SWITCH ? (
                      <Switch
                        checked={Boolean(value)}
                        onCheckedChange={(checked) =>
                          setValues((current) => ({
                            ...current,
                            [input.key]: checked,
                          }))
                        }
                      />
                    ) : input.control === BlueprintInputControl.DROPDOWN ? (
                      <Select
                        value={typeof value === 'string' ? value : undefined}
                        onValueChange={(next) =>
                          setValues((current) => ({
                            ...current,
                            [input.key]: next,
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
                        value={typeof value === 'string' ? value : ''}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [input.key]: event.target.value,
                          }))
                        }
                      />
                    ) : (
                      <Input
                        value={typeof value === 'string' ? value : ''}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [input.key]: event.target.value,
                          }))
                        }
                      />
                    )}
                    {error && (
                      <p className="text-xs text-destructive">{error}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        {currentTab === 'output' &&
          (operation.sample && typeof operation.sample === 'object' ? (
            <SimpleJsonViewer data={operation.sample} maxHeight={300} />
          ) : (
            <p className="text-xs text-muted-foreground">
              {t('No outputs yet. Paste a response sample in the Outputs tab')}
            </p>
          ))}
      </div>
    </aside>
  );
}

function formatBuiltRequest(built: {
  method: string;
  url: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: string | null;
  form: Record<string, string>;
}): string {
  const query = Object.entries(built.query)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const lines = [
    `${built.method} ${built.url}${query ? `?${query}` : ''}`,
    ...Object.entries(built.headers).map(([key, value]) => `${key}: ${value}`),
  ];
  const body =
    built.body ??
    (Object.keys(built.form).length > 0
      ? Object.entries(built.form)
          .map(([key, value]) => `${key}=${value}`)
          .join('&')
      : '');
  return body.length > 0 ? [...lines, '', body].join('\n') : lines.join('\n');
}

function patternErrorOf(
  pattern: string,
  patternMessage: string,
  value: unknown,
): string {
  if (
    pattern.length === 0 ||
    value === undefined ||
    value === '' ||
    value === null
  ) {
    return '';
  }
  if (!blueprintRules.isValidRegex(pattern)) {
    return '';
  }
  return new RegExp(pattern).test(String(value))
    ? ''
    : patternMessage || t('Invalid format');
}
