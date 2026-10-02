import { SolutionInstall, solutionUtils } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { FormattedDate } from '@/components/custom/formatted-date';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

import { solutionsHooks } from '../hooks/solutions-hooks';

function UpgradeInstallDialog({
  install,
  open,
  onOpenChange,
}: UpgradeInstallDialogProps) {
  const { data: solution, isLoading } = solutionsHooks.useSolution(
    install.solutionId,
  );
  const { mutate: upgrade, isPending } = solutionsHooks.useUpgradeInstall();
  const newerVersions = (solution?.versions ?? []).filter((version) =>
    solutionUtils.versionNewer({
      candidate: version.version,
      current: install.version,
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('Upgrade to v{version}', { version: install.latestVersion })}
          </DialogTitle>
          <DialogDescription>
            {t('{name}, currently v{version}', {
              name: install.solutionName,
              version: install.version,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">{t('What changed')}</div>
            {isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              newerVersions.map((version) => (
                <div key={version.version} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">v{version.version}</span>
                    <FormattedDate
                      className="text-xs text-muted-foreground"
                      date={new Date(version.publishedAt)}
                    />
                  </div>
                  <div className="text-muted-foreground">{version.notes}</div>
                </div>
              ))
            )}
          </div>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            <li>
              {t(
                'The new version goes into the drafts of {count, plural, =1 {1 workflow} other {# workflows}}. What is running now stays as it is until you publish.',
                { count: install.workflowIds.length },
              )}
            </li>
            <li>{t('Connections and configuration are kept.')}</li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            loading={isPending}
            onClick={() =>
              upgrade(install.id, { onSuccess: () => onOpenChange(false) })
            }
          >
            {t('Upgrade')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { UpgradeInstallDialog };

type UpgradeInstallDialogProps = {
  install: SolutionInstall;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
