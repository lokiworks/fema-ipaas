import { SolutionSummary } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { PackagePlus, PackageSearch } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { SearchInput } from '@/components/custom/search-input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

import { solutionsHooks } from '../hooks/solutions-hooks';
import { solutionsUtils } from '../utils/solutions-utils';

import { SolutionCard } from './solution-card';

function SolutionLibrary({ onGenerate }: SolutionLibraryProps) {
  const navigate = useNavigate();
  const { data: solutions, isLoading } = solutionsHooks.useSolutions();
  const [category, setCategory] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState('');

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-36 w-full" />
        ))}
      </div>
    );
  }

  const all = solutions ?? [];
  if (all.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackagePlus />
          </EmptyMedia>
          <EmptyTitle>{t('No solutions yet')}</EmptyTitle>
          <EmptyDescription>
            {t(
              'Package the workflows you have built in a project into a solution, and other projects can install it with a guided wizard.',
            )}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onGenerate}>
            <PackagePlus className="size-4" />
            {t('Create solution from project')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const visible = solutionsUtils.filterSolutions({
    solutions: all,
    category,
    search,
    mineOnly,
    userId: authenticationSession.getCurrentUserId(),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <CategoryChip
          label={t('All')}
          active={category === null}
          onClick={() => setCategory(null)}
        />
        {solutionsUtils.categoriesOf(all).map((item) => (
          <CategoryChip
            key={item}
            label={item}
            active={category === item}
            onClick={() => setCategory(item)}
          />
        ))}
        <div className="grow" />
        <Button
          variant={mineOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMineOnly(!mineOnly)}
        >
          {t('Created by me')}
        </Button>
        <div className="w-64">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('Search solutions or connectors')}
          />
        </div>
      </div>
      {visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageSearch />
            </EmptyMedia>
            <EmptyTitle>{t('No matching solutions')}</EmptyTitle>
            <EmptyDescription>
              {t('Try another keyword or category.')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <SolutionGrid
          solutions={visible}
          onOpen={(id) => navigate(`/solutions/${id}`)}
        />
      )}
    </div>
  );
}

function SolutionGrid({ solutions, onOpen }: SolutionGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {solutions.map((solution) => (
        <SolutionCard
          key={solution.id}
          solution={solution}
          onClick={() => onOpen(solution.id)}
        />
      ))}
    </div>
  );
}

function CategoryChip({ label, active, onClick }: CategoryChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-sm transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
}

export { SolutionLibrary };

type SolutionLibraryProps = {
  onGenerate: () => void;
};

type SolutionGridProps = {
  solutions: SolutionSummary[];
  onOpen: (id: string) => void;
};

type CategoryChipProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};
