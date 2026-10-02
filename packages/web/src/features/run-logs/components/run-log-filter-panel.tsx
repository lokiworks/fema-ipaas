import {
  ExecutionStatus,
  RunLogCondition,
  RunLogConditionField,
  RunLogConditionState,
  RunLogDurationOperator,
  RunLogFilterState,
  runLogFilterUtils,
  RunLogMatch,
  RunLogScope,
  RunLogTimeRange,
  RUN_LOG_TEXT_MAX_LENGTH,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Clock, ListFilter, Plus, X } from 'lucide-react';
import { useState } from 'react';

import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectSearch,
  MultiSelectTrigger,
  MultiSelectValue,
} from '@/components/custom/multi-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { executionUtils } from '@/features/executions/utils/execution-utils';
import { cn } from '@/lib/utils';

import { runLogUiUtils } from '../utils/run-log-ui-utils';

export function RunLogFilterPanel({
  state,
  scope,
  connectorName,
  onApply,
}: {
  state: RunLogFilterState;
  scope: RunLogScope | undefined;
  connectorName: (name: string) => string;
  onApply: (next: RunLogFilterState) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = runLogFilterUtils.effective(state).complete.length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={activeCount > 0 ? 'secondary' : 'outline'}
          size="sm"
        >
          <ListFilter className="size-4" />
          {t('Filter')}
          {activeCount > 0 && (
            <Badge variant="default" className="ml-1 px-1.5">
              {activeCount + 1}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[680px] max-w-[95vw] p-0">
        {open && (
          <FilterDraft
            state={state}
            scope={scope}
            connectorName={connectorName}
            onCancel={() => setOpen(false)}
            onApply={(next) => {
              setOpen(false);
              onApply(next);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function FilterDraft({
  state,
  scope,
  connectorName,
  onCancel,
  onApply,
}: {
  state: RunLogFilterState;
  scope: RunLogScope | undefined;
  connectorName: (name: string) => string;
  onCancel: () => void;
  onApply: (next: RunLogFilterState) => void;
}) {
  const [draft, setDraft] = useState<RunLogFilterState>(state);
  const used = draft.conditions.map((condition) => condition.field);
  const addable = FIELDS.filter((field) => !used.includes(field));
  const { incompleteCount } = runLogFilterUtils.effective(draft);
  const maxDays = scope ? runLogUiUtils.maxRetentionDays(scope) : null;
  const updateCondition = (index: number, next: RunLogCondition) =>
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.map((condition, position) =>
        position === index ? next : condition,
      ),
    }));
  const removeCondition = (index: number) =>
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.filter(
        (_, position) => position !== index,
      ),
    }));
  const addCondition = (field: RunLogConditionField) =>
    setDraft((current) => ({
      ...current,
      conditions: [
        ...current.conditions,
        runLogFilterUtils.emptyCondition(field),
      ],
    }));

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="text-sm font-medium">
          {t('Set filter conditions')}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {t('Match')}
        </span>
        <Select
          value={draft.match}
          onValueChange={(value) =>
            setDraft((current) => ({
              ...current,
              match:
                value === RunLogMatch.ANY ? RunLogMatch.ANY : RunLogMatch.ALL,
            }))
          }
        >
          <SelectTrigger className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={RunLogMatch.ALL}>{t('All')}</SelectItem>
            <SelectItem value={RunLogMatch.ANY}>{t('Any')}</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {t('of the conditions')}
        </span>
      </div>
      {draft.match === RunLogMatch.ANY && (
        <p className="px-4 pt-3 text-xs text-muted-foreground">
          {t(
            'The time condition always applies; the other conditions match when any of them is met.',
          )}
        </p>
      )}
      <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex w-32 shrink-0 items-center gap-1.5 rounded-md border bg-muted px-2 py-1.5 text-sm">
            <Clock className="size-4" />
            {t('Time')}
          </span>
          <span className="w-24 shrink-0 text-center text-sm text-muted-foreground">
            {t('equals')}
          </span>
          <Select
            value={draft.customRange ? CUSTOM_RANGE : draft.time}
            onValueChange={(value) => {
              const time = TIME_RANGES.find((range) => range === value);
              if (time) {
                setDraft((current) => ({
                  ...current,
                  time,
                  customRange: null,
                }));
              }
            }}
          >
            <SelectTrigger className="h-9 grow">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {draft.customRange && (
                <SelectItem value={CUSTOM_RANGE}>
                  {t('Custom range from the link')}
                </SelectItem>
              )}
              {TIME_RANGES.map((range) => (
                <SelectItem key={range} value={range}>
                  {runLogUiUtils.timeRangeLabel(range)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="w-8 shrink-0" />
        </div>
        {draft.conditions.map((condition, index) => (
          <ConditionRow
            key={condition.field}
            condition={condition}
            scope={scope}
            connectorName={connectorName}
            fields={FIELDS.filter(
              (field) => field === condition.field || !used.includes(field),
            )}
            onChange={(next) => updateCondition(index, next)}
            onRemove={() => removeCondition(index)}
          />
        ))}
        {addable.length > 0 && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="w-fit">
                <Plus className="size-4" />
                {t('Add filter condition')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {addable.map((field) => (
                <DropdownMenuItem
                  key={field}
                  onSelect={() => addCondition(field)}
                >
                  {runLogUiUtils.fieldLabel(field)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="flex items-center gap-2 border-t px-4 py-3">
        <span className="grow text-xs text-muted-foreground">
          {incompleteCount > 0
            ? t(
                '{count, plural, =1 {1 condition is incomplete and will be ignored} other {# conditions are incomplete and will be ignored}}',
                { count: incompleteCount },
              )
            : maxDays !== null && maxDays > 0
            ? t('Only logs from the last {days} days can be queried', {
                days: maxDays,
              })
            : null}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button type="button" size="sm" onClick={() => onApply(draft)}>
          {t('Query')}
        </Button>
      </div>
    </div>
  );
}

function ConditionRow({
  condition,
  scope,
  connectorName,
  fields,
  onChange,
  onRemove,
}: {
  condition: RunLogCondition;
  scope: RunLogScope | undefined;
  connectorName: (name: string) => string;
  fields: RunLogConditionField[];
  onChange: (next: RunLogCondition) => void;
  onRemove: () => void;
}) {
  const conditionState = runLogFilterUtils.conditionState(condition);
  return (
    <div className="flex items-start gap-2">
      <Select
        value={condition.field}
        onValueChange={(value) => {
          const field = fields.find((candidate) => candidate === value);
          if (field && field !== condition.field) {
            onChange(runLogFilterUtils.emptyCondition(field));
          }
        }}
      >
        <SelectTrigger className="h-9 w-32 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fields.map((field) => (
            <SelectItem key={field} value={field}>
              {runLogUiUtils.fieldLabel(field)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ConditionOperator condition={condition} onChange={onChange} />
      <div className="flex min-w-0 grow flex-col gap-1">
        <ConditionValue
          condition={condition}
          scope={scope}
          connectorName={connectorName}
          onChange={onChange}
        />
        {conditionState !== RunLogConditionState.COMPLETE && (
          <span
            className={cn(
              'text-xs',
              conditionState === RunLogConditionState.INVALID
                ? 'text-destructive'
                : 'text-muted-foreground',
            )}
          >
            {conditionState === RunLogConditionState.INVALID
              ? t(
                  'Enter a number of seconds that is 0 or greater, otherwise this condition is ignored',
                )
              : t('Not filled in, so this condition is ignored')}
          </span>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 shrink-0"
        aria-label={t('Remove condition')}
        onClick={onRemove}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

function ConditionOperator({
  condition,
  onChange,
}: {
  condition: RunLogCondition;
  onChange: (next: RunLogCondition) => void;
}) {
  if (condition.field === RunLogConditionField.DURATION) {
    return (
      <Select
        value={condition.operator}
        onValueChange={(value) =>
          onChange({
            ...condition,
            operator:
              value === RunLogDurationOperator.LTE
                ? RunLogDurationOperator.LTE
                : RunLogDurationOperator.GTE,
          })
        }
      >
        <SelectTrigger className="h-9 w-24 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[RunLogDurationOperator.GTE, RunLogDurationOperator.LTE].map(
            (operator) => (
              <SelectItem key={operator} value={operator}>
                {runLogUiUtils.durationOperatorLabel(operator)}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
    );
  }
  return (
    <span className="w-24 shrink-0 pt-2 text-center text-sm text-muted-foreground">
      {condition.field === RunLogConditionField.CONTENT ||
      condition.field === RunLogConditionField.BUSINESS_KEY
        ? t('contains')
        : t('equals')}
    </span>
  );
}

function ConditionValue({
  condition,
  scope,
  connectorName,
  onChange,
}: {
  condition: RunLogCondition;
  scope: RunLogScope | undefined;
  connectorName: (name: string) => string;
  onChange: (next: RunLogCondition) => void;
}) {
  switch (condition.field) {
    case RunLogConditionField.PROJECT:
      return (
        <ValuePicker
          values={condition.values}
          placeholder={t('Select or search projects')}
          options={(scope?.projects ?? []).map((project) => ({
            value: project.id,
            label: project.displayName,
          }))}
          onChange={(values) => onChange({ ...condition, values })}
        />
      );
    case RunLogConditionField.WORKFLOW:
      return (
        <ValuePicker
          values={condition.values}
          placeholder={t('Select or search workflows')}
          options={(scope?.workflows ?? []).map((workflow) => ({
            value: workflow.id,
            label: workflow.displayName,
          }))}
          onChange={(values) => onChange({ ...condition, values })}
        />
      );
    case RunLogConditionField.STATUS:
      return (
        <ValuePicker
          values={condition.values}
          placeholder={t('Select run statuses')}
          options={Object.values(ExecutionStatus).map((status) => ({
            value: status,
            label: executionUtils.getStatusLabel(status),
          }))}
          onChange={(values) =>
            onChange({
              ...condition,
              values: Object.values(ExecutionStatus).filter((status) =>
                values.includes(status),
              ),
            })
          }
        />
      );
    case RunLogConditionField.CONNECTOR:
      return (
        <ValuePicker
          values={condition.values}
          placeholder={
            (scope?.connectors ?? []).length > 0
              ? t('Select connectors')
              : t('No connectors are used by your workflows yet')
          }
          options={(scope?.connectors ?? []).map((name) => ({
            value: name,
            label: connectorName(name),
          }))}
          onChange={(values) => onChange({ ...condition, values })}
        />
      );
    case RunLogConditionField.CONTENT:
      return (
        <Input
          className="h-9"
          value={condition.text}
          maxLength={RUN_LOG_TEXT_MAX_LENGTH}
          placeholder={t(
            'Matches run ID, dedupe key, error code or error message',
          )}
          onChange={(event) =>
            onChange({ ...condition, text: event.target.value })
          }
        />
      );
    case RunLogConditionField.BUSINESS_KEY:
      return (
        <Input
          className="h-9"
          value={condition.text}
          maxLength={RUN_LOG_TEXT_MAX_LENGTH}
          placeholder={t(
            'Employee ID, approval number or name; a part of it is enough',
          )}
          onChange={(event) =>
            onChange({ ...condition, text: event.target.value })
          }
        />
      );
    case RunLogConditionField.DURATION:
      return (
        <div className="flex items-center gap-2">
          <Input
            className="h-9"
            inputMode="decimal"
            value={condition.seconds}
            placeholder={t('Enter a number')}
            onChange={(event) =>
              onChange({ ...condition, seconds: event.target.value })
            }
          />
          <span className="shrink-0 text-sm text-muted-foreground">
            {t('seconds')}
          </span>
        </div>
      );
  }
}

function ValuePicker({
  values,
  options,
  placeholder,
  onChange,
}: {
  values: string[];
  options: { value: string; label: string }[];
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  return (
    <MultiSelect
      value={values}
      onValueChange={onChange}
      items={options.map((option) => ({
        value: option.value,
        label: option.label,
      }))}
    >
      <MultiSelectTrigger>
        <MultiSelectValue placeholder={placeholder} />
      </MultiSelectTrigger>
      <MultiSelectContent>
        <MultiSelectSearch placeholder={t('Search...')} />
        <MultiSelectList>
          <MultiSelectEmpty>{t('No results')}</MultiSelectEmpty>
          {options.map((option) => (
            <MultiSelectItem key={option.value} value={option.value}>
              {option.label}
            </MultiSelectItem>
          ))}
        </MultiSelectList>
      </MultiSelectContent>
    </MultiSelect>
  );
}

const CUSTOM_RANGE = 'custom';

const TIME_RANGES: RunLogTimeRange[] = Object.values(RunLogTimeRange);

const FIELDS: RunLogConditionField[] = [
  RunLogConditionField.PROJECT,
  RunLogConditionField.WORKFLOW,
  RunLogConditionField.STATUS,
  RunLogConditionField.CONNECTOR,
  RunLogConditionField.CONTENT,
  RunLogConditionField.BUSINESS_KEY,
  RunLogConditionField.DURATION,
];
