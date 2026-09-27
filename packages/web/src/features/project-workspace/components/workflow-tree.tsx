import { Folder } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CornerLeftUp,
  FileInput,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  LayoutTemplate,
  ListChecks,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
  Workflow as WorkflowIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { SearchInput } from '@/components/custom/search-input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { GenerateWorkflowDialog } from '@/features/ai/components/generate-workflow-dialog';
import { TemplatePickerDialog } from '@/features/templates/components/template-picker-dialog';
import { NewWorkflowDialog } from '@/features/workflows/components/new-workflow-dialog';
import { cn } from '@/lib/utils';

import { projectWorkspaceHooks } from '../hooks/project-workspace-hooks';
import { WorkspaceContext } from '../hooks/use-workspace-context';
import { projectRoleLabels } from '../lib/role-labels';
import { TreeRow, workspaceUtils } from '../lib/workspace-utils';

import { ActionMenu, ActionMenuEntry } from './action-menu';
import { BatchPublishDialog } from './batch-publish-dialog';
import { DisabledReason } from './disabled-reason';
import { FolderDialog } from './folder-dialog';
import { ImportWorkflowFileDialog } from './import-workflow-dialog';
import { TypeToConfirmDialog } from './type-to-confirm-dialog';
import { MoveWorkflowsDialog } from './workflow-dialogs';
import { WorkflowMoreMenu } from './workflow-more-menu';

