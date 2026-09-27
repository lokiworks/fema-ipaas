import {
  BlueprintVersionAction,
  BlueprintVersionStatus,
  BlueprintVersionView,
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

import { connectorBlueprintHooks } from '../../hooks/connector-blueprint-hooks';

export function BlueprintVersionActions({
  detail,
  version,
}: {
  detail: ConnectorBlueprintDetail;
  version: BlueprintVersionView;
}) {
  const [pendingAction, setPendingAction] =
    useState<BlueprintVersionAction | null>(null);
  const liveVersionCount = detail.versions.filter(
    (candidate) => candidate.status !== BlueprintVersionStatus.STOPPED,
  ).length;
  const isLastLive =
    version.status !== BlueprintVersionStatus.STOPPED && liveVersionCount === 1;

  return (
    <div className="flex items-center gap-3">
      {actionsFor(version.status).map((item) => (
        <button
          key={item.action}
          type="button"
          className="text-sm text-primary underline-offset-4 hover:underline"
          onClick={() => setPendingAction(item.action)}
        >
          {item.label}
        </button>
      ))}
      <BlueprintVersionActionDialog
        blueprintId={detail.id}
        version={version}
        action={pendingAction}
        isLastLive={isLastLive}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null);
          }
        }}
      />
    </div>
  );
}

function BlueprintVersionActionDialog({
  blueprintId,
  version,
  action,
  isLastLive,
  onOpenChange,
}: {
  blueprintId: string;
  version: BlueprintVersionView;
  action: BlueprintVersionAction | null;
  isLastLive: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate, isPending } =
    connectorBlueprintHooks.useChangeBlueprintVersionStatus({
      id: blueprintId,
      onSuccess: () => onOpenChange(false),
    });

  return (
    <Dialog open={action !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {action && (
          <ActionDialogBody
            version={version}
            action={action}
            isLastLive={isLastLive}
            isPending={isPending}
            onConfirm={() =>
              mutate({ versionId: version.id, request: { action } })
            }
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ActionDialogBody({
  version,
  action,
  isLastLive,
  isPending,
  onConfirm,
  onCancel,
}: {
  version: BlueprintVersionView;
  action: BlueprintVersionAction;
  isLastLive: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const copy = actionCopyOf({ action, version, isLastLive });
  return (
    <>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription className="pt-1">
          {copy.description}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button
          type="button"
          variant={copy.danger ? 'destructive' : 'default'}
          loading={isPending}
          onClick={onConfirm}
        >
          {copy.confirmLabel}
        </Button>
      </DialogFooter>
    </>
  );
}

function actionsFor(
  status: BlueprintVersionStatus,
): { action: BlueprintVersionAction; label: string }[] {
  switch (status) {
    case BlueprintVersionStatus.CANARY:
      return [
        {
          action: BlueprintVersionAction.PROMOTE,
          label: t('Release to everyone'),
        },
        {
          action: BlueprintVersionAction.STOP_CANARY,
          label: t('Stop canary'),
        },
      ];
    case BlueprintVersionStatus.FULL:
      return [
        { action: BlueprintVersionAction.STOP, label: t('Stop support') },
      ];
    case BlueprintVersionStatus.STOPPED:
      return [
        { action: BlueprintVersionAction.RESTORE, label: t('Restore support') },
      ];
  }
}

function actionCopyOf({
  action,
  version,
  isLastLive,
}: {
  action: BlueprintVersionAction;
  version: BlueprintVersionView;
  isLastLive: boolean;
}): {
  title: string;
  description: string;
  confirmLabel: string;
  danger: boolean;
} {
  switch (action) {
    case BlueprintVersionAction.PROMOTE:
      return {
        title: t('Release {version} to everyone?', {
          version: version.version,
        }),
        description: t(
          'Once fully released, every project uses this version by default for newly added nodes. Existing nodes are not affected',
        ),
        confirmLabel: t('Release to everyone'),
        danger: false,
      };
    case BlueprintVersionAction.STOP_CANARY:
      return {
        title: t('Stop the canary rollout of {version}?', {
          version: version.version,
        }),
        description: t(
          'Once stopped, this version becomes "support stopped" and nodes already on it will be prompted to upgrade',
        ),
        confirmLabel: t('Stop canary'),
        danger: false,
      };
    case BlueprintVersionAction.STOP: {
      const usageText =
        version.usage > 0
          ? t(
              '{count} workflow nodes are using this version. Once stopped, they will be prompted to upgrade',
              { count: version.usage },
            )
          : t('No workflow nodes are currently using this version');
      const offlineText = isLastLive
        ? ` ${t(
            'This is the last available version. Once stopped, the connector goes offline and can no longer be added to workflows',
          )}`
        : '';
      return {
        title: t('Stop support for {version}?', { version: version.version }),
        description: `${usageText}${offlineText}`,
        confirmLabel: t('Stop support'),
        danger: true,
      };
    }
    case BlueprintVersionAction.RESTORE:
      return {
        title: t('Restore support for {version}?', {
          version: version.version,
        }),
        description: t(
          'Once restored, this version becomes "fully released" again and nodes can keep using it',
        ),
        confirmLabel: t('Restore support'),
        danger: false,
      };
  }
}
