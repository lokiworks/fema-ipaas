import { t } from 'i18next';
import { PackageX } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { solutionsHooks, SolutionDetailView } from '@/features/solutions';

export function SolutionDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: solution, isLoading } = solutionsHooks.useSolution(id);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[72rem] px-6 py-6">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!solution) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageX />
          </EmptyMedia>
          <EmptyTitle>{t('This solution does not exist')}</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => navigate('/solutions')}>
            {t('Back to solutions')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return <SolutionDetailView solution={solution} />;
}
