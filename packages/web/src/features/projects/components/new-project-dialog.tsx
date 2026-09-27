import { ProjectWithLimits } from '@fema-ipaas/shared';
import { useState } from 'react';

import { ProjectInfoDialog } from '@/features/project-workspace/components/project-info-dialog';

type NewProjectDialogProps = {
  children: React.ReactNode;
  onCreate?: (project: ProjectWithLimits) => void;
};

export const NewProjectDialog = ({ children, onCreate }: NewProjectDialogProps) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span
        className="contents"
        onClickCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {children}
      </span>
      <ProjectInfoDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={onCreate}
      />
    </>
  );
};
