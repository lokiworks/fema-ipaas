import { t } from 'i18next';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function MappingWideEditor({
  open,
  onOpenChange,
  jsonPreview,
  sidePanel,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jsonPreview: React.ReactNode;
  sidePanel: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[90vh] w-[96vw] max-w-[1500px] flex-col gap-3 p-4 sm:max-w-[1500px]"
        data-testid="mapping-wide-editor"
      >
        <DialogHeader className="mb-0">
          <DialogTitle>{t('Field mapping')}</DialogTitle>
          <DialogDescription>
            {t(
              'Target fields on the left, transforms in the middle, sources on the right. The JSON on the far right is what this step outputs for your sample data.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:overflow-visible">
          <div className="@container flex flex-col gap-3 pr-1 lg:min-h-0 lg:overflow-y-auto">
            {children}
          </div>
          <div className="flex flex-col gap-3 lg:min-h-0">
            <div className="flex min-h-[260px] flex-col lg:min-h-0 lg:flex-1">
              {jsonPreview}
            </div>
            {sidePanel && <div className="h-[300px] shrink-0">{sidePanel}</div>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
