import { Folder, FOLDER_NAME_MAX_LENGTH, formErrors } from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import { api } from '@/lib/api';

import { projectWorkspaceHooks } from '../hooks/project-workspace-hooks';
import { workspaceUtils } from '../lib/workspace-utils';

export function FolderDialog({
  open,
  onOpenChange,
  projectId,
  folders,
  folder,
  parentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  folders: Folder[];
  folder?: Folder | null;
  parentId?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <FolderForm
          key={open ? 'open' : 'closed'}
          projectId={projectId}
          folders={folders}
          folder={folder ?? null}
          parentId={folder ? folder.parentId ?? null : parentId ?? null}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function FolderForm({
  projectId,
  folders,
  folder,
  parentId,
  onOpenChange,
}: {
  projectId: string;
  folders: Folder[];
  folder: Folder | null;
  parentId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm<FolderValues>({
    resolver: zodResolver(FolderSchema),
    mode: 'onChange',
    defaultValues: { displayName: folder?.displayName ?? '' },
  });
  const { mutate: create, isPending: isCreating } =
    projectWorkspaceHooks.useCreateFolder();
  const { mutate: rename, isPending: isRenaming } =
    projectWorkspaceHooks.useRenameFolder();
  const siblings = folders
    .filter(
      (candidate) =>
        (candidate.parentId ?? null) === parentId &&
        candidate.id !== folder?.id,
    )
    .map((candidate) => candidate.displayName);
  const name = form.watch('displayName');
  const duplicate = workspaceUtils.isNameTaken({ name, taken: siblings });

  const onError = (error: unknown) =>
    form.setError('root.serverError', {
      type: 'manual',
      message: t(api.extractServerErrorMessage(error, 'Something went wrong')),
    });

  const handleSubmit = (values: FolderValues) => {
    form.clearErrors('root.serverError');
    if (duplicate) {
      return;
    }
    const onSuccess = () => {
      toast.success(folder ? t('Folder renamed') : t('Folder created'));
      onOpenChange(false);
    };
    if (folder) {
      rename(
        { folderId: folder.id, displayName: values.displayName.trim() },
        { onSuccess, onError },
      );
      return;
    }
    create(
      {
        projectId,
        displayName: values.displayName.trim(),
        ...(parentId ? { parentId } : {}),
      },
      { onSuccess, onError },
    );
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <DialogHeader>
          <DialogTitle>
            {folder ? t('Rename folder') : t('New folder')}
          </DialogTitle>
        </DialogHeader>
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel showRequiredIndicator>{t('Folder name')}</FormLabel>
              <Input {...field} autoFocus maxLength={FOLDER_NAME_MAX_LENGTH} />
              <p className="text-xs text-muted-foreground">
                {field.value.length}/{FOLDER_NAME_MAX_LENGTH}
              </p>
              {duplicate && (
                <p className="text-sm text-destructive">
                  {t('folderNameTaken')}
                </p>
              )}
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
            {t('Cancel')}
          </Button>
          <Button
            type="submit"
            loading={isCreating || isRenaming}
            disabled={duplicate}
          >
            {folder ? t('Save') : t('Create')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

const FolderSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, formErrors.required)
    .max(FOLDER_NAME_MAX_LENGTH, 'folderNameTooLong'),
});

type FolderValues = z.infer<typeof FolderSchema>;
