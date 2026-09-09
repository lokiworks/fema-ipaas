import { t } from 'i18next';
import { Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { UserRowData } from '../index';

import { UpdateUserDialog } from './update-user-dialog';

type EditUserActionProps = {
  row: UserRowData;
  onUpdate: () => void;
};

export const EditUserAction = ({ row, onUpdate }: EditUserActionProps) => {
  if (row.type === 'invitation') {
    return null;
  }

  return (
    <div className="flex items-end justify-end">
      <Tooltip>
        <TooltipTrigger asChild>
          <UpdateUserDialog
            userId={row.data.id}
            role={row.data.tenantRole}
            externalId={row.data.externalId ?? undefined}
            onUpdate={onUpdate}
          >
            <Button
              variant="ghost"
              aria-label={t('Edit user')}
              className="size-8 p-0"
            >
              <Pencil className="size-4" />
            </Button>
          </UpdateUserDialog>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('Edit user')}</TooltipContent>
      </Tooltip>
    </div>
  );
};
