import {
  BlueprintVersionStatus,
  BlueprintVersionView,
  ConnectorBlueprintDetail,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import { FormattedDate } from '@/components/custom/formatted-date';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import { connectorBlueprintHooks } from '../../hooks/connector-blueprint-hooks';

import { blueprintVersionStatusUtils } from './version-status-utils';

export function BlueprintVersionDrawer({
  detail,
  version,
  onClose,
}: {
  detail: ConnectorBlueprintDetail;
  version: BlueprintVersionView | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={version !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent className="flex flex-col gap-0 overflow-y-auto sm:max-w-lg">
        {version && (
          <DrawerBody key={version.id} detail={detail} version={version} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  detail,
  version,
}: {
  detail: ConnectorBlueprintDetail;
  version: BlueprintVersionView;
}) {
  const { data: projects } = connectorBlueprintHooks.useBlueprintProjects(
    detail.id,
  );
  const projectName = (projectId: string) =>
    (projects ?? []).find((project) => project.id === projectId)?.name ??
    t('Deleted project');
  const operationName = (key: string) =>
    detail.definition.operations.find((operation) => operation.key === key)
      ?.name ?? key;
  const triggerName = (key: string) =>
    detail.definition.triggers.find((trigger) => trigger.key === key)?.name ??
    key;

  return (
    <div className="flex flex-col gap-4 p-4">
      <SheetHeader className="p-0">
        <SheetTitle>
          {t('Version {version}', { version: version.version })}
        </SheetTitle>
        <SheetDescription>
          {t('Published by {name} on {date}', {
            name: version.publishedBy?.name ?? t('Deleted user'),
            date: new Date(version.publishedAt).toLocaleString(),
          })}
        </SheetDescription>
      </SheetHeader>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{t('Status')}</dt>
        <dd>
          <Badge
            variant={blueprintVersionStatusUtils.badgeVariant(version.status)}
          >
            {blueprintVersionStatusUtils.label(version.status)}
          </Badge>
        </dd>
        {version.status === BlueprintVersionStatus.CANARY && (
          <>
            <dt className="text-muted-foreground">{t('Canary projects')}</dt>
            <dd>
              {version.canaryProjectIds.length > 0
                ? version.canaryProjectIds.map(projectName).join('、')
                : t('Not set')}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">{t('Version description')}</dt>
        <dd>{version.description || '-'}</dd>
        <dt className="text-muted-foreground">{t('Published on')}</dt>
        <dd>
          <FormattedDate date={new Date(version.publishedAt)} includeTime />
        </dd>
        <dt className="text-muted-foreground">{t('Nodes in use')}</dt>
        <dd>{t('{count} nodes', { count: version.usage })}</dd>
      </dl>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">
          {t('Operations included ({count})', {
            count: version.operationKeys.length,
          })}
        </h3>
        {version.operationKeys.length > 0 ? (
          <div className="flex flex-col gap-1 rounded-md border p-2">
            {version.operationKeys.map((key) => (
              <div
                key={key}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="grow truncate">{operationName(key)}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {key}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t('No operations')}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">
          {t('Triggers included ({count})', {
            count: version.triggerKeys.length,
          })}
        </h3>
        {version.triggerKeys.length > 0 ? (
          <div className="flex flex-col gap-1 rounded-md border p-2">
            {version.triggerKeys.map((key) => (
              <div
                key={key}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="grow truncate">{triggerName(key)}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {key}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t('No triggers')}</p>
        )}
      </div>
      {version.updates.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            {t('Updates within this version')}
          </h3>
          <div className="flex flex-col gap-2">
            {version.updates.map((update) => (
              <div
                key={`${update.publishedAt}-${update.publishedBy}`}
                className="rounded-md border p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="grow text-sm font-medium">
                    {update.description}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {update.publishedByName ?? t('Deleted user')}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  <FormattedDate
                    date={new Date(update.publishedAt)}
                    includeTime
                  />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
