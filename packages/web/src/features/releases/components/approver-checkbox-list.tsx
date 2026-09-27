import { t } from 'i18next';

import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { projectMembersHooks } from '@/features/project-members';
import { projectCollectionUtils } from '@/features/projects';

import { releaseUiUtils } from '../utils/release-ui-utils';

export function ApproverCheckboxList({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const { project } = projectCollectionUtils.useCurrentProject();
  const { data: members } = projectMembersHooks.useMembers();
  const candidates = releaseUiUtils.approverCandidates({
    ownerId: project.ownerId,
    members: members?.data ?? [],
  });
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {candidates.map((candidate) => {
        const label = candidate.name ?? t('Project owner');
        return (
          <label
            key={candidate.userId}
            className="flex min-w-0 items-center gap-2 text-sm"
          >
            <Checkbox
              checked={value.includes(candidate.userId)}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onChange(
                  checked === true
                    ? [
                        ...value.filter((id) => id !== candidate.userId),
                        candidate.userId,
                      ]
                    : value.filter((id) => id !== candidate.userId),
                )
              }
            />
            <TextWithTooltip tooltipMessage={label}>
              <span>{label}</span>
            </TextWithTooltip>
            {candidate.isOwner && candidate.name !== null && (
              <Badge variant="outline">{t('Owner')}</Badge>
            )}
          </label>
        );
      })}
    </div>
  );
}
