import { Permission } from '@fema-ipaas/core-utils';
import {
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
    onCompare,
  }: WorkflowVersionDetailsCardProps) => {
    const navigate = useNavigate();
    const { checkAccess } = useAuthorization();
    const userHasPermissionToWriteWorkflow = checkAccess(
      Permission.WRITE_WORKFLOW,
    );
    const [setVersion, setReadonly] = useBuilderStateContext((state) => [
      state.setVersion,
      state.setReadOnly,
    ]);
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
            className="truncate whitespace-nowrap text-sm font-medium leading-none select-none cursor-default"
          ></FormattedDate>
          <p className="flex gap-1 text-xs text-muted-foreground">
            {workflowVersion.state === WorkflowVersionState.DRAFT
              ? t('Draft')
              : `v${workflowVersionNumber}`}
          </p>
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

WorkflowVersionDetailsCard.displayName = 'WorkflowVersionDetailsCard';
export { WorkflowVersionDetailsCard };

type WorkflowVersionDetailsCardProps = {
  workflowVersion: WorkflowVersionMetadata;
  selected: boolean;
  publishedVersionId: string | undefined | null;
  workflowVersionNumber: number;
  onCompare: () => void;
};
