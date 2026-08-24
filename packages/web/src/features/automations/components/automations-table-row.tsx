import { FolderDto, PopulatedWorkflow } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Copy,
  CornerUpLeft,
  Download,
  Folder,
  Link,
  MoreHorizontal,
  Pencil,
  Plus,
  Share2,
  Star,
  Table2,
  Trash2,
  Workflow,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { FormattedDate } from '@/components/custom/formatted-date';
import { LoadingSpinner } from '@/components/custom/spinner';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { UserBadge } from '@/components/custom/user-badge';
import { useEmbedding } from '@/components/providers/embed-provider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MoveToFolderDialog } from '@/features/automations/components/move-to-folder-dialog';
import { ConnectorIconList } from '@/features/connectors/components/connector-icon-list';
import { ShareTemplateDialog } from '@/features/workflows/components/share-template-dialog';
import { WorkflowCreatedByBadge } from '@/features/workflows/components/workflow-created-by-badge';
import { WorkflowStatusToggle } from '@/features/workflows/components/workflow-status-toggle';
import { cn } from '@/lib/utils';

import { TreeItem } from '../lib/types';

import { CreateNewMenu, CreateInFolderKind } from './create-new-menu';

type AutomationsTableRowProps = {
  item: TreeItem;
  isSelected: boolean;
  isExpanded: boolean;
  isPinned: boolean;
  workspaceMembers: any;
  folders: FolderDto[];
  onRowClick: () => void;
  onToggleSelection: () => void;
  onTogglePin: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDuplicate: (workflow: PopulatedWorkflow) => void;
  onMoveTo: (item: TreeItem, folderId: string) => void;
  onExportWorkflow: (workflow: PopulatedWorkflow) => void;
  onCreateInFolder?: (folderId: string, kind: CreateInFolderKind) => void;
  userHasPermissionToWriteWorkflow?: boolean;
  isCreatingWorkflow?: boolean;
  isMoving: boolean;
  isDuplicating: boolean;
  onLoadMore?: () => void;
};

