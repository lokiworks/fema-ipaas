import { useId } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export function DataTableInputCheckbox({
  label,
  checked,
  handleCheckedChange,
}: DataTableCheckboxProps) {
  const checkboxId = useId();
  return (
    <label
      htmlFor={checkboxId}
      className={cn(
        buttonVariants({ variant: 'outline' }),
        'flex items-center space-x-2 border-dashed rounded-md px-3 py-2 h-9',
        'cursor-pointer font-normal hover:bg-accent/5',
        checked && 'bg-accent/10 border-accent text-accent-foreground',
      )}
    >
      <Checkbox
        id={checkboxId}
        checked={checked}
        onCheckedChange={(value) => handleCheckedChange(value === true)}
      />
      <span className="text-sm leading-none select-none">{label}</span>
    </label>
  );
}

type DataTableCheckboxProps = {
  label: string;
  checked: boolean;
  handleCheckedChange: (checked: boolean) => void;
};
