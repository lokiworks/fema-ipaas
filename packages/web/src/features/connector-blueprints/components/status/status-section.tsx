import { ConnectorBlueprintDetail } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { connectorBlueprintHooks } from '../../hooks/connector-blueprint-hooks';

import { BlueprintStatusEditor } from './blueprint-status-editor';

export function BlueprintStatusSection({
  detail,
}: {
  detail: ConnectorBlueprintDetail;
}) {
  const { mutate, isPending } =
    connectorBlueprintHooks.useUpdateConnectorBlueprint({
      id: detail.id,
    });

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">
          {t('Status code configuration')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            'Decide whether a request succeeded or failed from the application status code in the response. This applies to every operation of the connector; a single operation can override it',
          )}
        </p>
      </div>
      <BlueprintStatusEditor
        value={detail.definition.status}
        isSaving={isPending}
        onSave={(status) =>
          mutate({ definition: { ...detail.definition, status } })
        }
      />
    </div>
  );
}
