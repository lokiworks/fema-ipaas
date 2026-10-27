import { t } from 'i18next';
import { ArrowLeft } from 'lucide-react';
import { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function MasterDetailLayout({
  list,
  detail,
  showDetail,
  onBack,
}: MasterDetailLayoutProps) {
  return (
    <div className="flex w-full flex-col gap-4 xl:grid xl:grid-cols-[260px_minmax(0,1fr)]">
      <div
        className={cn('flex flex-col gap-2', showDetail && 'hidden xl:flex')}
      >
        {list}
      </div>
      <div
        className={cn(
          'flex min-w-0 flex-col gap-3',
          !showDetail && 'hidden xl:flex',
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start xl:hidden"
          onClick={onBack}
        >
          <ArrowLeft className="size-4 mr-1" />
          {t('Back to list')}
        </Button>
        {detail}
      </div>
    </div>
  );
}

type MasterDetailLayoutProps = {
  list: ReactNode;
  detail: ReactNode;
  showDetail: boolean;
  onBack: () => void;
};
