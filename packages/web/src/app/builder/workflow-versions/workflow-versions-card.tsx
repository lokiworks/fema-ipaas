import { Permission } from '@fema-ipaas/core-utils';
import {
  ReleaseChangeAction,
  ReleaseChangeWithDetails,
  WorkflowVersionMetadata,
  WorkflowVersionState,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  EllipsisVertical,
  Eye,
  EyeIcon,
  GitCompare,
  History,
  Pencil,
} from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { CardListItem } from '@/components/custom/card-list';
import { FormattedDate } from '@/components/custom/formatted-date';
import { UserAvatar } from '@/components/custom/user-avatar';
import { useEmbedding } from '@/components/providers/embed-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { projectCollectionUtils } from '@/features/projects';
import { VersionReleaseInfo } from '@/features/releases';
import { WorkflowVersionStateDot, workflowHooks } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';

import { OverwriteDraftDialog } from './overwrite-draft-dialog';
import { RollbackVersionDialog } from './rollback-version-dialog';

const WorkflowVersionDetailsCard = React.memo(
  ({
    workflowVersion,
    selected,
    publishedVersionId,
    workflowVersionNumber,
    releaseInfo,
    onCompare,
  }: WorkflowVersionDetailsCardProps) => {
    const navigate = useNavigate();
    const { checkAccess } = useAuthorization();
    const userHasPermissionToWriteWorkflow = checkAccess(
      Permission.WRITE_WORKFLOW,
    );
    const [setVersion, setReadonly, workflow] = useBuilderStateContext(
      (state) => [state.setVersion, state.setReadOnly, state.workflow],
    );
    const { project } = projectCollectionUtils.useCurrentProject();
    const inProduction = workflowVersion.id === workflow.publishedVersionId;
    const inTest =
      project.releasesEnabled && workflowVersion.id === workflow.testVersionId;
    const [dropdownMenuOpen, setDropdownMenuOpen] = useState(false);
    const canRollbackToThisVersion =
      workflowVersion.state === WorkflowVersionState.LOCKED &&
      workflowVersion.id !== publishedVersionId &&
      checkAccess(Permission.PUBLISH_WORKFLOW);
    const { mutate: viewVersion, isPending } =
      workflowHooks.useFetchWorkflowVersion({
        onSuccess: (populatedWorkflowVersion) => {
          setVersion(populatedWorkflowVersion);
          setReadonly(
            populatedWorkflowVersion.state === WorkflowVersionState.LOCKED ||
              !userHasPermissionToWriteWorkflow,
          );
        },
      });

    const showAvatar = !useEmbedding().embedState.isEmbedded;

    return (
      <CardListItem interactive={false} className="px-4">
        {showAvatar && workflowVersion.updatedByUser && (
          <UserAvatar
            size={45}
            withoutBorder={true}
            name={
              workflowVersion.updatedByUser.firstName +
              ' ' +
              workflowVersion.updatedByUser.lastName
            }
            email={workflowVersion.updatedByUser.email}
          />
        )}
        <div className="grid min-w-0 grow gap-2">
          <FormattedDate
            date={new Date(workflowVersion.created)}
            includeTime={true}
            className="break-words text-sm font-medium leading-tight select-none cursor-default"
          ></FormattedDate>
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {workflowVersion.state === WorkflowVersionState.DRAFT
              ? t('Draft')
              : `v${workflowVersionNumber}`}
            {inProduction && <Badge variant="success">{t('Production')}</Badge>}
            {inTest && <Badge variant="info">{t('Test')}</Badge>}
          </p>
          <VersionPublisher
            workflowVersion={workflowVersion}
            releaseInfo={releaseInfo}
          />
        </div>
        <div className="flex shrink-0 items-center justify-center gap-1 font-medium">
          {selected && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="size-7 flex justify-center items-center">
                  <EyeIcon className="w-5 h-5 "></EyeIcon>
                </div>
              </TooltipTrigger>
              <TooltipContent>{t('Viewing')}</TooltipContent>
            </Tooltip>
          )}

          <WorkflowVersionStateDot
            state={workflowVersion.state}
            versionId={workflowVersion.id}
            publishedVersionId={publishedVersionId}
          ></WorkflowVersionStateDot>

          <DropdownMenu
            onOpenChange={(open) => setDropdownMenuOpen(open)}
            open={dropdownMenuOpen}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                aria-label={t('More actions')}
                disabled={isPending}
                size={'icon'}
                className="size-7"
              >
                <EllipsisVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-52">
              <DropdownMenuItem
                onClick={() => {
                  if (workflowVersion.state === WorkflowVersionState.LOCKED) {
                    navigate(
                      authenticationSession.appendProjectRoutePrefix(
                        `/workflows/${workflowVersion.workflowId}/v/${workflowVersion.id}`,
                      ),
                    );
                    return;
                  }
                  viewVersion(workflowVersion);
                }}
                className="w-full"
              >
                <Eye className="mr-2 h-4 w-4" />
                <span>
                  {workflowVersion.state === WorkflowVersionState.LOCKED
                    ? t('View snapshot')
                    : t('View')}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCompare} className="w-full">
                <GitCompare className="mr-2 h-4 w-4" />
                <span>{t('Compare')}</span>
              </DropdownMenuItem>
              {canRollbackToThisVersion && (
                <RollbackVersionDialog
                  versionId={workflowVersion.id}
                  versionNumber={workflowVersionNumber}
                  onDone={() => setDropdownMenuOpen(false)}
                >
                  <DropdownMenuItem
                    className="w-full"
                    onSelect={(e) => {
                      e.preventDefault();
                    }}
                  >
                    <History className="mr-2 h-4 w-4" />
                    <span>{t('Roll back to this version')}</span>
                  </DropdownMenuItem>
                </RollbackVersionDialog>
              )}
              {workflowVersion.state !== WorkflowVersionState.DRAFT && (
                <OverwriteDraftDialog
                  versionNumber={workflowVersionNumber.toString()}
                  versionId={workflowVersion.id}
                  onConfirm={() => {
                    setDropdownMenuOpen(false);
                  }}
                >
                  <DropdownMenuItem
                    className="w-full"
                    onSelect={(e) => {
                      e.preventDefault();
                    }}
                    disabled={!userHasPermissionToWriteWorkflow}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    <span>{t('Use as Draft')}</span>
                  </DropdownMenuItem>
                </OverwriteDraftDialog>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardListItem>
    );
  },
);

