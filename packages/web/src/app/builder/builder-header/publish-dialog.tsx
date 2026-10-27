import {
  BatchPublishRequestBody,
  PUBLISH_DESCRIPTION_MAX_LENGTH,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { TriangleAlert } from 'lucide-react';
import { useForm } from 'react-hook-form';

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
import { Textarea } from '@/components/ui/textarea';
import { CharacterCounter } from '@/features/project-workspace/components/character-counter';

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
      <DialogContent className="max-w-lg">
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

const PublishSchema = BatchPublishRequestBody.pick({ description: true });

type PublishValues = { description?: string };
