import { t } from 'i18next';
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
import { api } from '@/lib/api';

import { releasesHooks } from '../hooks/releases-hooks';

export function TurnOffEnvironmentsDialog({
  open,
  onOpenChange,
  projectId,
  approverIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  approverIds: string[];
}) {
  const { mutate: updateEnvironments, isPending } =
    releasesHooks.useUpdateEnvironments();
  const turnOff = () =>
    updateEnvironments(
      { projectId, enabled: false, approverIds },
      {
        onSuccess: () => {
          toast.success(t('Test and production are off'));
          onOpenChange(false);
        },
        onError: (error) =>
          toast.error(
            api.extractServerErrorMessage(error, t('Something went wrong')),
          ),
      },
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Turn off test and production?')}</DialogTitle>
          <DialogDescription>
            {t('Publishing in the editor puts changes live immediately again.')}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          <li>{t('All test deployments are removed.')}</li>
          <li>{t('All test connection replacements are deleted.')}</li>
          <li>{t('Workflows in production keep running as they are.')}</li>
        </ul>
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
            variant="destructive"
            loading={isPending}
            onClick={turnOff}
          >
            {t('Turn off')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