function VersionPublisher({
  workflowVersion,
  releaseInfo,
}: {
  workflowVersion: WorkflowVersionMetadata;
  releaseInfo: VersionReleaseInfo | undefined;
}) {
  const entries = [
    releaseInfo?.production
      ? {
          change: releaseInfo.production,
          text: productionText({
            change: releaseInfo.production,
            requestedBy: releaseInfo.requestedBy,
          }),
        }
      : null,
    releaseInfo?.test
      ? {
          change: releaseInfo.test,
          text: t('Deployed to test by {name}', {
            name: releaseInfo.test.actorName,
          }),
        }
      : null,
  ].filter((entry) => entry !== null);
  if (entries.length === 0) {
    const editor = workflowVersion.updatedByUser;
    return editor ? (
      <p className="text-xs text-muted-foreground">
        {t('Last edited by {name}', {
          name: `${editor.firstName} ${editor.lastName}`.trim(),
        })}
      </p>
    ) : null;
  }
  return (
    <div className="flex flex-col gap-0.5" data-testid="version-publisher">
      {entries.map(({ change, text }) => (
        <div
          key={change.id}
          className="flex flex-col text-xs text-muted-foreground"
        >
          <span>{text}</span>
          {change.note && (
            <span
              className="line-clamp-2 break-words text-foreground/80"
              title={change.note}
            >
              {t('Release note: {note}', { note: change.note })}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function productionText({
  change,
  requestedBy,
}: {
  change: ReleaseChangeWithDetails;
  requestedBy: string | null;
}): string {
  if (change.action === ReleaseChangeAction.ROLLED_BACK) {
    return t('Rolled back by {name} to the content of v{version}', {
      name: change.actorName,
      version: change.restoredVersionNumber ?? 0,
    });
  }
  if (change.action === ReleaseChangeAction.PUBLISHED_DIRECTLY) {
    return t('Published by {name}', { name: change.actorName });
  }
  const requester = requestedBy ?? change.actorName;
  if (requester !== change.actorName) {
    return t('Promoted by {name}, approved by {approver}', {
      name: requester,
      approver: change.actorName,
    });
  }
  return t('Promoted to production by {name}', { name: requester });
}

WorkflowVersionDetailsCard.displayName = 'WorkflowVersionDetailsCard';
export { WorkflowVersionDetailsCard };

type WorkflowVersionDetailsCardProps = {
  workflowVersion: WorkflowVersionMetadata;
  selected: boolean;
  publishedVersionId: string | undefined | null;
  workflowVersionNumber: number;
  releaseInfo: VersionReleaseInfo | undefined;
  onCompare: () => void;
};
