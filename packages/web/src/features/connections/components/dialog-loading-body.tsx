import { t } from 'i18next';

import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

export function DialogLoadingBody() {
  return (
    <>
      <DialogHeader className="sr-only">
        <DialogTitle>{t('Loading')}</DialogTitle>
        <DialogDescription>{t('Loading...')}</DialogDescription>
      </DialogHeader>
      <Skeleton className="h-24 w-full" />
    </>
  );
}
