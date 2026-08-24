import { isNil } from '@fema-ipaas/core-utils';

import { UserBadge } from '@/components/custom/user-badge';
import { useEmbedding } from '@/components/providers/embed-provider';

export const NoteFooter = ({ creatorId, isDragging }: NoteFooterProps) => {
  const {
    embedState: { isEmbedded },
  } = useEmbedding();
  if (isEmbedded) {
    return null;
  }
  return (
    <div className="flex items-center justify-between gap-2 cursor-grabbing overflow-hidden">
      <div className="grow">
        {!isNil(creatorId) && (
          <UserBadge
            size="xsmall"
            id={creatorId}
            includeName={true}
            hideHover={isDragging}
          />
        )}
      </div>
    </div>
  );
};
NoteFooter.displayName = 'NoteFooter';

type NoteFooterProps = {
  id: string;
  isDragging?: boolean;
  creatorId: string | null | undefined;
};
