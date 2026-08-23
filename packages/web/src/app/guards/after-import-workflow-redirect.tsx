import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { workflowHooks } from '@/features/workflows';

export const AfterImportWorkflowRedirect = () => {
  const { workflowId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (workflowId) {
      queryClient.removeQueries({
        queryKey: workflowHooks.createWorkflowQueryKeys({
          workflowId,
          versionId: undefined,
        }),
      });
    }
    navigate(`/workflows/${workflowId}`, { replace: true });
  }, []);
  return <></>;
};
