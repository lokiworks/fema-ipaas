import { isNil } from '@fema-ipaas/core-utils';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useResourceLock } from '@/hooks/use-resource-lock';

import { useBuilderStateContext } from '../../builder-hooks';
import { workflowCanvasHooks } from '../hooks';

function useWorkflowLock() {
  const [readonly, workflowId, setReadOnly] = useBuilderStateContext(
    (state) => [state.readonly, state.workflow.id, state.setReadOnly],
  );
  const run = useBuilderStateContext((state) => state.run);
  const readonlySetByLock = useRef(false);
  const navigate = useNavigate();
  const { switchToDraft } = workflowCanvasHooks.useSwitchToDraft();

  // refresh the workflow in place after a successful take-over; a full-page
  // reload would break the embed SDK handshake inside an iframe. When viewing
  // a run, mirror EditWorkflowOrViewDraftButton: navigate to the workflow
  // (client-side, embed-safe) instead of editing a draft under the run view.
  // Branch on the builder run state, not the URL: embed mounts a memory
  // router, so window.location never reflects the in-app route.
  const onTakeOver = useCallback(() => {
    if (!isNil(run)) {
      navigate(`/workflows/${workflowId}`);
    } else {
      switchToDraft();
    }
  }, [run, navigate, workflowId, switchToDraft]);

  const { lockedBy, takeOver } = useResourceLock({
    resourceId: workflowId,
    onTakeOver,
  });

  useEffect(() => {
    if (lockedBy && !readonly) {
      readonlySetByLock.current = true;
      setReadOnly(true);
    }
    if (!lockedBy && readonlySetByLock.current) {
      readonlySetByLock.current = false;
      setReadOnly(false);
    }
  }, [lockedBy, readonly, setReadOnly]);

  return { lockedBy, takeOver };
}

export { useWorkflowLock };
