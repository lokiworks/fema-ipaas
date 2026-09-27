import {
  Folder,
  ProjectTreeWorkflow,
  WORKFLOW_DESCRIPTION_MAX_LENGTH,
  WORKFLOW_NAME_MAX_LENGTH,
  WorkflowOperationType,
  formErrors,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { CornerLeftUp, Folder as FolderIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

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
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  projectDirectoryHooks,
  projectDirectoryUtils,
} from '@/features/projects/api/project-directory-api';
import { workflowsApi } from '@/features/workflows/api/workflows-api';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

import { projectWorkspaceHooks } from '../hooks/project-workspace-hooks';
import { workspaceUtils } from '../lib/workspace-utils';

export function MoveWorkflowsDialog({
  open,
  onOpenChange,
  projectId,
  workflowIds,
  folders,
  currentFolderId,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  workflowIds: string[];
  folders: Folder[];
  currentFolderId?: string | null;
  onMoved?: () => void;
}) {
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  const { mutate: move, isPending } = projectWorkspaceHooks.useMoveWorkflows();
  const options = flattenFolders({ folders });
  const handleMove = () => {
    if (target === undefined) {
      return;
    }
    move(
      { projectId, workflowIds, folderId: target },
      {
        onSuccess: (result) => {
          toast.success(t('Moved {count} workflows', { count: result.moved }));
          onOpenChange(false);
          onMoved?.();
        },
      },
    );
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setTarget(undefined);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('Move {count} workflows to', { count: workflowIds.length })}
          </DialogTitle>
        </DialogHeader>
        <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto rounded-md border p-1">
          <MoveOption
            label={t('Project root')}
            depth={0}
            icon={<CornerLeftUp className="size-4" />}
            selected={target === null}
            disabled={currentFolderId === null}
            onSelect={() => setTarget(null)}
          />
          {options.map(({ folder, depth }) => (
            <MoveOption
              key={folder.id}
              label={folder.displayName}
              depth={depth}
              icon={<FolderIcon className="size-4" />}
              selected={target === folder.id}
              disabled={currentFolderId === folder.id}
              onSelect={() => setTarget(folder.id)}
            />
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
            loading={isPending}
            disabled={target === undefined}
            onClick={handleMove}
          >
            {t('Move')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveOption({
  label,
  depth,
  icon,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  depth: number;
  icon: React.ReactNode;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      style={{ paddingLeft: 8 + depth * 16 }}
      className={cn(
        'flex items-center gap-2 rounded-sm py-1.5 pr-2 text-left text-sm hover:bg-muted disabled:opacity-50',
        selected && 'bg-muted font-medium',
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function flattenFolders({
  folders,
}: {
  folders: Folder[];
}): { folder: Folder; depth: number }[] {
  const ids = new Set(folders.map((folder) => folder.id));
  const walk = (
    parentId: string | null,
    depth: number,
  ): { folder: Folder; depth: number }[] =>
    folders
      .filter((folder) => {
        const parent =
          folder.parentId && ids.has(folder.parentId) ? folder.parentId : null;
        return parent === parentId;
      })
      .flatMap((folder) => [{ folder, depth }, ...walk(folder.id, depth + 1)]);
  return walk(null, 0);
}

export function CopyWorkflowDialog({
  open,
  onOpenChange,
  projectId,
  workflow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  workflow: Pick<ProjectTreeWorkflow, 'id' | 'displayName'>;
}) {
  const navigate = useNavigate();
  const { data: directory } = projectDirectoryHooks.useDirectory();
  const candidates = (directory ?? []).filter((item) =>
    projectDirectoryUtils.canEdit(item),
  );
  const defaultTarget =
    candidates.find((item) => item.id === projectId)?.id ??
    candidates.find((item) => !projectDirectoryUtils.isFull(item))?.id ??
    '';
  const [target, setTarget] = useState<string>('');
  const selected = target || defaultTarget;
  const selectedItem = candidates.find((item) => item.id === selected);
  const { mutate: copy, isPending } = projectWorkspaceHooks.useCopyWorkflow();
  const handleCopy = () =>
    copy(
      {
        workflowId: workflow.id,
        request: { projectId, targetProjectId: selected },
      },
      {
        onSuccess: (result) => {
          toast.success(t('Created {name}', { name: result.displayName }), {
            description:
              result.clearedConnections > 0
                ? t('{count} steps need their connection selected again', {
                    count: result.clearedConnections,
                  })
                : undefined,
          });
          onOpenChange(false);
          if (result.projectId === projectId) {
            navigate(`/projects/${projectId}/workflows/${result.workflowId}`);
          }
        },
      },
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('Copy {name}', { name: workflow.displayName })}
          </DialogTitle>
          <DialogDescription>
            {t(
              'The copy is created as an unpublished draft. Connections that are not available in the target project are cleared.',
            )}
          </DialogDescription>
        </DialogHeader>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('You have no project you can edit')}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t('Target project')}</span>
            <Select value={selected} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue placeholder={t('Select a project')} />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((item) => (
                  <SelectItem
                    key={item.id}
                    value={item.id}
                    disabled={projectDirectoryUtils.isFull(item)}
                  >
                    {item.displayName}
                    {projectDirectoryUtils.isFull(item)
                      ? ` · ${t('Workflow limit reached')}`
                      : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
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
            loading={isPending}
            disabled={
              !selectedItem || projectDirectoryUtils.isFull(selectedItem)
            }
            onClick={handleCopy}
          >
            {t('Create copy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WorkflowInfoDialog({
  open,
  onOpenChange,
  workflow,
  siblingNames,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: ProjectTreeWorkflow;
  siblingNames: string[];
  canEdit: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <WorkflowInfoForm
          key={open ? 'open' : 'closed'}
          workflow={workflow}
          siblingNames={siblingNames}
          canEdit={canEdit}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function WorkflowInfoForm({
  workflow,
  siblingNames,
  canEdit,
  onOpenChange,
}: {
  workflow: ProjectTreeWorkflow;
  siblingNames: string[];
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm<InfoValues>({
    resolver: zodResolver(InfoSchema),
    mode: 'onChange',
    defaultValues: {
      displayName: workflow.displayName,
      description: workflow.description ?? '',
    },
  });
  const { mutateAsync: update } = projectWorkspaceHooks.useUpdateWorkflow();
  const [saving, setSaving] = useState(false);
  const name = form.watch('displayName');
  const description = form.watch('description') ?? '';
  const duplicate = workspaceUtils.isNameTaken({
    name,
    taken: siblingNames,
  });

  const handleSubmit = async (values: InfoValues) => {
    form.clearErrors('root.serverError');
    if (duplicate) {
      return;
    }
    setSaving(true);
    try {
      if (values.displayName.trim() !== workflow.displayName) {
        await update({
          workflowId: workflow.id,
          request: {
            type: WorkflowOperationType.CHANGE_NAME,
            request: { displayName: values.displayName.trim() },
          },
        });
      }
      if ((values.description ?? '') !== (workflow.description ?? '')) {
        const current = await workflowsApi.get(workflow.id);
        await update({
          workflowId: workflow.id,
          request: {
            type: WorkflowOperationType.UPDATE_METADATA,
            request: {
              metadata: {
                ...(current.metadata ?? {}),
                description: values.description ?? '',
              },
            },
          },
        });
      }
      toast.success(t('Saved'));
      onOpenChange(false);
    } catch (error) {
      form.setError('root.serverError', {
        type: 'manual',
        message: t(
          api.extractServerErrorMessage(error, 'Something went wrong'),
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <DialogHeader>
          <DialogTitle>{t('Basic info')}</DialogTitle>
        </DialogHeader>
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel showRequiredIndicator>{t('Workflow name')}</FormLabel>
              <Input
                {...field}
                disabled={!canEdit}
                maxLength={WORKFLOW_NAME_MAX_LENGTH}
              />
              <p className="text-xs text-muted-foreground">
                {field.value.length}/{WORKFLOW_NAME_MAX_LENGTH}
              </p>
              {duplicate && (
                <p className="text-sm text-destructive">
                  {t('workflowNameTaken')}
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Description')}</FormLabel>
              <Textarea
                {...field}
                value={field.value ?? ''}
                disabled={!canEdit}
                rows={3}
                maxLength={WORKFLOW_DESCRIPTION_MAX_LENGTH}
              />
              <p className="text-xs text-muted-foreground">
                {description.length}/{WORKFLOW_DESCRIPTION_MAX_LENGTH}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
        {form.formState.errors.root?.serverError && (
          <FormMessage>
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {canEdit ? t('Cancel') : t('Close')}
          </Button>
          {canEdit && (
            <Button type="submit" loading={saving} disabled={duplicate}>
              {t('Save')}
            </Button>
          )}
        </DialogFooter>
      </form>
    </Form>
  );
}

const InfoSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, formErrors.required)
    .max(WORKFLOW_NAME_MAX_LENGTH, 'workflowNameTooLong'),
  description: z
    .string()
    .max(WORKFLOW_DESCRIPTION_MAX_LENGTH, 'workflowDescriptionTooLong')
    .optional(),
});

type InfoValues = z.infer<typeof InfoSchema>;
