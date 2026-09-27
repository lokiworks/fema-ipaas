import { t } from 'i18next';
import { useSearchParams } from 'react-router-dom';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RunsTable } from '@/features/executions';
import { DedupedEventsTable } from '@/features/trigger-runtime';

const RunsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const view =
    searchParams.get(VIEW_QUERY_PARAM) === DEDUPED_VIEW
      ? DEDUPED_VIEW
      : RUNS_VIEW;
  return (
    <div className="flex flex-col gap-3">
      <Tabs
        value={view}
        onValueChange={(next) =>
          setSearchParams(
            next === DEDUPED_VIEW ? { [VIEW_QUERY_PARAM]: DEDUPED_VIEW } : {},
          )
        }
      >
        <TabsList>
          <TabsTrigger value={RUNS_VIEW}>{t('Runs')}</TabsTrigger>
          <TabsTrigger value={DEDUPED_VIEW}>{t('Deduplicated')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {view === DEDUPED_VIEW ? <DedupedEventsTable /> : <RunsTable />}
    </div>
  );
};

const VIEW_QUERY_PARAM = 'view';
const RUNS_VIEW = 'runs';
const DEDUPED_VIEW = 'deduped';

export { RunsPage };
