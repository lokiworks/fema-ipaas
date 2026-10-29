import { t } from 'i18next';
import { Check, KeyRound } from 'lucide-react';
import { ComponentProps, useState } from 'react';

import { Button } from '@/components/ui/button';
import { DisabledReason } from '@/features/project-workspace/components/disabled-reason';

import { projectAccessRequestsHooks } from '../hooks/project-access-requests-hooks';

import { RequestProjectAccessDialog } from './request-project-access-dialog';

export function RequestProjectAccessButton({
  projectId,
  projectName,
  variant = 'default',
  size = 'default',
}: {
  projectId: string;
  projectName: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
}) {
  const [open, setOpen] = useState(false);
  const pending = projectAccessRequestsHooks.useMyPendingProjectIds();
  if (pending.has(projectId)) {
    return (
      <DisabledReason reason={t('projectAccessRequestedHint')}>
        <Button type="button" variant={variant} size={size} disabled>
          <Check />
          {t('projectAccessRequestedBadge')}
        </Button>
      </DisabledReason>
    );
  }
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <KeyRound />
        {t('projectAccessRequestButton')}
      </Button>
      <RequestProjectAccessDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        projectName={projectName}
      />
    </>
  );
}

type ButtonProps = ComponentProps<typeof Button>;
