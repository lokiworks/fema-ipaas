import { DeployToTestRequestBody } from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';

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
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { CharacterCounter } from '@/features/project-workspace/components/character-counter';

export function DeployToTestDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (note: string | undefined) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DeployToTestForm
          key={open ? 'open' : 'closed'}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}

function DeployToTestForm({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (note: string | undefined) => void;
}) {
  const form = useForm<DeployNoteValues>({
    resolver: zodResolver(DeployNoteSchema),
    mode: 'onChange',
    defaultValues: { note: '' },
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          onConfirm(values.note?.trim() || undefined),
        )}
      >
        <DialogHeader>
          <DialogTitle>{t('Deploy to test')}</DialogTitle>
          <DialogDescription>
            {t(
              'The draft is locked as a new version and runs in the test environment with test values. Production is not affected.',
            )}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Release note (optional)')}</FormLabel>
              <CharacterCounter
                multiline
                length={(field.value ?? '').length}
                max={300}
              >
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ''}
                    maxLength={300}
                    placeholder={t('e.g. Added the signature to the message')}
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
          <Button type="submit" name="Confirm deploy to test">
            {t('Deploy to test')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

const DeployNoteSchema = DeployToTestRequestBody.pick({ note: true });

type DeployNoteValues = { note?: string };
