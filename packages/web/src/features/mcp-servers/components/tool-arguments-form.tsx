import { t } from 'i18next';
import { PlusIcon, Trash2Icon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RequiredFieldAsterisk } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import {
  ToolArgumentsMode,
  ToolArgumentsState,
  ToolDraft,
  ToolFieldIssue,
  ToolFieldKind,
  ToolFieldNode,
  mcpToolFormUtils,
} from '../utils/mcp-tool-form-schema';

export function ToolArgumentsForm({
  nodes,
  state,
  issues,
  disabled,
  onChange,
}: {
  nodes: ToolFieldNode[];
  state: ToolArgumentsState;
  issues: ToolFieldIssue[];
  disabled: boolean;
  onChange: (state: ToolArgumentsState) => void;
}) {
  const jsonMode = state.mode === ToolArgumentsMode.JSON;
  const rootIssues = issues.filter((issue) => issue.path.length === 0);
  return (
    <div className="flex flex-col gap-3" data-testid="tool-arguments-form">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t('Arguments')}</span>
        <Tabs
          value={state.mode}
          onValueChange={(value) =>
            onChange(
              mcpToolFormUtils.switchMode({
                nodes,
                state,
                mode:
                  value === ToolArgumentsMode.JSON
                    ? ToolArgumentsMode.JSON
                    : ToolArgumentsMode.FORM,
              }),
            )
          }
        >
          <TabsList>
            <TabsTrigger value={ToolArgumentsMode.FORM}>
              {t('Form')}
            </TabsTrigger>
            <TabsTrigger value={ToolArgumentsMode.JSON}>JSON</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {state.switchError !== null && (
        <Alert variant="destructive">
          <AlertTitle>{t('Cannot switch to the form yet')}</AlertTitle>
          <AlertDescription>
            {mcpToolFormUtils.messageOf(state.switchError)}
          </AlertDescription>
        </Alert>
      )}
      {jsonMode ? (
        <div className="flex flex-col gap-1">
          <Textarea
            value={state.jsonText}
            disabled={disabled}
            minRows={8}
            maxRows={20}
            spellCheck={false}
            aria-label={t('Arguments as JSON')}
            className="font-mono text-xs"
            onChange={(event) =>
              onChange({
                ...state,
                jsonText: event.target.value,
                switchError: null,
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            {t(
              'A JSON object that follows the input schema of the tool. It is checked field by field before the call.',
            )}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {nodes.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t('This tool takes no arguments.')}
            </p>
          )}
          {nodes.map((node) => (
            <FieldEditor
              key={node.key}
              node={node}
              draft={state.drafts[node.key] ?? ''}
              path={node.key}
              issues={issues}
              disabled={disabled}
              onChange={(draft) =>
                onChange({
                  ...state,
                  drafts: { ...state.drafts, [node.key]: draft },
                })
              }
            />
          ))}
          {Object.keys(state.extra).length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t(
                'Fields the schema does not describe are kept as they are: {fields}',
                { fields: Object.keys(state.extra).join(', ') },
              )}
            </p>
          )}
        </div>
      )}
      {rootIssues.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            {rootIssues
              .map((issue) => mcpToolFormUtils.messageOf(issue))
              .join(' ')}
          </AlertDescription>
        </Alert>
      )}
      {issues.length > 0 && (
        <Alert variant="destructive" data-testid="tool-arguments-issues">
          <AlertTitle>
            {t('{count} problems in the arguments', { count: issues.length })}
          </AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {issues.map((issue, index) => (
                <li key={`${issue.path}-${issue.code}-${index}`}>
                  {mcpToolFormUtils.messageOf(issue)}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function FieldEditor({
  node,
  draft,
  path,
  issues,
  disabled,
  onChange,
}: {
  node: ToolFieldNode;
  draft: ToolDraft;
  path: string;
  issues: ToolFieldIssue[];
  disabled: boolean;
  onChange: (draft: ToolDraft) => void;
}) {
  const own = issues.filter((issue) => issue.path === path);
  const container =
    node.kind === ToolFieldKind.OBJECT || node.kind === ToolFieldKind.ARRAY;
  return (
    <div className="flex flex-col gap-1.5" data-field={path}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-medium">
          {node.label}
          {node.required && <RequiredFieldAsterisk />}
        </span>
        <span className="text-xs text-muted-foreground">
          {node.label !== node.key && node.key.length > 0
            ? `${node.key} · `
            : ''}
          {kindText(node)}
        </span>
      </div>
      {node.description !== undefined && (
        <p className="text-xs text-muted-foreground">{node.description}</p>
      )}
      {container ? (
        <ContainerEditor
          node={node}
          draft={draft}
          path={path}
          issues={issues}
          disabled={disabled}
          onChange={onChange}
        />
      ) : (
        <ScalarEditor
          node={node}
          draft={typeof draft === 'string' ? draft : ''}
          invalid={own.length > 0}
          disabled={disabled}
          onChange={onChange}
        />
      )}
      {own.map((issue, index) => (
        <p
          key={`${issue.code}-${index}`}
          className="text-xs text-destructive"
          role="alert"
        >
          {mcpToolFormUtils.messageOf(issue)}
        </p>
      ))}
    </div>
  );
}

function ContainerEditor({
  node,
  draft,
  path,
  issues,
  disabled,
  onChange,
}: {
  node: ToolFieldNode;
  draft: ToolDraft;
  path: string;
  issues: ToolFieldIssue[];
  disabled: boolean;
  onChange: (draft: ToolDraft) => void;
}) {
  if (node.kind === ToolFieldKind.OBJECT) {
    const record = isDraftRecord(draft) ? draft : {};
    return (
      <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
        {(node.properties ?? []).map((property) => (
          <FieldEditor
            key={property.key}
            node={property}
            draft={record[property.key] ?? ''}
            path={`${path}.${property.key}`}
            issues={issues}
            disabled={disabled}
            onChange={(next) => onChange({ ...record, [property.key]: next })}
          />
        ))}
      </div>
    );
  }
  const item = node.item;
  const list = Array.isArray(draft) ? draft : [];
  if (item === undefined) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
      {list.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('No items yet')}</p>
      )}
      {list.map((entry, index) => (
        <div key={index} className="flex items-start gap-2">
          <div className="min-w-0 grow">
            <FieldEditor
              node={{ ...item, label: `#${index + 1}`, required: false }}
              draft={entry}
              path={`${path}[${index + 1}]`}
              issues={issues}
              disabled={disabled}
              onChange={(next) =>
                onChange(
                  list.map((current, position) =>
                    position === index ? next : current,
                  ),
                )
              }
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={t('Remove item {index}', { index: index + 1 })}
            onClick={() =>
              onChange(list.filter((_, position) => position !== index))
            }
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={disabled}
        onClick={() => onChange([...list, mcpToolFormUtils.emptyDraft(item)])}
      >
        <PlusIcon />
        {t('Add item')}
      </Button>
    </div>
  );
}

function ScalarEditor({
  node,
  draft,
  invalid,
  disabled,
  onChange,
}: {
  node: ToolFieldNode;
  draft: string;
  invalid: boolean;
  disabled: boolean;
  onChange: (draft: ToolDraft) => void;
}) {
  switch (node.kind) {
    case ToolFieldKind.BOOLEAN:
      return (
        <ChoiceSelect
          value={draft}
          required={node.required}
          invalid={invalid}
          disabled={disabled}
          label={node.label}
          options={[
            { value: 'true', label: t('Yes') },
            { value: 'false', label: t('No') },
          ]}
          onChange={onChange}
        />
      );
    case ToolFieldKind.ENUM:
      return (
        <ChoiceSelect
          value={draft}
          required={node.required}
          invalid={invalid}
          disabled={disabled}
          label={node.label}
          options={(node.options ?? []).map((option) => ({
            value: String(option.value),
            label: option.label,
          }))}
          onChange={onChange}
        />
      );
    case ToolFieldKind.JSON:
      return (
        <Textarea
          value={draft}
          disabled={disabled}
          aria-invalid={invalid}
          aria-label={node.label}
          minRows={2}
          maxRows={10}
          spellCheck={false}
          placeholder="{}"
          className="font-mono text-xs"
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case ToolFieldKind.NUMBER:
    case ToolFieldKind.INTEGER:
      return (
        <Input
          value={draft}
          disabled={disabled}
          aria-invalid={invalid}
          aria-label={node.label}
          inputMode="decimal"
          onChange={(event) => onChange(event.target.value)}
        />
      );
    default:
      return (
        <Input
          value={draft}
          disabled={disabled}
          aria-invalid={invalid}
          aria-label={node.label}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

function ChoiceSelect({
  value,
  required,
  invalid,
  disabled,
  label,
  options,
  onChange,
}: {
  value: string;
  required: boolean;
  invalid: boolean;
  disabled: boolean;
  label: string;
  options: { value: string; label: string }[];
  onChange: (draft: string) => void;
}) {
  return (
    <Select
      value={value.length === 0 ? undefined : value}
      disabled={disabled}
      onValueChange={(next) => onChange(next === UNSET_VALUE ? '' : next)}
    >
      <SelectTrigger
        className={cn('w-full', invalid && 'border-destructive')}
        aria-label={label}
        aria-invalid={invalid}
      >
        <SelectValue placeholder={t('Not set')} />
      </SelectTrigger>
      <SelectContent>
        {!required && value.length > 0 && (
          <SelectItem value={UNSET_VALUE}>{t('Not set')}</SelectItem>
        )}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function kindText(node: ToolFieldNode): string {
  switch (node.kind) {
    case ToolFieldKind.STRING:
      return t('text');
    case ToolFieldKind.NUMBER:
      return t('number');
    case ToolFieldKind.INTEGER:
      return t('whole number');
    case ToolFieldKind.BOOLEAN:
      return t('yes / no');
    case ToolFieldKind.ENUM:
      return t('one of a list');
    case ToolFieldKind.ARRAY:
      return t('list');
    case ToolFieldKind.OBJECT:
      return t('group of fields');
    case ToolFieldKind.JSON:
      return 'JSON';
  }
}

function isDraftRecord(value: ToolDraft): value is Record<string, ToolDraft> {
  return typeof value === 'object' && !Array.isArray(value);
}

const UNSET_VALUE = '__unset__';
