import {
  BlueprintAuth,
  BlueprintAuthField,
  BlueprintAuthFieldControl,
  blueprintFactory,
  ConnectorBlueprintDetail,
} from '@fema-ipaas/shared';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { connectorBlueprintHooks } from '../../hooks/connector-blueprint-hooks';

import { authDraftUtils } from './auth-draft-utils';

export function AuthTestDataDialog({
  open,
  onOpenChange,
  auth,
  detail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auth: BlueprintAuth;
  detail: ConnectorBlueprintDetail;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <AuthTestDataForm
          key={open ? 'open' : 'closed'}
          auth={auth}
          detail={detail}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function AuthTestDataForm({
  auth,
  detail,
  onOpenChange,
}: {
  auth: BlueprintAuth;
  detail: ConnectorBlueprintDetail;
  onOpenChange: (open: boolean) => void;
}) {
  const fields: BlueprintAuthField[] = [
    ...blueprintFactory.autoAuthFields(auth.type),
    ...auth.fields,
  ];
  const [values, setValues] = useState<Record<string, string>>({
    ...detail.authStatus.testData,
  });
  const { mutate, isPending } =
    connectorBlueprintHooks.useSaveBlueprintAuthTestData({
      id: detail.id,
      onSuccess: () => onOpenChange(false),
    });
  const unchanged = authDraftUtils.same({
    left: values,
    right: detail.authStatus.testData,
  });

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t('Edit test data')}</DialogTitle>
        <DialogDescription>
          {t(
            'Used only for testing the authentication, and stored with this connector’s dev configuration.',
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        {fields.map((field) => (
          <div key={field.key} className="flex flex-col gap-1.5">
            <Label showRequiredIndicator={field.required}>{field.label}</Label>
            {field.control === BlueprintAuthFieldControl.DROPDOWN ? (
              <Select
                value={values[field.key] ?? ''}
                onValueChange={(value) =>
                  setValues((prev) => ({ ...prev, [field.key]: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.control === BlueprintAuthFieldControl.LONG_TEXT ? (
              <Textarea
                rows={2}
                value={values[field.key] ?? ''}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.key]: event.target.value,
                  }))
                }
              />
            ) : (
              <Input
                type={
                  field.control === BlueprintAuthFieldControl.PASSWORD
                    ? 'password'
                    : 'text'
                }
                className={
                  field.control === BlueprintAuthFieldControl.PASSWORD
                    ? 'font-mono'
                    : undefined
                }
                value={values[field.key] ?? ''}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.key]: event.target.value,
                  }))
                }
              />
            )}
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          {t('Cancel')}
        </Button>
        <Button
          type="button"
          disabled={unchanged}
          loading={isPending}
          onClick={() => mutate({ values })}
        >
          {t('Save')}
        </Button>
      </DialogFooter>
    </div>
  );
}
