import { VariableWithoutSensitiveData } from '@fema-ipaas/shared';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { PermissionNeededTooltip } from '@/components/custom/permission-needed-tooltip';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Button } from '@/components/ui/button';
import { internalErrorToast } from '@/components/ui/sonner';
import { variablesApi } from '@/features/variables/api/variables';

export function VariableValueCell({
  variable,
  canReveal,
}: VariableValueCellProps) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const { mutate: reveal, isPending } = useMutation({
    mutationFn: () => variablesApi.reveal(variable.id),
    onSuccess: ({ value }) => setRevealed(value),
    onError: () => internalErrorToast(),
  });
  const isShown = revealed !== null;

  return (
    <div
      className="flex min-w-0 items-center gap-1"
      data-testid="variable-value"
    >
      <div className="flex min-w-0 flex-col">
        <TextWithTooltip tooltipMessage={revealed ?? ''}>
          <span className="truncate font-mono text-sm">
            {isShown ? revealed : MASK}
          </span>
        </TextWithTooltip>
        {variable.hasTestValue && (
          <span className="truncate text-xs text-muted-foreground">
            {t('Test value set')}
          </span>
        )}
      </div>
      <PermissionNeededTooltip hasPermission={canReveal}>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          disabled={!canReveal}
          loading={isPending}
          aria-label={isShown ? t('Hide value') : t('Show value')}
          onClick={(event) => {
            event.stopPropagation();
            if (isShown) {
              setRevealed(null);
              return;
            }
            reveal();
          }}
        >
          {isShown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </PermissionNeededTooltip>
    </div>
  );
}

const MASK = '••••••••';

type VariableValueCellProps = {
  variable: VariableWithoutSensitiveData;
  canReveal: boolean;
};
