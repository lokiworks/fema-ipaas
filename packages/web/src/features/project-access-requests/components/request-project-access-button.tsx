import { t } from 'i18next';
import { Check, ChevronDown, KeyRound, Undo2 } from 'lucide-react';
import { ComponentProps, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  const pending = projectAccessRequestsHooks.useMyPendingRequest(projectId);
  const { mutate: withdraw, isPending: withdrawing } =
    projectAccessRequestsHooks.useWithdrawRequest();
  if (pending) {
    return (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={variant}
            size={size}
            loading={withdrawing}
            onClick={(event) => event.stopPropagation()}
          >
            <Check />
            {t('projectAccessRequestedBadge')}
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent onClick={(event) => event.stopPropagation()}>
          <DropdownMenuLabel className="max-w-64 font-normal text-muted-foreground">
            {t('projectAccessRequestedHint')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => withdraw(pending.id)}>
            <Undo2 />
            {t('Withdraw request')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
