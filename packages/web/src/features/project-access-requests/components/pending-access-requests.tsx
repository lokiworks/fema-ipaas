import {
  DEFAULT_PROJECT_ACCESS_ROLE,
  DefaultProjectRole,
  ProjectAccessRequestWithUser,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Info } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { FormattedDate } from '@/components/custom/formatted-date';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { projectRoleLabels } from '@/features/project-workspace/lib/role-labels';

import { projectAccessRequestsHooks } from '../hooks/project-access-requests-hooks';
import { projectAccessRequestUtils } from '../utils/project-access-request-utils';

export function PendingAccessRequests({ projectId }: { projectId: string }) {
  const [searchParams] = useSearchParams();
  const { data: requests } = projectAccessRequestsHooks.usePendingRequests({
    projectId,
    enabled: true,
  });
  const linkedRequestId = searchParams.get(ACCESS_REQUEST_PARAM);
  const linkedRequestClosed =
    linkedRequestId !== null &&
    requests !== undefined &&
    !requests.some((request) => request.id === linkedRequestId);
  if (!requests || requests.length === 0) {
    return linkedRequestClosed ? <ClosedRequestNotice /> : null;
  }
  return (
    <>
      {linkedRequestClosed && <ClosedRequestNotice />}
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      <h3 className="text-sm font-medium">
        {t('projectAccessPendingTitle', { count: requests.length })}
      </h3>
      <div className="flex flex-col divide-y">
        {requests.map((request) => (
          <PendingRequestRow
            key={request.id}
            projectId={projectId}
            request={request}
          />
          ))}
        </div>
      </div>
    </>
  );
}

function ClosedRequestNotice() {
  return (
    <div
      className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm"
      data-testid="project-access-request-closed"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">
          {t('projectAccessLinkedRequestClosedTitle')}
        </span>
        <span className="text-muted-foreground">
          {t('projectAccessLinkedRequestClosedDescription')}
        </span>
      </div>
    </div>
  );
}

function PendingRequestRow({
  projectId,
  request,
}: {
  projectId: string;
  request: ProjectAccessRequestWithUser;
}) {
  const [role, setRole] = useState<DefaultProjectRole>(
    DEFAULT_PROJECT_ACCESS_ROLE,
  );
  const {
    mutate: decide,
    mutateAsync: decideAsync,
    isPending,
  } = projectAccessRequestsHooks.useDecideRequest({ projectId });
  const name = projectAccessRequestUtils.requesterName(request);
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{name}</span>
        {request.userEmail && (
          <TextWithTooltip tooltipMessage={request.userEmail}>
            <span className="truncate text-xs text-muted-foreground">
              {request.userEmail}
            </span>
          </TextWithTooltip>
        )}
        <span className="break-words text-xs text-muted-foreground">
          {t('projectAccessReasonLabel', {
            reason: projectAccessRequestUtils.reasonText(request.reason),
          })}
        </span>
        <span className="text-xs text-muted-foreground">
          <FormattedDate date={new Date(request.created)} />
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Select
          value={role}
          onValueChange={(value) => {
            const next = Object.values(DefaultProjectRole).find(
              (candidate) => candidate === value,
            );
            if (next) {
              setRole(next);
            }
          }}
        >
          <SelectTrigger
            className="w-32"
            aria-label={t('projectAccessGrantRole')}
          >
            <SelectValue>{projectRoleLabels.label(role)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ROLE_ORDER.map((candidate) => (
              <SelectItem key={candidate} value={candidate}>
                {projectRoleLabels.label(candidate)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          loading={isPending}
          onClick={() => decide({ id: request.id, name, approve: true, role })}
        >
          {t('projectAccessApprove')}
        </Button>
        <ConfirmationDeleteDialog
          title={t('Reject the request from {name}?', { name })}
          message={t('projectAccessRejectMessage', { name })}
          entityName={name}
          buttonText={t('projectAccessReject')}
          mutationFn={async () => {
            await decideAsync({ id: request.id, name, approve: false });
          }}
        >
          <Button type="button" size="sm" variant="outline">
            {t('projectAccessReject')}
          </Button>
        </ConfirmationDeleteDialog>
      </div>
    </div>
  );
}

const ACCESS_REQUEST_PARAM = 'accessRequest';

const ROLE_ORDER: DefaultProjectRole[] = [
  DefaultProjectRole.VIEWER,
  DefaultProjectRole.OPERATOR,
  DefaultProjectRole.DEVELOPER,
  DefaultProjectRole.ADMIN,
];
