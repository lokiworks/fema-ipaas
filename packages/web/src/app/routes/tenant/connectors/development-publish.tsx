import {
  BlueprintPublishMode,
  BlueprintRollout,
  BlueprintVersionError,
  BlueprintVersionStatus,
  blueprintChanges,
  blueprintVersions,
  ConnectorBlueprintDetail,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ArrowLeftIcon, PackageXIcon, RocketIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { LoadingSpinner } from '@/components/custom/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { connectorBlueprintHooks } from '@/features/connector-blueprints';
import { blueprintIssueUtils } from '@/features/connector-blueprints/components/publish/blueprint-issue-utils';
import { BlueprintPublishChangesStep } from '@/features/connector-blueprints/components/publish/publish-step-changes';
import { BlueprintPublishInfoStep } from '@/features/connector-blueprints/components/publish/publish-step-info';
import { blueprintIconUtils } from '@/features/connector-blueprints/utils/blueprint-icon-utils';
import { cn } from '@/lib/utils';

export default function ConnectorDevelopmentPublishPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: detail, isLoading } =
    connectorBlueprintHooks.useConnectorBlueprint(id ?? null);

  if (isLoading) {
    return <Skeleton className="m-4 h-96 w-full" />;
  }

  if (!detail) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageXIcon />
            </EmptyMedia>
            <EmptyTitle>{t('Connector not found')}</EmptyTitle>
            <EmptyDescription>{t('It may have been deleted')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => navigate('/tenant/connectors/development')}>
              {t('Back to Connector Development')}
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return <PublishFlow detail={detail} />;
}

