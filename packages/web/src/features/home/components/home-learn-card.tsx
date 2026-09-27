import { t } from 'i18next';
import { Braces, Compass, Rocket, Server, ShieldAlert } from 'lucide-react';

import { helpStore, launchTour } from '@/features/help';

import { SideCard, SideRow } from './side-card';

export function HomeLearnCard({
  mcpProjectId,
}: {
  mcpProjectId: string | null;
}) {
  return (
    <SideCard title={t('Get started')}>
      <div className="flex flex-col gap-0.5">
        <SideRow
          icon={Compass}
          title={t('Get to know the console')}
          subtitle={t('Interactive tutorial')}
          onClick={() => launchTour('console')}
        />
        <SideRow
          icon={Rocket}
          title={t('Build your first workflow in 5 minutes')}
          subtitle={t('Help article')}
          onClick={() => helpStore.openHelp('quickstart')}
        />
        <SideRow
          icon={Braces}
          title={t('Use data from earlier steps')}
          subtitle={t('Help article')}
          onClick={() => helpStore.openHelp('references')}
        />
        <SideRow
          icon={ShieldAlert}
          title={t('Error handling and retries')}
          subtitle={t('Help article')}
          onClick={() => helpStore.openHelp('errors')}
        />
        {mcpProjectId && (
          <SideRow
            icon={Server}
            title={t('Open workflows to AI assistants (MCP)')}
            subtitle={t('Go to MCP services')}
            to={`/projects/${mcpProjectId}/mcp-services`}
          />
        )}
      </div>
    </SideCard>
  );
}