export const AutomationsTableRow = ({
  item,
  isSelected,
  isExpanded,
  isPinned,
  folders,
  onToggleSelection,
  onTogglePin,
  onRename,
  onDelete,
  onDuplicate,
  onMoveTo,
  onExportWorkflow,
  onCreateInFolder,
  userHasPermissionToWriteWorkflow = true,
  isCreatingWorkflow,
  isMoving,
  isDuplicating,
  onLoadMore,
}: AutomationsTableRowProps) => {
  const { embedState } = useEmbedding();
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [moveFolderId, setMoveFolderId] = useState('');
  const [isCreateTooltipOpen, setIsCreateTooltipOpen] = useState(false);

  if (item.type === 'load-more-folder') {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-primary font-medium py-2">
        <div
          className="flex items-center gap-2 cursor-pointer hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onLoadMore?.();
          }}
        >
          <ArrowDown className="h-4 w-4" />
          <span>
            {t('Load {count} more items...', { count: item.loadMoreCount })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="w-10 shrink-0 pl-4 pr-1 flex items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox checked={isSelected} onCheckedChange={onToggleSelection} />
      </div>
      <div
        className={cn(
          'w-8 shrink-0 flex items-center justify-center mr-2',
          item.type === 'folder' && 'mr-3',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {item.depth === 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onTogglePin}
                className="p-0.5 rounded hover:bg-muted transition-colors"
              >
                <Star
                  className={cn(
                    'h-4 w-4',
                    isPinned
                      ? 'text-yellow-500 fill-yellow-500'
                      : 'text-muted-foreground/40 hover:text-muted-foreground',
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {isPinned ? t('Remove from favorites') : t('Add to favorites')}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex-1 min-w-[200px] pl-2 pr-2 flex items-center">
        <div
          className="relative flex items-center gap-2 min-w-0"
          style={{ paddingLeft: item.depth * 24 }}
        >
          {item.type === 'folder' && (
            <span className="absolute -left-5 flex items-center justify-center w-5">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </span>
          )}
          <span className="shrink-0">
            <RowItemIcon item={item} />
          </span>
          <TextWithTooltip tooltipMessage={item.name}>
            <span>{item.name}</span>
          </TextWithTooltip>
        </div>
      </div>
      <div className="w-[230px] shrink-0 px-2 flex items-center">
        <RowItemDetails item={item} />
      </div>
      <div className="w-[200px] shrink-0 px-2 flex items-center">
        {item.data && (
          <FormattedDate
            date={new Date(item.data.updated)}
            className="text-left"
          />
        )}
      </div>
      {!embedState.isEmbedded && (
        <div className="w-[250px] shrink-0 px-2 flex items-center overflow-hidden">
          <RowItemOwner item={item} />
        </div>
      )}
      <div
        className="w-[160px] shrink-0 px-2 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {isWorkflowItem(item) && (
          <>
            <WorkflowStatusToggle workflow={item.data} />
            <WorkflowCreatedByBadge createdBy={item.data.createdBy} />
          </>
        )}
      </div>
      <div
        className="w-[80px] shrink-0 px-2 flex items-center justify-end gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        {item.type === 'folder' && onCreateInFolder && (
          <Tooltip
            open={isCreateTooltipOpen}
            onOpenChange={setIsCreateTooltipOpen}
          >
            <CreateNewMenu
              scope="folder"
              align="end"
              userHasPermissionToWriteWorkflow={
                userHasPermissionToWriteWorkflow
              }
              userHasPermissionToWriteFolder={false}
              isCreatingWorkflow={isCreatingWorkflow}
              onCreateWorkflow={() => onCreateInFolder(item.id, 'workflow')}
              onImportWorkflow={() =>
                onCreateInFolder(item.id, 'import-workflow')
              }
              onOpenChange={(open) => {
                if (open) setIsCreateTooltipOpen(false);
              }}
            >
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                  aria-label={t('Create inside folder')}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
            </CreateNewMenu>
            <TooltipContent side="top">
              {t('Create inside folder')}
            </TooltipContent>
          </Tooltip>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {item.type === 'folder' && (
              <DropdownMenuItem
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set('folder', item.id);
                  navigator.clipboard.writeText(url.toString());
                  toast.success(t('URL copied to clipboard'));
                }}
              >
                <Link className="h-4 w-4 mr-2" />
                {t('Copy URL')}
              </DropdownMenuItem>
            )}

            <DropdownMenuItem onClick={onRename}>
              <Pencil className="h-4 w-4 mr-2" />
              {t('Rename')}
            </DropdownMenuItem>

            {isWorkflowItem(item) && !embedState.hideDuplicateWorkflow && (
              <DropdownMenuItem
                onClick={() => onDuplicate(item.data)}
                disabled={isDuplicating}
              >
                {isDuplicating ? (
                  <LoadingSpinner className="mr-2" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {isDuplicating ? t('Duplicating...') : t('Duplicate')}
              </DropdownMenuItem>
            )}

            {item.type === 'workflow' && !embedState.hideFolders && (
              <DropdownMenuItem
                onClick={() => {
                  setMoveFolderId('');
                  setIsMoveOpen(true);
                }}
              >
                <CornerUpLeft className="h-4 w-4 mr-2" />
                {t('Move To')}
              </DropdownMenuItem>
            )}

            {isWorkflowItem(item) &&
              !embedState.hideExportAndImportWorkflow && (
                <DropdownMenuItem onClick={() => onExportWorkflow(item.data)}>
                  <Download className="h-4 w-4 mr-2" />
                  {t('Export')}
                </DropdownMenuItem>
              )}

            {isWorkflowItem(item) && !embedState.isEmbedded && (
              <ShareTemplateDialog
                workflowId={item.id}
                workflowVersionId={item.data.version.id}
              >
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <Share2 className="h-4 w-4 mr-2" />
                  {t('Share')}
                </DropdownMenuItem>
              </ShareTemplateDialog>
            )}

            <DropdownMenuSeparator />
            <ConfirmationDeleteDialog
              title={t('Delete {type}', { type: item.type })}
              message={t('Deleting "{name}" cannot be undone.', {
                name: item.name,
              })}
              mutationFn={async () => onDelete()}
              entityName={item.type}
              buttonText={t('Delete')}
            >
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('Delete')}
              </DropdownMenuItem>
            </ConfirmationDeleteDialog>
          </DropdownMenuContent>
        </DropdownMenu>

        <MoveToFolderDialog
          open={isMoveOpen}
          onOpenChange={setIsMoveOpen}
          folders={folders}
          selectedFolderId={moveFolderId}
          onFolderChange={setMoveFolderId}
          onConfirm={() => {
            onMoveTo(item, moveFolderId);
            setIsMoveOpen(false);
          }}
          isMoving={isMoving}
        />
      </div>
    </>
  );
};

const RowItemIcon = ({ item }: { item: TreeItem }) => {
  switch (item.type) {
    case 'folder':
      return <Folder className="h-4 w-4 text-gray-400 fill-gray-400" />;
    case 'workflow':
      return <Workflow className="h-4 w-4 text-primary" />;
    default:
      return <Table2 className="h-4 w-4 text-emerald-500" />;
  }
};

const RowItemDetails = ({ item }: { item: TreeItem }) => {
  if (item.type === 'folder') {
    return (
      <span className="text-muted-foreground">
        {item.childCount} {item.childCount === 1 ? t('file') : t('files')}
      </span>
    );
  }
  if (isWorkflowItem(item)) {
    return (
      <ConnectorIconList
        trigger={item.data.version.trigger}
        maxNumberOfIconsToShow={3}
        size="xs"
      />
    );
  }
  return <span className="text-muted-foreground">-</span>;
};

const RowItemOwner = ({ item }: { item: TreeItem }) => {
  if (isWorkflowItem(item)) {
    if (item.data.ownerId) {
      return (
        <UserBadge
          id={item.data.ownerId}
          includeAvatar={true}
          includeName={true}
          size="small"
        />
      );
    }
  }
  return <span className="text-muted-foreground">-</span>;
};

function isWorkflowItem(
  item: TreeItem,
): item is Omit<TreeItem, 'data'> & { data: PopulatedWorkflow } {
  return item.type === 'workflow';
}
