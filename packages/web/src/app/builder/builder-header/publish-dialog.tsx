import {
  BatchPublishRequestBody,
  PUBLISH_DESCRIPTION_MAX_LENGTH,
} from '@fema-ipaas/shared';
import { isNil } from '@fema-ipaas/core-utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { VersionChangeList } from '@/app/builder/workflow-versions/version-change-list';

import { Alert, AlertDescription } from '@/components/ui/alert';
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
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { CharacterCounter } from '@/features/project-workspace/components/character-counter';
import { versionDiff } from '@/features/releases';
import { workflowsApi } from '@/features/workflows';
import { cn } from '@/lib/utils';

export function PublishDialog({
  open,
  onOpenChange,
  onConfirm,
  isPublishing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (description: string | undefined) => void;
  isPublishing: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <PublishForm
          key={open ? 'open' : 'closed'}
          isPublishing={isPublishing}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}

function PublishForm({
  isPublishing,
  onCancel,
  onConfirm,
}: {
  isPublishing: boolean;
  onCancel: () => void;
  onConfirm: (description: string | undefined) => void;
}) {
  const form = useForm<PublishValues>({
    resolver: zodResolver(PublishSchema),
    mode: 'onChange',
    defaultValues: { description: '' },
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          onConfirm(values.description?.trim() || undefined),
        )}
      >
        <DialogHeader>
          <DialogTitle>{t('Publish')}</DialogTitle>
        </DialogHeader>
        <Alert variant="warning">
          <TriangleAlert className="size-4" />
          <AlertDescription>
            {t(
              'Once published, the workflow starts running. If it is already running, the newly published workflow replaces the running one. Proceed with care.',
            )}
          </AlertDescription>
        </Alert>
        <PublishChanges />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Publish description')}</FormLabel>
              <CharacterCounter
                multiline
                length={(field.value ?? '').length}
                max={PUBLISH_DESCRIPTION_MAX_LENGTH}
              >
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ''}
                    rows={3}
                    maxLength={PUBLISH_DESCRIPTION_MAX_LENGTH}
                    placeholder={t(
                      'Describe what changed so the team can trace it later',
                    )}
                  />
                </FormControl>
              </CharacterCounter>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button type="submit" name="Confirm publish" loading={isPublishing}>
            {t('Publish')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function PublishChanges() {
  const [workflow, draft] = useBuilderStateContext((state) => [
    state.workflow,
    state.workflowVersion,
  ]);
  const [expanded, setExpanded] = useState(false);
  const publishedVersionId = workflow.publishedVersionId;
  const { data: published, isLoading } = useQuery({
    queryKey: ['workflow-version-compare', workflow.id, publishedVersionId],
    queryFn: async () =>
      (
        await workflowsApi.get(workflow.id, {
          versionId: publishedVersionId ?? undefined,
        })
      ).version,
    enabled: !isNil(publishedVersionId),
  });
  if (!isNil(publishedVersionId) && (isLoading || isNil(published))) {
    return null;
  }
  const before = published ?? null;
  const stepCount = versionDiff.diffSteps({
    before: before?.trigger ?? null,
    after: draft.trigger,
  }).length;
  const workflowChanged =
    !isNil(before) &&
    versionDiff.workflowChanges({ before, after: draft }).length > 0;
  if (stepCount === 0 && !workflowChanged) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="flex items-center gap-1.5 text-left text-sm font-medium"
        onClick={() => setExpanded((value) => !value)}
      >
        <ChevronRight
          className={cn(
            'size-4 shrink-0 transition-transform',
            expanded && 'rotate-90',
          )}
        />
        {isNil(before)
          ? t('publishChangesFirstTitle', { count: stepCount })
          : t('publishChangesTitle', {
              count: stepCount + (workflowChanged ? 1 : 0),
            })}
      </button>
      {expanded && (
        <ScrollArea className="max-h-64">
          <VersionChangeList before={before} after={draft} collapsed={true} />
        </ScrollArea>
      )}
    </div>
  );
}

const PublishSchema = BatchPublishRequestBody.pick({ description: true });

type PublishValues = { description?: string };