function PublishFlow({ detail }: { detail: ConnectorBlueprintDetail }) {
  const navigate = useNavigate();
  const changes = detail.changes;
  const issues = detail.issues;
  const versions = detail.versions;
  const { data: projects } = connectorBlueprintHooks.useBlueprintProjects(
    detail.id,
  );

  const [step, setStep] = useState<0 | 1>(0);
  const [picked, setPicked] = useState<string[]>(
    changes.map((change) => change.id),
  );
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(
    changes[0]?.id ?? null,
  );
  const [mode, setMode] = useState<BlueprintPublishMode>(
    BlueprintPublishMode.NEW_VERSION,
  );
  const [rollout, setRollout] = useState<BlueprintRollout>(
    BlueprintRollout.FULL,
  );
  const [canaryProjectIds, setCanaryProjectIds] = useState<string[]>([]);
  const [version, setVersion] = useState(() =>
    blueprintVersions.suggestNext(
      versions.map((entry) => entry.packageVersion),
    ),
  );
  const [description, setDescription] = useState('');
  const [descriptionTouched, setDescriptionTouched] = useState(false);

  const chosenChanges = changes.filter((change) => picked.includes(change.id));
  const hasRemoval = blueprintChanges.includesRemoval({
    changes,
    changeIds: picked,
  });

  const highestVersion = blueprintVersions.highest(
    versions.map((entry) => entry.version),
  );
  const highestVersionEntry =
    versions.find((entry) => entry.version === highestVersion) ?? null;

  const canUpdateCurrent =
    versions.length > 0 &&
    highestVersionEntry?.status !== BlueprintVersionStatus.STOPPED &&
    !hasRemoval;
  const patchReason =
    versions.length === 0
      ? t(
          'No version has been published yet. The first publish can only be a new version',
        )
      : highestVersionEntry?.status === BlueprintVersionStatus.STOPPED
      ? t('The current version {version} already has support stopped', {
          version: highestVersionEntry.version,
        })
      : hasRemoval
      ? t(
          'This publish includes a removal, so it can only ship as a new version',
        )
      : '';

  const effectiveMode = canUpdateCurrent
    ? mode
    : BlueprintPublishMode.NEW_VERSION;

  const maxPackageVersion = blueprintVersions.highest(
    versions.map((entry) => entry.packageVersion),
  );
  const maxVersionDisplay = maxPackageVersion
    ? blueprintVersions.displayOf(maxPackageVersion)
    : t('None');

  const versionErrorCode =
    effectiveMode === BlueprintPublishMode.NEW_VERSION
      ? blueprintVersions.newVersionError({
          version,
          existing: versions.map((entry) => entry.packageVersion),
        })
      : null;
  const versionError =
    versionErrorCode === BlueprintVersionError.FORMAT
      ? t('Use the format "major.minor", e.g. 1.3')
      : versionErrorCode === BlueprintVersionError.NOT_GREATER
      ? t('Needs to be greater than the highest published version {version}', {
          version: maxVersionDisplay,
        })
      : '';

  const canaryError =
    effectiveMode === BlueprintPublishMode.NEW_VERSION &&
    rollout === BlueprintRollout.CANARY &&
    canaryProjectIds.length === 0
      ? t('Select at least one project')
      : '';

  const descriptionError =
    description.trim().length === 0
      ? t('A version description is required')
      : '';

  const canNext = issues.length === 0 && chosenChanges.length > 0;
  const blockNextReason =
    issues.length > 0
      ? t('Resolve the issues in the pre-publish checks first')
      : chosenChanges.length === 0
      ? t('Select at least one change')
      : '';
  const blockPublishReason =
    blockNextReason || versionError || canaryError || descriptionError;

  const { mutate: publish, isPending } =
    connectorBlueprintHooks.usePublishConnectorBlueprint({
      id: detail.id,
      onSuccess: () => {
        toast.success(
          effectiveMode === BlueprintPublishMode.UPDATE_CURRENT
            ? t('Published an update in {version}', {
                version: highestVersionEntry?.version ?? '',
              })
            : rollout === BlueprintRollout.CANARY
            ? t('{version} has started rolling out to canary', { version })
            : t('Published {version}', { version }),
        );
        navigate(`/tenant/connectors/development/${detail.id}/versions`);
      },
    });

  const handlePublish = () => {
    if (blockPublishReason) {
      return;
    }
    publish({
      changeIds: picked,
      mode: effectiveMode,
      version:
        effectiveMode === BlueprintPublishMode.NEW_VERSION
          ? version.trim()
          : null,
      rollout:
        effectiveMode === BlueprintPublishMode.UPDATE_CURRENT
          ? BlueprintRollout.FULL
          : rollout,
      canaryProjectIds:
        effectiveMode === BlueprintPublishMode.NEW_VERSION &&
        rollout === BlueprintRollout.CANARY
          ? canaryProjectIds
          : [],
      description: description.trim(),
    });
  };

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Button
          variant="ghost"
          onClick={() =>
            navigate(`/tenant/connectors/development/${detail.id}/versions`)
          }
        >
          <ArrowLeftIcon className="mr-1 size-4" />
          {t('Exit publishing')}
        </Button>
        <div className="h-5 w-px bg-border" />
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
          style={{ background: detail.iconColor }}
        >
          {blueprintIconUtils.letterOf(detail.displayName)}
        </span>
        <span className="truncate font-medium">
          {t('Publish "{name}"', { name: detail.displayName })}
        </span>
        <Badge variant="outline">
          {detail.currentVersion
            ? t('Current v{version}', { version: detail.currentVersion })
            : t('First publish')}
        </Badge>
        <div className="flex items-center gap-3 px-4">
          <StepTab
            index={0}
            current={step}
            label={t('Confirm changes to publish')}
            onClick={() => setStep(0)}
          />
          <StepTab
            index={1}
            current={step}
            label={t('Fill in publish information')}
            onClick={() => {
              if (canNext) {
                setStep(1);
              }
            }}
          />
        </div>
        <span className="grow" />
        {step === 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="tooltip-wrapper">
                <Button disabled={!canNext} onClick={() => setStep(1)}>
                  {t('Next step')}
                </Button>
              </div>
            </TooltipTrigger>
            {blockNextReason && (
              <TooltipContent>{blockNextReason}</TooltipContent>
            )}
          </Tooltip>
        ) : (
          <>
            <Button variant="outline" onClick={() => setStep(0)}>
              {t('Back')}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="tooltip-wrapper">
                  <Button
                    disabled={!!blockPublishReason}
                    loading={isPending}
                    onClick={handlePublish}
                  >
                    <RocketIcon className="mr-1 size-4" />
                    {t('Publish')}
                  </Button>
                </div>
              </TooltipTrigger>
              {blockPublishReason && (
                <TooltipContent>{blockPublishReason}</TooltipContent>
              )}
            </Tooltip>
          </>
        )}
      </div>
      {isPending && (
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          <LoadingSpinner className="size-4" />
          {t('Publishing runs as a background job and can take a few seconds')}
        </div>
      )}
      {issues.length > 0 && (
        <div className="px-4 pt-4">
          <Alert variant="destructive">
            <AlertTitle>
              {t('{count} issues need to be resolved before publishing', {
                count: issues.length,
              })}
            </AlertTitle>
            <AlertDescription>
              <ul className="mt-1 flex flex-col gap-1">
                {issues.map((issue, index) => {
                  const described = blueprintIssueUtils.describe({
                    issue,
                    blueprintId: detail.id,
                  });
                  return (
                    <li
                      key={`${issue.code}-${issue.key ?? index}`}
                      className="flex items-center gap-2"
                    >
                      <span>{described.text}</span>
                      <Link
                        className="text-primary underline-offset-4 hover:underline"
                        to={described.to}
                      >
                        {t('Go fix it')}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      )}
      <div className="flex-1 overflow-auto p-4">
        {step === 0 ? (
          <BlueprintPublishChangesStep
            changes={changes}
            picked={picked}
            onPickedChange={setPicked}
            selectedId={selectedChangeId}
            onSelectedChange={setSelectedChangeId}
          />
        ) : (
          <BlueprintPublishInfoStep
            chosenChanges={chosenChanges}
            mode={effectiveMode}
            onModeChange={setMode}
            canUpdateCurrent={canUpdateCurrent}
            patchReason={patchReason}
            version={version}
            onVersionChange={setVersion}
            versionError={versionError}
            maxVersionDisplay={maxVersionDisplay}
            rollout={rollout}
            onRolloutChange={setRollout}
            canaryProjectIds={canaryProjectIds}
            onCanaryProjectIdsChange={setCanaryProjectIds}
            canaryError={canaryError}
            projects={projects ?? []}
            description={description}
            onDescriptionChange={setDescription}
            descriptionTouched={descriptionTouched}
            onDescriptionTouched={() => setDescriptionTouched(true)}
            descriptionError={descriptionError}
          />
        )}
      </div>
    </div>
  );
}

function StepTab({
  index,
  current,
  label,
  onClick,
}: {
  index: 0 | 1;
  current: 0 | 1;
  label: string;
  onClick: () => void;
}) {
  const active = current === index;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 text-sm',
        active ? 'font-medium text-foreground' : 'text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full text-xs',
          active ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}
      >
        {index + 1}
      </span>
      {label}
    </button>
  );
}
