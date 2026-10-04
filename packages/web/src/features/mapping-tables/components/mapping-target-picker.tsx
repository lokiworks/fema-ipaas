import { MappingSpec } from '@fema-ipaas/core-utils';
import { t } from 'i18next';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { TargetOption } from '../utils/target-schema';

export function MappingTargetPicker({
  value,
  options,
  disabled,
  onChange,
  onAddRequested,
}: {
  value: MappingSpec['destination'];
  options: TargetOption[];
  disabled: boolean;
  onChange: (destination: MappingSpec['destination']) => void;
  onAddRequested?: () => void;
}) {
  const current = value
    ? `${value.connectorName}/${value.actionName}`
    : NO_TARGET;
  const known = options.some((option) => option.key === current);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium">{t('Write the result to')}</span>
      <Select
        value={current}
        disabled={disabled}
        onValueChange={(key) => {
          if (key === current || key.length === 0) {
            return;
          }
          if (key === ADD_TARGET) {
            onAddRequested?.();
            return;
          }
          onChange(options.find((option) => option.key === key)?.target);
        }}
      >
        <SelectTrigger
          className="h-8 text-xs"
          aria-label={t('Write the result to')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_TARGET}>
            {t('No target, free fields')}
          </SelectItem>
          {!known && value && (
            <SelectItem value={current}>
              {value.displayName ?? value.actionName}
            </SelectItem>
          )}
          {options.map((option) => (
            <SelectItem key={option.key} value={option.key}>
              {option.label}
            </SelectItem>
          ))}
          {onAddRequested && (
            <SelectItem value={ADD_TARGET}>
              {t('Add a writing step...')}
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {options.length === 0 && value === undefined && (
        <span className="text-xs text-muted-foreground">
          {onAddRequested
            ? t(
                'Choose Add a writing step to pick the app and the action. Its fields come with their types and required marks, and the step is added after this one for you to confirm.',
              )
            : t(
                'Add the step that writes the data first, then pick it here to get its fields with types and required marks.',
              )}
        </span>
      )}
    </div>
  );
}

const NO_TARGET = 'none';
const ADD_TARGET = '__add-write-step__';
