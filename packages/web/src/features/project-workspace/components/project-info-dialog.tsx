import {
  ColorName,
  PROJECT_COLOR_PALETTE,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  ProjectWithLimits,
  SaveProjectInfoRequestBody,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { Check } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

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
import { Textarea } from '@/components/ui/textarea';
import { projectDirectoryHooks } from '@/features/projects/api/project-directory-api';
import { projectCollectionUtils } from '@/features/projects/stores/project-collection';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

import { projectWorkspaceHooks } from '../hooks/project-workspace-hooks';
import { workspaceUtils } from '../lib/workspace-utils';

export function ProjectInfoDialog({
  open,
  onOpenChange,
  project,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Pick<
    ProjectWithLimits,
    'id' | 'displayName' | 'description' | 'icon'
  > | null;
  onCreated?: (project: ProjectWithLimits) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <ProjectInfoForm
          key={open ? 'open' : 'closed'}
          project={project ?? null}
          onOpenChange={onOpenChange}
          onCreated={onCreated}
        />
      </DialogContent>
    </Dialog>
  );
}

function ProjectInfoForm({
  project,
  onOpenChange,
  onCreated,
}: {
  project: Pick<
    ProjectWithLimits,
    'id' | 'displayName' | 'description' | 'icon'
  > | null;
  onOpenChange: (open: boolean) => void;
  onCreated?: (project: ProjectWithLimits) => void;
}) {
  const { data: directory } = projectDirectoryHooks.useDirectory();
  const form = useForm<SaveProjectInfoRequestBody>({
    resolver: zodResolver(SaveProjectInfoRequestBody),
    mode: 'onChange',
    defaultValues: defaultValues(project),
  });
  const description = form.watch('description') ?? '';
  const displayName = form.watch('displayName');
  const color = form.watch('icon.color');
  const taken = (directory ?? [])
    .filter((item) => item.id !== project?.id)
    .map((item) => item.displayName);
  const duplicate = workspaceUtils.isNameTaken({ name: displayName, taken });

  const handleError = (error: unknown) =>
    form.setError('root.serverError', {
      type: 'manual',
      message: t(api.extractServerErrorMessage(error, 'Something went wrong')),
    });

  const { mutate: create, isPending: isCreating } =
    projectCollectionUtils.useCreateProject((created) => {
      toast.success(t('projectCreated', { projectName: created.displayName }));
      onCreated?.(created);
      onOpenChange(false);
    }, handleError);
  const { mutate: save, isPending: isSaving } =
    projectWorkspaceHooks.useSaveProjectInfo();

  const handleSubmit = (values: SaveProjectInfoRequestBody) => {
    form.clearErrors('root.serverError');
    if (duplicate) {
      return;
    }
    if (project === null) {
      create({
        displayName: values.displayName,
        description: values.description,
        icon: values.icon,
        externalId: null,
        metadata: null,
        maxConcurrentJobs: null,
      });
      return;
    }
    save(
      { projectId: project.id, request: values },
      {
        onSuccess: () => {
          toast.success(t('Project updated'));
          onOpenChange(false);
        },
        onError: handleError,
      },
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
            {project === null ? t('Create Project') : t('Edit project info')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Projects group workflows by business line or team; permissions are isolated between projects.',
            )}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel showRequiredIndicator>{t('Project Name')}</FormLabel>
              <div className="relative">
                <Input
                  {...field}
                  autoFocus
                  maxLength={PROJECT_NAME_MAX_LENGTH}
                  className="pr-16"
                  placeholder={t('For example: HR onboarding')}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {field.value.length}/{PROJECT_NAME_MAX_LENGTH}
                </span>
              </div>
              {duplicate && (
                <p className="text-sm text-destructive">
                  {t('projectNameTaken')}
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="icon.color"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Color')}</FormLabel>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {PROJECT_COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={color === option}
                    aria-label={option}
                    onClick={() => field.onChange(option)}
                    className={cn(
                      'flex size-7 items-center justify-center rounded-md ring-offset-2 ring-offset-background transition',
                      color === option && 'ring-2 ring-ring',
                    )}
                    style={{
                      backgroundColor: PROJECT_COLOR_PALETTE[option].color,
                      color: PROJECT_COLOR_PALETTE[option].textColor,
                    }}
                  >
                    {color === option && <Check className="size-4" />}
                  </button>
                ))}
              </div>
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
                rows={3}
                maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
                placeholder={t('What this project is for')}
              />
              <p className="text-xs text-muted-foreground">
                {description.length}/{PROJECT_DESCRIPTION_MAX_LENGTH}
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
            {t('Cancel')}
          </Button>
          <Button
            type="submit"
            loading={isCreating || isSaving}
            disabled={duplicate}
          >
            {project === null ? t('Create Project') : t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function defaultValues(
  project: Pick<
    ProjectWithLimits,
    'displayName' | 'description' | 'icon'
  > | null,
): SaveProjectInfoRequestBody {
  return {
    displayName: project?.displayName ?? '',
    description: project?.description ?? '',
    icon: project?.icon ?? { color: ColorName.BLUE },
  };
}

const PROJECT_COLORS: ColorName[] = [
  ColorName.PURPLE,
  ColorName.BLUE,
  ColorName.CYAN,
  ColorName.GREEN,
  ColorName.ORANGE,
  ColorName.RED,
  ColorName.PINK,
  ColorName.VIOLET,
  ColorName.DARK_GREEN,
  ColorName.DEEP_ORANGE,
];