export function WorkflowTree({ context }: { context: WorkspaceContext }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId, folders, workflows, permissions } = context;
  const canEdit = permissions.canEdit;
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [dialog, setDialog] = useState<TreeDialog | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const { mutate: move } = projectWorkspaceHooks.useMoveWorkflows();
  const { mutate: removeFolder, isPending: isDeletingFolder } =
    projectWorkspaceHooks.useDeleteFolder();
  const { mutate: removeMany, isPending: isDeleting } =
    projectWorkspaceHooks.useDeleteWorkflows();

  const rows = workspaceUtils.buildTreeRows({
    folders,
    workflows,
    query,
    collapsed,
  });
  const visibleIds = rows.flatMap((row) =>
    row.kind === 'workflow' ? [row.workflow.id] : [],
  );
  const livePicked = picked.filter((id) =>
    workflows.some((workflow) => workflow.id === id),
  );
  const allPicked =
    visibleIds.length > 0 && visibleIds.every((id) => livePicked.includes(id));
  const allOpen = folders.every((folder) => !collapsed.has(folder.id));
  const rootFolderBlock = workspaceUtils.canCreateSubfolder({
    folderId: null,
    folders,
  });
  const activeWorkflowId =
    location.pathname.match(/\/workflows\/([^/]+)/)?.[1] ?? null;
  const dragged = dragId
    ? workflows.find((workflow) => workflow.id === dragId)
    : undefined;
  const limitReason = context.limitReached
    ? t('The project has reached its workflow limit')
    : null;
  const viewerReason = canEdit ? null : projectRoleLabels.viewerHint();
  const close = () => setDialog(null);

  const togglePick = (id: string) =>
    setPicked((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const toggleFolder = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  const exitBatch = () => {
    setBatch(false);
    setPicked([]);
  };

  const moveTo = ({
    workflowId,
    folderId,
  }: {
    workflowId: string;
    folderId: string | null;
  }) => {
    const workflow = workflows.find((item) => item.id === workflowId);
    if (!workflow || (workflow.folderId ?? null) === folderId) {
      return;
    }
    const folder = folders.find((item) => item.id === folderId);
    move(
      { projectId, workflowIds: [workflowId], folderId },
      {
        onSuccess: () =>
          toast.success(
            folder
              ? t('Moved to {name}', { name: folder.displayName })
              : t('Moved to the project root'),
          ),
      },
    );
  };

  const dropHandlers = (target: string) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!dragId) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (dropTarget !== target) {
        setDropTarget(target);
      }
    },
    onDragLeave: (event: React.DragEvent) => {
      if (
        event.relatedTarget instanceof Node &&
        event.currentTarget.contains(event.relatedTarget)
      ) {
        return;
      }
      setDropTarget((current) => (current === target ? null : current));
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const workflowId =
        event.dataTransfer.getData('text/workflow-id') || dragId;
      setDragId(null);
      setDropTarget(null);
      if (workflowId) {
        moveTo({ workflowId, folderId: target === ROOT ? null : target });
      }
    },
  });

  const createItems: ActionMenuEntry[] = [
    {
      key: 'new',
      label: t('New workflow'),
      icon: WorkflowIcon,
      disabledReason: limitReason,
      onSelect: () => setDialog({ kind: 'new' }),
    },
    {
      key: 'ai',
      label: t('Create with AI'),
      icon: Sparkles,
      disabledReason: limitReason,
      description: t('Describe the automation in one sentence'),
      onSelect: () => setDialog({ kind: 'ai' }),
    },
    {
      key: 'template',
      label: t('New from template'),
      icon: LayoutTemplate,
      disabledReason: limitReason,
      onSelect: () => setDialog({ kind: 'template' }),
    },
    {
      key: 'import',
      label: t('Import workflow'),
      icon: FileInput,
      onSelect: () => setDialog({ kind: 'import' }),
    },
    'divider',
    {
      key: 'folder',
      label: t('New folder'),
      icon: FolderPlus,
      disabledReason:
        rootFolderBlock.reason === 'limit'
          ? t('Each project can have up to 100 folders')
          : permissions.canWriteFolders
          ? null
          : t('No access'),
      onSelect: () => setDialog({ kind: 'folder', parentId: null }),
    },
  ];

  const folderItems = (folder: Folder, depth: number): ActionMenuEntry[] => {
    const block = workspaceUtils.canCreateSubfolder({
      folderId: folder.id,
      folders,
    });
    return [
      {
        key: 'new',
        label: t('New workflow'),
        icon: Plus,
        disabledReason: limitReason,
        onSelect: () => setDialog({ kind: 'new', folderId: folder.id }),
      },
      {
        key: 'sub',
        label: t('New subfolder'),
        icon: FolderPlus,
        disabledReason:
          block.reason === 'depth' || depth + 1 >= 3
            ? t('Folders can be nested up to three levels')
            : block.reason === 'limit'
            ? t('Each project can have up to 100 folders')
            : null,
        onSelect: () => setDialog({ kind: 'folder', parentId: folder.id }),
      },
      {
        key: 'rename',
        label: t('Rename'),
        icon: PenLine,
        onSelect: () => setDialog({ kind: 'rename', folder }),
      },
      'divider',
      {
        key: 'delete',
        label: t('Delete folder'),
        icon: Trash2,
        destructive: true,
        onSelect: () => setDialog({ kind: 'deleteFolder', folder }),
      },
    ];
  };

  const renderRow = (row: TreeRow) => {
    if (row.kind === 'folder') {
      const { folder, depth, open, count } = row;
      return (
        <div
          key={folder.id}
          role="treeitem"
          aria-expanded={open}
          tabIndex={0}
          style={{ paddingLeft: 8 + depth * 16 }}
          className={cn(
            'group flex h-8 cursor-pointer items-center gap-1.5 rounded-md pr-1 text-sm hover:bg-muted',
            dropTarget === folder.id && 'bg-primary/10 ring-1 ring-primary',
          )}
          onClick={() => {
            if (query.trim().length === 0) {
              toggleFolder(folder.id);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              toggleFolder(folder.id);
            }
          }}
          {...(canEdit ? dropHandlers(folder.id) : {})}
        >
          {open ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          )}
          {open ? (
            <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate" title={folder.displayName}>
            {folder.displayName}
          </span>
          <span className="text-xs text-muted-foreground">{count}</span>
          {canEdit && !batch && (
            <ActionMenu
              items={folderItems(folder, depth)}
              label={t('Folder actions')}
              triggerClassName="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            />
          )}
        </div>
      );
    }
    const { workflow, depth } = row;
    const isPicked = livePicked.includes(workflow.id);
    return (
      <div
        key={workflow.id}
        role="treeitem"
        tabIndex={0}
        draggable={canEdit && !batch}
        style={{ paddingLeft: 8 + depth * 16 }}
        onDragStart={(event) => {
          event.dataTransfer.setData('text/workflow-id', workflow.id);
          event.dataTransfer.effectAllowed = 'move';
          setDragId(workflow.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setDropTarget(null);
        }}
        onClick={() =>
          batch
            ? togglePick(workflow.id)
            : navigate(`/projects/${projectId}/workflows/${workflow.id}`)
        }
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            navigate(`/projects/${projectId}/workflows/${workflow.id}`);
          }
        }}
        className={cn(
          'group flex h-8 cursor-pointer items-center gap-1.5 rounded-md pr-1 text-sm hover:bg-muted',
          !batch && activeWorkflowId === workflow.id && 'bg-muted font-medium',
          batch && isPicked && 'bg-primary/10',
          dragId === workflow.id && 'opacity-50',
        )}
      >
        {batch && (
          <Checkbox
            checked={isPicked}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={() => togglePick(workflow.id)}
          />
        )}
        <WorkflowIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate" title={workflow.displayName}>
          {workflow.displayName}
        </span>
        {workflow.hasUnpublishedChanges && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-label={t('Has unpublished changes')}
                className="size-1.5 shrink-0 rounded-full bg-primary"
              />
            </TooltipTrigger>
            <TooltipContent>{t('Has unpublished changes')}</TooltipContent>
          </Tooltip>
        )}
        {!batch && (
          <WorkflowMoreMenu
            workflow={workflow}
            context={context}
            triggerClassName="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1 px-2">
        <span className="flex-1 text-xs font-medium text-muted-foreground">
          {t('Project resources ({count})', { count: workflows.length })}
        </span>
        <DisabledReason
          reason={
            viewerReason ??
            (workflows.length === 0 ? t('No workflows yet') : null)
          }
        >
          <Button
            type="button"
            variant={batch ? 'secondary' : 'ghost'}
            size="icon-xs"
            aria-label={batch ? t('Exit batch mode') : t('Batch actions')}
            disabled={!canEdit || workflows.length === 0}
            onClick={() => {
              if (batch) {
                exitBatch();
                return;
              }
              setBatch(true);
              setPicked([]);
              setCollapsed(new Set());
            }}
          >
            <ListChecks />
          </Button>
        </DisabledReason>
        {folders.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={
              allOpen ? t('Collapse all folders') : t('Expand all folders')
            }
            onClick={() =>
              setCollapsed(
                allOpen
                  ? new Set(folders.map((folder) => folder.id))
                  : new Set(),
              )
            }
          >
            {allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
          </Button>
        )}
        {canEdit ? (
          <ActionMenu
            items={createItems}
            label={t('Create')}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t('Create')}
              >
                <Plus />
              </Button>
            }
          />
        ) : (
          <DisabledReason reason={viewerReason}>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled
              aria-label={t('Create')}
            >
              <Plus />
            </Button>
          </DisabledReason>
        )}
      </div>
      <div className="px-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t('Search workflow name')}
        />
      </div>
      {batch && (
        <div className="flex items-center gap-2 px-2 text-xs">
          <span className="flex-1">
            {t('{count} selected', { count: livePicked.length })}
          </span>
          <Button
            type="button"
            variant="link"
            size="xs"
            disabled={visibleIds.length === 0}
            onClick={() =>
              setPicked(
                allPicked
                  ? livePicked.filter((id) => !visibleIds.includes(id))
                  : [...new Set([...livePicked, ...visibleIds])],
              )
            }
          >
            {allPicked ? t('Deselect all') : t('Select all')}
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={exitBatch}>
            {t('Exit')}
          </Button>
        </div>
      )}
      <div
        role="tree"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1"
      >
        {dragged && dragged.folderId && (
          <div
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-md border border-dashed px-2 text-sm text-muted-foreground',
              dropTarget === ROOT && 'border-primary bg-primary/10',
            )}
            {...dropHandlers(ROOT)}
          >
            <CornerLeftUp className="size-4" />
            {t('Move to the project root')}
          </div>
        )}
        {rows.map(renderRow)}
        {rows.length === 0 && (
          <div className="flex flex-col items-start gap-2 px-2 py-4 text-sm text-muted-foreground">
            <span>
              {query.trim().length > 0
                ? t('No matching workflows')
                : t('No workflows yet')}
            </span>
            {query.trim().length === 0 && canEdit && (
              <Button
                type="button"
                size="sm"
                disabled={Boolean(limitReason)}
                onClick={() => setDialog({ kind: 'new' })}
              >
                <Plus />
                {t('New workflow')}
              </Button>
            )}
            {query.trim().length === 0 && viewerReason && (
              <span className="text-xs">{viewerReason}</span>
            )}
          </div>
        )}
      </div>
      {batch && (
        <div className="flex flex-wrap gap-2 border-t px-2 pt-2">
          <DisabledReason
            reason={permissions.canPublish ? null : t('No access')}
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={livePicked.length === 0 || !permissions.canPublish}
              onClick={() => setDialog({ kind: 'publish', ids: livePicked })}
            >
              {t('Batch publish')}
            </Button>
          </DisabledReason>
          <DisabledReason
            reason={
              folders.length === 0 ? t('The project has no folders yet') : null
            }
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={livePicked.length === 0 || folders.length === 0}
              onClick={() => setDialog({ kind: 'move', ids: livePicked })}
            >
              {t('Move to')}
            </Button>
          </DisabledReason>
          <DisabledReason
            reason={permissions.canDelete ? null : t('No access')}
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-destructive"
              disabled={livePicked.length === 0 || !permissions.canDelete}
              onClick={() => setDialog({ kind: 'deleteMany', ids: livePicked })}
            >
              {t('Delete')}
            </Button>
          </DisabledReason>
        </div>
      )}
      {dialog?.kind === 'new' && (
        <NewWorkflowDialog
          open
          onOpenChange={(open) => !open && close()}
          projectId={projectId}
          folderId={dialog.folderId}
        />
      )}
      {dialog?.kind === 'ai' && (
        <GenerateWorkflowDialog
          open
          onOpenChange={(open) => !open && close()}
          projectId={projectId}
        />
      )}
      {dialog?.kind === 'template' && (
        <TemplatePickerDialog
          open
          onOpenChange={(open) => !open && close()}
          projectId={projectId}
        />
      )}
      {dialog?.kind === 'import' && (
        <ImportWorkflowFileDialog
          open
          onOpenChange={(open) => !open && close()}
          projectId={projectId}
          existingNames={context.workflowNames}
          limitReason={limitReason}
        />
      )}
      {(dialog?.kind === 'folder' || dialog?.kind === 'rename') && (
        <FolderDialog
          open
          onOpenChange={(open) => !open && close()}
          projectId={projectId}
          folders={folders}
          folder={dialog.kind === 'rename' ? dialog.folder : null}
          parentId={dialog.kind === 'folder' ? dialog.parentId : null}
        />
      )}
      {dialog?.kind === 'deleteFolder' && (
        <TypeToConfirmDialog
          open
          onOpenChange={(open) => !open && close()}
          title={t('Delete folder {name}?', {
            name: dialog.folder.displayName,
          })}
          description={
            dialog.folder.parentId
              ? t(
                  'Subfolders and workflows inside move up one level to {parent}. Nothing is deleted.',
                  {
                    parent:
                      folders.find(
                        (folder) => folder.id === dialog.folder.parentId,
                      )?.displayName ?? '',
                  },
                )
              : t(
                  'Subfolders and workflows inside move to the project root. Nothing is deleted.',
                )
          }
          actionLabel={t('Delete')}
          isPending={isDeletingFolder}
          onConfirm={() => removeFolder(dialog.folder.id, { onSuccess: close })}
        />
      )}
      {dialog?.kind === 'move' && (
        <MoveWorkflowsDialog
          open
          onOpenChange={(open) => !open && close()}
          projectId={projectId}
          workflowIds={dialog.ids}
          folders={folders}
          onMoved={exitBatch}
        />
      )}
      {dialog?.kind === 'publish' && (
        <BatchPublishDialog
          open
          onOpenChange={(open) => !open && close()}
          projectId={projectId}
          workflowIds={dialog.ids}
          onDone={exitBatch}
        />
      )}
      {dialog?.kind === 'deleteMany' && (
        <TypeToConfirmDialog
          open
          onOpenChange={(open) => !open && close()}
          title={t('Delete {count} workflows?', { count: dialog.ids.length })}
          description={t(
            'This cannot be undone. Pending promotion requests of these workflows are withdrawn automatically.',
          )}
          actionLabel={t('Delete')}
          isPending={isDeleting}
          onConfirm={() =>
            removeMany(
              { projectId, workflowIds: dialog.ids },
              {
                onSuccess: (result) => {
                  toast.success(
                    t('Deleted {count} workflows', { count: result.deleted }),
                  );
                  close();
                  exitBatch();
                },
              },
            )
          }
        />
      )}
    </div>
  );
}

const ROOT = '__root__';

type TreeDialog =
  | { kind: 'new'; folderId?: string }
  | { kind: 'ai' }
  | { kind: 'template' }
  | { kind: 'import' }
  | { kind: 'folder'; parentId: string | null }
  | { kind: 'rename'; folder: Folder }
  | { kind: 'deleteFolder'; folder: Folder }
  | { kind: 'move'; ids: string[] }
  | { kind: 'publish'; ids: string[] }
  | { kind: 'deleteMany'; ids: string[] };
