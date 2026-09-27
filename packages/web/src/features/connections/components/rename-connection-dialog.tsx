import {
  CONNECTION_DISPLAY_NAME_MAX_LENGTH,
  formErrors,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { Pencil } from 'lucide-react';
import { useState, forwardRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { connectionsMutations } from '../hooks/connections-hooks';

const RenameConnectionSchema = z.object({
  displayName: z
    .string()
    .min(1, formErrors.required)
    .max(CONNECTION_DISPLAY_NAME_MAX_LENGTH, 'connectionDisplayNameTooLong'),
});

type RenameConnectionSchema = z.infer<typeof RenameConnectionSchema>;

type RenameConnectionDialogProps = {
  connectionId: string;
  currentName: string;
  userHasPermissionToRename: boolean;
  onRename: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

const RenameConnectionDialog = forwardRef<
  HTMLDivElement,
  RenameConnectionDialogProps
>(
  (
    {
      connectionId,
      currentName,
      userHasPermissionToRename,
      onRename,
      open,
      onOpenChange,
      hideTrigger,
    },
    _,
  ) => {
    const [isControlled] = useState(
      open !== undefined && onOpenChange !== undefined,
    );
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const isRenameDialogOpen = isControlled ? Boolean(open) : uncontrolledOpen;
    const setIsRenameDialogOpen = isControlled
      ? onOpenChange!
      : setUncontrolledOpen;
    const renameConnectionForm = useForm<RenameConnectionSchema>({
      resolver: zodResolver(RenameConnectionSchema),
      mode: 'onChange',
      defaultValues: {
        displayName: currentName,
      },
    });

    const { mutate: renameConnection, isPending } =
      connectionsMutations.useRenameConnection({
        currentName,
        setIsRenameDialogOpen,
        renameConnectionForm,
        refetch: onRename,
      });

    return (
      <Tooltip>
        <Dialog
          open={isRenameDialogOpen}
          onOpenChange={(nextOpen) => setIsRenameDialogOpen(nextOpen)}
        >
          {!hideTrigger && (
            <>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('Rename Connection')}
                  disabled={!userHasPermissionToRename}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIsRenameDialogOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {!userHasPermissionToRename
                  ? t('Permission needed')
                  : t('Edit')}
              </TooltipContent>
            </>
          )}
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('Rename Connection')}</DialogTitle>
              <DialogDescription>
                {t('Enter a new display name for this connection.')}
              </DialogDescription>
            </DialogHeader>
            <Form {...renameConnectionForm}>
              <form
                className="grid space-y-4"
                onSubmit={renameConnectionForm.handleSubmit((data) =>
                  renameConnection({
                    connectionId,
                    displayName: data.displayName,
                  }),
                )}
              >
                <FormField
                  control={renameConnectionForm.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem className="grid space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="displayName">{t('Name')}</Label>
                        <span className="text-xs text-muted-foreground">
                          {field.value.length}/
                          {CONNECTION_DISPLAY_NAME_MAX_LENGTH}
                        </span>
                      </div>
                      <Input
                        {...field}
                        id="displayName"
                        placeholder={t('New Connection Name')}
                        className="rounded-sm"
                        maxLength={CONNECTION_DISPLAY_NAME_MAX_LENGTH}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {renameConnectionForm?.formState?.errors?.root?.serverError && (
                  <FormMessage>
                    {
                      renameConnectionForm.formState.errors.root.serverError
                        .message
                    }
                  </FormMessage>
                )}
                <DialogFooter className="justify-end">
                  <DialogClose asChild>
                    <Button variant={'outline'}>{t('Cancel')}</Button>
                  </DialogClose>

                  <Button loading={isPending}>{t('Rename')}</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </Tooltip>
    );
  },
);

RenameConnectionDialog.displayName = 'RenameConnectionDialog';

export { RenameConnectionDialog };
