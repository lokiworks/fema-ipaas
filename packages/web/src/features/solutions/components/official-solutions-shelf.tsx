import { SolutionSummary } from '@fema-ipaas/shared';
import { useNavigate } from 'react-router-dom';

import { cn } from '@/lib/utils';

import { SolutionCard } from './solution-card';

function OfficialSolutionsGrid({
  solutions,
  className,
}: OfficialSolutionsGridProps) {
  const navigate = useNavigate();
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
      data-testid="official-solutions"
    >
      {solutions.map((solution) => (
        <SolutionCard
          key={solution.id}
          solution={solution}
          onClick={() => navigate(`/solutions/${solution.id}`)}
        />
      ))}
    </div>
  );
}

export { OfficialSolutionsGrid };

type OfficialSolutionsGridProps = {
  solutions: SolutionSummary[];
  className?: string;
};
