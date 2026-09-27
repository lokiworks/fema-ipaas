import { t } from 'i18next';
import { Braces, Bug, Rocket, Server } from 'lucide-react';

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
          icon={Rocket}
          title={t('Build your first workflow')}
          subtitle={t('Help docs')}
          to={`${DOCS_BASE_URL}/workflows/building-workflows`}
          external={true}
        />
        <SideRow
          icon={Braces}
          title={t('Use data from earlier steps')}
          subtitle={t('Help docs')}
          to={`${DOCS_BASE_URL}/workflows/passing-data`}
          external={true}
        />
        <SideRow
          icon={Bug}
          title={t('Debug failed runs')}
          subtitle={t('Help docs')}
          to={`${DOCS_BASE_URL}/workflows/debugging-runs`}
          external={true}
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

const DOCS_BASE_URL = 'https://github.com/lokiworks/fema-ipaas/docs';
