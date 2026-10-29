import {
  ProjectAccessRequest,
  ProjectAccessRequestWithUser,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import { personName } from '@/lib/person-name';

function requesterName(
  request: Pick<
    ProjectAccessRequestWithUser,
    'userFirstName' | 'userLastName' | 'userEmail' | 'userId'
  >,
): string {
  return personName.formatWithFallback({
    firstName: request.userFirstName,
    lastName: request.userLastName,
    fallback: request.userEmail ?? request.userId,
  });
}

function pendingProjectIds(
  requests: Pick<ProjectAccessRequest, 'projectId'>[] | undefined,
): Set<string> {
  return new Set((requests ?? []).map((request) => request.projectId));
}

function decidedMessage({
  name,
  approve,
}: {
  name: string;
  approve: boolean;
}): string {
  return approve
    ? t('projectAccessApproved', { name })
    : t('projectAccessRejected', { name });
}

function reasonText(reason: string | null | undefined): string {
  const trimmed = reason?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : t('No reason given');
}

function membersLink(projectId: string): string {
  return `/projects/${projectId}/home?share=1`;
}

export const projectAccessRequestUtils = {
  requesterName,
  pendingProjectIds,
  decidedMessage,
  reasonText,
  membersLink,
};
