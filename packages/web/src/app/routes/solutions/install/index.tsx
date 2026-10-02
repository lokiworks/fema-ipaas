import { t } from 'i18next';
import { ChevronLeft, PackageX } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { solutionsHooks } from '@/features/solutions';

import { InstallWizard } from './install-wizard';

export function SolutionInstallPage() {
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

  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-6 px-6 py-6">
      <Link
        to={`/solutions/${solution.id}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {solution.name}
      </Link>
      <h1 className="text-xl font-medium">
        {t('Install {name}', { name: solution.name })}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          v{solution.currentVersion}
        </span>
      </h1>
      <InstallWizard
        key={`${solution.id}-${solution.currentVersion}`}
        solution={solution}
      />
    </div>
  );
}
