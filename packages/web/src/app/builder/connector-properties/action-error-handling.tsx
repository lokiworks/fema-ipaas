import {
  ActionErrorHandlingOptions,
  ErrorCodeOperator,
  ErrorHandlingRule,
  errorHandlingUtils,
  ErrorStrategy,
  ErrorStrategyMode,
  WorkflowAction,
  WorkflowOperationType,
  workflowStructureUtil,
  WorkflowTrigger,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  CopyCheck,
  EllipsisVertical,
  Info,
  Plus,
  ShieldAlert,
  Split,
  Trash2,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import React from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { MessageTooltip } from '@/components/custom/message-tooltip';
import { TagInput } from '@/components/custom/tag-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, GAP_SIZE_FOR_STEP_SETTINGS } from '@/lib/utils';

import { useStepSettingsContext } from '../step-settings/step-settings-context';

import {
  ERROR_CODE_OPERATOR_LABELS,
  ERROR_STRATEGY_MODE_LABELS,
  errorHandlingFormUtils,
} from './error-handling-utils';

const ActionErrorHandlingForm = React.memo(
  ({
    hideContinueOnFailure,
    hideRetryOnFailure,
    disabled,
  }: ActionErrorHandlingFormProps) => {
    const form = useFormContext();
    const watched: unknown = useWatch({
      control: form.control,
      name: OPTIONS_FIELD,
    });
    const parsed = ActionErrorHandlingOptions.safeParse(watched);
    const options = parsed.success ? parsed.data : undefined;
    const strategy = errorHandlingUtils.effectiveStrategy({
      options,
      fallback: { mode: ErrorStrategyMode.STOP },
    });
    const rules = options?.rules ?? [];
    const modes = errorHandlingFormUtils.availableModes({
      hideContinueOnFailure: hideContinueOnFailure === true,
      hideRetryOnFailure: hideRetryOnFailure === true,
    });

    if (hideContinueOnFailure === true && hideRetryOnFailure === true) {
      return null;
    }

    const save = (next: {
      strategy: ErrorStrategy;
      rules: ErrorHandlingRule[];
    }) =>
      form.setValue(OPTIONS_FIELD, errorHandlingFormUtils.buildOptions(next), {
        shouldDirty: true,
        shouldValidate: true,
      });
    const updateRule = (id: string, patch: Partial<ErrorHandlingRule>) =>
      save({
        strategy,
        rules: rules.map((rule) =>
          rule.id === id ? { ...rule, ...patch } : rule,
        ),
      });
    const usesBranches = errorHandlingUtils.usesBranches({
      strategy,
      rules,
    });

    return (
      <div
        className={cn(
          'flex flex-col border-t border-border pt-4',
          GAP_SIZE_FOR_STEP_SETTINGS,
        )}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <ShieldAlert className="size-4" />
          <span className="text-[13px] font-semibold tracking-[-0.005em] text-muted-foreground">
            {t('Error handling')}
          </span>
        </div>
        <Alert>
          <Info />
          <AlertDescription>
            {t(
              'When the step fails, custom strategies are checked from top to bottom and the first match wins. If none match, the default strategy applies.',
            )}
          </AlertDescription>
        </Alert>
        {usesBranches && (
          <Alert variant="primary">
            <Split />
            <AlertDescription>
              {t(
                'Failures go into the failure branch under this step on the canvas. Add notification or logging steps there; after the branch finishes, the run continues with the following steps.',
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-2">
          <Label>{t('Default strategy')}</Label>
          <StrategyFields
            strategy={strategy}
            modes={modes}
            disabled={disabled}
            onChange={(next) => save({ strategy: next, rules })}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label>{t('Custom strategies')}</Label>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                save({
                  strategy,
                  rules: [
                    ...rules,
                    errorHandlingFormUtils.newRule({
                      id: nanoid(),
                      name: t('Strategy {number}', {
                        number: rules.length + 1,
                      }),
                    }),
                  ],
                })
              }
            >
              <Plus className="size-4" />
              {t('Add')}
            </Button>
          )}
        </div>
        {rules.length === 0 && (
          <span className="text-xs text-muted-foreground">
            {t(
              'No custom strategies. Handle errors by code, for example retry on rate limits (HTTP_429) and stop on bad requests (HTTP_400).',
            )}
          </span>
        )}
        {rules.map((rule, index) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            modes={modes}
            disabled={disabled}
            isFirst={index === 0}
            isLast={index === rules.length - 1}
            onChange={(patch) => updateRule(rule.id, patch)}
            onDuplicate={() =>
              save({
                strategy,
                rules: [
                  ...rules.slice(0, index + 1),
                  {
                    ...rule,
                    id: nanoid(),
                    name: t('{name} copy', { name: rule.name }),
                  },
                  ...rules.slice(index + 1),
                ],
              })
            }
            onMove={(offset) =>
              save({
                strategy,
                rules: errorHandlingFormUtils.moveRule({
                  rules,
                  index,
                  offset,
                }),
              })
            }
            onDelete={() =>
              save({
                strategy,
                rules: rules.filter((candidate) => candidate.id !== rule.id),
              })
            }
          />
        ))}
        {!disabled && (
          <ApplyToSimilarSteps
            options={errorHandlingFormUtils.buildOptions({ strategy, rules })}
          />
        )}
      </div>
    );
  },
);

ActionErrorHandlingForm.displayName = 'ActionErrorHandlingForm';
export { ActionErrorHandlingForm };

function StrategyFields({
  strategy,
  modes,
  disabled,
  onChange,
}: {
  strategy: ErrorStrategy;
  modes: ErrorStrategyMode[];
  disabled: boolean;
  onChange: (strategy: ErrorStrategy) => void;
}) {
  const retry = errorHandlingUtils.retryPolicyOf(strategy);
  return (
    <div className="flex flex-col gap-2">
      <Select
        value={strategy.mode}
        disabled={disabled}
        onValueChange={(value) => {
          const mode = modes.find((candidate) => candidate === value);
          if (mode) {
            onChange(errorHandlingFormUtils.withMode({ strategy, mode }));
          }
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {modes.map((mode) => (
            <SelectItem key={mode} value={mode}>
              {t(ERROR_STRATEGY_MODE_LABELS[mode])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {retry && (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t('Retry count')}</Label>
            <Select
              value={String(retry.attempts)}
              disabled={disabled}
              onValueChange={(value) =>
                onChange({ ...strategy, retryAttempts: Number(value) })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {errorHandlingFormUtils.retryAttemptOptions.map((count) => (
                  <SelectItem key={count} value={String(count)}>
                    {t('{count} times', { count })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t('Retry interval')}</Label>
            <Select
              value={String(retry.intervalSeconds)}
              disabled={disabled}
              onValueChange={(value) =>
                onChange({ ...strategy, retryIntervalSeconds: Number(value) })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {errorHandlingFormUtils.retryIntervalOptions.map((seconds) => (
                  <SelectItem key={seconds} value={String(seconds)}>
                    {t('{seconds} seconds', { seconds })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

function RuleCard({
  rule,
  modes,
  disabled,
  isFirst,
  isLast,
  onChange,
  onDuplicate,
  onMove,
  onDelete,
}: RuleCardProps) {
  const noCodes = rule.codes.every((code) => code.trim().length === 0);
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Input
          className="h-8 font-medium"
          value={rule.name}
          disabled={disabled}
          maxLength={50}
          aria-label={t('Strategy name')}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        {!disabled && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('More')}
              >
                <EllipsisVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="size-4" />
                {t('Duplicate')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isFirst} onClick={() => onMove(-1)}>
                <ArrowUp className="size-4" />
                {t('Move up')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isLast} onClick={() => onMove(1)}>
                <ArrowDown className="size-4" />
                {t('Move down')}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 className="size-4" />
                {t('Delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">{t('Condition')}</Label>
        <Select
          value={rule.operator}
          disabled={disabled}
          onValueChange={(value) => {
            const operator = OPERATORS.find((candidate) => candidate === value);
            if (operator) {
              onChange({ operator });
            }
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((operator) => (
              <SelectItem key={operator} value={operator}>
                {t(ERROR_CODE_OPERATOR_LABELS[operator])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">{t('Error codes')}</Label>
        <TagInput
          value={rule.codes}
          disabled={disabled}
          placeholder={t('Press Enter to add')}
          showDescription={false}
          onChange={(codes) => onChange({ codes: [...codes] })}
        />
        {noCodes ? (
          <span className="text-xs text-destructive">
            {t('Add at least one error code')}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t(
              'For example HTTP_429, STEP_TIMEOUT, STEP_FAILED or CONNECTION_EXPIRED. A plain number such as 429 means the HTTP status.',
            )}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">{t('Strategy')}</Label>
        <StrategyFields
          strategy={rule.strategy}
          modes={modes}
          disabled={disabled}
          onChange={(strategy) => onChange({ strategy })}
        />
      </div>
    </div>
  );
}

function ApplyToSimilarSteps({
  options,
}: {
  options: NonNullable<ActionErrorHandlingOptions>;
}) {
  const { selectedStep } = useStepSettingsContext();
  const [trigger, applyOperation] = useBuilderStateContext((state) => [
    state.workflowVersion.trigger,
    state.applyOperation,
  ]);
  if (!isActionStep(selectedStep)) {
    return null;
  }
  const targets = errorHandlingFormUtils.sameActionSteps({
    step: selectedStep,
    steps: workflowStructureUtil.getAllSteps(trigger).filter(isActionStep),
  });
  return (
    <div className="flex flex-col items-start gap-1">
      <MessageTooltip
        isDisabled={targets.length === 0}
        message={t('No other step uses the same action')}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={targets.length === 0}
          onClick={() => {
            targets.forEach((target) =>
              applyOperation({
                type: WorkflowOperationType.UPDATE_ACTION,
                request: errorHandlingFormUtils.withErrorHandling({
                  step: target,
                  options,
                }),
              }),
            );
            toast.success(
              t('Applied to {count} other steps', { count: targets.length }),
            );
          }}
        >
          <CopyCheck className="size-4" />
          {t('Apply to similar steps')}
        </Button>
      </MessageTooltip>
      <span className="text-xs text-muted-foreground">
        {t(
          'Copies these strategies to other steps that use the same connector action.',
        )}
      </span>
    </div>
  );
}

function isActionStep(
  step: WorkflowAction | WorkflowTrigger,
): step is WorkflowAction {
  return workflowStructureUtil.isAction(step.type);
}

const OPTIONS_FIELD = 'settings.errorHandlingOptions';
const OPERATORS = [
  ErrorCodeOperator.EQUALS_ANY,
  ErrorCodeOperator.NOT_EQUALS_ANY,
  ErrorCodeOperator.STARTS_WITH_ANY,
  ErrorCodeOperator.NOT_STARTS_WITH_ANY,
];

type ActionErrorHandlingFormProps = {
  hideContinueOnFailure?: boolean;
  hideRetryOnFailure?: boolean;
  disabled: boolean;
};

type RuleCardProps = {
  rule: ErrorHandlingRule;
  modes: ErrorStrategyMode[];
  disabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<ErrorHandlingRule>) => void;
  onDuplicate: () => void;
  onMove: (offset: number) => void;
  onDelete: () => void;
};
