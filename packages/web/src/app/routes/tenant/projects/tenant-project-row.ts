import { ProjectLimitsRow, ProjectWithLimits } from '@fema-ipaas/shared';

export type TenantProjectRow = ProjectWithLimits & {
  globalConnectionsCount: number;
  limits: ProjectLimitsRow | null;
};
