import { OperatorTenantSummary } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  LimitField,
  LimitFields,
  LimitInputs,
  operatorHooks,
  operatorUtils,
} from '@/features/operator';

export function LimitsDialog({
  tenant,
  open,
  onOpenChange,
}: {
  tenant: OperatorTenantSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <LimitsForm
          key={open ? tenant.id : 'closed'}
          tenant={tenant}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function LimitsForm({
  tenant,
  onClose,
}: {
  tenant: OperatorTenantSummary;
  onClose: () => void;
}) {
  const { mutate: save, isPending } = operatorHooks.useUpdateLimits({
    onSaved: onClose,
  });
  const [value, setValue] = useState<LimitInputs>(inputsOf(tenant));
  const [invalidField, setInvalidField] = useState<LimitField | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const built = operatorUtils.buildLimitsUpdate(value);
        if (!built.ok) {
          setInvalidField(built.field);
          return;
        }
        setInvalidField(null);
        save({ id: tenant.id, request: built.limits });
      }}
    >
      <DialogHeader>
        <DialogTitle>{t('Edit limits')}</DialogTitle>
        <DialogDescription>
          {t('Limits for {name}. They apply to new items right away.', {
            name: tenant.name,
          })}
        </DialogDescription>
      </DialogHeader>
      <LimitFields
        value={value}
        onChange={setValue}
        invalidField={invalidField}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('Cancel')}
        </Button>
        <Button type="submit" loading={isPending} data-testid="limits-save">
          {t('Save')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function inputsOf(tenant: OperatorTenantSummary): LimitInputs {
  return {
    usersLimit: operatorUtils.limitInputOf(tenant.usersLimit),
    projectsLimit: operatorUtils.limitInputOf(tenant.projectsLimit),
    activeWorkflowsLimit: operatorUtils.limitInputOf(
      tenant.activeWorkflowsLimit,
    ),
    concurrentExecutionsLimit: operatorUtils.limitInputOf(
      tenant.concurrentExecutionsLimit,
    ),
    workerGroupId: tenant.workerGroupId ?? '',
  };
}
