import {
  DefaultProjectRole,
  ProjectMemberWithUser,
  ReleaseCheck,
  ReleaseCheckCode,
  WorkflowReleaseStatus,
  WorkflowTrigger,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

function statusLabel(status: WorkflowReleaseStatus): string {
  switch (status) {
    case WorkflowReleaseStatus.PENDING:
      return t('Pending approval');
    case WorkflowReleaseStatus.DEPLOYED:
      return t('Published');
    case WorkflowReleaseStatus.REJECTED:
      return t('Rejected');
    case WorkflowReleaseStatus.WITHDRAWN:
      return t('Withdrawn');
  }
}

function checkText(check: ReleaseCheck): string {
  const subject = check.subject ?? '';
  switch (check.code) {
    case ReleaseCheckCode.VERSION_VALID:
      return t('The version passes validation');
    case ReleaseCheckCode.VERSION_INVALID:
      return t('The version has incomplete steps');
    case ReleaseCheckCode.CONNECTIONS_OK:
      return t('{count} connections are available', { count: Number(subject) });
    case ReleaseCheckCode.CONNECTION_MISSING:
      return t('Connection {name} is missing in this project', {
        name: subject,
      });
    case ReleaseCheckCode.CONNECTION_UNHEALTHY:
      return t(
        'Connection {name} is not working; its steps will fail after release',
        { name: subject },
      );
    case ReleaseCheckCode.VARIABLES_OK:
      return t('{count} variables exist', { count: Number(subject) });
    case ReleaseCheckCode.VARIABLE_MISSING:
      return t('Variable {name} does not exist', { name: subject });
    case ReleaseCheckCode.NO_TEST_RUNS:
      return t('This version has not been tested');
    case ReleaseCheckCode.APPROVAL_REQUIRED:
      return t('Publishing requires approval');
    case ReleaseCheckCode.ALREADY_PUBLISHED:
      return t('This version is already published');
  }
}

function approvalRequired(approverIds: string[]): boolean {
  return approverIds.length > 0;
}

function approverCandidates({
  ownerId,
  members,
}: {
  ownerId: string;
  members: ProjectMemberWithUser[];
}): ApproverCandidate[] {
  const owner = members.find((member) => member.userId === ownerId);
  const others = members
    .filter(
      (member) =>
        member.userId !== ownerId && APPROVER_ROLES.includes(member.role),
    )
    .map((member) => ({
      userId: member.userId,
      name: memberName(member),
      isOwner: false,
    }));
  return [
    {
      userId: ownerId,
      name: owner ? memberName(owner) : null,
      isOwner: true,
    },
    ...others,
  ];
}

function promotionBlocker({
  testVersionId,
  productionVersionId,
  pendingReleaseId,
}: {
  testVersionId: string | null | undefined;
  productionVersionId: string | null | undefined;
  pendingReleaseId: string | null | undefined;
}): PromotionBlocker | null {
  if (!testVersionId) {
    return PromotionBlocker.NO_TEST_DEPLOYMENT;
  }
  if (pendingReleaseId) {
    return PromotionBlocker.PENDING_APPROVAL;
  }
  if (testVersionId === productionVersionId) {
    return PromotionBlocker.SAME_AS_PRODUCTION;
  }
  return null;
}

function promotionBlockerText(blocker: PromotionBlocker): string {
  switch (blocker) {
    case PromotionBlocker.NO_TEST_DEPLOYMENT:
      return t('Deploy to test first');
    case PromotionBlocker.PENDING_APPROVAL:
      return t('A promotion of this workflow is waiting for approval');
    case PromotionBlocker.SAME_AS_PRODUCTION:
      return t('Production already runs the version in test');
  }
}

function environmentStatus({
  versionId,
  isDraft,
  testVersionId,
  productionVersionId,
}: {
  versionId: string;
  isDraft: boolean;
  testVersionId: string | null | undefined;
  productionVersionId: string | null | undefined;
}): EnvironmentStatus {
  if (isDraft) {
    return EnvironmentStatus.NOT_DEPLOYED;
  }
  const inTest = versionId === testVersionId;
  const inProduction = versionId === productionVersionId;
  if (inTest && inProduction) {
    return EnvironmentStatus.TEST_AND_PRODUCTION;
  }
  if (inTest) {
    return EnvironmentStatus.TEST;
  }
  if (inProduction) {
    return EnvironmentStatus.PRODUCTION;
  }
  return EnvironmentStatus.NONE;
}

function testWebhookUrl({
  webhookUrlPrefix,
  workflowId,
}: {
  webhookUrlPrefix: string | null | undefined;
  workflowId: string;
}): string {
  const prefix = (webhookUrlPrefix ?? '').replace(/\/+$/, '');
  return `${prefix}/${workflowId}/test-env`;
}

function isWebhookTrigger(trigger: WorkflowTrigger): boolean {
  return (
    trigger.type === WorkflowTriggerType.CONNECTOR &&
    trigger.settings.connectorName === WEBHOOK_CONNECTOR_NAME
  );
}

function memberName(member: ProjectMemberWithUser): string {
  const fullName = `${member.user.firstName ?? ''} ${
    member.user.lastName ?? ''
  }`.trim();
  return fullName.length > 0 ? fullName : member.user.email;
}

const APPROVER_ROLES: DefaultProjectRole[] = [
  DefaultProjectRole.ADMIN,
  DefaultProjectRole.DEVELOPER,
];
const WEBHOOK_CONNECTOR_NAME = '@fema-ipaas/connector-webhook';

export enum PromotionBlocker {
  NO_TEST_DEPLOYMENT = 'NO_TEST_DEPLOYMENT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  SAME_AS_PRODUCTION = 'SAME_AS_PRODUCTION',
}

export enum EnvironmentStatus {
  NOT_DEPLOYED = 'NOT_DEPLOYED',
  TEST = 'TEST',
  PRODUCTION = 'PRODUCTION',
  TEST_AND_PRODUCTION = 'TEST_AND_PRODUCTION',
  NONE = 'NONE',
}

export const releaseUiUtils = {
  statusLabel,
  checkText,
  approvalRequired,
  approverCandidates,
  promotionBlocker,
  promotionBlockerText,
  environmentStatus,
  testWebhookUrl,
  isWebhookTrigger,
};

export type ApproverCandidate = {
  userId: string;
  name: string | null;
  isOwner: boolean;
};
