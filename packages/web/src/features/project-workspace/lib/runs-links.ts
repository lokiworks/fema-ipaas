import { ExecutionStatus } from '@fema-ipaas/shared';

function forProject({
  projectId,
  createdAfter,
  failedOnly = false,
  workflowId,
}: {
  projectId: string;
  createdAfter?: string;
  failedOnly?: boolean;
  workflowId?: string;
}): string {
  const params = new URLSearchParams();
  if (createdAfter) {
    params.set('createdAfter', createdAfter);
  }
  if (workflowId) {
    params.append('workflowId', workflowId);
  }
  if (failedOnly) {
    FAILED_STATUSES.forEach((status) => params.append('status', status));
  }
  const query = params.toString();
  return `/projects/${projectId}/runs${query ? `?${query}` : ''}`;
}

const FAILED_STATUSES: ExecutionStatus[] = [
  ExecutionStatus.FAILED,
  ExecutionStatus.INTERNAL_ERROR,
  ExecutionStatus.TIMEOUT,
  ExecutionStatus.MEMORY_LIMIT_EXCEEDED,
];

export const runsLinks = { forProject };
