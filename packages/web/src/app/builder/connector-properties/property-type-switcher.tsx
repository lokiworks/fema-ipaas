import { PropertyExecutionType } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  Braces,
  Brackets,
  Hash,
  Minus,
  SquareFunction,
  ToggleLeft,
  Type,
  Wand2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function PropertyTypeSwitcher({
  value,
  onChange,
  onReset,
  disabled,
}: PropertyTypeSwitcherProps) {
  const active = OPTIONS.find((option) => option.type === value) ?? OPTIONS[0];
  const isOverridden = value !== PropertyExecutionType.MANUAL;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={t('Value type')}
              className="size-8 shrink-0"
            >
              <active.icon
                className={cn('size-4', {
                  'text-foreground': isOverridden,
                  'text-muted-foreground': !isOverridden,
                })}
              />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          {t('Value type')}: {active.label()}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-40">
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.type}
            onSelect={() => onChange(option.type)}
            className={cn('gap-2 text-sm', {
              'bg-accent': option.type === value,
            })}
          >
            <option.icon className="size-3.5 text-muted-foreground" />
            {option.label()}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 text-sm" onSelect={onReset}>
          <Wand2 className="size-3.5 text-muted-foreground" />
          {t('Reset to default')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

PropertyTypeSwitcher.displayName = 'PropertyTypeSwitcher';

const OPTIONS = [
  {
    type: PropertyExecutionType.MANUAL,
    icon: Wand2,
    label: () => t('Automatic'),
  },
  {
    type: PropertyExecutionType.DYNAMIC,
    icon: SquareFunction,
    label: () => t('Expression'),
  },
  { type: PropertyExecutionType.STRING, icon: Type, label: () => t('String') },
  { type: PropertyExecutionType.NUMBER, icon: Hash, label: () => t('Number') },
  {
    type: PropertyExecutionType.BOOLEAN,
    icon: ToggleLeft,
    label: () => t('Boolean'),
  },
  {
    type: PropertyExecutionType.OBJECT,
    icon: Braces,
    label: () => t('Object'),
  },
  {
    type: PropertyExecutionType.ARRAY,
    icon: Brackets,
    label: () => t('Array'),
  },
  { type: PropertyExecutionType.NULL, icon: Minus, label: () => t('Null') },
];

export type PropertyTypeSwitcherProps = {
  value: PropertyExecutionType;
  onChange: (type: PropertyExecutionType) => void;
  onReset: () => void;
  disabled?: boolean;
};
