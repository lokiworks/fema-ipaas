import { useEmbedding } from '@/components/providers/embed-provider';

import { ProjectDashboardPageHeader } from './project-dashboard-page-header';

export const ProjectDashboardLayoutHeader = () => {
  const { embedState } = useEmbedding();

  return (
    <div className="flex flex-col">
      {!embedState.isEmbedded && <ProjectDashboardPageHeader />}
    </div>
  );
};

ProjectDashboardLayoutHeader.displayName = 'ProjectDashboardLayoutHeader';

export default ProjectDashboardLayoutHeader;
