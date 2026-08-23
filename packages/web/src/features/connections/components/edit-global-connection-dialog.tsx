import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { Pencil } from 'lucide-react';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { GlobalConnectionWarning } from '@/components/custom/global-connection-utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { WorkspaceSelector } from '../../workspaces/components/workspaces-selector';
import { globalConnectionsMutations } from '../hooks/global-connections-hooks';

const EditGlobalConnectionSchema = z.object({
  displayName: z.string(),
  workspaceIds: z.array(z.string()),
  preSelectForNewWorkspaces: z.boolean(),
});

type EditGlobalConnectionSchema = z.infer<typeof EditGlobalConnectionSchema>;

type EditGlobalConnectionDialogProps = {
  connectionId: string;
  currentName: string;
  workspaceIds: string[];
  preSelectForNewWorkspaces: boolean;
  onEdit: () => void;
  userHasPermissionToEdit: boolean;
};

const EditGlobalConnectionDialog: React.FC<EditGlobalConnectionDialogProps> = ({
  connectionId,
  currentName,
  workspaceIds,
  preSelectForNewWorkspaces,
  onEdit,
  userHasPermissionToEdit,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const editConnectionForm = useForm<EditGlobalConnectionSchema>({
    resolver: zodResolver(EditGlobalConnectionSchema),
    defaultValues: {
      displayName: currentName,
      workspaceIds: workspaceIds,
      preSelectForNewWorkspaces: preSelectForNewWorkspaces,
    },
  });

  const {
    mutate: updateGlobalConnection,
    isPending: isUpdatingGlobalConnection,
  } = globalConnectionsMutations.useUpdateGlobalConnection(
    onEdit,
    setIsOpen,
    editConnectionForm,
  );

  return (
    <Tooltip>
      <Dialog open={isOpen} onOpenChange={(open) => setIsOpen(open)}>
        <DialogTrigger asChild>
          <>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={!userHasPermissionToEdit}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setIsOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {!userHasPermissionToEdit ? t('Permission needed') : t('Edit')}
            </TooltipContent>
          </>
        </DialogTrigger>
        <DialogContent onInteractOutside={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t('Edit Global Connection')}</DialogTitle>
          </DialogHeader>
          <Form {...editConnectionForm}>
            <form
              onSubmit={editConnectionForm.handleSubmit((data) =>
                updateGlobalConnection({
                  connectionId,
                  displayName: data.displayName,
                  workspaceIds: data.workspaceIds,
                  preSelectForNewWorkspaces: data.preSelectForNewWorkspaces,
                  currentName: currentName,
                }),
              )}
            >
              <div className="grid space-y-4">
                <GlobalConnectionWarning />
                <FormField
                  control={editConnectionForm.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem className="grid space-y-2">
                      <Label htmlFor="displayName">{t('Name')}</Label>
                      <Input
                        {...field}
                        id="displayName"
                        placeholder={t('Connection Name')}
                        className="rounded-sm"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <WorkspaceSelector
                  control={editConnectionForm.control}
                  name="workspaceIds"
                />
                <FormField
                  control={editConnectionForm.control}
                  name="preSelectForNewWorkspaces"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-3">
                      <Checkbox
                        id="preSelectForNewWorkspaces"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <Label
                        htmlFor="preSelectForNewWorkspaces"
                        className="cursor-pointer"
                      >
                        {t('Include by default in new workspaces')}
                      </Label>
                    </FormItem>
                  )}
                />
                {editConnectionForm?.formState?.errors?.root?.serverError && (
                  <FormMessage>
                    {
                      editConnectionForm.formState.errors.root.serverError
                        .message
                    }
                  </FormMessage>
                )}
              </div>
              <DialogFooter className="mt-8">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isUpdatingGlobalConnection}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIsOpen(false);
                  }}
                >
                  {t('Cancel')}
                </Button>
                <Button loading={isUpdatingGlobalConnection}>
                  {t('Save')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Tooltip>
  );
};

export { EditGlobalConnectionDialog };
