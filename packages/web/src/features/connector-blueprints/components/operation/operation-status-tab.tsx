import {
  BlueprintOperation,
  ConnectorBlueprintDetail,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';

import {
  BlueprintStatusEditor,
  StatusReadView,
} from '../status/blueprint-status-editor';

export function OperationStatusTab({
  detail,
  operation,
  onUpdate,
  isPending,
}: {
  detail: ConnectorBlueprintDetail;
  operation: BlueprintOperation;
  onUpdate: (patch: Partial<BlueprintOperation>) => void;
  isPending: boolean;
}) {
  const globalStatus = detail.definition.status;
  const follows = operation.statusOverride === null;
  const toggle = (checked: boolean) => {
    onUpdate({
      statusOverride: checked ? null : operation.statusOverride ?? globalStatus,
    });
    toast.success(
      checked
        ? t('Now following the connector-level configuration')
        : t('Now using a configuration for this operation only'),
    );
  };
  const switchControl = (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {t('Follow the connector-level configuration')}
      <Switch checked={follows} onCheckedChange={toggle} />
    </label>
  );

  if (!follows) {
    return (
      <BlueprintStatusEditor
        title={t('Status codes (operation-specific)')}
        extra={switchControl}
        value={operation.statusOverride ?? globalStatus}
        isSaving={isPending}
        onSave={(statusOverride) => onUpdate({ statusOverride })}
      />
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">{t('Status codes')}</span>
        {switchControl}
      </div>
      <StatusReadView value={globalStatus} />
      <p className="text-xs text-muted-foreground">
        {t('Currently following the connector-level configuration.')}{' '}
        <Link
          className="text-primary underline"
          to={`/tenant/connectors/development/${detail.id}/status`}
        >
          {t('Edit the connector-level configuration')}
        </Link>
        {t(', or turn off the switch to configure it for this operation only.')}
      </p>
    </section>
  );
}
