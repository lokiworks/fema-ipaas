import dayjs from 'dayjs';
import { t } from 'i18next';
import { Calendar } from 'lucide-react';
import React from 'react';
import { useSearchParams } from 'react-router-dom';

import { ConsolePage } from '@/components/custom/console-page';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { ComponentHealthTab } from './components/component-health-tab';
import { DiagnosticsTab } from './components/diagnostics-tab';
import { QueueTab } from './components/queue-tab';
import { RunsTab } from './components/runs-tab';
import { SystemHealthTab } from './components/system-health-tab';
import { healthFormat } from './lib/health-format';
import { healthMetricsQueries } from './lib/health-metrics-hooks';

type TabValue = 'components' | 'system' | 'runs' | 'queue' | 'diagnostics';

type MonthOption = { value: string; label: string };

function buildMonthOptions(): MonthOption[] {
  const now = dayjs();
  return Array.from({ length: 6 }, (_unused, index) => {
    const month = now.subtract(index, 'month');
    return {
      value: month.format('YYYY-MM'),
      label: healthFormat.monthLabel(month.toDate()),
    };
  });
}

export default function SettingsHealthPage() {
  const monthOptions = React.useMemo(buildMonthOptions, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabValue) || 'components';
  const selectedMonth = searchParams.get('month') || monthOptions[0].value;

  const range = React.useMemo(() => {
    const month = dayjs(`${selectedMonth}-01`);
    return {
      createdAfter: month.startOf('month').toISOString(),
      createdBefore: month.endOf('month').toISOString(),
    };
  }, [selectedMonth]);

  const { data: report, isLoading: isReportLoading } =
    healthMetricsQueries.useRunMetrics(range, activeTab === 'runs');
  const { data: live, isLoading: isLiveLoading } =
    healthMetricsQueries.useQueueMetrics(range, activeTab === 'queue');

  const setTab = (tab: TabValue) => {
    const newParams = new URLSearchParams(searchParams);
    if (tab === 'components') {
      newParams.delete('tab');
    } else {
      newParams.set('tab', tab);
    }
    setSearchParams(newParams, { replace: true });
  };

  const handleMonthChange = (month: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('month', month);
    setSearchParams(newParams, { replace: true });
  };

  return (
    <ConsolePage
      title={t('Health')}
      description={t('Check the status of your tenant and its components')}
      actions={
        activeTab === 'runs' || activeTab === 'queue' ? (
          <Select value={selectedMonth} onValueChange={handleMonthChange}>
            <SelectTrigger className="w-auto gap-2 h-8">
              <Calendar className="h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="bottom" align="end">
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : undefined
      }
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => setTab(value as TabValue)}
        className="w-full"
      >
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="components">{t('Components')}</TabsTrigger>
          <TabsTrigger value="system">{t('System Health')}</TabsTrigger>
          <TabsTrigger value="runs">{t('Runs Health')}</TabsTrigger>
          <TabsTrigger value="queue">{t('Queue Health')}</TabsTrigger>
          <TabsTrigger value="diagnostics">{t('Diagnostics')}</TabsTrigger>
        </TabsList>

        <TabsContent value="components">
          <ComponentHealthTab />
        </TabsContent>

        <TabsContent value="system">
          <SystemHealthTab onSeeRuns={() => setTab('runs')} />
        </TabsContent>

        <TabsContent value="runs">
          <RunsTab report={report} isLoading={isReportLoading} />
        </TabsContent>

        <TabsContent value="queue">
          <QueueTab live={live} isLoading={isLiveLoading} />
        </TabsContent>

        <TabsContent value="diagnostics">
          <DiagnosticsTab enabled={activeTab === 'diagnostics'} />
        </TabsContent>
      </Tabs>
    </ConsolePage>
  );
}
